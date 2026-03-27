const crearDevolucion = async (req, res) => {
  const client = req.dbClient;
  const { venta_id, tipo, motivo, items_entrada, items_salida } = req.body;
  const usuario_id = req.user.id;

  if (!items_entrada || !Array.isArray(items_entrada) || items_entrada.length === 0) {
    return res.status(400).json({ error: 'Debes indicar al menos un producto a devolver.' });
  }
  if (tipo === 'cambio' && (!items_salida || items_salida.length === 0)) {
    return res.status(400).json({ error: 'Un cambio requiere indicar el producto que se lleva el cliente.' });
  }

  try {
    await client.query('BEGIN');

    // 1. Validar que la venta existe y está completada
    const ventaRes = await client.query(
      `SELECT * FROM ventas WHERE id = $1 AND estado = 'completada'`,
      [venta_id]
    );
    if (ventaRes.rowCount === 0) throw new Error('Venta no encontrada o ya anulada.');
    const venta = ventaRes.rows[0];

    // 2. Crear cabecera de devolución
    const devRes = await client.query(
      `INSERT INTO devoluciones (venta_id, tienda_id, usuario_id, tipo, motivo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [venta_id, venta.tienda_id, usuario_id, tipo, motivo || null]
    );
    const devolucion_id = devRes.rows[0].id;

    let total_entrada = 0;
    let total_salida = 0;

    // 3. Procesar items que el cliente devuelve (entran al inventario)
    for (const item of items_entrada) {
      // Validar que el item pertenece a la venta original
      const ventaItemRes = await client.query(
        `SELECT vi.id, vi.precio_unitario, vi.cantidad
         FROM venta_items vi
         WHERE vi.venta_id = $1 AND vi.sku_id = $2`,
        [venta_id, item.sku_id]
      );
      if (ventaItemRes.rowCount === 0) {
        throw new Error(`El producto SKU ${item.sku_id} no pertenece a esta venta.`);
      }
      const ventaItem = ventaItemRes.rows[0];
      if (item.cantidad > ventaItem.cantidad) {
        throw new Error(`No puedes devolver más unidades de las que se vendieron (SKU ${item.sku_id}).`);
      }

      await client.query(
        `INSERT INTO devolucion_items_entrada (devolucion_id, sku_id, venta_item_id, cantidad, precio_original)
         VALUES ($1, $2, $3, $4, $5)`,
        [devolucion_id, item.sku_id, ventaItem.id, item.cantidad, ventaItem.precio_unitario]
      );

      // Kardex: el producto vuelve al inventario
      await client.query(
        `INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
         VALUES ($1, $2, 'devolucion_cliente', $3, $4, 'Devolución de cliente')`,
        [item.sku_id, venta.tienda_id, item.cantidad, devolucion_id]
      );

      total_entrada += ventaItem.precio_unitario * item.cantidad;
    }

    // 4. Si es cambio, procesar los items que el cliente se lleva (salen del inventario)
    if (tipo === 'cambio') {
      for (const item of items_salida) {
        const stockRes = await client.query(
          `SELECT COALESCE(SUM(k.cantidad), 0) as stock, pr.precio_venta, p.nombre_koaj
           FROM skus s
           JOIN productos p ON p.id = s.producto_id
           LEFT JOIN kardex k ON k.sku_id = s.id AND k.tienda_id = $2
           LEFT JOIN precios pr ON pr.sku_id = s.id AND pr.tienda_id = $2
           WHERE s.id = $1
           GROUP BY pr.precio_venta, p.nombre_koaj`,
          [item.sku_id, venta.tienda_id]
        );

        const stock = Number(stockRes.rows[0]?.stock) || 0;
        const nombre_koaj = stockRes.rows[0]?.nombre_koaj || `SKU ${item.sku_id}`;

        if (stock < item.cantidad) {
          throw new Error(`Sin stock para entregar ${nombre_koaj} en el cambio. Disponible: ${stock}`);
        }

        const precio_cambio = Number(stockRes.rows[0]?.precio_venta) || 0;

        await client.query(
          `INSERT INTO devolucion_items_salida (devolucion_id, sku_id, cantidad, precio_venta)
           VALUES ($1, $2, $3, $4)`,
          [devolucion_id, item.sku_id, item.cantidad, precio_cambio]
        );

        await client.query(
          `INSERT INTO kardex (sku_id, tienda_id, tipo, cantidad, referencia_documento, notas)
           VALUES ($1, $2, 'venta', $3, $4, 'Salida por cambio')`,
          [item.sku_id, venta.tienda_id, -item.cantidad, devolucion_id]
        );

        total_salida += precio_cambio * item.cantidad;
      }
    }

    // 5. Calcular diferencia y actualizarla
    const diferencia = total_entrada - total_salida;
    await client.query(
      `UPDATE devoluciones SET diferencia_precio = $1 WHERE id = $2`,
      [diferencia, devolucion_id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      message: tipo === 'cambio' ? 'Cambio registrado exitosamente.' : 'Devolución registrada exitosamente.',
      devolucion_id,
      diferencia_a_reembolsar: diferencia
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  }
};

const getDevolucion = async (req, res) => {
  const client = req.dbClient;
  const { id } = req.params;

  try {
    const devRes = await client.query(
      `SELECT d.*, v.numero_factura
       FROM devoluciones d
       JOIN ventas v ON v.id = d.venta_id
       WHERE d.id = $1`,
      [id]
    );
    if (devRes.rowCount === 0) return res.status(404).json({ error: 'Devolución no encontrada.' });

    const entradaRes = await client.query(
      `SELECT die.*, p.nombre_koaj, s.ean
       FROM devolucion_items_entrada die
       JOIN skus s ON s.id = die.sku_id
       JOIN productos p ON p.id = s.producto_id
       WHERE die.devolucion_id = $1`,
      [id]
    );

    const salidaRes = await client.query(
      `SELECT dis.*, p.nombre_koaj, s.ean
       FROM devolucion_items_salida dis
       JOIN skus s ON s.id = dis.sku_id
       JOIN productos p ON p.id = s.producto_id
       WHERE dis.devolucion_id = $1`,
      [id]
    );

    res.json({
      devolucion: devRes.rows[0],
      items_devueltos: entradaRes.rows,
      items_entregados: salidaRes.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { crearDevolucion, getDevolucion };
