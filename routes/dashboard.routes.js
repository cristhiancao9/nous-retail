// routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const { getMetricasDia, getVentasPorHora } = require('../controllers/dashboard.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const rolesPermitidos = ['admin', 'vendedor'];

router.get('/metricas',        requireAuth(rolesPermitidos), getMetricasDia);
router.get('/ventas-por-hora', requireAuth(rolesPermitidos), getVentasPorHora);

module.exports = router;
