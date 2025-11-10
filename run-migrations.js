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
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    )
  `);
  console.log('✅ Tabla google_auth_tokens creada/verificada');
} catch (error) {
  console.error('❌ Error creando google_auth_tokens:', error.message);
}

console.log('\n🎉 Migraciones completadas!');
db.close();
