// routes/index.js
const express = require('express');
const router = express.Router();

const recepcionesRoutes = require('./recepciones.routes');
const authRoutes = require('./auth.routes');
const inventarioRoutes = require('./inventario.routes');
const ventasRoutes = require('./ventas.routes');
const trasladosRoutes = require('./traslados.routes');
const devolucionesRoutes = require('./devoluciones.routes');
const ajustesRoutes = require('./ajustes.routes');
const dashboardRoutes = require('./dashboard.routes');

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/recepciones', recepcionesRoutes);
router.use('/ventas', ventasRoutes);
router.use('/traslados', trasladosRoutes);
router.use('/devoluciones', devolucionesRoutes);
router.use('/ajustes', ajustesRoutes);
module.exports = router;