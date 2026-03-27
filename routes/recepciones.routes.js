// routes/recepciones.routes.js
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middlewares/auth.middleware');
const { uploadXML, getReception, getFacturaTrazabilidad, getDiscrepancies, scanItem, closeReception, getVerificationSummary } = require('../controllers/recepciones.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const rolesPermitidos = ['admin', 'bodega'];

router.post('/xml', requireAuth(['admin']), upload.single('factura'), uploadXML);
router.get('/:id', requireAuth(rolesPermitidos), getReception);
router.get('/trazabilidad/:factura_koaj', requireAuth(['admin', 'vendedor']), getFacturaTrazabilidad);
router.get('/:id/discrepancias', requireAuth(rolesPermitidos), getDiscrepancies);
router.post('/:id/escanear', requireAuth(rolesPermitidos), scanItem);
router.post('/:id/cerrar', requireAuth(['admin']), closeReception);
router.get('/:id/resumen-verificacion', requireAuth(rolesPermitidos), getVerificationSummary);
module.exports = router;