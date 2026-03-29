const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { crearTraslado, despacharTraslado, recibirTraslado, getTraslados, getTraslado } = require('../controllers/traslados.controller');

router.get('/',    requireAuth(['admin', 'bodega']), getTraslados);
router.post('/',   requireAuth(['admin', 'bodega']), crearTraslado);
router.get('/:id', requireAuth(['admin', 'bodega']), getTraslado);
router.put('/:id/despachar', requireAuth(['admin', 'bodega']), despacharTraslado);
router.put('/:id/recibir',   requireAuth(['admin', 'bodega']), recibirTraslado);

module.exports = router;