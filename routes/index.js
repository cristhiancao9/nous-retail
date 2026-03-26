// routes/index.js
const express = require('express');
const router = express.Router();

const recepcionesRoutes = require('./recepciones.routes');
const authRoutes = require('./auth.routes');
const inventarioRoutes = require('./inventario.routes');
router.use('/inventario', inventarioRoutes);
router.use('/auth', authRoutes);
router.use('/recepciones', recepcionesRoutes);

module.exports = router;