const express = require('express');
const router = express.Router();

// 1. Importar la función desde el controlador de ventas
const {
  registrarVentaRapida, abrirCaja, getCajaActiva, cerrarCaja, getHistorialCajas,
  crearVenta, getVenta, getVentasPorTienda, anularVenta,
  consultarClienteFactus, getFacturaElectronica, descargarPdfFactura, enviarEmailFactura
} = require('../controllers/ventas.controller');

// 2. Importar el middleware de autenticación (ajusta la ruta según tu carpeta)
const { requireAuth } = require('../middlewares/auth.middleware');

// 3. La ruta (ya la tienes bien, solo asegúrate de que los nombres coincidan)
const rolesPermitidos = ['admin', 'vendedor'];

// --- RUTAS DE CAJAS ---
router.post('/cajas/abrir',            requireAuth(['admin', 'vendedor']), abrirCaja);
router.get('/cajas/activa/:tienda_id', requireAuth(['admin', 'vendedor']), getCajaActiva);
router.get('/cajas',                   requireAuth(['admin']),             getHistorialCajas);
router.post('/cajas/:id/cerrar',       requireAuth(['admin']),             cerrarCaja);

// --- RUTAS FACTUS ---
router.get('/factus/cliente', requireAuth(rolesPermitidos), consultarClienteFactus);
router.get('/factus/factura/:id', requireAuth(rolesPermitidos), getFacturaElectronica);
router.get('/factus/factura/:id/pdf', requireAuth(rolesPermitidos), descargarPdfFactura);
router.post('/factus/factura/:id/email', requireAuth(rolesPermitidos), enviarEmailFactura);

// --- RUTAS DE VENTAS ---
router.post('/venta-rapida', requireAuth(rolesPermitidos), registrarVentaRapida);
router.get('/tienda/:tienda_id', requireAuth(['admin']), getVentasPorTienda);
router.post('/', requireAuth(['admin', 'vendedor']), crearVenta);
router.get('/:id', requireAuth(['admin', 'vendedor']), getVenta);
router.post('/:id/anular', requireAuth(['admin']), anularVenta);

module.exports = router;