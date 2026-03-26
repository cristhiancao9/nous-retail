// controllers/recepciones.controller.js
const { parseKoajItem, parseKoajXML } = require('../utils/parsers');
const uploadXML = async (req, res) => {
  const client = req.dbClient;
  // Aseguramos que los datos que vienen del form-data sean números
  const tienda_id = parseInt(req.body.tienda_id, 10);
  const margen_objetivo = parseFloat(req.body.margen_objetivo);

  if (!req.file) return res.status(400).json({ error: 'No se subió archivo XML' });

  try {
    await client.query('BEGIN'); // Iniciar Transacción

    const facturaData = parseKoajXML(req.file.buffer);
    const margen = margen_objetivo / 100;

    // 1. Crear Recepción
    const resRecepcion = await client.query(`
      INSERT INTO recepciones (tienda_id, usuario_id, factura_koaj, fecha_factura, descuento_pct, estado)
      VALUES ($1, $2, $3, $4, $5, 'abierta') RETURNING id;
    `, [tienda_id, req.user.id, facturaData.factura_koaj, facturaData.fecha_factura, facturaData.items[0]?.descuento_pct || 0]);

    const recepcion_id = resRecepcion.rows[0].id;
    let totalUnidades = 0;
    let totalCosto = 0;

    // 2. Procesar Ítems
    for (const item of facturaData.items) {
      // Reemplaza el parseKoajRef antiguo por esto:
      const refFull = `${item.referencia_base}-${item.color}`;
      const metadata = parseKoajItem(refFull, item.nombre_koaj);

      // FIX 1: Mandamos el nombre del color ya armado desde Node.js para no confundir a Postgres
      const nombreColor = `Color ${item.color}`;
      const resColor = await client.query(`
        INSERT INTO colores (codigo, nombre) VALUES ($1, $2)
        ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id;
      `, [item.color, nombreColor]);

      // FIX 2: Actualizamos el ON CONFLICT a (codigo, tipo) que fue el cambio que hicimos en la BD
      const resTalla = await client.query(`
        INSERT INTO tallas (codigo, tipo, orden) VALUES ($1, 'ropa', 99)
        ON CONFLICT (codigo, tipo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id;
      `, [item.talla]);

      // Reemplaza el INSERT de resProd por esto:
      const precio_lista_koaj = Math.round(item.precio_sin_iva * 1.19);
      const resProd = await client.query(`
        INSERT INTO productos (referencia_base, color_id, referencia_full, genero, familia, nombre_koaj, nombre_diseno, temporada, precio_lista_koaj)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (referencia_full) DO UPDATE SET precio_lista_koaj = EXCLUDED.precio_lista_koaj
        RETURNING id;
      `, [item.referencia_base, resColor.rows[0].id, refFull, metadata.genero, metadata.familia, item.nombre_koaj, metadata.nombre_diseno, metadata.temporada, precio_lista_koaj]);

      const resSku = await client.query(`
        INSERT INTO skus (producto_id, talla_id) VALUES ($1, $2)
        ON CONFLICT (producto_id, talla_id) DO UPDATE SET producto_id = EXCLUDED.producto_id
        RETURNING id;
      `, [resProd.rows[0].id, resTalla.rows[0].id]);

      const sku_id = resSku.rows[0].id;
      const precio_costo = Math.round(item.precio_sin_iva * (1 - (item.descuento_pct / 100)) * 1.19);
      const precio_venta = Math.round(precio_costo / (1 - margen));

      await client.query(`
        INSERT INTO precios (sku_id, tienda_id, precio_venta, creado_por) VALUES ($1, $2, $3, $4)
        ON CONFLICT (sku_id, tienda_id) DO UPDATE SET precio_venta = EXCLUDED.precio_venta;
      `, [sku_id, tienda_id, precio_venta, req.user.id]);

      // Generar una línea por cada unidad física que haya llegado (para escanear 1 a 1)
      for (let i = 0; i < item.cantidad; i++) {
        await client.query(`
          INSERT INTO recepcion_items (recepcion_id, sku_id, precio_lista, precio_costo)
          VALUES ($1, $2, $3, $4);
        `, [recepcion_id, sku_id, precio_lista_koaj, precio_costo]);
      }

      totalUnidades += item.cantidad;
      totalCosto += (precio_costo * item.cantidad);
    }

    await client.query(`UPDATE recepciones SET total_unidades = $1, total_costo = $2 WHERE id = $3;`, [totalUnidades, totalCosto, recepcion_id]);
    await client.query('COMMIT');

    res.status(201).json({ message: 'Recepción creada con éxito', recepcion_id, totalUnidades });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error procesando XML:', error);
    res.status(500).json({ error: 'Error procesando XML', detalle: error.message });
  }
};

const scanItem = async (req, res) => {
  const client = req.dbClient;
  const { id: recepcion_id } = req.params;
  const { ean, force_sku_id } = req.body; // force_sku_id se usa solo si el EAN es nuevo

  try {
    await client.query('BEGIN');

    // 1. Buscar si el EAN ya existe en nuestro catálogo de SKUs
    let resSku = await client.query(`SELECT id, producto_id FROM nous.skus WHERE ean = $1`, [ean]);

    // CASO A: El EAN es nuevo (Tu filtro)
    if (resSku.rowCount === 0) {
      if (!force_sku_id) {
        // Traemos los datos técnicos para que el administrador elija correctamente
        const pendientes = await client.query(`
          SELECT DISTINCT 
            s.id, 
            p.referencia_base, 
            p.nombre_koaj, 
            p.nombre_diseno, 
            t.codigo as talla, 
            c.nombre as color
          FROM nous.recepcion_items ri
          JOIN nous.skus s ON s.id = ri.sku_id
          JOIN nous.productos p ON p.id = s.producto_id
          JOIN nous.colores c ON c.id = p.color_id
          JOIN nous.tallas t ON t.id = s.talla_id
          WHERE ri.recepcion_id = $1 AND ri.verificado_por_empleado = FALSE
          ORDER BY p.nombre_koaj ASC
        `, [recepcion_id]);

        await client.query('ROLLBACK');
        return res.status(404).json({
          status: 'ean_desconocido',
          message: 'Este código de barras no está vinculado. Por favor selecciona el producto.',
          pendientes: pendientes.rows
        });
      }

      // Si enviaron force_sku_id, vinculamos el EAN al SKU para siempre
      await client.query(`UPDATE nous.skus SET ean = $1 WHERE id = $2`, [ean, force_sku_id]);
      resSku = { rows: [{ id: force_sku_id }] };
    }

    const sku_id = resSku.rows[0].id;

    // 2. Marcar una unidad como verificada en esta recepción
    const updateRes = await client.query(`
      UPDATE nous.recepcion_items 
      SET verificado_por_empleado = TRUE, 
          fecha_verificacion = NOW(),
          ean_escaneado = $1
      WHERE id = (
        SELECT id FROM nous.recepcion_items 
        WHERE recepcion_id = $2 AND sku_id = $3 AND verificado_por_empleado = FALSE
        LIMIT 1
      )
      RETURNING id;
    `, [ean, recepcion_id, sku_id]);

    if (updateRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Esa prenda ya fue verificada o no pertenece a esta factura' });
    }

    await client.query('COMMIT');
    res.json({ status: 'success', message: 'Ítem verificado correctamente' });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
};

const getVerificationSummary = async (req, res) => {
  const client = req.dbClient;
  const { id: recepcion_id } = req.params;

  try {
    const summary = await client.query(`
      SELECT 
        p.referencia_base,
        p.nombre_koaj,
        t.codigo as talla,
        c.nombre as color,
        COUNT(*) as total_esperado,
        SUM(CASE WHEN ri.verificado_por_empleado THEN 1 ELSE 0 END) as verificado,
        (COUNT(*) - SUM(CASE WHEN ri.verificado_por_empleado THEN 1 ELSE 0 END)) as faltante
      FROM nous.recepcion_items ri
      JOIN nous.skus s ON s.id = ri.sku_id
      JOIN nous.productos p ON p.id = s.producto_id
      JOIN nous.colores c ON c.id = p.color_id
      JOIN nous.tallas t ON t.id = s.talla_id
      WHERE ri.recepcion_id = $1
      GROUP BY p.referencia_base, p.nombre_koaj, t.codigo, c.nombre
      ORDER BY p.nombre_koaj ASC, t.codigo ASC;
    `, [recepcion_id]);

    res.json({
      recepcion_id,
      resumen: summary.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getReception = async (req, res) => {
  res.json({ status: 'ok' });
};

const getDiscrepancies = async (req, res) => {
  const client = req.dbClient;
  const { id: recepcion_id } = req.params;

  try {
    // 1. Detalle por producto
    const discrepancies = await client.query(`
      SELECT 
        p.referencia_base,
        p.nombre_koaj,
        t.codigo as talla,
        c.nombre as color,
        COUNT(*) as cantidad_faltante,
        MAX(ri.precio_lista) as precio_unitario,
        (COUNT(*) * MAX(ri.precio_lista)) as total_perdido_pvp
      FROM nous.recepcion_items ri
      JOIN nous.skus s ON s.id = ri.sku_id
      JOIN nous.productos p ON p.id = s.producto_id
      JOIN nous.colores c ON c.id = p.color_id
      JOIN nous.tallas t ON t.id = s.talla_id
      WHERE ri.recepcion_id = $1 AND ri.verificado_por_empleado = FALSE
      GROUP BY p.referencia_base, p.nombre_koaj, t.codigo, c.nombre
      ORDER BY p.nombre_koaj ASC;
    `, [recepcion_id]);

    // 2. Totales globales (Dinero y Unidades)
    const totalsRes = await client.query(`
        SELECT 
            COUNT(*) as unidades_totales_faltantes,
            SUM(precio_lista) as gran_total_dinero_faltante
        FROM nous.recepcion_items
        WHERE recepcion_id = $1 AND verificado_por_empleado = FALSE
    `, [recepcion_id]);

    const resumenGeneral = totalsRes.rows[0];

    res.json({
      recepcion_id,
      resumen_faltantes: discrepancies.rows,
      unidades_totales_faltantes: parseInt(resumenGeneral.unidades_totales_faltantes) || 0,
      valor_total_dinero_faltante: parseFloat(resumenGeneral.gran_total_dinero_faltante) || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const closeReception = async (req, res) => {
  const client = req.dbClient;
  const { id: recepcion_id } = req.params;

  try {
    await client.query('BEGIN');

    // 1. Contar qué se esperaba vs qué se verificó realmente
    const conteoRes = await client.query(`
      SELECT 
        COUNT(*) as total_xml,
        SUM(CASE WHEN verificado_por_empleado THEN 1 ELSE 0 END) as total_verificado
      FROM nous.recepcion_items 
      WHERE recepcion_id = $1
    `, [recepcion_id]);

    const { total_xml, total_verificado } = conteoRes.rows[0];
    const tieneDiscrepancia = total_xml !== total_verificado;

    // 2. Obtener solo los ítems que SÍ fueron verificados para mover al Kardex
    const itemsVerificados = await client.query(`
      SELECT sku_id, COUNT(*) as cantidad
      FROM nous.recepcion_items 
      WHERE recepcion_id = $1 AND verificado_por_empleado = TRUE
      GROUP BY sku_id
    `, [recepcion_id]);

    const recepcionData = await client.query(
      `SELECT tienda_id, factura_koaj FROM nous.recepciones WHERE id = $1`,
      [recepcion_id]
    );
    const { tienda_id, factura_koaj } = recepcionData.rows[0];

    // 3. Cargar al Kardex SOLAMENTE lo que llegó físicamente
    for (const item of itemsVerificados.rows) {
      await client.query(`
        INSERT INTO nous.kardex (sku_id, tienda_id, tipo , cantidad, referencia_documento, notas)
        VALUES ($1, $2, 'entrada_compra', $3, $4, $5)
      `, [
        item.sku_id,
        tienda_id,
        item.cantidad,
        factura_koaj,
        tieneDiscrepancia ? `Cierre con NOVEDAD (Factura ${factura_koaj})` : `Carga completa (Factura ${factura_koaj})`
      ]);
    }

    // 4. Actualizar estado de la recepción
    const nuevoEstado = tieneDiscrepancia ? 'finalizada_con_discrepancia' : 'finalizada';
    await client.query(`
      UPDATE nous.recepciones 
      SET estado = $1, 
          total_unidades_recibidas = $2,
          fecha_cierre = NOW()
      WHERE id = $3
    `, [nuevoEstado, total_verificado, recepcion_id]);

    await client.query('COMMIT');

    res.json({
      message: tieneDiscrepancia ? 'Recepción cerrada con faltantes' : 'Recepción cerrada exitosamente',
      esperado: total_xml,
      recibido: total_verificado,
      estado: nuevoEstado
    });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
};

module.exports = { uploadXML, getReception, getDiscrepancies, scanItem, closeReception, getVerificationSummary };