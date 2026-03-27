const crearTraslado = async (req, res) => {
 const client = req.dbClient;
 const { tienda_origen, tienda_destino, items, notas } = req.body;
 const usuario_id = req.user.id;

 if (!items || !Array.isArray(items) || items.length === 0) {
  return res.status(400).json({ error: 'Debes enviar al menos un producto en el traslado.' });
 }

 try {
  await client.query('BEGIN');

  if (tienda_origen === tienda_destino) {
   throw new Error('La tienda de origen y destino no pueden ser la misma.');
  }

  // 1. Crear cabecera del traslado
  const trasladoRes = await client.query(`
      INSERT INTO traslados (tienda_origen, tienda_destino, usuario_id, notas)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [tienda_origen, tienda_destino, usuario_id, notas]);

  const traslado_id = trasladoRes.rows[0].id;

  // 2. Verificar stock e insertar items
  for (const item of items) {
   // Verificamos stock en la tienda de origen
   const stockRes = await client.query(`
        SELECT s.id, COALESCE(i.cantidad, 0) as stock_actual, p.nombre_koaj
        FROM skus s
        JOIN productos p ON p.id = s.producto_id
        LEFT JOIN inventario i ON i.sku_id = s.id AND i.tienda_id = $2
        WHERE s.ean = $1
      `, [item.ean, tienda_origen]);

   if (stockRes.rowCount === 0) throw new Error(`Producto EAN ${item.ean} no encontrado.`);
   const { id: sku_id, nombre_koaj } = stockRes.rows[0];

   // Forzamos a que sean números reales de JavaScript
   const stockReal = Number(stockRes.rows[0].stock_actual) || 0;
   const cantidadSolicitada = Number(item.cantidad) || 0;

   if (stockReal < cantidadSolicitada) {
    throw new Error(`Stock insuficiente en origen para ${nombre_koaj}. Disponible: ${stockReal}, Solicitado: ${cantidadSolicitada}`);
   }

   await client.query(`
        INSERT INTO traslado_items (traslado_id, sku_id, cantidad)
        VALUES ($1, $2, $3)
      `, [traslado_id, sku_id, item.cantidad]);
  }

  await client.query('COMMIT');
  res.status(201).json({ message: 'Traslado creado en estado PENDIENTE', traslado_id });
 } catch (error) {
  await client.query('ROLLBACK');
  res.status(400).json({ error: error.message });
 }
};

const despacharTraslado = async (req, res) => {
 const client = req.dbClient;
 const { id } = req.params;

 try {
  await client.query('BEGIN');

  const tRes = await client.query(`SELECT * FROM traslados WHERE id = $1 AND estado = 'pendiente'`, [id]);
  if (tRes.rowCount === 0) throw new Error('Traslado no encontrado o ya despachado');
  const traslado = tRes.rows[0];

  // Cambiar estado
  await client.query(`UPDATE traslados SET estado = 'en_transito' WHERE id = $1`, [id]);

  // Re-verificar stock y descontar del Kardex Origen
  const itemsRes = await client.query(`SELECT sku_id, cantidad FROM traslado_items WHERE traslado_id = $1`, [id]);

  for (const item of itemsRes.rows) {
   const stockRes = await client.query(`
        SELECT COALESCE(SUM(k.cantidad), 0) as stock_actual, p.nombre_koaj
        FROM skus s
        JOIN productos p ON p.id = s.producto_id
        LEFT JOIN kardex k ON k.sku_id = s.id AND k.tienda_id = $2
        WHERE s.id = $1
        GROUP BY p.nombre_koaj
      `, [item.sku_id, traslado.tienda_origen]);

   const stockReal = Number(stockRes.rows[0]?.stock_actual) || 0;
   const nombre_koaj = stockRes.rows[0]?.nombre_koaj || `SKU ${item.sku_id}`;

   if (stockReal < item.cantidad) {
    throw new Error(`Stock insuficiente para despachar ${nombre_koaj}. Disponible: ${stockReal}, Requerido: ${item.cantidad}`);
   }

   await client.query(`
        INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
        VALUES ($1, $2, 'traslado_out', $3, $4, 'Despacho hacia tienda destino')
      `, [item.sku_id, traslado.tienda_origen, -item.cantidad, id]);
  }

  await client.query('COMMIT');
  res.json({ message: 'Mercancía despachada. Stock restado de tienda origen.' });
 } catch (error) {
  await client.query('ROLLBACK');
  res.status(400).json({ error: error.message });
 }
};

const recibirTraslado = async (req, res) => {
 const client = req.dbClient;
 const { id } = req.params;

 try {
  await client.query('BEGIN');

  const tRes = await client.query(`SELECT * FROM traslados WHERE id = $1 AND estado = 'en_transito'`, [id]);
  if (tRes.rowCount === 0) throw new Error('Traslado no encontrado o no está en tránsito');
  const traslado = tRes.rows[0];

  // Cambiar estado y fecha
  await client.query(`UPDATE traslados SET estado = 'recibido', recibido_en = NOW() WHERE id = $1`, [id]);

  // Sumar al Kardex Destino
  const itemsRes = await client.query(`SELECT sku_id, cantidad FROM traslado_items WHERE traslado_id = $1`, [id]);

  for (const item of itemsRes.rows) {
   await client.query(`
        INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
        VALUES ($1, $2, 'traslado_in', $3, $4, 'Recepción de tienda origen')
      `, [item.sku_id, traslado.tienda_destino, item.cantidad, id]);
  }

  await client.query('COMMIT');
  res.json({ message: 'Mercancía recibida. Stock sumado a tienda destino.' });
 } catch (error) {
  await client.query('ROLLBACK');
  res.status(400).json({ error: error.message });
 }
};

const getTraslados = async (req, res) => {
 const client = req.dbClient;
 const { estado, tienda_id } = req.query;

 try {
  let whereClause = 'WHERE 1=1';
  const params = [];

  if (estado) {
   params.push(estado);
   whereClause += ` AND t.estado = $${params.length}`;
  }
  if (tienda_id) {
   params.push(tienda_id);
   whereClause += ` AND (t.tienda_origen = $${params.length} OR t.tienda_destino = $${params.length})`;
  }

  const result = await client.query(`
      SELECT
        t.id, t.estado, t.notas, t.creado_en, t.recibido_en,
        to_orig.nombre AS tienda_origen,
        to_dest.nombre AS tienda_destino,
        u.nombre AS creado_por,
        COUNT(ti.id) AS total_referencias,
        SUM(ti.cantidad) AS total_unidades
      FROM traslados t
      JOIN tiendas to_orig ON to_orig.id = t.tienda_origen
      JOIN tiendas to_dest ON to_dest.id = t.tienda_destino
      JOIN usuarios u ON u.id = t.usuario_id
      LEFT JOIN traslado_items ti ON ti.traslado_id = t.id
      ${whereClause}
      GROUP BY t.id, to_orig.nombre, to_dest.nombre, u.nombre
      ORDER BY t.creado_en DESC
    `, params);

  res.json(result.rows);
 } catch (error) {
  res.status(500).json({ error: error.message });
 }
};

module.exports = { crearTraslado, despacharTraslado, recibirTraslado, getTraslados };