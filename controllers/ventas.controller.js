const pool = require('../config/db');
const factusService = require('../services/factus.service');

// Emite la FE a Factus de forma asíncrona y actualiza el registro en BD
async function emitirFacturaAsync(fe_id, payload, tenantSchema) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query(`SET search_path = "${tenantSchema}", public; SET timezone = 'America/Bogota';`);
    const resultado = await factusService.emitirFacturaElectronica(payload);
    const bill = resultado?.data?.bill || {};
    await dbClient.query(`
      UPDATE facturas_electronicas
      SET estado = 'emitida',
          numero_factura = $1,
          cufe = $2,
          respuesta_factus = $3,
          intentos = intentos + 1,
          actualizado_en = NOW()
      WHERE id = $4
    `, [bill.number || null, bill.cufe || null, JSON.stringify(resultado), fe_id]);

    // Sincronizar numero_factura y cufe en la tabla ventas
    if (bill.number) {
      await dbClient.query(`
        UPDATE ventas
        SET numero_factura = $1, cufe = $2, estado_dian = 'validada'
        WHERE id = (SELECT venta_id FROM facturas_electronicas WHERE id = $3)
      `, [bill.number, bill.cufe || null, fe_id]);
    }
  } catch (err) {
    console.error(`[Factus] Error emitiendo FE id=${fe_id}:`, err.message);
    try {
      await dbClient.query(`
        UPDATE facturas_electronicas
        SET estado = 'error',
            error_mensaje = $1,
            intentos = intentos + 1,
            actualizado_en = NOW()
        WHERE id = $2
      `, [err.message, fe_id]);
    } catch (dbErr) {
      console.error(`[Factus] No se pudo actualizar estado de error:`, dbErr.message);
    }
  } finally {
    dbClient.release();
  }
}

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
    // 1. Verificar si ya hay una caja abierta
    const cajaAbierta = await client.query(`
      SELECT id FROM cajas WHERE tienda_id = $1 AND estado = 'abierta'
    `, [tienda_id]);

    if (cajaAbierta.rowCount > 0) {
      return res.status(400).json({
        error: 'Ya existe una caja abierta para esta tienda.',
        caja_id: cajaAbierta.rows[0].id
      });
    }

    // 2. Si hay una caja cerrada de HOY, reabrirla en lugar de crear una nueva
    const cajaHoy = await client.query(`
      SELECT id FROM cajas WHERE tienda_id = $1 AND fecha = CURRENT_DATE AND estado = 'cerrada'
    `, [tienda_id]);

    if (cajaHoy.rowCount > 0) {
      const result = await client.query(`
        UPDATE cajas
        SET estado = 'abierta', cerrada_en = NULL, abierta_en = NOW(),
            usuario_id = $1, base_apertura = $2
        WHERE id = $3
        RETURNING *
      `, [usuario_id, base_apertura || 0, cajaHoy.rows[0].id]);
      return res.status(200).json(result.rows[0]);
    }

    // 3. No existe caja hoy — crear una nueva
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
      SELECT c.*,
        COALESCE((
          SELECT SUM(d.diferencia_precio)
          FROM devoluciones d
          WHERE d.tienda_id = $1
            AND DATE(d.creado_en) = c.fecha
            AND d.tipo = 'devolucion'
        ), 0)::BIGINT AS total_devoluciones,
        COALESCE((
          SELECT COUNT(*)
          FROM devoluciones d
          WHERE d.tienda_id = $1
            AND DATE(d.creado_en) = c.fecha
        ), 0)::INT AS num_devoluciones
      FROM cajas c
      WHERE c.tienda_id = $1 AND c.estado = 'abierta'
      ORDER BY c.abierta_en DESC
      LIMIT 1
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
 const {
   tienda_id, caja_id, items, forma_pago,
   valor_efectivo, valor_tarjeta, valor_transferencia,
   cliente_id,
   tipo_documento,      // 'fe' | 'pos' (default: 'pos')
   numbering_range_id,  // requerido si tipo_documento === 'fe'
   cliente_factus       // requerido si tipo_documento === 'fe'
 } = req.body;
 const usuario_id = req.user.id;
 const esFE = tipo_documento === 'fe';

 try {
  await client.query('BEGIN');

  // 1. Verificar caja y bloquear la fila para evitar condiciones de carrera
  const cajaRes = await client.query(
    `SELECT id FROM cajas WHERE id = $1 AND estado = 'abierta' FOR UPDATE`,
    [caja_id]
  );
  if (cajaRes.rowCount === 0) throw new Error('La caja especificada no está abierta o no existe.');

  let subtotal = 0;
  const procesados = [];

  // 2, 3 y 4. Verificar stock y PRECIO REAL en la base de datos
  for (const item of items) {
   const stockRes = await client.query(`
        SELECT s.id,
               COALESCE(SUM(k.cantidad), 0) AS stock_actual,
               p.nombre_koaj,
               pr.precio_venta
        FROM skus s
        JOIN productos p ON p.id = s.producto_id
        LEFT JOIN kardex k  ON k.sku_id  = s.id AND k.tienda_id  = $2
        LEFT JOIN precios pr ON pr.sku_id = s.id AND pr.tienda_id = $2
        WHERE s.ean = $1
        GROUP BY s.id, p.nombre_koaj, pr.precio_venta
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
    nombre: nombre_koaj,
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

  // --- FACTURA ELECTRÓNICA (asíncrona) ---
  let fe_id = null;
  if (esFE) {
    if (!numbering_range_id || !cliente_factus) {
      return res.status(400).json({ error: 'Para factura electrónica se requieren numbering_range_id y cliente_factus.' });
    }

    const factusPayload = factusService.buildPayloadFactura({
      numbering_range_id,
      reference_code: `V-${venta_id}`,
      cliente_factus,
      items_procesados: procesados,
      forma_pago,
      vEfectivo: Number(valor_efectivo) || 0,
      vTarjeta: Number(valor_tarjeta) || 0,
      vTransferencia: Number(valor_transferencia) || 0
    });

    // Validar que no exista ya una FE para esta venta
    const feExistente = await client.query(`
      SELECT id, estado FROM facturas_electronicas WHERE venta_id = $1 LIMIT 1
    `, [venta_id]);
    if (feExistente.rowCount > 0) {
      const { id: fe_id_existente, estado } = feExistente.rows[0];
      return res.status(409).json({
        error: `Esta venta ya tiene una factura electrónica (id=${fe_id_existente}, estado=${estado}).`
      });
    }

    // Insertar registro pendiente en BD
    const feRes = await client.query(`
      INSERT INTO facturas_electronicas (venta_id, estado, payload_enviado)
      VALUES ($1, 'pendiente', $2) RETURNING id
    `, [venta_id, JSON.stringify(factusPayload)]);
    fe_id = feRes.rows[0].id;

    // Emitir a Factus sin bloquear la respuesta
    const tenantSchema = req.user.tenant_schema;
    setImmediate(() => {
      emitirFacturaAsync(fe_id, factusPayload, tenantSchema).catch(() => {});
    });
  }

  res.status(201).json({
    status: 'success',
    message: 'Venta completada',
    venta_id,
    total,
    cambio,
    tipo_documento: tipo_documento || 'pos',
    ...(fe_id && { factura_electronica_id: fe_id })
  });

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

    const feRes = await req.dbClient.query(`
      SELECT id, estado, numero_factura, cufe, error_mensaje, intentos, actualizado_en, payload_enviado, respuesta_factus
      FROM facturas_electronicas
      WHERE venta_id = $1
      ORDER BY creado_en DESC
      LIMIT 1
    `, [id]);

    let factura_electronica = null;
    let cliente = null;

    if (feRes.rowCount > 0) {
      const fe = feRes.rows[0];
      const respuesta = fe.respuesta_factus ?? {};
      const esNC      = respuesta.tipo === 'nota_credito';
      const ncData    = respuesta?.data?.credit_note ?? {};

      factura_electronica = {
        id:              fe.id,
        estado:          fe.estado,
        numero_factura:  fe.numero_factura,
        cufe:            fe.cufe,
        error_mensaje:   fe.error_mensaje,
        intentos:        fe.intentos,
        actualizado_en:  fe.actualizado_en,
        // Nota Crédito
        nota_credito:    esNC ? (respuesta.nc_number ?? ncData.number ?? null) : null,
        nc_cude:         esNC ? (ncData.cude ?? null) : null,
        nc_public_url:   esNC ? (ncData.public_url ?? null) : null,
        nc_estado:       esNC ? 'emitida' : (fe.estado === 'emitida' ? null : 'pendiente'),
      };
      // Extraer datos del cliente desde el payload enviado a Factus
      const payload = fe.payload_enviado;
      if (payload?.customer) {
        cliente = payload.customer;
      }
    }

    // Devoluciones asociadas a esta venta
    const devRes = await req.dbClient.query(`
      SELECT
        d.id, d.tipo, d.motivo, d.diferencia_precio, d.creado_en,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'nombre', p.nombre_koaj,
              'ean', s.ean,
              'cantidad', die.cantidad,
              'precio_original', die.precio_original
            )
          ) FILTER (WHERE die.id IS NOT NULL),
          '[]'
        ) AS items_devueltos
      FROM devoluciones d
      LEFT JOIN devolucion_items_entrada die ON die.devolucion_id = d.id
      LEFT JOIN skus s ON s.id = die.sku_id
      LEFT JOIN productos p ON p.id = s.producto_id
      WHERE d.venta_id = $1
      GROUP BY d.id
      ORDER BY d.creado_en ASC
    `, [id]);

    res.json({ venta: ventaRes.rows[0], items: itemsRes.rows, factura_electronica, cliente, devoluciones: devRes.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getVentasPorTienda = async (req, res) => {
  const { tienda_id } = req.params;
  const { fecha_inicio, fecha_fin } = req.query;
  try {
    const result = await req.dbClient.query(`
      SELECT v.*, fe.estado AS estado_fe,
             CASE WHEN COUNT(d.id) > 0 THEN true ELSE false END AS tiene_devolucion
      FROM ventas v
      LEFT JOIN facturas_electronicas fe ON fe.venta_id = v.id
      LEFT JOIN devoluciones d ON d.venta_id = v.id
      WHERE v.tienda_id = $1 AND DATE(v.creado_en) BETWEEN $2 AND $3
      GROUP BY v.id, fe.estado
      ORDER BY v.creado_en DESC
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

    // Bloquear la fila de la caja para evitar condiciones de carrera
    await client.query(`SELECT id FROM cajas WHERE id = $1 FOR UPDATE`, [venta.caja_id]);

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

    // 4. Verificar si tiene FE emitida para generar Nota Crédito
    const feRes = await client.query(`
      SELECT id, respuesta_factus, payload_enviado
      FROM facturas_electronicas
      WHERE venta_id = $1 AND estado = 'emitida'
      LIMIT 1
    `, [id]);

    await client.query('COMMIT');

    // 5. Si hay FE emitida, emitir NC asíncronamente
    if (feRes.rowCount > 0) {
      const fe = feRes.rows[0];
      const r  = fe.respuesta_factus ?? {};

      // Factus puede devolver el bill id en distintas rutas según versión de API
      const billId = r?.data?.bill?.id
                  ?? r?.bill?.id
                  ?? r?.data?.id
                  ?? null;

      const payloadOriginal = fe.payload_enviado;

      console.log(`[NC] fe_id=${fe.id} billId=${billId} payloadKeys=${Object.keys(payloadOriginal || {}).join(',')}`);

      if (billId && payloadOriginal) {
        const tenantSchema = req.user.tenant_schema;
        const numeroFactura = fe.numero_factura ?? null;
        setImmediate(() => {
          emitirNotaCreditoAsync(fe.id, billId, id, payloadOriginal, tenantSchema, numeroFactura).catch(() => {});
        });
        return res.json({ message: 'Venta anulada. Nota Crédito en proceso de emisión.', nota_credito: 'pendiente' });
      }

      // billId no encontrado — guardar aviso para reintento manual
      console.warn(`[NC] No se encontró bill_id en respuesta_factus para fe_id=${fe.id}. Estructura: ${JSON.stringify(r).slice(0, 300)}`);
    }

    res.json({ message: 'Venta anulada correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  }
};

async function emitirNotaCreditoAsync(fe_id, billId, venta_id, payloadOriginal, tenantSchema, numeroFactura) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query(`SET search_path = "${tenantSchema}", public; SET timezone = 'America/Bogota';`);

    const resultado = await factusService.emitirNotaCredito({
      bill_id:             billId,
      number_bill:         numeroFactura,
      reference_code:      `NC-${venta_id}`,
      customer:            payloadOriginal.customer,
      items:               payloadOriginal.items,
      payment_method_code: payloadOriginal.payment_method_code,
    });

    const nc = resultado?.data?.credit_note || resultado?.data || {};
    await dbClient.query(`
      UPDATE facturas_electronicas
      SET respuesta_factus = $1,
          error_mensaje = NULL,
          actualizado_en = NOW()
      WHERE id = $2
    `, [JSON.stringify({ ...JSON.parse(JSON.stringify(resultado)), tipo: 'nota_credito', nc_number: nc.number }), fe_id]);

    console.log(`[Factus NC] Nota Crédito emitida para FE id=${fe_id} → ${nc.number}`);
  } catch (err) {
    console.error(`[Factus NC] Error emitiendo NC para FE id=${fe_id}:`, err.message);
    await dbClient.query(`
      UPDATE facturas_electronicas
      SET error_mensaje = $1, actualizado_en = NOW()
      WHERE id = $2
    `, [`NC Error: ${err.message}`, fe_id]);
  } finally {
    dbClient.release();
  }
}

// Envía la factura electrónica por email al cliente
const enviarEmailFactura = async (req, res) => {
  const { id } = req.params;  // id = venta_id (UUID)
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Se requiere el campo email.' });

  try {
    const result = await req.dbClient.query(
      `SELECT numero_factura, estado FROM facturas_electronicas WHERE venta_id = $1 ORDER BY id DESC LIMIT 1`, [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada' });

    const { numero_factura, estado } = result.rows[0];

    if (estado !== 'emitida' || !numero_factura) {
      return res.status(400).json({ error: `La factura aún no está emitida (estado: ${estado})` });
    }

    await factusService.enviarEmailFactura(numero_factura, email);
    res.json({ message: `Factura ${numero_factura} enviada a ${email}` });

  } catch (error) {
    res.status(502).json({ error: `Error enviando email: ${error.message}` });
  }
};

// Mapa de códigos locales → ID numérico que espera Factus
const FACTUS_DOC_IDS = {
  CC:  3,   // Cédula de ciudadanía
  NIT: 6,   // NIT
  CE:  5,   // Cédula de extranjería
  PP:  4,   // Pasaporte
  TI:  7,   // Tarjeta de identidad
  RC:  11,  // Registro civil
};

// Consulta datos del cliente en la DIAN por tipo y número de documento
const consultarClienteFactus = async (req, res) => {
  const { tipo_doc, numero } = req.query;
  if (!tipo_doc || !numero) {
    return res.status(400).json({ error: 'Se requieren los parámetros tipo_doc y numero.' });
  }

  const identification_document_id = FACTUS_DOC_IDS[tipo_doc?.toUpperCase()];
  if (!identification_document_id) {
    return res.status(400).json({ error: `Tipo de documento no soportado: ${tipo_doc}. Use: ${Object.keys(FACTUS_DOC_IDS).join(', ')}` });
  }

  try {
    const data = await factusService.consultarAdquiriente(identification_document_id, numero);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: `Error consultando Factus: ${error.message}` });
  }
};

// Consulta el estado de una factura electrónica por su ID
const getFacturaElectronica = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await req.dbClient.query(
      `SELECT * FROM facturas_electronicas WHERE id = $1`, [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Descarga el PDF de una factura electrónica — responde con el archivo PDF
const descargarPdfFactura = async (req, res) => {
  const { id } = req.params;  // id = venta_id (UUID)
  try {
    const result = await req.dbClient.query(
      `SELECT numero_factura, estado FROM facturas_electronicas WHERE venta_id = $1 ORDER BY id DESC LIMIT 1`, [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada' });

    const { numero_factura, estado } = result.rows[0];

    if (estado !== 'emitida' || !numero_factura) {
      return res.status(400).json({ error: `La factura aún no está emitida (estado: ${estado})` });
    }

    const { file_name, pdf_base_64_encoded } = await factusService.descargarPdfFactura(numero_factura);

    const pdfBuffer = Buffer.from(pdf_base_64_encoded, 'base64');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file_name}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getHistorialCajas = async (req, res) => {
  const client = req.dbClient;
  const { tienda_id } = req.query;

  if (!tienda_id) return res.status(400).json({ error: 'Se requiere tienda_id.' });

  try {
    const result = await client.query(`
      SELECT
        c.id,
        c.fecha,
        TO_CHAR(c.abierta_en AT TIME ZONE 'America/Bogota', 'HH24:MI') AS apertura,
        TO_CHAR(c.cerrada_en AT TIME ZONE 'America/Bogota', 'HH24:MI') AS cierre,
        c.base_apertura                                                  AS saldo_inicial,
        COALESCE(SUM(v.total), 0)::BIGINT                               AS total_ventas,
        COUNT(v.id)::INT                                                 AS transacciones,
        COALESCE((
          SELECT SUM(d.diferencia_precio)
          FROM devoluciones d
          WHERE d.tienda_id = c.tienda_id AND DATE(d.creado_en) = c.fecha
            AND d.tipo = 'devolucion'
        ), 0)::BIGINT                                                    AS total_devoluciones,
        COALESCE((
          SELECT COUNT(*)
          FROM devoluciones d
          WHERE d.tienda_id = c.tienda_id AND DATE(d.creado_en) = c.fecha
        ), 0)::INT                                                       AS num_devoluciones,
        c.estado
      FROM cajas c
      LEFT JOIN ventas v ON v.caja_id = c.id AND v.estado = 'completada'
      WHERE c.tienda_id = $1
      GROUP BY c.id, c.fecha, c.abierta_en, c.cerrada_en, c.base_apertura, c.estado
      ORDER BY c.fecha DESC, c.abierta_en DESC
      LIMIT 30
    `, [tienda_id]);

    res.json({ cajas: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  registrarVentaRapida, abrirCaja, getCajaActiva, cerrarCaja, getHistorialCajas,
  crearVenta, getVenta, getVentasPorTienda, anularVenta,
  consultarClienteFactus, getFacturaElectronica, descargarPdfFactura, enviarEmailFactura
};
