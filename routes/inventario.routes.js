const express = require('express');
const router = express.Router();
const { getStoreStock } = require('../controllers/inventario.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

// Definir roles que pueden ver el stock (ajusta según tus necesidades)
const rolesPermitidos = ['admin', 'empleado'];

// Ruta: GET /api/inventario/stock/:tienda_id
router.get('/stock/:tienda_id', requireAuth(rolesPermitidos), getStoreStock);

module.exports = router;