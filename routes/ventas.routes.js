const express = require('express');
const router = express.Router();

// 1. Importar la función desde el controlador de ventas
const { registrarVentaRapida } = require('../controllers/ventas.controller');

// 2. Importar el middleware de autenticación (ajusta la ruta según tu carpeta)
const { requireAuth } = require('../middlewares/auth.middleware');

// 3. La ruta (ya la tienes bien, solo asegúrate de que los nombres coincidan)
const rolesPermitidos = ['admin', 'empleado'];
router.post('/venta-rapida', requireAuth(rolesPermitidos), registrarVentaRapida);

module.exports = router;