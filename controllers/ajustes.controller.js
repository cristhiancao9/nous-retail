const crearAjuste = async (req, res) => {
  const client = req.dbClient;
  const { tienda_id, motivo, items } = req.body;
  const usuario_id = req.user.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debes enviar al menos un producto para ajustar.' });
  }
  if (!motivo) {
    return res.status(400).json({ error: 'El motivo del ajuste es obligatorio.' });
  }

  try {
    await client.query('BEGIN');

    // 1. Crear cabecera del ajuste
    const ajusteRes = await client.query(
      `INSERT INTO ajustes_inventario (tienda_id, usuario_id, motivo)
       VALUES ($1, $2, $3) RETURNING id`,
      [tienda_id, usuario_id, motivo]
    );
    const ajuste_id = ajusteRes.rows[0].id;

    // 2. Procesar cada item
    for (const item of items) {
      const stockRes = await client.query(
        `SELECT COALESCE(SUM(k.cantidad), 0) as stock_sistema, p.nombre_koaj
         FROM skus s
         JOIN productos p ON p.id = s.producto_id
         LEFT JOIN kardex k ON k.sku_id = s.id AND k.tienda_id = $2
         WHERE s.ean = $1
         GROUP BY p.nombre_koaj`,
        [item.ean, tienda_id]
      );

      if (stockRes.rowCount === 0) throw new Error(`Producto EAN ${item.ean} no encontrado.`);

      const cantidad_sistema = Number(stockRes.rows[0].stock_sistema);
      const cantidad_real = Number(item.cantidad_real);
      const diferencia = cantidad_real - cantidad_sistema;

      // Si no hay diferencia, no hay nada que ajustar
      if (diferencia === 0) continue;

      await client.query(
        `INSERT INTO ajuste_items (ajuste_id, sku_id, cantidad_sistema, cantidad_real)
         SELECT $1, s.id, $2, $3 FROM skus s WHERE s.ean = $4`,
        [ajuste_id, cantidad_sistema, cantidad_real, item.ean]
      );

      // Kardex: ajuste positivo o negativo según la diferencia
      const tipo_kardex = diferencia > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
      await client.query(
        `INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
         SELECT s.id, $1, $2, $3, $4, $5 FROM skus s WHERE s.ean = $6`,
        [tienda_id, tipo_kardex, diferencia, ajuste_id, `Ajuste: ${motivo}`, item.ean]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Ajuste de inventario registrado exitosamente.', ajuste_id });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  }
};

const getAjuste = async (req, res) => {
  const client = req.dbClient;
  const { id } = req.params;

  try {
    const ajusteRes = await client.query(
      `SELECT a.*, u.nombre as creado_por, t.nombre as tienda
       FROM ajustes_inventario a
       JOIN usuarios u ON u.id = a.usuario_id
       JOIN tiendas t ON t.id = a.tienda_id
       WHERE a.id = $1`,
      [id]
    );
    if (ajusteRes.rowCount === 0) return res.status(404).json({ error: 'Ajuste no encontrado.' });

    const itemsRes = await client.query(
      `SELECT ai.cantidad_sistema, ai.cantidad_real, ai.diferencia,
              p.nombre_koaj, s.ean
       FROM ajuste_items ai
       JOIN skus s ON s.id = ai.sku_id
       JOIN productos p ON p.id = s.producto_id
       WHERE ai.ajuste_id = $1`,
      [id]
    );

    res.json({ ajuste: ajusteRes.rows[0], items: itemsRes.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { crearAjuste, getAjuste };
