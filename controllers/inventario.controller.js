const getInventario = async (req, res) => {
  const client = req.dbClient;
  const tienda_id = req.query.tienda_id || req.user.tienda_id;

  try {
    const result = await client.query(`
      SELECT
        s.id        AS sku_id,
        s.ean,
        p.referencia_base,
        p.nombre_koaj,
        t.codigo    AS talla,
        c.nombre    AS color,
        COALESCE(i.cantidad, 0)  AS stock_actual,
        pr.precio_venta
      FROM skus s
      JOIN productos p  ON p.id = s.producto_id
      JOIN tallas t     ON t.id = s.talla_id
      JOIN colores c    ON c.id = p.color_id
      LEFT JOIN inventario i   ON i.sku_id = s.id  AND i.tienda_id = $1
      LEFT JOIN precios    pr  ON pr.sku_id = s.id AND pr.tienda_id = $1
      ORDER BY p.nombre_koaj, t.codigo
    `, [tienda_id]);

    res.json({ inventario: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

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
        SUM(k.cantidad) as stock_disponible
      FROM kardex k
      JOIN skus s ON s.id = k.sku_id
      JOIN productos p ON p.id = s.producto_id
      JOIN colores c ON c.id = p.color_id
      JOIN tallas t ON t.id = s.talla_id
      WHERE k.tienda_id = $1
      GROUP BY p.referencia_base, p.nombre_koaj, t.codigo, c.nombre
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
        k.created_at as fecha,
        k.tipo,
        k.cantidad,
        k.referencia_documento,
        k.notas,
        p.nombre_koaj,
        t.codigo as talla,
        c.nombre as color
      FROM kardex k
      JOIN skus s ON s.id = k.sku_id
      JOIN productos p ON p.id = s.producto_id
      JOIN tallas t ON t.id = s.talla_id
      JOIN colores c ON c.id = p.color_id
      WHERE k.sku_id = $1 AND k.tienda_id = $2
      ORDER BY k.created_at DESC;
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

// Busca un producto por EAN exacto, referencia_base o nombre para el POS
const buscarProducto = async (req, res) => {
  const client = req.dbClient;
  const { ean, q, tienda_id } = req.query;

  if (!ean && !q) return res.status(400).json({ error: 'Se requiere ean o q.' });
  if (!tienda_id)  return res.status(400).json({ error: 'Se requiere tienda_id.' });

  try {
    let rows;

    if (ean) {
      // 1. Búsqueda exacta por EAN
      const resultEan = await client.query(`
        SELECT
          s.id            AS sku_id,
          s.ean,
          p.nombre_koaj   AS nombre,
          p.referencia_base,
          t.codigo        AS talla,
          c.nombre        AS color,
          pr.precio_venta,
          COALESCE(SUM(k.cantidad), 0) AS stock_actual
        FROM skus s
        JOIN productos p  ON p.id  = s.producto_id
        JOIN tallas t     ON t.id  = s.talla_id
        JOIN colores c    ON c.id  = p.color_id
        LEFT JOIN precios pr ON pr.sku_id = s.id AND pr.tienda_id = $2
        LEFT JOIN kardex  k  ON k.sku_id  = s.id AND k.tienda_id = $2
        WHERE s.ean = $1
        GROUP BY s.id, s.ean, p.nombre_koaj, p.referencia_base, t.codigo, c.nombre, pr.precio_venta
        LIMIT 1
      `, [ean, tienda_id]);

      if (resultEan.rows.length > 0) {
        return res.json({ producto: resultEan.rows[0] });
      }

      // 2. Fallback: búsqueda exacta por referencia_base → devuelve todas las tallas disponibles
      const resultRef = await client.query(`
        SELECT
          s.id            AS sku_id,
          s.ean,
          p.nombre_koaj   AS nombre,
          p.referencia_base,
          t.codigo        AS talla,
          c.nombre        AS color,
          pr.precio_venta,
          COALESCE(SUM(k.cantidad), 0) AS stock_actual
        FROM skus s
        JOIN productos p  ON p.id  = s.producto_id
        JOIN tallas t     ON t.id  = s.talla_id
        JOIN colores c    ON c.id  = p.color_id
        LEFT JOIN precios pr ON pr.sku_id = s.id AND pr.tienda_id = $2
        LEFT JOIN kardex  k  ON k.sku_id  = s.id AND k.tienda_id = $2
        WHERE UPPER(p.referencia_base) = UPPER($1)
        GROUP BY s.id, s.ean, p.nombre_koaj, p.referencia_base, t.codigo, c.nombre, pr.precio_venta
        ORDER BY t.codigo
      `, [ean, tienda_id]);

      if (resultRef.rows.length === 0) {
        return res.json({ producto: null });
      }

      // Si solo hay una talla, la agrega directo como si fuera EAN
      if (resultRef.rows.length === 1) {
        return res.json({ producto: resultRef.rows[0] });
      }

      return res.json({ productos: resultRef.rows, tipo: 'referencia' });

    } else {
      // Búsqueda parcial por nombre o referencia (máx 10 resultados)
      const termino = `%${q}%`;
      const result = await client.query(`
        SELECT
          s.id            AS sku_id,
          s.ean,
          p.nombre_koaj   AS nombre,
          p.referencia_base,
          t.codigo        AS talla,
          c.nombre        AS color,
          pr.precio_venta,
          COALESCE(SUM(k.cantidad), 0) AS stock_actual
        FROM skus s
        JOIN productos p  ON p.id  = s.producto_id
        JOIN tallas t     ON t.id  = s.talla_id
        JOIN colores c    ON c.id  = p.color_id
        LEFT JOIN precios pr ON pr.sku_id = s.id AND pr.tienda_id = $2
        LEFT JOIN kardex  k  ON k.sku_id  = s.id AND k.tienda_id = $2
        WHERE p.nombre_koaj ILIKE $1
           OR p.referencia_base ILIKE $1
        GROUP BY s.id, s.ean, p.nombre_koaj, p.referencia_base, t.codigo, c.nombre, pr.precio_venta
        ORDER BY p.nombre_koaj, t.codigo
        LIMIT 10
      `, [termino, tienda_id]);
      rows = result.rows;
    }

    if (rows.length === 0) {
      return res.json(ean ? { producto: null } : { productos: [] });
    }

    // Si fue búsqueda por EAN devuelve objeto único; por texto devuelve array
    res.json(ean ? { producto: rows[0] } : { productos: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getInventario, getStoreStock, getKardexBySku, buscarProducto };