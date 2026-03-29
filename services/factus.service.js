// services/factus.service.js
// Maneja autenticación OAuth2 con Factus y expone los métodos de la API

const FACTUS_URL = process.env.FACTUS_URL || 'https://api-sandbox.factus.com.co';

// Token en memoria — se reutiliza entre requests
let tokenData = {
  access_token: null,
  refresh_token: null,
  expires_at: 0  // timestamp en ms
};

// --- AUTH ---

async function authenticate() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.FACTUS_CLIENT_ID,
    client_secret: process.env.FACTUS_CLIENT_SECRET,
    username: process.env.FACTUS_USERNAME,
    password: process.env.FACTUS_PASSWORD
  });

  const res = await fetch(`${FACTUS_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Factus auth fallida: ${res.status} - ${err}`);
  }

  const data = await res.json();
  // Guardamos con 60s de margen antes de que expire
  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000
  };
  return tokenData.access_token;
}

async function doRefresh() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.FACTUS_CLIENT_ID,
    client_secret: process.env.FACTUS_CLIENT_SECRET,
    refresh_token: tokenData.refresh_token
  });

  const res = await fetch(`${FACTUS_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    // Si el refresh falla, hacemos autenticación completa
    return authenticate();
  }

  const data = await res.json();
  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000
  };
  return tokenData.access_token;
}

async function getValidToken() {
  if (tokenData.access_token && Date.now() < tokenData.expires_at) {
    return tokenData.access_token;
  }
  if (tokenData.refresh_token) {
    return doRefresh();
  }
  return authenticate();
}

// --- HTTP HELPERS ---

async function factusGet(path) {
  const token = await getValidToken();
  const res = await fetch(`${FACTUS_URL}${path}`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Factus GET ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

async function factusPost(path, payload) {
  const token = await getValidToken();
  const res = await fetch(`${FACTUS_URL}${path}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Factus POST ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

// --- ENDPOINTS PÚBLICOS ---

/**
 * Consulta datos del adquiriente en la DIAN por tipo y número de documento.
 * @param {string|number} identification_document_id  ID del tipo de doc (ej: 3 = Cédula, 6 = NIT)
 * @param {string} identification_number              Número del documento
 */
async function consultarAdquiriente(identification_document_id, identification_number) {
  return factusGet(
    `/v1/dian/acquirer?identification_document_id=${identification_document_id}&identification_number=${encodeURIComponent(identification_number)}`
  );
}

/**
 * Crea y valida una factura electrónica en Factus/DIAN.
 * @param {object} payload  Body completo según spec de Factus
 */
async function emitirFacturaElectronica(payload) {
  return factusPost('/v1/bills/validate', payload);
}

/**
 * Descarga el PDF de una factura desde Factus.
 * @param {string} numero  Número de la factura (ej: SETP990028107)
 * @returns {{ file_name: string, pdf_base_64_encoded: string }}
 */
async function descargarPdfFactura(numero) {
  const data = await factusGet(`/v1/bills/download-pdf/${encodeURIComponent(numero)}`);
  return data?.data || data;
}

/**
 * Envía la factura electrónica por email al cliente vía Factus.
 * @param {string} numero  Número de la factura (ej: SETP990028107)
 * @param {string} email   Email del destinatario
 */
async function enviarEmailFactura(numero, email) {
  return factusPost(`/v1/bills/send-email/${encodeURIComponent(numero)}`, { email });
}

/**
 * Crea y valida una Nota Crédito de anulación en Factus.
 * @param {number} bill_id          ID interno de Factus de la factura original
 * @param {string} reference_code   Código de referencia único (ej: NC-venta_id)
 * @param {object} customer         Datos del cliente (mismo de la FE original)
 * @param {Array}  items            Items (mismos de la FE original)
 * @param {string} payment_method_code
 */
async function emitirNotaCredito({ bill_id, number_bill, reference_code, customer, items, payment_method_code }) {
  const payload = {
    numbering_range_id:      Number(process.env.FACTUS_NC_RANGE_ID),
    correction_concept_code: 2,    // 2 = Anulación de factura electrónica
    customization_id:        20,   // 20 = NC que referencia una FE
    bill_id:                 Number(bill_id),
    reference_code,
    send_email:              false,
    observation:             'Anulación de venta',
    payment_method_code:     payment_method_code || '10',
    customer,
    items,
  };
  // Número de la factura referenciada (evita notificación CBF02)
  if (number_bill) payload.number_bill = number_bill;
  return factusPost('/v1/credit-notes/validate', payload);
}

/**
 * Mapea la forma de pago del sistema local al código de medio de pago de Factus.
 */
function mapearMedioPago(forma_pago, vEfectivo, vTarjeta, vTransferencia) {
  if (vEfectivo > 0 && vTarjeta === 0 && vTransferencia === 0) return '10'; // Efectivo
  if (vTarjeta > 0 && vEfectivo === 0 && vTransferencia === 0) return '48';  // Tarjeta crédito
  if (vTransferencia > 0 && vEfectivo === 0 && vTarjeta === 0) return '47'; // Transferencia
  return '10'; // Mixto → efectivo por defecto
}

/**
 * Construye el payload de Factus a partir de los datos de una venta.
 */
function buildPayloadFactura({ numbering_range_id, reference_code, cliente_factus, items_procesados, forma_pago, vEfectivo, vTarjeta, vTransferencia }) {
  return {
    numbering_range_id: Number(numbering_range_id),
    reference_code: String(reference_code),
    payment_form: '1',  // 1 = contado
    payment_method_code: mapearMedioPago(forma_pago, vEfectivo, vTarjeta, vTransferencia),
    send_email: false,
    customer: {
      identification: String(cliente_factus.identification),
      dv: cliente_factus.dv || '',
      names: cliente_factus.names,
      company: cliente_factus.company || '',
      trade_name: cliente_factus.trade_name || '',
      address: cliente_factus.address || '',
      email: cliente_factus.email || '',
      phone: cliente_factus.phone || '',
      legal_organization_id: String(cliente_factus.legal_organization_id || '2'),
      tribute_id: String(cliente_factus.tribute_id || '21'),
      identification_document_id: String(cliente_factus.identification_document_id),
      municipality_id: String(cliente_factus.municipality_id || '980')
    },
    items: items_procesados.map(p => ({
      code_reference: String(p.sku_id),
      name: p.nombre,
      quantity: p.cantidad,
      discount_rate: 0,
      price: p.precio_unitario,
      tax_rate: '0.00',
      unit_measure_id: 70,  // 70 = Unidad (und)
      standard_code_id: 1,
      is_excluded: 1,  // No responsable de IVA
      tribute_id: 1    // IVA (requerido por Factus cuando is_excluded = 1)
    }))
  };
}

module.exports = {
  consultarAdquiriente,
  emitirFacturaElectronica,
  descargarPdfFactura,
  enviarEmailFactura,
  emitirNotaCredito,
  buildPayloadFactura
};
