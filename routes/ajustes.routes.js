const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { crearAjuste, getAjuste } = require('../controllers/ajustes.controller');

router.post('/', requireAuth(['admin']), crearAjuste);
router.get('/:id', requireAuth(['admin']), getAjuste);

module.exports = router;
