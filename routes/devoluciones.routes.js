const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { crearDevolucion, getDevolucion } = require('../controllers/devoluciones.controller');

router.post('/', requireAuth(['admin', 'vendedor']), crearDevolucion);
router.get('/:id', requireAuth(['admin', 'vendedor']), getDevolucion);

module.exports = router;
