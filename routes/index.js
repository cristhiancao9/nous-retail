// routes/index.js
const express = require('express');
const router = express.Router();

const recepcionesRoutes = require('./recepciones.routes');
const authRoutes = require('./auth.routes');
const inventarioRoutes = require('./inventario.routes');
const ventasRoutes = require('./ventas.routes');
router.use('/inventario', inventarioRoutes);
router.use('/auth', authRoutes);
router.use('/recepciones', recepcionesRoutes);
router.use('/ventas', ventasRoutes);
module.exports = router;