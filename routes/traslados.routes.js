const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { crearTraslado, despacharTraslado, recibirTraslado, getTraslados } = require('../controllers/traslados.controller');

// Todos estos endpoints son para administradores o personal de bodega
router.get('/', requireAuth(['admin', 'bodega']), getTraslados);
router.post('/', requireAuth(['admin', 'bodega']), crearTraslado);
router.put('/:id/despachar', requireAuth(['admin', 'bodega']), despacharTraslado);
router.put('/:id/recibir', requireAuth(['admin', 'bodega']), recibirTraslado);

module.exports = router;