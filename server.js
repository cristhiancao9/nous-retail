// server.js
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
require('dotenv').config();

const routes = require('./routes');
const { iniciarRetryJob } = require('./services/factus.retry');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Seguridad: cabeceras HTTP ──────────────────────────────────────────────
app.use(helmet());

// ── CORS: solo acepta peticiones del frontend configurado ──────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (ej: curl, Postman en dev)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origen no permitido — ${origin}`));
  },
  credentials: true,
}));

// ── Rate limiting: protección contra fuerza bruta en login ────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,                   // máx 20 intentos por IP en esa ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' },
});

// Rate limiting general para toda la API (protección ante abuso)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 300,            // 300 req/min por IP es suficiente para un POS
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de peticiones alcanzado. Intenta de nuevo en un momento.' },
});

// ── Body parsers ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check (sin rate limit para monitoreo) ──────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'NOUS Retail API', version: '1.0.0' });
});

// ── Rutas ─────────────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter); // límite estricto solo en login
app.use('/api', apiLimiter, routes);

// ── Error handler global ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arrancar ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor NOUS corriendo en el puerto ${PORT}`);
  iniciarRetryJob();
});
