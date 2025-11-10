// ============================================
// MÓDULO: DATABASE
// Configuración y setup de la base de datos
// ============================================

const Database = require('better-sqlite3');
const fs = require('fs');

// Crear carpeta data si no existe
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data');
  console.log('📁 Carpeta data creada');
}

// Crear/conectar a la base de datos
const db = new Database('./data/database.db');

// Crear todas las tablas
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_interaction DATETIME,
      is_premium INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_date DATETIME NOT NULL,
      reminder_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS expense_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      creator_phone TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_closed INTEGER DEFAULT 0,
      FOREIGN KEY (creator_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS group_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES expense_groups(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      payer_phone TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES expense_groups(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      from_phone TEXT NOT NULL,
      to_phone TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      marked_by TEXT,
      marked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES expense_groups(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      user_phone TEXT PRIMARY KEY,
      current_module TEXT,
      context TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      user_name TEXT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    );
  `);

  console.log('✅ Base de datos inicializada');
}

// Funciones de usuarios
function registerUser(phone, name = null) {
  const existingUser = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  const isNewUser = !existingUser;
  
  const stmt = db.prepare(`
    INSERT INTO users (phone, name, last_interaction)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(phone) DO UPDATE SET 
      name = COALESCE(?, name),
      last_interaction = CURRENT_TIMESTAMP
  `);
  stmt.run(phone, name, name);
  
  return { isNewUser };
}

module.exports = {
  db,
  initializeDatabase,
  registerUser
};