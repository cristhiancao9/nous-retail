const registrarVentaRapida = async (req, res) => {
 const client = req.dbClient;
 const { ean, tienda_id } = req.body;

 try {
  await client.query('BEGIN');

  // Sin prefijo nous.
  const resStock = await client.query(`
      SELECT 
        s.id as sku_id, 
        p.nombre_koaj,
        COALESCE(SUM(k.cantidad), 0) as stock_actual
      FROM skus s
      JOIN productos p ON p.id = s.producto_id
      LEFT JOIN kardex k ON k.sku_id = s.id AND k.tienda_id = $2
      WHERE s.ean = $1
      GROUP BY s.id, p.nombre_koaj
    `, [ean, tienda_id]);

  if (resStock.rowCount === 0) {
   await client.query('ROLLBACK');
   return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  const { sku_id, nombre_koaj, stock_actual } = resStock.rows[0];

  if (parseInt(stock_actual) <= 0) {
   await client.query('ROLLBACK');
   return res.status(400).json({
    error: 'Sin existencias',
    message: `No puedes vender ${nombre_koaj} porque el stock actual es ${stock_actual}.`
   });
  }

  // Sin prefijo nous.
  await client.query(`
      INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
      VALUES ($1, $2, 'venta', -1, 'TICKET-VENTA', $3)
    `, [sku_id, tienda_id, `Venta rápida: ${nombre_koaj}`]);

  await client.query('COMMIT');

  res.json({
   status: 'success',
   message: `Venta exitosa de ${nombre_koaj}. Stock restante: ${stock_actual - 1}`
  });

 } catch (error) {
  await client.query('ROLLBACK');
  res.status(500).json({ error: error.message });
 }
};

// --- MÓDULO DE CAJAS ---

const abrirCaja = async (req, res) => {
  const client = req.dbClient;
  const { tienda_id, base_apertura } = req.body;
  const usuario_id = req.user.id;

  try {
    const cajaExistente = await client.query(`
      SELECT id FROM cajas
      WHERE tienda_id = $1 AND fecha = CURRENT_DATE AND estado = 'abierta'
    `, [tienda_id]);

    if (cajaExistente.rowCount > 0) {
      return res.status(400).json({ error: 'Ya existe una caja abierta hoy para esta tienda.' });
    }

    const result = await client.query(`
      INSERT INTO cajas (tienda_id, usuario_id, base_apertura)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [tienda_id, usuario_id, base_apertura || 0]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCajaActiva = async (req, res) => {
  const client = req.dbClient;
  const { tienda_id } = req.params;

  try {
    const result = await client.query(`
      SELECT * FROM cajas 
      WHERE tienda_id = $1 AND fecha = CURRENT_DATE AND estado = 'abierta'
    `, [tienda_id]);
    
    if (result.rowCount === 0) return res.status(404).json({ message: 'No hay caja abierta' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const cerrarCaja = async (req, res) => {
  const client = req.dbClient;
  const { id } = req.params;

  try {
    const result = await client.query(`
      UPDATE cajas 
      SET estado = 'cerrada', cerrada_en = NOW()
      WHERE id = $1 AND estado = 'abierta'
      RETURNING *
    `, [id]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Caja no encontrada o ya cerrada' });
    res.json({ message: 'Caja cerrada exitosamente', resumen: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- MÓDULO DE VENTAS ---

const crearVenta = async (req, res) => {
 const client = req.dbClient;
 const { tienda_id, caja_id, items, forma_pago, valor_efectivo, valor_tarjeta, valor_transferencia, cliente_id } = req.body;
 const usuario_id = req.user.id;

 try {
  await client.query('BEGIN');

  // 1. Verificar caja
  const cajaRes = await client.query(`SELECT id FROM cajas WHERE id = $1 AND estado = 'abierta'`, [caja_id]);
  if (cajaRes.rowCount === 0) throw new Error('La caja especificada no está abierta o no existe.');

  let subtotal = 0;
  const procesados = [];

  // 2, 3 y 4. Verificar stock y PRECIO REAL en la base de datos
  for (const item of items) {
   const stockRes = await client.query(`
        SELECT s.id, COALESCE(i.cantidad, 0) as stock_actual, p.nombre_koaj, pr.precio_venta
        FROM skus s
        JOIN productos p ON p.id = s.producto_id
        LEFT JOIN inventario i ON i.sku_id = s.id AND i.tienda_id = $2
        LEFT JOIN precios pr ON pr.sku_id = s.id AND pr.tienda_id = $2
        WHERE s.ean = $1
      `, [item.ean, tienda_id]);

   if (stockRes.rowCount === 0) throw new Error(`Producto con EAN ${item.ean} no encontrado.`);

   const { id: sku_id, stock_actual, nombre_koaj, precio_venta } = stockRes.rows[0];

   if ((stock_actual || 0) < item.cantidad) {
    throw new Error(`Stock insuficiente para ${nombre_koaj}. Disponible: ${stock_actual || 0}`);
   }

   if (!precio_venta) {
    throw new Error(`El producto ${nombre_koaj} no tiene precio configurado para esta tienda.`);
   }

   // CAPA DE SEGURIDAD: Ignoramos el precio del JSON y usamos el de la BD
   const precio_real = Number(precio_venta);
   const total_linea = item.cantidad * precio_real;

   subtotal += total_linea;
   procesados.push({
    sku_id,
    cantidad: item.cantidad,
    precio_unitario: precio_real,
    total_linea
   });
  }

  const total = subtotal;

  // CAPA DE SEGURIDAD: Convertimos a números para evitar error NaN
  const vEfectivo = Number(valor_efectivo) || 0;
  const vTarjeta = Number(valor_tarjeta) || 0;
  const vTransferencia = Number(valor_transferencia) || 0;

  const cambio = (vEfectivo + vTarjeta + vTransferencia) - total;

  if (cambio < 0) {
   throw new Error(`El dinero recibido no alcanza para pagar el total de $${total}`);
  }

  // 6. Insertar Venta
  const ventaRes = await client.query(`
      INSERT INTO ventas (tienda_id, caja_id, usuario_id, cliente_id, subtotal, total, forma_pago, valor_efectivo, valor_tarjeta, valor_transferencia, cambio)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
    `, [tienda_id, caja_id, usuario_id, cliente_id || null, subtotal, total, forma_pago, vEfectivo, vTarjeta, vTransferencia, cambio]);

  const venta_id = ventaRes.rows[0].id;

  // 7 y 8. Insertar items y Kardex
  for (const p of procesados) {
   await client.query(`
        INSERT INTO venta_items (venta_id, sku_id, cantidad, precio_unitario, precio_costo, total_linea)
        VALUES ($1, $2, $3, $4, 0, $5) 
      `, [venta_id, p.sku_id, p.cantidad, p.precio_unitario, p.total_linea]);

   await client.query(`
        INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
        VALUES ($1, $2, 'venta', $3, $4, 'Ticket de Venta')
      `, [p.sku_id, tienda_id, -p.cantidad, venta_id]);
  }

  // 9. Actualizar totales de caja
  await client.query(`
      UPDATE cajas 
      SET total_efectivo = total_efectivo + $1, 
          total_tarjeta = total_tarjeta + $2, 
          total_transferencia = total_transferencia + $3
      WHERE id = $4
    `, [vEfectivo, vTarjeta, vTransferencia, caja_id]);

  await client.query('COMMIT');
  res.status(201).json({ status: 'success', message: 'Venta completada', venta_id, total, cambio });
 } catch (error) {
  await client.query('ROLLBACK');
  res.status(400).json({ error: error.message });
 }
};

const getVenta = async (req, res) => {
  const { id } = req.params;
  try {
    const ventaRes = await req.dbClient.query(`SELECT * FROM ventas WHERE id = $1`, [id]);
    if (ventaRes.rowCount === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    
    const itemsRes = await req.dbClient.query(`
      SELECT vi.*, p.nombre_koaj, s.ean 
      FROM venta_items vi
      JOIN skus s ON s.id = vi.sku_id
      JOIN productos p ON p.id = s.producto_id
      WHERE vi.venta_id = $1
    `, [id]);

    res.json({ venta: ventaRes.rows[0], items: itemsRes.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getVentasPorTienda = async (req, res) => {
  const { tienda_id } = req.params;
  const { fecha_inicio, fecha_fin } = req.query;
  try {
    const result = await req.dbClient.query(`
      SELECT * FROM ventas 
      WHERE tienda_id = $1 AND DATE(creado_en) BETWEEN $2 AND $3
      ORDER BY creado_en DESC
    `, [tienda_id, fecha_inicio || '2000-01-01', fecha_fin || '2100-01-01']);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const anularVenta = async (req, res) => {
  const client = req.dbClient;
  const { id } = req.params;

  try {
    await client.query('BEGIN');
    const ventaRes = await client.query(`SELECT * FROM ventas WHERE id = $1 AND estado = 'completada'`, [id]);
    if (ventaRes.rowCount === 0) throw new Error('Venta no encontrada o ya anulada');

    const venta = ventaRes.rows[0];

    // 1. Cambiar estado
    await client.query(`UPDATE ventas SET estado = 'anulada' WHERE id = $1`, [id]);

    // 2. Revertir inventario
    const itemsRes = await client.query(`SELECT sku_id, cantidad FROM venta_items WHERE venta_id = $1`, [id]);
    for (const item of itemsRes.rows) {
      await client.query(`
        INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
        VALUES ($1, $2, 'anulacion', $3, $4, 'Anulación de Venta')
      `, [item.sku_id, venta.tienda_id, item.cantidad, id]);
    }

    // 3. Restar de la caja
    await client.query(`
      UPDATE cajas 
      SET total_efectivo = total_efectivo - $1, 
          total_tarjeta = total_tarjeta - $2, 
          total_transferencia = total_transferencia - $3
      WHERE id = $4
    `, [venta.valor_efectivo, venta.valor_tarjeta, venta.valor_transferencia, venta.caja_id]);

    await client.query('COMMIT');
    res.json({ message: 'Venta anulada correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  }
};

module.exports = { registrarVentaRapida,abrirCaja, getCajaActiva, cerrarCaja, crearVenta, getVenta, getVentasPorTienda, anularVenta };
