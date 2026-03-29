// controllers/dashboard.controller.js

const getMetricasDia = async (req, res) => {
  const client = req.dbClient;
  const tienda_id = req.query.tienda_id || req.user.tienda_id;

  try {
    // Ventas de hoy
    const hoyRes = await client.query(`
      SELECT
        COALESCE(SUM(total), 0)::BIGINT        AS ventas_dia,
        COUNT(*)::INT                          AS transacciones,
        COALESCE(ROUND(AVG(total)), 0)::BIGINT AS ticket_promedio
      FROM ventas
      WHERE tienda_id = $1
        AND DATE(creado_en) = CURRENT_DATE
        AND estado = 'completada'
    `, [tienda_id]);

    // Ventas de ayer (para calcular tendencias reales)
    const ayerRes = await client.query(`
      SELECT
        COALESCE(SUM(total), 0)::BIGINT        AS ventas_ayer,
        COUNT(*)::INT                          AS transacciones_ayer,
        COALESCE(ROUND(AVG(total)), 0)::BIGINT AS ticket_promedio_ayer
      FROM ventas
      WHERE tienda_id = $1
        AND DATE(creado_en) = CURRENT_DATE - INTERVAL '1 day'
        AND estado = 'completada'
    `, [tienda_id]);

    // Efectivo real desde la caja activa
    const cajaRes = await client.query(`
      SELECT
        COALESCE(total_efectivo, 0)::BIGINT AS efectivo_caja,
        estado
      FROM cajas
      WHERE tienda_id = $1 AND estado = 'abierta'
      LIMIT 1
    `, [tienda_id]);

    // Devoluciones de hoy
    const devRes = await client.query(`
      SELECT
        COUNT(*)::INT                          AS num_devoluciones,
        COALESCE(SUM(diferencia_precio), 0)::BIGINT AS total_devoluciones
      FROM devoluciones
      WHERE tienda_id = $1
        AND DATE(creado_en) = CURRENT_DATE
        AND tipo = 'devolucion'
    `, [tienda_id]);

    // Productos con stock crítico
    const stockRes = await client.query(`
      SELECT COUNT(*)::INT AS stock_critico
      FROM (
        SELECT s.id,
               COALESCE(SUM(k.cantidad), 0) AS stock_actual,
               5 AS stock_minimo
        FROM skus s
        LEFT JOIN kardex k ON k.sku_id = s.id AND k.tienda_id = $1
        GROUP BY s.id
        HAVING COALESCE(SUM(k.cantidad), 0) <= 5
      ) sub
    `, [tienda_id]);

    const hoy   = hoyRes.rows[0];
    const ayer  = ayerRes.rows[0];
    const caja  = cajaRes.rows[0] ?? {};
    const dev   = devRes.rows[0];
    const stock = stockRes.rows[0];

    // Calcular tendencias reales vs ayer
    const trend = (hoyVal, ayerVal) => {
      const hoy  = Number(hoyVal)  || 0;
      const ayer = Number(ayerVal) || 0;
      if (ayer === 0) return null;
      const pct = Math.round(((hoy - ayer) / ayer) * 100);
      return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' };
    };

    res.json({
      ventas_dia:           hoy.ventas_dia,
      transacciones:        hoy.transacciones,
      ticket_promedio:      hoy.ticket_promedio,
      efectivo_caja:        caja.efectivo_caja ?? 0,
      caja_abierta:         caja.estado === 'abierta',
      num_devoluciones:     dev.num_devoluciones,
      total_devoluciones:   dev.total_devoluciones,
      stock_critico:        stock.stock_critico,
      tendencia_ventas:     trend(hoy.ventas_dia, ayer.ventas_ayer),
      tendencia_trans:      trend(hoy.transacciones, ayer.transacciones_ayer),
      tendencia_ticket:     trend(hoy.ticket_promedio, ayer.ticket_promedio_ayer),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getVentasPorHora = async (req, res) => {
  const client = req.dbClient;
  const tienda_id = req.query.tienda_id || req.user.tienda_id;
  const { fecha } = req.query;

  const fechaFiltro = fecha || new Date().toISOString().split('T')[0];

  try {
    const result = await client.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('hour', creado_en), 'HH24:MI') AS hora,
        COALESCE(SUM(total), 0)::BIGINT                   AS ventas,
        COUNT(*)::INT                                     AS transacciones
      FROM ventas
      WHERE tienda_id = $1
        AND DATE(creado_en) = $2
        AND estado = 'completada'
      GROUP BY DATE_TRUNC('hour', creado_en)
      ORDER BY DATE_TRUNC('hour', creado_en)
    `, [tienda_id, fechaFiltro]);

    res.json({ data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getMetricasDia, getVentasPorHora };
