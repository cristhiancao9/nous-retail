// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(cors()); // Importante para que tu frontend React pueda conectarse
app.use(express.json()); // Parsea body JSON
app.use(express.urlencoded({ extended: true }));

// Ruta base
app.get('/api/health', (req, res) => {
 res.json({ status: 'online', service: 'NOUS Retail API', version: '1.0.0' });
});

// Montar el enrutador principal
app.use('/api', routes);

// Middleware de manejo de errores globales
app.use((err, req, res, next) => {
 console.error(err.stack);
 res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
});

// Iniciar servidor
app.listen(PORT, () => {
 console.log(`🚀 Servidor NOUS corriendo en el puerto ${PORT}`);
});