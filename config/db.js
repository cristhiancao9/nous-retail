// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

// Render (y la mayoría de plataformas cloud) proveen DATABASE_URL como connection string.
// En local usamos las variables individuales.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // requerido por Render PostgreSQL
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

pool.on('error', (err, client) => {
 console.error('Error inesperado en el pool de idle clients', err);
 process.exit(-1);
});

module.exports = pool;