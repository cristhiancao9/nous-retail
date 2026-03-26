// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
 host: process.env.DB_HOST,
 port: process.env.DB_PORT,
 user: process.env.DB_USER,
 password: process.env.DB_PASSWORD,
 database: process.env.DB_NAME,
 // Configuraciones recomendadas para producción
 max: 20, // Máximo de clientes en el pool
 idleTimeoutMillis: 30000,
 connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
 console.error('Error inesperado en el pool de idle clients', err);
 process.exit(-1);
});

module.exports = pool;