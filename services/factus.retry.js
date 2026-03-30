// services/factus.retry.js
// Job que reintenta facturas electrónicas fallidas o pendientes

const pool = require('../config/db');
const factusService = require('./factus.service');

const MAX_INTENTOS = 3;
const INTERVALO_MS = 5 * 60 * 1000; // cada 5 minutos

async function reintentarFacturasPendientes() {
  let dbClient;
  try {
    dbClient = await pool.connect();

    const tenantSchema = process.env.TENANT_SCHEMA || 'nous';
    await dbClient.query(`SET search_path = "${tenantSchema}", public; SET timezone = 'America/Bogota';`);

    // Buscar FE pendientes o con error que aún tienen intentos disponibles
    const result = await dbClient.query(`
      SELECT id, payload_enviado
      FROM facturas_electronicas
      WHERE estado IN ('pendiente', 'error')
        AND intentos < $1
      LIMIT 10
    `, [MAX_INTENTOS]);

    if (result.rowCount === 0) return;

    console.log(`[Factus Retry] ${result.rowCount} factura(s) para reintentar`);

    for (const row of result.rows) {
      await reintentarUna(row.id, row.payload_enviado, dbClient);
    }

  } catch (err) {
    console.error('[Factus Retry] Error general:', err.message);
  } finally {
    if (dbClient) dbClient.release();
  }
}

async function reintentarUna(fe_id, payload, dbClient) {
  try {
    const resultado = await factusService.emitirFacturaElectronica(payload);
    const bill = resultado?.data?.bill || {};

    await dbClient.query(`
      UPDATE facturas_electronicas
      SET estado = 'emitida',
          numero_factura = $1,
          cufe = $2,
          respuesta_factus = $3,
          error_mensaje = NULL,
          intentos = intentos + 1,
          actualizado_en = NOW()
      WHERE id = $4
    `, [bill.number || null, bill.cufe || null, JSON.stringify(resultado), fe_id]);

    if (bill.number) {
      await dbClient.query(`
        UPDATE ventas
        SET numero_factura = $1, cufe = $2, estado_dian = 'emitida'
        WHERE id = (SELECT venta_id FROM facturas_electronicas WHERE id = $3)
      `, [bill.number, bill.cufe || null, fe_id]);
    }

    console.log(`[Factus Retry] FE id=${fe_id} emitida → ${bill.number}`);

  } catch (err) {
    console.error(`[Factus Retry] FE id=${fe_id} falló de nuevo: ${err.message}`);
    await dbClient.query(`
      UPDATE facturas_electronicas
      SET estado = 'error',
          error_mensaje = $1,
          intentos = intentos + 1,
          actualizado_en = NOW()
      WHERE id = $2
    `, [err.message, fe_id]);
  }
}

function iniciarRetryJob() {
  console.log(`[Factus Retry] Job iniciado — reintento cada ${INTERVALO_MS / 60000} min, máx ${MAX_INTENTOS} intentos`);
  // Primera ejecución al arrancar (con delay de 30s para que el server esté listo)
  setTimeout(reintentarFacturasPendientes, 30000);
  // Luego cada INTERVALO_MS
  setInterval(reintentarFacturasPendientes, INTERVALO_MS);
}

module.exports = { iniciarRetryJob };
