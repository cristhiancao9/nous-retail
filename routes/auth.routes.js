// routes/auth.routes.js
const express = require('express');
const { login, register, getUsuarios, toggleUsuario } = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/register',          requireAuth(['admin']), register);
router.get('/usuarios',           requireAuth(['admin']), getUsuarios);
router.patch('/usuarios/:id/toggle', requireAuth(['admin']), toggleUsuario);

module.exports = router;