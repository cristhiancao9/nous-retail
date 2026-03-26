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
        SUM(CASE 
          WHEN k.tipo IN ('entrada_compra', 'devolucion_cliente', 'ajuste_positivo') THEN k.cantidad 
          WHEN k.tipo IN ('venta', 'devolucion_proveedor', 'ajuste_negativo') THEN -k.cantidad 
          ELSE 0 
        END) as stock_disponible
      FROM nous.kardex k
      JOIN nous.skus s ON s.id = k.sku_id
      JOIN nous.productos p ON p.id = s.producto_id
      JOIN nous.colores c ON c.id = p.color_id
      JOIN nous.tallas t ON t.id = s.talla_id
      WHERE k.tienda_id = $1
      GROUP BY p.referencia_base, p.nombre_koaj, t.codigo, c.nombre
      HAVING SUM(CASE 
          WHEN k.tipo IN ('entrada_compra', 'devolucion_cliente', 'ajuste_positivo') THEN k.cantidad 
          WHEN k.tipo IN ('venta', 'devolucion_proveedor', 'ajuste_negativo') THEN -k.cantidad 
          ELSE 0 
        END) > 0
      ORDER BY p.nombre_koaj ASC;
    `, [tienda_id]);

  res.json(stock.rows);
 } catch (error) {
  res.status(500).json({ error: error.message });
 }
};

module.exports = { getStoreStock };