const express = require('express');
const router = express.Router();
const { getStoreStock, getKardexBySku } = require('../controllers/inventario.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

// Definir roles que pueden ver el stock (ajusta según tus necesidades)
const rolesPermitidos = ['admin', 'vendedor'];

// Ruta: GET /api/inventario/stock/:tienda_id
router.get('/stock/:tienda_id', requireAuth(rolesPermitidos), getStoreStock);
router.get('/kardex/:sku_id', requireAuth(['admin', 'vendedor']), getKardexBySku);
module.exports = router;