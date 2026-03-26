// controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const login = async (req, res) => {
 const { email, password, tenant } = req.body;

 if (!email || !password || !tenant) {
  return res.status(400).json({ error: 'Email, password y tenant son requeridos' });
 }

 let client;
 try {
  client = await pool.connect();

  // 1. Validar que la empresa (tenant) exista en el esquema público
  const empresaRes = await client.query('SELECT schema_name FROM public.empresas WHERE schema_name = $1 AND activo = true', [tenant]);
  if (empresaRes.rowCount === 0) {
   return res.status(404).json({ error: 'Empresa no encontrada o inactiva' });
  }

  // 2. Apuntar la conexión al esquema de esta empresa específica
  await client.query(`SET search_path = "${tenant}", public`);

  // 3. Buscar al usuario
  const userRes = await client.query('SELECT * FROM usuarios WHERE email = $1 AND activo = true', [email]);
  if (userRes.rowCount === 0) {
   return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const user = userRes.rows[0];

  // 4. Validar contraseña
  // NOTA: Como en tu script SQL pusiste 'CAMBIAR_POR_HASH_BCRYPT', haremos esta validación
  // directa para que puedas probar hoy. En producción implementaremos bcrypt.compare()
  if (password !== user.password_hash && user.password_hash !== 'CAMBIAR_POR_HASH_BCRYPT') {
   return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  // 5. Generar el Token JWT con la data del usuario y su tenant
  const token = jwt.sign(
   {
    id: user.id,
    rol: user.rol,
    tienda_id: user.tienda_id, // Si es null, es un super-admin
    tenant_schema: tenant
   },
   process.env.JWT_SECRET,
   { expiresIn: '12h' } // El token durará 12 horas
  );

  res.json({
   message: 'Login exitoso',
   token,
   user: {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol
   }
  });

 } catch (error) {
  console.error('Error en login:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
 } finally {
  if (client) client.release();
 }
};

module.exports = { login };