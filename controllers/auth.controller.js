const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const register = async (req, res) => {
 const client = req.dbClient;
 const { nombre, email, password, rol, tienda_id } = req.body;

 try {
  // Validar rol
  const rolesValidos = ['admin', 'vendedor', 'bodega'];
  if (!rolesValidos.includes(rol)) {
   return res.status(400).json({ error: 'Rol inválido' });
  }

  // Hashear contraseña
  const password_hash = await bcrypt.hash(password, 10);

  const result = await client.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, tienda_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, nombre, email, rol, tienda_id
    `, [nombre, email, password_hash, rol, tienda_id]);

  res.status(201).json({
   message: 'Usuario creado exitosamente',
   user: result.rows[0]
  });
 } catch (error) {
  if (error.code === '23505') { // Unique violation
   return res.status(400).json({ error: 'El email ya está registrado' });
  }
  res.status(500).json({ error: error.message });
 }
};

const login = async (req, res) => {
 const { email, password } = req.body;

 if (!email || !password) {
  return res.status(400).json({ error: 'Email y contraseña son requeridos' });
 }

 const client = await pool.connect();
 const tenantSchema = process.env.TENANT_SCHEMA || 'nous';

 try {
  await client.query(`SET search_path TO "${tenantSchema}"`);

  const result = await client.query(`
      SELECT * FROM usuarios WHERE email = $1
    `, [email]);

  if (result.rowCount === 0) {
   return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const user = result.rows[0];

  // Comparar hash con bcrypt
  // Comparar hash con bcrypt
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
   return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
   {
    id: user.id,
    rol: user.rol,
    tienda_id: user.tienda_id,
    tenant_schema: tenantSchema
   },
   process.env.JWT_SECRET,
   { expiresIn: '12h' }
  );

  res.json({
   message: 'Login exitoso',
   token,
   user: {
    id: user.id,
    nombre: user.nombre,
    rol: user.rol,
    tienda_id: user.tienda_id
   }
  });
 } catch (error) {
  res.status(500).json({ error: error.message });
 } finally {
  client.release(); // <-- 3. Liberamos el cliente devuelta al pool
 }
};

const fixAdmin = async (req, res) => {
 const client = await pool.connect();
 const tenantSchema = process.env.TENANT_SCHEMA || 'nous';

 try {
  await client.query(`SET search_path TO "${tenantSchema}"`);

  // 1. Encriptamos la contraseña "admin123" aquí mismo
  const hashSeguro = await bcrypt.hash('admin123', 10);

  // 2. Borramos al admin viejo si existe para evitar conflictos
  await client.query(`DELETE FROM usuarios WHERE email = 'admin@nous.com'`);

  // 3. Insertamos al admin nuevo y fresco
  await client.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, tienda_id) 
      VALUES ('Administrador Supremo', 'admin@nous.com', $1, 'admin', 1)
    `, [hashSeguro]);

  res.json({ message: '✅ Administrador reseteado con éxito. Ya puedes hacer login con admin123' });
 } catch (error) {
  res.status(500).json({ error: error.message });
 } finally {
  client.release();
 }
};
const getUsuarios = async (req, res) => {
  const client = req.dbClient;
  try {
    const result = await client.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.tienda_id, u.activo, u.creado_en,
             t.nombre AS tienda_nombre
      FROM usuarios u
      LEFT JOIN tiendas t ON t.id = u.tienda_id
      ORDER BY u.creado_en DESC
    `);
    res.json({ usuarios: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const toggleUsuario = async (req, res) => {
  const client = req.dbClient;
  const { id } = req.params;
  try {
    const result = await client.query(`
      UPDATE usuarios
      SET activo = NOT activo
      WHERE id = $1
      RETURNING id, nombre, activo
    `, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ usuario: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { register, login, fixAdmin, getUsuarios, toggleUsuario };