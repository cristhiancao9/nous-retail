// routes/recepciones.routes.js
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middlewares/auth.middleware');
const {
  uploadXML, getRecepciones, getReception,
  getFacturaTrazabilidad, getDiscrepancies,
  scanItem, closeReception, getVerificationSummary
} = require('../controllers/recepciones.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const rolesPermitidos = ['admin', 'bodega'];

// Rutas fijas primero (antes de /:id para evitar colisiones)
router.get('/',                                requireAuth(rolesPermitidos), getRecepciones);
router.post('/xml',                            requireAuth(['admin']), upload.single('factura'), uploadXML);
router.get('/trazabilidad/:factura_koaj',      requireAuth(['admin', 'vendedor']), getFacturaTrazabilidad);

// Rutas con parámetro :id al final
router.get('/:id',                             requireAuth(rolesPermitidos), getReception);
router.get('/:id/discrepancias',               requireAuth(rolesPermitidos), getDiscrepancies);
router.get('/:id/resumen-verificacion',        requireAuth(rolesPermitidos), getVerificationSummary);
router.post('/:id/escanear',                   requireAuth(rolesPermitidos), scanItem);
router.post('/:id/cerrar',                     requireAuth(['admin']), closeReception);

module.exports = router;
