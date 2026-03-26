const registrarVentaRapida = async (req, res) => {
 const client = req.dbClient;
 const { ean, tienda_id } = req.body;

 try {
  await client.query('BEGIN');

  // 1. Buscar el SKU y calcular su stock actual en un solo paso
  const resStock = await client.query(`
      SELECT 
        s.id as sku_id, 
        p.nombre_koaj,
        COALESCE(SUM(k.cantidad), 0) as stock_actual
      FROM nous.skus s
      JOIN nous.productos p ON p.id = s.producto_id
      LEFT JOIN nous.kardex k ON k.sku_id = s.id AND k.tienda_id = $2
      WHERE s.ean = $1
      GROUP BY s.id, p.nombre_koaj
    `, [ean, tienda_id]);

  if (resStock.rowCount === 0) {
   await client.query('ROLLBACK');
   return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  const { sku_id, nombre_koaj, stock_actual } = resStock.rows[0];

  // 2. LA VALIDACIÓN CRÍTICA: Bloqueo si el stock es 0 o menos
  if (parseInt(stock_actual) <= 0) {
   await client.query('ROLLBACK');
   return res.status(400).json({
    error: 'Sin existencias',
    message: `No puedes vender ${nombre_koaj} porque el stock actual es ${stock_actual}.`
   });
  }

  // 3. Si hay stock, procedemos con la venta (-1)
  await client.query(`
      INSERT INTO nous.kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
      VALUES ($1, $2, 'venta', -1, 'TICKET-VENTA', $3)
    `, [sku_id, tienda_id, `Venta: ${nombre_koaj}`]);

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

module.exports = { registrarVentaRapida };