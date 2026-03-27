// routes/auth.routes.js
const express = require('express');
const { login, register, fixAdmin } = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// POST /api/auth/login
router.post('/register', requireAuth(['admin']), register);
router.post('/login', login);
router.get('/fix-admin', fixAdmin);

module.exports = router;