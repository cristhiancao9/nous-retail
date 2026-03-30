// middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const requireAuth = (allowedRoles = []) => {
 return async (req, res, next) => {
  let client;
  try {
   const authHeader = req.headers.authorization;
   if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
   }

   const token = authHeader.split(' ')[1];
   const decoded = jwt.verify(token, process.env.JWT_SECRET);

   // Validar roles si la ruta lo exige
   if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.rol)) {
    return res.status(403).json({ error: 'Permisos insuficientes para esta acción' });
   }

   // Adquirir conexión EXCLUSIVA para esta petición
   client = await pool.connect();

   // Inyectar el search_path de forma segura (asumiendo que tenant_schema viene validado en el JWT)
   // Usamos comillas dobles por si el nombre del schema tiene caracteres especiales
   await client.query(`
     SET search_path = "${decoded.tenant_schema}", public;
     SET timezone = 'America/Bogota';
   `);

   // Pasamos el cliente y el usuario a los controladores
   req.dbClient = client;
   req.user = decoded;

   // Control de liberación de cliente
   let clientReleased = false;
   const releaseClient = () => {
    if (!clientReleased) {
     client.release();
     clientReleased = true;
    }
   };

   res.on('finish', releaseClient);
   res.on('close', releaseClient);

   next();
  } catch (error) {
   if (client) client.release();
   return res.status(401).json({ error: 'Token inválido o expirado' });
  }
 };
};

module.exports = { requireAuth };