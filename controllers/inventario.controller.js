const getStoreStock = async (req, res) => {
 const client = req.dbClient;
 const { tienda_id } = req.params;

 try {
  const stock = await client.query(`
      SELECT 
        p.referencia_base,
        p.nombre_koaj,
        t.codigo as talla,
        c.nombre as color,
        SUM(k.cantidad) as stock_disponible -- Suma directa (1 + -1 + -1 + -1 = -2)
      FROM nous.kardex k
      JOIN nous.skus s ON s.id = k.sku_id
      JOIN nous.productos p ON p.id = s.producto_id
      JOIN nous.colores c ON c.id = p.color_id
      JOIN nous.tallas t ON t.id = s.talla_id
      WHERE k.tienda_id = $1
      GROUP BY p.referencia_base, p.nombre_koaj, t.codigo, c.nombre
      -- Si quieres ver productos en 0 o negativo para auditoría, quita el HAVING
      ORDER BY p.nombre_koaj ASC;
    `, [tienda_id]);

  res.json(stock.rows);
 } catch (error) {
  res.status(500).json({ error: error.message });
 }
};
const getKardexBySku = async (req, res) => {
 const client = req.dbClient;
 const { sku_id } = req.params;
 const { tienda_id } = req.query;

 try {
  const history = await client.query(`
      SELECT 
        k.id,
        k.created_at as fecha, -- Cambiado de fecha_movimiento a created_at
        k.tipo,
        k.cantidad,
        k.referencia_documento,
        k.notas,
        p.nombre_koaj,
        p.referencia_base,
        t.codigo as talla,
        c.nombre as color
      FROM nous.kardex k
      JOIN nous.skus s ON s.id = k.sku_id
      JOIN nous.productos p ON p.id = s.producto_id
      JOIN nous.tallas t ON t.id = s.talla_id
      JOIN nous.colores c ON c.id = p.color_id
      WHERE k.sku_id = $1 AND k.tienda_id = $2
      ORDER BY k.created_at DESC; -- Cambiado aquí también
    `, [sku_id, tienda_id]);

  if (history.rowCount === 0) {
   return res.status(404).json({ message: 'No hay movimientos para este producto.' });
  }

  res.json({
   sku_id,
   producto: `${history.rows[0].nombre_koaj} (${history.rows[0].color} - Talla ${history.rows[0].talla})`,
   movimientos: history.rows
  });
 } catch (error) {
  res.status(500).json({ error: error.message });
 }
};

module.exports = { getStoreStock, getKardexBySku };