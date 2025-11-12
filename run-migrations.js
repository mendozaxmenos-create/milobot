const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('./data/database.db');

console.log('🔄 Ejecutando migraciones...\n');

// Función para agregar columna si no existe
function addColumnIfNotExists(table, column, definition) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some(col => col.name === column);
    
    if (!exists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`✅ Columna ${column} agregada a ${table}`);
    } else {
      console.log(`⏭️  Columna ${column} ya existe en ${table}`);
    }
  } catch (error) {
    console.error(`❌ Error agregando ${column}:`, error.message);
  }
}

// Agregar columnas a calendar_events
console.log('📅 Actualizando tabla calendar_events...');
addColumnIfNotExists('calendar_events', 'category', 'TEXT DEFAULT "personal"');
addColumnIfNotExists('calendar_events', 'is_recurring', 'INTEGER DEFAULT 0');
addColumnIfNotExists('calendar_events', 'recurring_type', 'TEXT');
addColumnIfNotExists('calendar_events', 'recurring_end_date', 'DATETIME');
addColumnIfNotExists('calendar_events', 'notification_time', 'INTEGER DEFAULT 15');
addColumnIfNotExists('calendar_events', 'google_event_id', 'TEXT');
addColumnIfNotExists('calendar_events', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
addColumnIfNotExists('calendar_events', 'has_due_date', 'INTEGER DEFAULT 1');

console.log('\n👤 Actualizando tabla users...');
addColumnIfNotExists('users', 'location_city', 'TEXT');
addColumnIfNotExists('users', 'location_lat', 'REAL');
addColumnIfNotExists('users', 'location_lon', 'REAL');
addColumnIfNotExists('users', 'location_state', 'TEXT');
addColumnIfNotExists('users', 'location_country', 'TEXT');
addColumnIfNotExists('users', 'location_country_code', 'TEXT');
addColumnIfNotExists('users', 'home_currency', 'TEXT');
addColumnIfNotExists('users', 'home_country_code', 'TEXT');

console.log('\n👥 Creando tablas nuevas...');

// Crear tabla de configuración
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_calendar_settings (
      user_phone TEXT PRIMARY KEY,
      notifications_enabled INTEGER DEFAULT 1,
      notification_time INTEGER DEFAULT 15,
      sync_google_auto INTEGER DEFAULT 1,
      notification_channel TEXT DEFAULT 'both',
      google_tokens TEXT,
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla user_calendar_settings creada/verificada');
} catch (error) {
  console.error('❌ Error creando user_calendar_settings:', error.message);
}

// Crear tabla de tokens
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_auth_tokens (
      user_phone TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      last_sync INTEGER,
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla google_auth_tokens creada/verificada');
} catch (error) {
  console.error('❌ Error creando google_auth_tokens:', error.message);
}

addColumnIfNotExists('google_auth_tokens', 'last_sync', 'INTEGER');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_email TEXT NOT NULL,
      account_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      last_sync INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_phone, account_email),
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla classroom_accounts creada/verificada');
} catch (error) {
  console.error('❌ Error creando classroom_accounts:', error.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_id INTEGER,
      google_course_id TEXT NOT NULL,
      name TEXT,
      section TEXT,
      description TEXT,
      room TEXT,
      state TEXT,
      teacher_group TEXT,
      enrollment_code TEXT,
      course_json TEXT,
      updated_at INTEGER,
      UNIQUE(account_id, google_course_id),
      FOREIGN KEY (account_id) REFERENCES classroom_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla classroom_courses creada/verificada');
} catch (error) {
  console.error('❌ Error creando classroom_courses:', error.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_id INTEGER,
      course_id INTEGER,
      google_announcement_id TEXT NOT NULL,
      text TEXT,
      materials TEXT,
      creation_time TEXT,
      update_time TEXT,
      creator_user_id TEXT,
      state TEXT,
      UNIQUE(account_id, google_announcement_id),
      FOREIGN KEY (account_id) REFERENCES classroom_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES classroom_courses(id),
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla classroom_announcements creada/verificada');
} catch (error) {
  console.error('❌ Error creando classroom_announcements:', error.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_coursework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_id INTEGER,
      course_id INTEGER,
      google_coursework_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      due_date TEXT,
      due_time TEXT,
      due_at TEXT,
      state TEXT,
      alternate_link TEXT,
      max_points REAL,
      work_type TEXT,
      creation_time TEXT,
      update_time TEXT,
      UNIQUE(account_id, google_coursework_id),
      FOREIGN KEY (account_id) REFERENCES classroom_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES classroom_courses(id),
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla classroom_coursework creada/verificada');
} catch (error) {
  console.error('❌ Error creando classroom_coursework:', error.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_user_state (
      user_phone TEXT PRIMARY KEY,
      last_sync INTEGER,
      last_summary_at INTEGER,
      last_summary_hash TEXT,
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla classroom_user_state creada/verificada');
} catch (error) {
  console.error('❌ Error creando classroom_user_state:', error.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_invites (
      phone TEXT PRIMARY KEY,
      invited_by TEXT,
      invited_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Tabla user_invites creada/verificada');
} catch (error) {
  console.error('❌ Error creando user_invites:', error.message);
}

addColumnIfNotExists('classroom_courses', 'account_id', 'INTEGER');
addColumnIfNotExists('classroom_announcements', 'account_id', 'INTEGER');
addColumnIfNotExists('classroom_coursework', 'account_id', 'INTEGER');
addColumnIfNotExists('classroom_accounts', 'account_name', 'TEXT');
addColumnIfNotExists('classroom_accounts', 'last_sync', 'INTEGER');

console.log('\n🎉 Migraciones completadas!');
db.close();
