// ============================================
// 🤖 BOT DE WHATSAPP - ASISTENTE PERSONAL
// Versión con whatsapp-web.js (más estable)
// ============================================

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Database = require('better-sqlite3');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const calendarModule = require('./modules/calendar-module');  
const classroomModule = require('./modules/classroom-module');
const weeklyRecapModule = require('./modules/weekly-recap-module');
const currencyModule = require('./modules/currency-module');
const statsModule = require('./modules/stats-module');
const googleIntegration = require('./modules/calendar-module/google');
const scheduledMessagesModule = require('./modules/scheduled-messages');
const ENABLE_IP_AUTO_LOCATION = process.env.ENABLE_IP_AUTO_LOCATION !== 'false';
const KEYWORD_SHORTCUTS = [
  {
    action: 'weather',
    label: 'Pronóstico del tiempo',
    example: 'pronostico',
    keywords: ['pronóstico', 'pronostico', 'clima', 'tiempo']
  },
  {
    action: 'expenses',
    label: 'Dividir gastos',
    example: 'gastos',
    keywords: ['gastos', 'dividir gastos', 'resumen de gastos', 'calcular gastos']
  },
  {
    action: 'calendar',
    label: 'Calendario y recordatorios',
    example: 'calendario',
    keywords: ['calendario', 'recordatorio', 'agenda']
  },
  {
    action: 'ai',
    label: 'Asistente IA',
    example: 'ia',
    keywords: ['ia', 'pregunta', 'ayuda ia', 'chat']
  },
  {
    action: 'currency',
    label: 'Conversor de monedas',
    example: 'convertir 100 usd a ars',
    keywords: ['moneda', 'convertir', 'cambio', 'dólar', 'dolar', 'usd']
  },
  {
    action: 'scheduled_message',
    label: 'Programar mensaje',
    example: 'programar mensaje',
    keywords: ['programar mensaje', 'mensaje programado', 'programar']
  }
];
// Configuración de modo debug (optimización: desactivar logs en producción)
const DEBUG_MODE = process.env.DEBUG === 'true' || process.env.NODE_ENV !== 'production';

// Helper para logs condicionales
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

// Crear carpeta data si no existe
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data');
  console.log('📁 Carpeta data creada');
}

// ============================================
// CONFIGURACIÓN DE BASE DE DATOS
// ============================================

const db = new Database('./data/database.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_interaction DATETIME,
    is_premium INTEGER DEFAULT 0,
    location_city TEXT,
    location_lat REAL,
    location_lon REAL,
    location_state TEXT,
    location_country TEXT,
    location_country_code TEXT,
    home_currency TEXT,
    home_country_code TEXT,
    timezone_name TEXT,
    timezone_offset_minutes INTEGER
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_date DATETIME NOT NULL,
    reminder_sent INTEGER DEFAULT 0,
    is_reminder INTEGER DEFAULT 0,
    has_due_date INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reminder_24h_sent INTEGER DEFAULT 0,
    reminder_1h_sent INTEGER DEFAULT 0,
    last_reminder_at DATETIME,
    reminder_attempts INTEGER DEFAULT 0,
    FOREIGN KEY (user_phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS event_invitees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS calendar_reminders_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    recipient_phone TEXT NOT NULL,
    reminder_type TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'sent',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_phone TEXT NOT NULL,
    target_chat TEXT NOT NULL,
    target_type TEXT NOT NULL,
    message_body TEXT NOT NULL,
    send_at DATETIME NOT NULL,
    timezone_offset INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_attempt_at DATETIME,
    recurrence_json TEXT,
    meta_json TEXT,
    whatsapp_message_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scheduled_message_id INTEGER NOT NULL,
    creator_phone TEXT NOT NULL,
    target_chat TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scheduled_message_id) REFERENCES scheduled_messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expense_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    creator_phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_closed INTEGER DEFAULT 0,
    closed_at DATETIME,
    currency TEXT DEFAULT 'ARS',
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
    currency TEXT DEFAULT 'ARS',
    is_paid INTEGER DEFAULT 0,
    paid_at DATETIME,
    paid_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES expense_groups(id)
  );

  CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    account_number TEXT,
    alias TEXT,
    cbu TEXT,
    currency TEXT DEFAULT 'ARS',
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_phone) REFERENCES users(phone) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expense_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    from_user_phone TEXT NOT NULL,
    to_user_phone TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ARS',
    payment_method TEXT,
    bank_account_id INTEGER,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_phone) REFERENCES users(phone),
    FOREIGN KEY (to_user_phone) REFERENCES users(phone),
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL
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

  CREATE TABLE IF NOT EXISTS google_auth_tokens (
    user_phone TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expiry_date INTEGER,
    last_sync INTEGER,
    FOREIGN KEY (user_phone) REFERENCES users(phone)
  );

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
  );

CREATE TABLE IF NOT EXISTS user_invites (
  phone TEXT PRIMARY KEY,
  invited_by TEXT,
  invited_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_recaps (
  user_phone TEXT PRIMARY KEY,
  last_sent_at DATETIME,
  last_activity_hash TEXT,
  enabled INTEGER DEFAULT 1,
  FOREIGN KEY (user_phone) REFERENCES users(phone)
);

CREATE TABLE IF NOT EXISTS bot_usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_phone TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_phone) REFERENCES users(phone)
);

CREATE INDEX IF NOT EXISTS idx_bot_usage_stats_user_phone ON bot_usage_stats(user_phone);
CREATE INDEX IF NOT EXISTS idx_bot_usage_stats_event_type ON bot_usage_stats(event_type);
CREATE INDEX IF NOT EXISTS idx_bot_usage_stats_created_at ON bot_usage_stats(created_at);
CREATE INDEX IF NOT EXISTS idx_bot_usage_stats_user_event ON bot_usage_stats(user_phone, event_type);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_phone ON bank_accounts(user_phone);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_is_default ON bank_accounts(user_phone, is_default);
CREATE INDEX IF NOT EXISTS idx_expense_payments_group_id ON expense_payments(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_payments_from_user ON expense_payments(from_user_phone);
CREATE INDEX IF NOT EXISTS idx_expense_payments_to_user ON expense_payments(to_user_phone);
CREATE INDEX IF NOT EXISTS idx_expense_payments_group_from_to ON expense_payments(group_id, from_user_phone, to_user_phone);

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
  );

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
  );

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
  );

  CREATE TABLE IF NOT EXISTS classroom_user_state (
    user_phone TEXT PRIMARY KEY,
    last_sync INTEGER,
    last_summary_at INTEGER,
    last_summary_hash TEXT,
    FOREIGN KEY (user_phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    plan_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    start_date DATETIME,
    end_date DATETIME,
    renewal_date DATETIME,
    payment_provider TEXT NOT NULL,
    payment_id TEXT,
    payment_status TEXT,
    preference_id TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ARS',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    cancelled_at DATETIME,
    FOREIGN KEY (user_phone) REFERENCES users(phone)
  );

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_phone ON subscriptions(user_phone);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_id ON subscriptions(payment_id);

  CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    subscription_id INTEGER,
    payment_provider TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ARS',
    status TEXT NOT NULL,
    payment_method TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_phone) REFERENCES users(phone),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
  );

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_phone ON payment_transactions(user_phone);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id ON payment_transactions(payment_id);

-- Índices adicionales para optimización de consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_phone ON calendar_events(user_phone);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON calendar_events(user_phone, event_date);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_payer_phone ON expenses(payer_phone);
CREATE INDEX IF NOT EXISTS idx_expenses_group_payer ON expenses(group_id, payer_phone);
CREATE INDEX IF NOT EXISTS idx_group_participants_group_id ON group_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_phone ON group_participants(phone);
CREATE INDEX IF NOT EXISTS idx_group_participants_group_phone ON group_participants(group_id, phone);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_send_at ON scheduled_messages(send_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_send_at ON scheduled_messages(status, send_at);
CREATE INDEX IF NOT EXISTS idx_expense_groups_creator_phone ON expense_groups(creator_phone);
CREATE INDEX IF NOT EXISTS idx_expense_groups_is_closed ON expense_groups(is_closed);
CREATE INDEX IF NOT EXISTS idx_expense_groups_creator_closed ON expense_groups(creator_phone, is_closed);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_feedback_user_phone ON feedback(user_phone);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_classroom_courses_user_phone ON classroom_courses(user_phone);
CREATE INDEX IF NOT EXISTS idx_classroom_courses_account_id ON classroom_courses(account_id);
CREATE INDEX IF NOT EXISTS idx_classroom_announcements_user_phone ON classroom_announcements(user_phone);
CREATE INDEX IF NOT EXISTS idx_classroom_announcements_course_id ON classroom_announcements(course_id);
CREATE INDEX IF NOT EXISTS idx_classroom_coursework_user_phone ON classroom_coursework(user_phone);
CREATE INDEX IF NOT EXISTS idx_classroom_coursework_course_id ON classroom_coursework(course_id);

  CREATE TABLE IF NOT EXISTS premium_notifications_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    processed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (user_phone) REFERENCES users(phone)
  );
`);

// Agregar columna last_reset_at a expense_groups si no existe
try {
  const columns = db.prepare(`PRAGMA table_info(expense_groups)`).all();
  const hasLastResetAt = columns.some(col => col.name === 'last_reset_at');
  if (!hasLastResetAt) {
    db.exec(`ALTER TABLE expense_groups ADD COLUMN last_reset_at DATETIME`);
    console.log('✅ Columna last_reset_at agregada a expense_groups');
  }
} catch (error) {
  console.warn('⚠️ Error verificando columna last_reset_at:', error.message);
}

try {
  calendarModule.database.ensureSchemaCompatibility(db);
} catch (error) {
  console.error('❌ No se pudo verificar el esquema del calendario al iniciar:', error.message);
}

try {
  classroomModule.database.ensureSchema(db);
} catch (error) {
  console.error('❌ No se pudo verificar el esquema de Classroom al iniciar:', error.message);
}

// Migraciones: agregar columnas si no existen
try {
  db.exec('ALTER TABLE users ADD COLUMN location_city TEXT');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE users ADD COLUMN location_lat REAL');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE users ADD COLUMN location_lon REAL');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE calendar_events ADD COLUMN is_reminder INTEGER DEFAULT 0');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE calendar_events ADD COLUMN has_due_date INTEGER DEFAULT 1');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE calendar_events ADD COLUMN reminder_24h_sent INTEGER DEFAULT 0');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE calendar_events ADD COLUMN reminder_1h_sent INTEGER DEFAULT 0');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE calendar_events ADD COLUMN last_reminder_at DATETIME');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE calendar_events ADD COLUMN reminder_attempts INTEGER DEFAULT 0');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE users ADD COLUMN calendar_reminders_enabled INTEGER DEFAULT 1');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE users ADD COLUMN timezone_name TEXT');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE users ADD COLUMN timezone_offset_minutes INTEGER');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE google_auth_tokens ADD COLUMN last_sync INTEGER');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE scheduled_messages ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
} catch (e) {
  // La columna ya existe, ignorar error
}

// Agregar columnas de moneda y cierre a grupos de gastos
try {
  db.exec('ALTER TABLE expense_groups ADD COLUMN currency TEXT DEFAULT \'ARS\'');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE expense_groups ADD COLUMN closed_at DATETIME');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE expenses ADD COLUMN currency TEXT DEFAULT \'ARS\'');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE expense_payments ADD COLUMN currency TEXT DEFAULT \'ARS\'');
} catch (e) {
  // La columna ya existe, ignorar error
}

// Agregar columnas para marcar gastos como pagados
try {
  db.exec('ALTER TABLE expenses ADD COLUMN is_paid INTEGER DEFAULT 0');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE expenses ADD COLUMN paid_at DATETIME');
} catch (e) {
  // La columna ya existe, ignorar error
}

try {
  db.exec('ALTER TABLE expenses ADD COLUMN paid_by TEXT');
} catch (e) {
  // La columna ya existe, ignorar error
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI) {
  googleIntegration.syncAllUsers(db)
    .then(({ processed, skipped }) => {
      console.log(`☁️ Sincronización inicial de Google completada (procesados: ${processed}, omitidos: ${skipped}).`);
    })
    .catch((error) => {
      console.error('❌ Error en sincronización inicial de Google:', error.message || error);
    });

  googleIntegration.startAutoSyncService(db);
} else {
  console.warn('⚠️ Sincronización automática de Google deshabilitada (faltan credenciales).');
}

console.log('✅ Base de datos inicializada');

// ============================================
// STATEMENTS PREPARADOS (OPTIMIZACIÓN)
// ============================================
// Preparar statements frecuentes una sola vez para mejor rendimiento
const preparedStatements = {
  getUserByPhone: db.prepare('SELECT * FROM users WHERE phone = ?'),
  getUserLocation: db.prepare('SELECT location_city, location_lat, location_lon, location_state, location_country, location_country_code, home_currency, home_country_code FROM users WHERE phone = ?'),
  getSession: db.prepare('SELECT * FROM sessions WHERE user_phone = ?'),
  updateSession: db.prepare(`
    INSERT INTO sessions (user_phone, current_module, context, last_updated)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_phone) DO UPDATE SET 
      current_module = ?,
      context = ?,
      last_updated = CURRENT_TIMESTAMP
  `),
  deleteSession: db.prepare('DELETE FROM sessions WHERE user_phone = ?'),
  checkUserExists: db.prepare('SELECT 1 FROM users WHERE phone = ?'),
  checkInviteExists: db.prepare('SELECT 1 FROM user_invites WHERE phone = ?'),
  getGroupParticipants: db.prepare('SELECT id, name, phone FROM group_participants WHERE group_id = ?'),
  getGroupParticipantsPhones: db.prepare('SELECT phone FROM group_participants WHERE group_id = ?'),
  getExpenseGroup: db.prepare('SELECT id, name, is_closed, created_at, creator_phone FROM expense_groups WHERE id = ?'),
  getActiveExpenseGroup: db.prepare(`
    SELECT id, name, created_at
    FROM expense_groups
    WHERE creator_phone = ? AND IFNULL(is_closed, 0) = 0
    ORDER BY created_at DESC
    LIMIT 1
  `),
  getExpensesByGroup: db.prepare(`
    SELECT e.id, e.group_id, e.payer_phone, e.amount, e.description, e.currency, e.is_paid, e.paid_at, e.paid_by, e.created_at,
           COALESCE(p.name, e.payer_phone) as payer_name
    FROM expenses e
    LEFT JOIN group_participants p ON e.payer_phone = p.phone AND e.group_id = p.group_id
    INNER JOIN expense_groups eg ON e.group_id = eg.id
    WHERE e.group_id = ? 
      AND eg.id = ?
      AND IFNULL(eg.is_closed, 0) = 0
      AND eg.creator_phone IS NOT NULL
      AND eg.id IS NOT NULL
    ORDER BY e.created_at DESC
  `)
};

console.log('✅ Statements preparados inicializados');

// ============================================
// CONFIGURACIÓN DE CLAUDE AI
// ============================================

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
let anthropic = null;

if (anthropicApiKey) {
  anthropic = new Anthropic({
    apiKey: anthropicApiKey,
  });
} else {
  console.warn('⚠️ Asistente IA (Claude) no configurado: falta ANTHROPIC_API_KEY.');
}

// CONFIGURACIÓN DE MERCADOPAGO
const mercadoPagoIntegration = require('./modules/mercadopago-integration');
const mercadoPagoInitialized = mercadoPagoIntegration.initializeMercadoPago();

// ============================================
// FUNCIONES DE BASE DE DATOS
// ============================================

// Objeto para almacenar los timeouts activos de cada usuario
const userTimeouts = {};

// Tiempo de inactividad en milisegundos (5 minutos)
const TIMEOUT_DURATION = 5 * 60 * 1000; // 5 minutos

function registerUser(phone, name = null) {
  // Verificar si es usuario nuevo
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

function ensureGroupInUsersTable(groupId, groupName = '') {
  if (!groupId) {
    return;
  }

  const existing = db.prepare('SELECT name FROM users WHERE phone = ?').get(groupId);
  const friendlyName = groupName && groupName.trim().length
    ? `Grupo: ${groupName.trim()}`
    : 'Grupo de WhatsApp';

  if (!existing) {
    db.prepare(`
      INSERT INTO users (phone, name, created_at, last_interaction)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(groupId, friendlyName);
  } else if ((!existing.name || existing.name.startsWith('Grupo')) && groupName) {
    db.prepare(`
      UPDATE users
      SET name = ?, last_interaction = CURRENT_TIMESTAMP
      WHERE phone = ?
    `).run(friendlyName, groupId);
  } else {
    db.prepare(`
      UPDATE users
      SET last_interaction = CURRENT_TIMESTAMP
      WHERE phone = ?
    `).run(groupId);
  }
}

function computeTimezoneOffsetMinutes(timezoneName) {
  if (!timezoneName) {
    return null;
  }

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneName,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(now);
    const extract = (type) => {
      const part = parts.find(p => p.type === type);
      return part ? Number(part.value) : 0;
    };

    const year = extract('year');
    const month = extract('month');
    const day = extract('day');
    const hour = extract('hour');
    const minute = extract('minute');
    const second = extract('second');

    const tzDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const offsetMinutes = Math.round((tzDate.getTime() - now.getTime()) / 60000);
    return offsetMinutes;
  } catch (error) {
    console.warn(`[WARN] No se pudo calcular offset para ${timezoneName}:`, error.message);
    return null;
  }
}

/**
 * Detectar y guardar automáticamente la ubicación del usuario por IP
 */
async function detectAndSaveUserLocation(userPhone) {
  try {
    if (!ENABLE_IP_AUTO_LOCATION) {
      console.log(`[DEBUG] Detección automática de ubicación deshabilitada. Se omite para ${userPhone}.`);
      return;
    }

    // Verificar si el usuario ya tiene ubicación guardada
    const userRow = db.prepare('SELECT name, location_city FROM users WHERE phone = ?').get(userPhone);
    if (userRow && userRow.location_city) {
      // El usuario ya tiene ubicación, no hacer nada
      return;
    }
    
    console.log(`[DEBUG] Detectando ubicación automática (solo sugerencia) para usuario: ${userPhone}`);
    
    const weatherAPI = require('./modules/weather-module/weather-api');
    const weatherModule = require('./modules/weather-module');
    
    const ipLocation = await weatherAPI.getLocationByIP();
    
    if (ipLocation.success && ipLocation.data) {
      const city = ipLocation.data.city || null;
      const country = ipLocation.data.country || null;
      const locationLabel = city && country
        ? `${city}, ${country}`
        : city || country || 'tu ubicación';

      console.log(`[DEBUG] Ubicación detectada (sugerencia): ${locationLabel}`);

      const pendingLocation = {
        city: locationLabel,
        rawCity: city,
        lat: ipLocation.data.lat,
        lon: ipLocation.data.lon,
        state: ipLocation.data.region || ipLocation.data.state || null,
        country: country,
        countryCode: ipLocation.data.countryCode || null,
        detectedAt: new Date().toISOString(),
        detectionMethod: 'ip_auto_suggest'
      };

      const timezoneName = ipLocation.data.timezone || null;
      if (timezoneName) {
        const offsetMinutes = computeTimezoneOffsetMinutes(timezoneName);
        try {
          db.prepare(`
            UPDATE users
            SET timezone_name = ?,
                timezone_offset_minutes = ?
            WHERE phone = ?
          `).run(timezoneName, offsetMinutes, userPhone);
        } catch (tzError) {
          console.warn('[WARN] No se pudo actualizar timezone del usuario:', tzError.message);
        }
        pendingLocation.timezone = timezoneName;
        pendingLocation.timezoneOffset = offsetMinutes;
      }

      updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation }));

      const formattedNumber = `${userPhone}@c.us`;
      const userName = userRow?.name || '¡Hola!';
      const suggestionMessage =
        `📍 ${userName === '¡Hola!' ? 'Hola' : `Hola *${userName}*`}! Detecté una ubicación aproximada: *${locationLabel}*.\n\n` +
        `⚠️ *Nota:* Esta ubicación se detecta desde el servidor y puede no ser precisa.\n\n` +
        `¿Querés que guarde esta ubicación o preferís escribir tu ciudad manualmente?\n\n` +
        `1️⃣ Sí, guardala (puede no ser precisa)\n2️⃣ No, prefiero indicarla manualmente\n\n` +
        `💡 Podés cambiarla en cualquier momento escribiendo el nombre de tu ciudad.`;

      try {
        await client.sendMessage(formattedNumber, suggestionMessage);
        console.log(`[DEBUG] Sugerencia de ubicación enviada a ${userPhone}`);
      } catch (sendError) {
        console.warn(`[WARN] No se pudo enviar la sugerencia de ubicación a ${userPhone}:`, sendError.message);
      }
    } else {
      console.warn(`[WARN] No se pudo detectar ubicación automáticamente para usuario: ${userPhone}`);
    }
  } catch (error) {
    console.error(`[ERROR] Error detectando ubicación automática para usuario ${userPhone}:`, error.message);
    // No lanzar el error, solo loguearlo para no interrumpir el flujo principal
  }
}

function isUserRegistered(phone) {
  if (!phone) {
    return false;
  }
  const row = db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone);
  return Boolean(row);
}

function hasPendingInvite(phone) {
  if (!phone) {
    return false;
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return false;
  const row = preparedStatements.checkInviteExists.get(normalizedPhone);
  return Boolean(row);
}

function recordInvite(phone, invitedBy = null) {
  if (!phone) {
    return;
  }
  const stmt = db.prepare(`
    INSERT INTO user_invites (phone, invited_by, invited_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(phone) DO UPDATE SET
      invited_at = CURRENT_TIMESTAMP,
      invited_by = COALESCE(?, invited_by)
  `);
  stmt.run(phone, invitedBy, invitedBy);
}

async function inviteMissingGroupMembers(participants = [], inviterPhone = null, inviterName = 'Un integrante del grupo') {
  if (!participants || participants.length === 0) {
    return;
  }

  const normalizedInviterPhone = inviterPhone ? inviterPhone.replace(/\D/g, '') : null;

  for (const participant of participants) {
    try {
      const serializedId = participant?.id?._serialized || '';
      if (!serializedId || serializedId.includes('bot')) {
        continue;
      }

      const participantPhone = participant?.id?.user;
      if (!participantPhone) {
        continue;
      }

      if (normalizedInviterPhone && participantPhone === normalizedInviterPhone) {
        continue;
      }

      if (isUserRegistered(participantPhone) || hasPendingInvite(participantPhone)) {
        continue;
      }

      let friendName = participant?.pushname || participant?.name || null;
      if (!friendName) {
        try {
          const contact = await client.getContactById(serializedId);
          friendName = contact?.pushname || contact?.name || contact?.number || null;
        } catch (error) {
          console.warn('[WARN] No se pudo obtener contacto para invitación:', error.message);
        }
      }

      const inviteResult = await sendFriendInviteMessage(
        client,
        inviterName || 'Un integrante del grupo',
        normalizedInviterPhone,
        friendName || 'Tu amigo',
        participantPhone
      );

      if (inviteResult.success) {
        recordInvite(participantPhone, normalizedInviterPhone);
        // El tracking de invitación se hace dentro de sendFriendInviteMessage
      } else if (inviteResult.error && inviteResult.error.toLowerCase().includes('no está registrado')) {
        recordInvite(participantPhone, normalizedInviterPhone);
      }
    } catch (error) {
      console.error('[ERROR] invitando miembro del grupo:', error);
    }
  }
}

function getSession(phone) {
  return preparedStatements.getSession.get(phone) || null;
}

function updateSession(phone, module, context = null) {
  preparedStatements.updateSession.run(phone, module, context, module, context);
  
  // Reiniciar el timeout cada vez que hay actividad
  resetTimeout(phone);
}

function clearSession(phone) {
  preparedStatements.deleteSession.run(phone);
  console.log(`🕐 Sesión cerrada por inactividad: ${phone}`);
}

function resetTimeout(phone) {
  // Cancelar timeout anterior si existe
  if (userTimeouts[phone]) {
    clearTimeout(userTimeouts[phone]);
  }
  
  // Crear nuevo timeout
  userTimeouts[phone] = setTimeout(() => {
    clearSession(phone);
    delete userTimeouts[phone];
  }, TIMEOUT_DURATION);
}

// ============================================
// MÓDULO DE CALENDARIO
// (Manejado por modules/calendar-module/)
// ============================================

// ============================================
// MÓDULO DE GASTOS
// ============================================

function createExpenseGroup(name, creatorPhone) {
  // Crear nuevo grupo de gastos
  // NOTA: NO establecer last_reset_at aquí - solo se usa para limpiar gastos antiguos cuando se crea un nuevo grupo
  // después de eliminar grupos anteriores
  const stmt = db.prepare(`
    INSERT INTO expense_groups (name, creator_phone)
    VALUES (?, ?)
  `);
  const result = stmt.run(name, creatorPhone);
  
  console.log(`[DEBUG] createExpenseGroup: Grupo ${result.lastInsertRowid} creado (${name})`);
  
  // Trackear grupo de gastos creado
  try {
    statsModule.trackExpenseGroupCreated(db, creatorPhone, {
      groupId: result.lastInsertRowid,
      groupName: name
    });
  } catch (error) {
    console.error('[ERROR] Error trackeando grupo de gastos:', error.message);
  }
  
  return { success: true, groupId: result.lastInsertRowid };
}

// Caché para normalización de teléfonos (optimización)
const phoneNormalizationCache = new Map();
const PHONE_CACHE_MAX_SIZE = 10000; // Limitar tamaño del caché

function normalizePhone(phone = '') {
  if (!phone) {
    return null;
  }
  
  // Verificar caché
  if (phoneNormalizationCache.has(phone)) {
    return phoneNormalizationCache.get(phone);
  }
  
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    phoneNormalizationCache.set(phone, null);
    return null;
  }
  if (digits.length < 6 || digits.length > 15) {
    phoneNormalizationCache.set(phone, null);
    return null;
  }
  
  // Limpiar caché si es muy grande
  if (phoneNormalizationCache.size >= PHONE_CACHE_MAX_SIZE) {
    // Eliminar el 20% más antiguo (FIFO aproximado)
    const keysToDelete = Array.from(phoneNormalizationCache.keys()).slice(0, Math.floor(PHONE_CACHE_MAX_SIZE * 0.2));
    keysToDelete.forEach(key => phoneNormalizationCache.delete(key));
  }
  
  phoneNormalizationCache.set(phone, digits);
  return digits;
}

function isMeaningfulName(name) {
  if (!name) {
    return false;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  const compact = trimmed.replace(/[()+\s-]/g, '');
  const onlyDigits = compact && /^\d+$/.test(compact);
  return !onlyDigits;
}

function formatPhoneForDisplay(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return 'Participante';
  }
  return `+${normalized}`;
}

function addParticipant(groupId, phone, name) {
  const normalizedPhone = normalizePhone(phone);
  if (!groupId || !normalizedPhone) {
    return { added: false, id: null, phone: normalizedPhone };
  }

  // CRÍTICO: Nunca agregar el bot como participante
  if (botPhoneNormalized && normalizedPhone === botPhoneNormalized) {
    return { added: false, id: null, phone: normalizedPhone };
  }

  // Buscar participantes existentes por teléfono normalizado
  // Esto evita duplicados con diferentes formatos del mismo teléfono
  const allParticipants = preparedStatements.getGroupParticipants.all(groupId);

  let existing = null;
  for (const participant of allParticipants) {
    const participantNormalized = normalizePhone(participant.phone);
    if (participantNormalized === normalizedPhone) {
      existing = participant;
      break;
    }
  }

  const trimmedName = name ? name.trim() : '';
  const meaningfulName = isMeaningfulName(trimmedName) ? trimmedName : null;

  if (existing) {
    // Si ya existe un participante con este teléfono normalizado, actualizar
    // Preferir el teléfono que empieza con 549 (formato argentino completo)
    const existingStartsWith549 = existing.phone.startsWith('549');
    const currentStartsWith549 = phone.startsWith('549');
    
    // Si el nuevo teléfono empieza con 549 y el existente no, actualizar el teléfono
    if (currentStartsWith549 && !existingStartsWith549) {
      db.prepare(`
        UPDATE group_participants
        SET phone = ?, name = COALESCE(?, name)
        WHERE id = ?
      `).run(normalizedPhone, meaningfulName, existing.id);
    } else if (meaningfulName && (!existing.name || !isMeaningfulName(existing.name))) {
      // Actualizar solo el nombre si es mejor
      db.prepare(`
        UPDATE group_participants
        SET name = ?
        WHERE id = ?
      `).run(meaningfulName, existing.id);
    }
    return { added: false, id: existing.id, phone: normalizedPhone };
  }

  const finalName = meaningfulName || `Participante ${normalizedPhone.slice(-4) || normalizedPhone}`;

  // Guardar el teléfono normalizado (ya está normalizado)
  const stmt = db.prepare(`
    INSERT INTO group_participants (group_id, phone, name)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(groupId, normalizedPhone, finalName);
  return { added: true, id: result.lastInsertRowid, phone: normalizedPhone };
}

function addExpense(groupId, payerPhone, amount, description, currency = null) {
  // Verificar que el grupo exista y esté activo antes de agregar el gasto
  const group = db.prepare(`
    SELECT id, name, is_closed, currency
    FROM expense_groups
    WHERE id = ?
  `).get(groupId);
  
  if (!group) {
    console.error(`[ERROR] addExpense: Grupo ${groupId} no existe`);
    return { success: false, error: 'Grupo no existe' };
  }
  
  if (group.is_closed === 1) {
    console.error(`[ERROR] addExpense: Grupo ${groupId} está cerrado`);
    return { success: false, error: 'Grupo cerrado. No se pueden agregar nuevos gastos. Podés reabrirlo desde el menú.' };
  }
  
  // Usar la moneda del grupo si no se especifica
  const expenseCurrency = currency || group.currency || 'ARS';
  
  const stmt = db.prepare(`
    INSERT INTO expenses (group_id, payer_phone, amount, description, currency)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(groupId, payerPhone, amount, description, expenseCurrency);
  
  console.log(`[DEBUG] addExpense: Gasto agregado - ID: ${result.lastInsertRowid}, Grupo: ${groupId} (${group.name}), Pagador: ${payerPhone}, Monto: ${amount}, Descripción: ${description}`);
  
  // Trackear gasto agregado
  try {
    statsModule.trackExpenseAdded(db, payerPhone, {
      groupId,
      amount,
      description,
      hasDescription: !!description
    });
  } catch (error) {
    console.error('[ERROR] Error trackeando gasto:', error.message);
  }
  
  return { success: true, expenseId: result.lastInsertRowid };
}

function getActiveExpenseGroupForChat(chatId) {
  const normalizedPhone = normalizePhone(chatId);
  if (!normalizedPhone) return null;
  return preparedStatements.getActiveExpenseGroup.get(normalizedPhone);
}

function updateExpenseGroupName(expenseGroupId, newName) {
  db.prepare(`
    UPDATE expense_groups
    SET name = ?
    WHERE id = ?
  `).run(newName, expenseGroupId);
}

function convertRawPhone(raw = '') {
  if (!raw) {
    return null;
  }
  return normalizePhone(raw);
}

function getParticipantDisplayName(participant) {
  if (!participant) {
    return 'Participante';
  }
  return participant.pushname || participant.name || participant.id?.user || 'Participante';
}

async function syncGroupParticipants(expenseGroupId, participants = []) {
  if (!participants || !participants.length) {
    return 0;
  }

  let addedCount = 0;
  for (const participant of participants) {
    const serializedId = participant?.id?._serialized || '';
    const phone = normalizePhone(participant?.id?.user);
    if (!phone) {
      continue;
    }
    if (botPhoneNormalized && phone === botPhoneNormalized) {
      continue;
    }
    let name = getParticipantDisplayName(participant);
    if (!isMeaningfulName(name) && serializedId) {
      try {
        const contact = await client.getContactById(serializedId);
        name = contact?.pushname || contact?.name || contact?.number || name;
      } catch (error) {
        console.warn('[WARN] No se pudo obtener contacto al sincronizar participantes:', error.message);
      }
    }
    const result = addParticipant(expenseGroupId, phone, name);
    if (result.added) {
      addedCount++;
    }
  }

  return addedCount;
}

function cleanupGroupParticipants(expenseGroupId, allowedPhones = []) {
  if (!expenseGroupId) {
    return;
  }
  const normalizedAllowed = new Set(
    (allowedPhones || []).map(normalizePhone).filter(Boolean)
  );

  // Obtener todos los participantes con sus nombres
  const rows = db.prepare(`
    SELECT id, phone, name FROM group_participants WHERE group_id = ?
  `).all(expenseGroupId);

  console.log(`[DEBUG] cleanupGroupParticipants: Grupo ${expenseGroupId}: ${rows.length} registros antes de limpiar, ${normalizedAllowed.size} teléfonos permitidos`);

  const deleteStmt = db.prepare('DELETE FROM group_participants WHERE id = ?');
  const updateStmt = db.prepare('UPDATE group_participants SET phone = ? WHERE id = ?');
  const updateExpenseStmt = db.prepare('UPDATE expenses SET payer_phone = ? WHERE group_id = ? AND payer_phone = ?');
  
  const seenPhones = new Map(); // normalized -> { id, phone, name }
  const seenNames = new Map(); // normalizedName -> { id, phone, normalizedPhone }
  let deletedCount = 0;
  let botDeletedCount = 0;
  let duplicateDeletedCount = 0;
  let consolidatedCount = 0;

  // Primero, identificar duplicados por teléfono y por nombre
  for (const row of rows) {
    const phone = normalizePhone(row.phone);
    if (!phone) {
      deleteStmt.run(row.id);
      deletedCount++;
      continue;
    }

    // SIEMPRE eliminar el bot
    if (botPhoneNormalized && phone === botPhoneNormalized) {
      deleteStmt.run(row.id);
      botDeletedCount++;
      console.log(`[DEBUG] cleanupGroupParticipants: Eliminado bot (${row.phone} → ${phone})`);
      continue;
    }

    const normalizedName = (row.name || '').toLowerCase().trim();
    
    // Verificar si ya existe un participante con el mismo teléfono normalizado
    if (seenPhones.has(phone)) {
      // Duplicado por teléfono - eliminar este registro
      deleteStmt.run(row.id);
      duplicateDeletedCount++;
      console.log(`[DEBUG] cleanupGroupParticipants: Eliminado duplicado por teléfono (${row.phone} → ${phone}), manteniendo ID ${seenPhones.get(phone).id}`);
      continue;
    }

    // Verificar si ya existe un participante con el mismo nombre (y nombre significativo)
    // IMPORTANTE: Consolidar por nombre ANTES de verificar teléfonos permitidos
    // Esto asegura que los duplicados se consoliden incluso si tienen teléfonos diferentes
    if (normalizedName && isMeaningfulName(normalizedName)) {
      if (seenNames.has(normalizedName)) {
        // Duplicado por nombre - consolidar: decidir cuál teléfono mantener
        const existing = seenNames.get(normalizedName);
        const existingPhone = existing.phone;
        const existingNormalized = existing.normalizedPhone;
        const existingId = existing.id;
        
        // Decidir qué teléfono mantener (prioridad):
        // 1. Preferir el que está en la lista de teléfonos permitidos
        // 2. Si ambos están o ninguno está, preferir el que empieza con 549 (formato argentino completo)
        // 3. Si ninguno empieza con 549, mantener el primero encontrado (existente)
        let keepPhone = existingPhone;
        let keepNormalized = existingNormalized;
        let keepId = existingId;
        let removePhone = row.phone;
        let removeNormalized = phone;
        let removeId = row.id;
        
        const existingInAllowed = normalizedAllowed.size === 0 || normalizedAllowed.has(existingNormalized);
        const currentInAllowed = normalizedAllowed.size === 0 || normalizedAllowed.has(phone);
        
        if (currentInAllowed && !existingInAllowed) {
          // El actual está en la lista permitida, el existente no - mantener el actual
          keepPhone = row.phone;
          keepNormalized = phone;
          keepId = row.id;
          removePhone = existingPhone;
          removeNormalized = existingNormalized;
          removeId = existingId;
        } else if (existingInAllowed && !currentInAllowed) {
          // El existente está en la lista permitida, el actual no - mantener el existente
          // Ya está configurado correctamente, no hacer nada
        } else {
          // Ambos están o ninguno está - preferir el que empieza con 549
          const existingStartsWith549 = existingPhone.startsWith('549');
          const currentStartsWith549 = row.phone.startsWith('549');
          
          if (currentStartsWith549 && !existingStartsWith549) {
            // El actual empieza con 549, el existente no - mantener el actual
            keepPhone = row.phone;
            keepNormalized = phone;
            keepId = row.id;
            removePhone = existingPhone;
            removeNormalized = existingNormalized;
            removeId = existingId;
          }
        }
        
        console.log(`[DEBUG] cleanupGroupParticipants: Consolidando por nombre "${row.name}": ${removePhone} (${removeNormalized}) → ${keepPhone} (${keepNormalized})`);
        
        // CRÍTICO: Actualizar TODOS los gastos que usan el teléfono que vamos a eliminar
        // Buscar por teléfono normalizado para encontrar todos los gastos relacionados
        const allExpenses = db.prepare(`
          SELECT id, payer_phone
          FROM expenses
          WHERE group_id = ?
        `).all(expenseGroupId);
        
        let updatedExpenses = 0;
        allExpenses.forEach(exp => {
          const normalizedPayer = normalizePhone(exp.payer_phone);
          // Actualizar si coincide con el teléfono que vamos a eliminar
          if (normalizedPayer === removeNormalized) {
            const updateResult = db.prepare('UPDATE expenses SET payer_phone = ? WHERE id = ?').run(keepPhone, exp.id);
            if (updateResult.changes > 0) {
              updatedExpenses++;
              console.log(`[DEBUG] cleanupGroupParticipants: Actualizado gasto ${exp.id}: ${exp.payer_phone} (${normalizedPayer}) → ${keepPhone} (${keepNormalized})`);
            }
          }
        });
        
        console.log(`[DEBUG] cleanupGroupParticipants: Consolidados ${updatedExpenses} gastos de ${removePhone} a ${keepPhone}`);
        
        // Actualizar pagos realizados también
        const allPayments = db.prepare(`
          SELECT id, from_user_phone, to_user_phone
          FROM expense_payments
          WHERE group_id = ?
        `).all(expenseGroupId);
        
        let updatedPayments = 0;
        allPayments.forEach(payment => {
          const normalizedFrom = normalizePhone(payment.from_user_phone);
          const normalizedTo = normalizePhone(payment.to_user_phone);
          
          // Actualizar si el pagador o el receptor coinciden con el teléfono que vamos a eliminar
          if (normalizedFrom === removeNormalized) {
            db.prepare('UPDATE expense_payments SET from_user_phone = ? WHERE id = ?').run(keepPhone, payment.id);
            updatedPayments++;
            console.log(`[DEBUG] cleanupGroupParticipants: Actualizado pago ${payment.id}: from_user_phone ${payment.from_user_phone} → ${keepPhone}`);
          }
          if (normalizedTo === removeNormalized) {
            db.prepare('UPDATE expense_payments SET to_user_phone = ? WHERE id = ?').run(keepPhone, payment.id);
            updatedPayments++;
            console.log(`[DEBUG] cleanupGroupParticipants: Actualizado pago ${payment.id}: to_user_phone ${payment.to_user_phone} → ${keepPhone}`);
          }
        });
        
        console.log(`[DEBUG] cleanupGroupParticipants: Consolidados ${updatedPayments} pagos de ${removePhone} a ${keepPhone}`);
        
        // Si decidimos mantener el actual en lugar del existente, actualizar los mapas
        if (keepId === row.id) {
          // Mantener el actual, eliminar el existente
          // Actualizar los mapas para reflejar que ahora usamos el actual
          seenNames.set(normalizedName, { id: row.id, phone: row.phone, normalizedPhone: phone });
          seenPhones.delete(existingNormalized);
          seenPhones.set(phone, { id: row.id, phone: row.phone, name: row.name });
        }
        
        // Eliminar el registro que no vamos a mantener
        deleteStmt.run(removeId);
        consolidatedCount++;
        continue;
      } else {
        // Marcar este nombre como visto
        seenNames.set(normalizedName, { id: row.id, phone: row.phone, normalizedPhone: phone });
      }
    }

    // Marcar este teléfono como visto
    seenPhones.set(phone, { id: row.id, phone: row.phone, name: row.name });

    // Si hay una lista de teléfonos permitidos y este no está, verificar si tiene gastos
    if (normalizedAllowed.size && !normalizedAllowed.has(phone)) {
      // IMPORTANTE: Buscar gastos usando teléfono normalizado en ambos lados
      const allExpenses = db.prepare(`
        SELECT payer_phone
        FROM expenses
        WHERE group_id = ?
      `).all(expenseGroupId);
      
      const expenseCount = allExpenses.filter(e => {
        const normalizedPayer = normalizePhone(e.payer_phone);
        return normalizedPayer === phone;
      }).length;

      if (expenseCount === 0) {
        // No tiene gastos y no está en la lista permitida, eliminarlo
        deleteStmt.run(row.id);
        seenPhones.delete(phone);
        if (normalizedName) {
          seenNames.delete(normalizedName);
        }
        deletedCount++;
        console.log(`[DEBUG] cleanupGroupParticipants: Eliminado participante no permitido sin gastos (${row.phone} → ${phone})`);
      }
    }
  }
  
  console.log(`[DEBUG] cleanupGroupParticipants: Grupo ${expenseGroupId}: Eliminados ${deletedCount + botDeletedCount + duplicateDeletedCount + consolidatedCount} registros (${botDeletedCount} bot, ${duplicateDeletedCount} duplicados por teléfono, ${consolidatedCount} consolidados por nombre, ${deletedCount} otros), quedan ${seenPhones.size} participantes únicos`);
}

async function resolveContactDisplayName(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return null;
  }
  try {
    const contact = await client.getContactById(`${normalizedPhone}@c.us`);
    return contact?.pushname || contact?.name || contact?.number || null;
  } catch (error) {
    console.warn('[WARN] No se pudo resolver nombre del contacto:', error.message);
    return null;
  }
}

function updateParticipantNameIfBetter(groupId, phone, candidateName) {
  if (!groupId || !phone || !isMeaningfulName(candidateName)) {
    return;
  }
  const normalizedPhone = normalizePhone(phone);
  const row = db.prepare(`
    SELECT name FROM group_participants 
    WHERE group_id = ? AND phone = ?
  `).get(groupId, normalizedPhone);

  if (!row) {
    return;
  }

  if (!row.name || !isMeaningfulName(row.name) || row.name !== candidateName.trim()) {
    db.prepare(`
      UPDATE group_participants
      SET name = ?
      WHERE group_id = ? AND phone = ?
    `).run(candidateName.trim(), groupId, normalizedPhone);
  }
}

async function buildParticipantDisplayMap(groupId, extraPhones = []) {
  const rows = db.prepare(`
    SELECT DISTINCT phone, name 
    FROM group_participants 
    WHERE group_id = ?
  `).all(groupId);

  const map = {};
  
  // Crear un mapa de teléfonos normalizados para evitar duplicados
  const normalizedPhoneMap = new Map(); // normalized -> original row
  
  // Normalizar todos los teléfonos de la base de datos
  rows.forEach(row => {
    const normalized = normalizePhone(row.phone);
    if (normalized && normalized !== botPhoneNormalized) {
      // Evitar duplicados: si ya existe un teléfono normalizado igual, mantener el que tiene mejor nombre
      if (!normalizedPhoneMap.has(normalized) || isMeaningfulName(row.name)) {
        normalizedPhoneMap.set(normalized, row);
      }
    }
  });
  
  // Agregar teléfonos extra (de gastos) normalizados
  extraPhones.forEach(phone => {
    const normalized = normalizePhone(phone);
    if (normalized && normalized !== botPhoneNormalized) {
      if (!normalizedPhoneMap.has(normalized)) {
        normalizedPhoneMap.set(normalized, { phone: normalized, name: null });
      }
    }
  });

  // Enriquecer nombres y construir el mapa final
  for (const [normalizedPhone, row] of normalizedPhoneMap) {
    // Excluir el bot del conteo
    if (botPhoneNormalized && normalizedPhone === botPhoneNormalized) {
      continue;
    }
    
    let displayName = row.name;

    if (!isMeaningfulName(displayName)) {
      const resolved = await resolveContactDisplayName(normalizedPhone);
      if (isMeaningfulName(resolved)) {
        displayName = resolved.trim();
        updateParticipantNameIfBetter(groupId, normalizedPhone, displayName);
      }
    }

    if (!isMeaningfulName(displayName)) {
      displayName = formatPhoneForDisplay(normalizedPhone);
    }

    map[normalizedPhone] = displayName;
  }

  return {
    map,
    count: Object.keys(map).length
  };
}

function formatAmount(amount) {
  const numeric = Number(amount) || 0;
  return numeric.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================
// FUNCIONES DE BASE DE DATOS: CUENTAS BANCARIAS
// ============================================

function addBankAccount(userPhone, alias) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone || !alias || !alias.trim()) {
    return { success: false, error: 'El alias es requerido' };
  }

  const aliasTrimmed = alias.trim();

  // Asegurar que el usuario esté registrado en la tabla users antes de agregar la cuenta bancaria
  // Esto evita el error de FOREIGN KEY constraint
  try {
    registerUser(normalizedPhone, null);
    console.log(`[DEBUG] Usuario ${normalizedPhone} verificado/registrado antes de agregar cuenta bancaria`);
  } catch (error) {
    console.error('[ERROR] Error verificando/registrando usuario:', error.message);
    return { success: false, error: 'No se pudo verificar el usuario. Por favor, intenta de nuevo.' };
  }

  // Verificar que no exista ya un alias con el mismo nombre para este usuario
  const existingAlias = db.prepare(`
    SELECT id FROM bank_accounts 
    WHERE user_phone = ? AND alias = ?
  `).get(normalizedPhone, aliasTrimmed);
  
  if (existingAlias) {
    return { success: false, error: 'Ya existe una cuenta con este alias' };
  }

  // Si se marca como default, quitar default de otras cuentas
  try {
    // Primero, quitar default de otras cuentas si esta se marca como default
    const existingDefault = db.prepare(`
      SELECT id FROM bank_accounts 
      WHERE user_phone = ? AND is_default = 1
    `).get(normalizedPhone);
    
    if (existingDefault) {
      db.prepare(`
        UPDATE bank_accounts 
        SET is_default = 0 
        WHERE user_phone = ? AND is_default = 1
      `).run(normalizedPhone);
    }

    // Solo guardar el alias, los demás campos se dejan en NULL o valores por defecto
    const stmt = db.prepare(`
      INSERT INTO bank_accounts (user_phone, bank_name, account_type, alias, currency, is_default, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(normalizedPhone, 'Sin especificar', 'Cuenta', aliasTrimmed, 'ARS');
    
    return { success: true, accountId: result.lastInsertRowid };
  } catch (error) {
    console.error('[ERROR] Error agregando cuenta bancaria:', error.message);
    return { success: false, error: error.message };
  }
}

function getUserBankAccounts(userPhone) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone) {
    return [];
  }

  return db.prepare(`
    SELECT id, bank_name, account_type, account_number, alias, cbu, currency, is_default, created_at, updated_at
    FROM bank_accounts
    WHERE user_phone = ?
    ORDER BY is_default DESC, created_at DESC
  `).all(normalizedPhone);
}

function getBankAccountById(accountId, userPhone) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone || !accountId) {
    return null;
  }

  return db.prepare(`
    SELECT id, bank_name, account_type, account_number, alias, cbu, currency, is_default, created_at, updated_at
    FROM bank_accounts
    WHERE id = ? AND user_phone = ?
  `).get(accountId, normalizedPhone);
}

function updateBankAccount(accountId, userPhone, bankName = null, accountType = null, accountNumber = null, alias = null, cbu = null, currency = null) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone || !accountId) {
    return { success: false, error: 'Datos inválidos' };
  }

  try {
    // Construir query dinámicamente según los campos proporcionados
    const updates = [];
    const values = [];
    
    if (bankName) {
      updates.push('bank_name = ?');
      values.push(bankName);
    }
    if (accountType) {
      updates.push('account_type = ?');
      values.push(accountType);
    }
    if (accountNumber !== null) {
      updates.push('account_number = ?');
      values.push(accountNumber);
    }
    if (alias !== null) {
      updates.push('alias = ?');
      values.push(alias);
    }
    if (cbu !== null) {
      updates.push('cbu = ?');
      values.push(cbu);
    }
    if (currency) {
      updates.push('currency = ?');
      values.push(currency);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(accountId, normalizedPhone);
    
    if (updates.length === 1) {
      return { success: false, error: 'No hay campos para actualizar' };
    }
    
    const query = `
      UPDATE bank_accounts 
      SET ${updates.join(', ')}
      WHERE id = ? AND user_phone = ?
    `;
    
    const result = db.prepare(query).run(...values);
    
    if (result.changes === 0) {
      return { success: false, error: 'Cuenta no encontrada' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[ERROR] Error actualizando cuenta bancaria:', error.message);
    return { success: false, error: error.message };
  }
}

function deleteBankAccount(accountId, userPhone) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone || !accountId) {
    return { success: false, error: 'Datos inválidos' };
  }

  try {
    const result = db.prepare(`
      DELETE FROM bank_accounts 
      WHERE id = ? AND user_phone = ?
    `).run(accountId, normalizedPhone);
    
    if (result.changes === 0) {
      return { success: false, error: 'Cuenta no encontrada' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[ERROR] Error eliminando cuenta bancaria:', error.message);
    return { success: false, error: error.message };
  }
}

function setDefaultBankAccount(accountId, userPhone) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone || !accountId) {
    return { success: false, error: 'Datos inválidos' };
  }

  try {
    // Quitar default de otras cuentas
    db.prepare(`
      UPDATE bank_accounts 
      SET is_default = 0 
      WHERE user_phone = ? AND is_default = 1
    `).run(normalizedPhone);
    
    // Marcar esta cuenta como default
    const result = db.prepare(`
      UPDATE bank_accounts 
      SET is_default = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_phone = ?
    `).run(accountId, normalizedPhone);
    
    if (result.changes === 0) {
      return { success: false, error: 'Cuenta no encontrada' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[ERROR] Error estableciendo cuenta por defecto:', error.message);
    return { success: false, error: error.message };
  }
}

function getDefaultBankAccount(userPhone) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone) {
    return null;
  }

  return db.prepare(`
    SELECT id, bank_name, account_type, account_number, alias, cbu, currency, is_default
    FROM bank_accounts
    WHERE user_phone = ? AND is_default = 1
    LIMIT 1
  `).get(normalizedPhone);
}

function getBankAccountByUser(userPhone) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone) {
    return null;
  }

  // Obtener la cuenta por defecto o la primera cuenta disponible
  return db.prepare(`
    SELECT id, alias, is_default
    FROM bank_accounts
    WHERE user_phone = ?
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  `).get(normalizedPhone);
}

function getBankAliasForUser(userPhone) {
  if (!userPhone) {
    return null;
  }
  // Normalizar el teléfono (normalizar es idempotente, así que está bien si ya está normalizado)
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone) {
    return null;
  }
  // Buscar directamente en la base de datos con el teléfono normalizado
  const account = db.prepare(`
    SELECT id, alias, is_default
    FROM bank_accounts
    WHERE user_phone = ?
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  `).get(normalizedPhone);
  
  return account?.alias || null;
}

// ============================================
// FUNCIONES DE BASE DE DATOS: PAGOS REALIZADOS
// ============================================

function addPayment(groupId, fromUserPhone, toUserPhone, amount, paymentMethod = null, bankAccountId = null, notes = null, currency = null) {
  const normalizedFromPhone = normalizePhone(fromUserPhone);
  const normalizedToPhone = normalizePhone(toUserPhone);
  
  if (!normalizedFromPhone || !normalizedToPhone || !amount || amount <= 0) {
    return { success: false, error: 'Datos inválidos' };
  }

  // Verificar que el grupo exista y esté activo
  const group = db.prepare(`
    SELECT id, name, is_closed, currency
    FROM expense_groups
    WHERE id = ?
  `).get(groupId);
  
  if (!group) {
    return { success: false, error: 'Grupo no existe' };
  }
  
  if (group.is_closed === 1) {
    return { success: false, error: 'Grupo cerrado. No se pueden registrar nuevos pagos. Podés reabrirlo desde el menú.' };
  }
  
  // Usar la moneda del grupo si no se especifica
  const paymentCurrency = currency || group.currency || 'ARS';

  // Verificar que no sea el mismo usuario
  if (normalizedFromPhone === normalizedToPhone) {
    return { success: false, error: 'No se puede registrar un pago a uno mismo' };
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO expense_payments (group_id, from_user_phone, to_user_phone, amount, currency, payment_method, bank_account_id, notes, payment_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(groupId, normalizedFromPhone, normalizedToPhone, amount, paymentCurrency, paymentMethod, bankAccountId, notes);
    
    console.log(`[DEBUG] addPayment: Pago registrado - ID: ${result.lastInsertRowid}, Grupo: ${groupId}, De: ${normalizedFromPhone}, Para: ${normalizedToPhone}, Monto: ${amount}`);
    
    return { success: true, paymentId: result.lastInsertRowid };
  } catch (error) {
    console.error('[ERROR] Error registrando pago:', error.message);
    return { success: false, error: error.message };
  }
}

function getPaymentsByGroup(groupId) {
  if (!groupId) {
    return [];
  }

  return db.prepare(`
    SELECT ep.id, ep.group_id, ep.from_user_phone, ep.to_user_phone, ep.amount, ep.payment_method, 
           ep.bank_account_id, ep.payment_date, ep.notes, ep.created_at,
           from_user.name as from_user_name, to_user.name as to_user_name,
           ba.alias as bank_alias
    FROM expense_payments ep
    LEFT JOIN group_participants from_user ON ep.from_user_phone = from_user.phone AND ep.group_id = from_user.group_id
    LEFT JOIN group_participants to_user ON ep.to_user_phone = to_user.phone AND ep.group_id = to_user.group_id
    LEFT JOIN bank_accounts ba ON ep.bank_account_id = ba.id
    WHERE ep.group_id = ?
    ORDER BY ep.payment_date DESC, ep.created_at DESC
  `).all(groupId);
}

function getPaymentsByUser(userPhone, groupId = null) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone) {
    return [];
  }

  let query = `
    SELECT ep.id, ep.group_id, ep.from_user_phone, ep.to_user_phone, ep.amount, ep.payment_method, 
           ep.bank_account_id, ep.payment_date, ep.notes, ep.created_at,
           from_user.name as from_user_name, to_user.name as to_user_name,
           ba.alias as bank_alias,
           eg.name as group_name
    FROM expense_payments ep
    LEFT JOIN group_participants from_user ON ep.from_user_phone = from_user.phone AND ep.group_id = from_user.group_id
    LEFT JOIN group_participants to_user ON ep.to_user_phone = to_user.phone AND ep.group_id = to_user.group_id
    LEFT JOIN bank_accounts ba ON ep.bank_account_id = ba.id
    LEFT JOIN expense_groups eg ON ep.group_id = eg.id
    WHERE (ep.from_user_phone = ? OR ep.to_user_phone = ?)
  `;
  
  const params = [normalizedPhone, normalizedPhone];
  
  if (groupId) {
    query += ` AND ep.group_id = ?`;
    params.push(groupId);
  }
  
  query += ` ORDER BY ep.payment_date DESC, ep.created_at DESC`;
  
  return db.prepare(query).all(...params);
}

function deletePayment(paymentId, userPhone) {
  const normalizedPhone = normalizePhone(userPhone);
  if (!normalizedPhone || !paymentId) {
    return { success: false, error: 'Datos inválidos' };
  }

  try {
    // Verificar que el pago pertenezca al usuario (como pagador o receptor)
    const payment = db.prepare(`
      SELECT id, from_user_phone, to_user_phone
      FROM expense_payments
      WHERE id = ?
    `).get(paymentId);
    
    if (!payment) {
      return { success: false, error: 'Pago no encontrado' };
    }
    
    const normalizedFromPhone = normalizePhone(payment.from_user_phone);
    const normalizedToPhone = normalizePhone(payment.to_user_phone);
    
    // Solo el pagador puede eliminar el pago
    if (normalizedFromPhone !== normalizedPhone) {
      return { success: false, error: 'No tienes permisos para eliminar este pago' };
    }
    
    const result = db.prepare(`
      DELETE FROM expense_payments 
      WHERE id = ?
    `).run(paymentId);
    
    if (result.changes === 0) {
      return { success: false, error: 'No se pudo eliminar el pago' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[ERROR] Error eliminando pago:', error.message);
    return { success: false, error: error.message };
  }
}

function getTotalPaymentsByGroup(groupId) {
  if (!groupId) {
    return {};
  }

  // Obtener total de pagos realizados agrupados por par de usuarios
  const payments = db.prepare(`
    SELECT from_user_phone, to_user_phone, SUM(amount) as total
    FROM expense_payments
    WHERE group_id = ?
    GROUP BY from_user_phone, to_user_phone
  `).all(groupId);

  // Crear un mapa de pagos: from_phone -> to_phone -> amount
  const paymentMap = new Map();
  
  payments.forEach(p => {
    const fromPhone = normalizePhone(p.from_user_phone);
    const toPhone = normalizePhone(p.to_user_phone);
    
    if (!paymentMap.has(fromPhone)) {
      paymentMap.set(fromPhone, new Map());
    }
    
    const toMap = paymentMap.get(fromPhone);
    const currentAmount = toMap.get(toPhone) || 0;
    toMap.set(toPhone, currentAmount + (p.total || 0));
  });

  return paymentMap;
}

function parseGroupExpenseMessage(rawText = '') {
  if (!rawText) {
    console.log('[DEBUG] parseGroupExpenseMessage: texto vacío');
    return null;
  }

  console.log(`[DEBUG] parseGroupExpenseMessage: texto original: "${rawText}"`);
  const cleaned = rawText.replace(/@\S+/g, ' ').trim();
  const lower = cleaned.toLowerCase();
  console.log(`[DEBUG] parseGroupExpenseMessage: texto limpio: "${cleaned}"`);

  if (lower.startsWith('crear') || lower.includes(' crear ') || lower.match(/crea\s+/)) {
    // También detectar "crea" sin la "r" al final
    const createMatch = cleaned.match(/crea(?:r)?\s+(.+)/i);
    let groupLabel = createMatch && createMatch[1] ? createMatch[1].trim() : null;
    if (groupLabel) {
      groupLabel = groupLabel.replace(/[.,;:]+$/g, '').trim();
    }
    console.log(`[DEBUG] parseGroupExpenseMessage: comando crear detectado, nombre: "${groupLabel}"`);
    return { type: 'create', raw: cleaned, lower, name: groupLabel };
  }

  if (lower.includes('resumen') || lower.includes('estado')) {
    console.log(`[DEBUG] parseGroupExpenseMessage: comando resumen detectado`);
    return { type: 'summary' };
  }

  if (lower.includes('calcular') || lower.includes('dividir')) {
    console.log(`[DEBUG] parseGroupExpenseMessage: comando calcular detectado`);
    return { type: 'calculate' };
  }

  const amountRegex = /(gasto|gasté|gaste|pagué|pague|pago)?\s*(\d+[.,]?\d*)/i;
  const match = cleaned.match(amountRegex);
  if (!match || !match[2]) {
    return null;
  }

  const normalizedAmount = match[2]
    .replace(/\./g, '')
    .replace(',', '.');
  const amount = parseFloat(normalizedAmount);
  if (Number.isNaN(amount) || amount <= 0) {
    return null;
  }

  let description = cleaned.slice(match.index + match[0].length).trim();
  description = description.replace(/^(en|para|por)\s+/i, '');
  if (!description) {
    description = 'Gasto registrado';
  }

  return {
    type: 'expense',
    amount,
    description,
    cleaned,
    lower
  };
}

async function getExpenseSummary(groupId, creatorPhone = null) {
  // Verificar que el grupo exista y esté activo (no cerrado y no eliminado)
  const group = preparedStatements.getExpenseGroup.get(groupId);

  if (!group || group.is_closed === 1) {
    return {
      expenses: [],
      total: '0.00',
      perPerson: '0.00',
      participantCount: 0
    };
  }
  
  // Si se proporciona creatorPhone, verificar que coincida
  if (creatorPhone && group.creator_phone !== creatorPhone) {
    console.warn(`[WARN] getExpenseSummary: El grupo ${groupId} no pertenece al creator_phone ${creatorPhone}`);
    return {
      expenses: [],
      total: '0.00',
      perPerson: '0.00',
      participantCount: 0
    };
  }
  
  // Log para debugging
  console.log(`[DEBUG] getExpenseSummary: Grupo ${groupId} (${group.name}) creado el ${group.created_at}, creator_phone: ${group.creator_phone}`);

  // Obtener gastos con nombre del pagador (solo de grupos activos y no eliminados)
  // IMPORTANTE: Solo obtener gastos que pertenecen EXACTAMENTE al grupo activo específico
  // Verificar que el grupo exista y esté activo antes de obtener los gastos
  // NOTA: NO filtrar por last_reset_at - mostrar TODOS los gastos del grupo activo
  // last_reset_at solo se usa para limpiar gastos antiguos cuando se crea un nuevo grupo
  const expenses = preparedStatements.getExpensesByGroup.all(groupId, groupId);
  
  // Log para debugging - mostrar detalles de los gastos
  console.log(`[DEBUG] getExpenseSummary: Grupo ${groupId} tiene ${expenses.length} gastos`);
  if (expenses.length > 0) {
    expenses.forEach((expense, index) => {
      console.log(`[DEBUG] getExpenseSummary: Gasto ${index + 1} - ID: ${expense.id}, group_id: ${expense.group_id}, monto: ${expense.amount}, desc: ${expense.description}, creado: ${expense.created_at}`);
    });
  }

  // Obtener todos los teléfonos únicos de participantes (excluyendo el bot)
  // IMPORTANTE: Normalizar teléfonos para evitar duplicados
  const participants = preparedStatements.getGroupParticipantsPhones.all(groupId);
  
  // Normalizar teléfonos y crear un Set para obtener participantes únicos
  const uniqueParticipants = new Set();
  
  participants.forEach(p => {
    const normalizedPhone = normalizePhone(p.phone);
    if (normalizedPhone) {
      // Excluir el bot si está configurado
      if (botPhoneNormalized && normalizedPhone === botPhoneNormalized) {
        return; // Saltar el bot
      }
      uniqueParticipants.add(normalizedPhone);
    }
  });
  
  // El conteo final es el número de participantes únicos normalizados (sin el bot)
  const participantCount = uniqueParticipants.size;
  
  console.log(`[DEBUG] getExpenseSummary: Grupo ${groupId}: ${participants.length} registros en BD, ${participantCount} participantes únicos después de normalizar (bot excluido: ${botPhoneNormalized || 'N/A'})`);
  // IMPORTANTE: Contar TODOS los gastos en el total, incluso los marcados como pagados
  // Los gastos marcados como pagados son solo referencia visual, no modifican el cálculo
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPerson = participantCount > 0 ? (total / participantCount).toFixed(2) : 0;

  return {
    expenses,
    total: total.toFixed(2),
    perPerson,
    participantCount
  };
}

function calculateSplit(groupId, humanParticipantPhones = null) {
  // Verificar que el grupo exista y esté activo
  const group = preparedStatements.getExpenseGroup.get(groupId);

  if (!group || group.is_closed === 1) {
    return {
      total: '0.00',
      perPerson: '0.00',
      transactions: []
    };
  }

  // Obtener gastos solo de grupos activos (no cerrados)
  // IMPORTANTE: NO filtrar por last_reset_at - mostrar TODOS los gastos del grupo activo
  // last_reset_at solo se usa para limpiar gastos antiguos cuando se crea un nuevo grupo
  // IMPORTANTE: Contar TODOS los gastos, incluso los marcados como pagados
  // Los gastos marcados como pagados son solo referencia visual, no modifican el cálculo
  const expenses = db.prepare(`
    SELECT e.payer_phone, SUM(e.amount) as total 
    FROM expenses e
    INNER JOIN expense_groups eg ON e.group_id = eg.id
    WHERE e.group_id = ? 
      AND IFNULL(eg.is_closed, 0) = 0
    GROUP BY e.payer_phone
  `).all(groupId);

  // IMPORTANTE: Si se proporcionan participantes humanos, usarlos directamente
  // Si no, obtenerlos de la base de datos (pero siempre excluir el bot)
  let normalizedPhones = new Set();
  const participantMap = new Map();
  
  console.log(`[DEBUG] calculateSplit: humanParticipantPhones proporcionados: ${humanParticipantPhones ? humanParticipantPhones.length : 0}`);
  console.log(`[DEBUG] calculateSplit: botPhoneNormalized: ${botPhoneNormalized}`);
  
  if (humanParticipantPhones && humanParticipantPhones.length > 0) {
    // Usar los participantes humanos proporcionados (actuales del grupo de WhatsApp)
    console.log(`[DEBUG] calculateSplit: Usando participantes humanos proporcionados (${humanParticipantPhones.length})`);
    humanParticipantPhones.forEach((phone, idx) => {
      const normalized = normalizePhone(phone);
      console.log(`[DEBUG] calculateSplit: Procesando participante ${idx + 1}: ${phone} → ${normalized} (bot: ${normalized === botPhoneNormalized})`);
      if (normalized && normalized !== botPhoneNormalized) {
        normalizedPhones.add(normalized);
        // Obtener nombre de la base de datos si existe
        const participant = db.prepare(`
          SELECT name 
          FROM group_participants 
          WHERE group_id = ? AND phone = ?
        `).get(groupId, normalized);
        const participantName = participant?.name || formatPhoneForDisplay(normalized);
        participantMap.set(normalized, participantName);
        console.log(`[DEBUG] calculateSplit: Agregado participante: ${normalized} (${participantName})`);
      } else {
        console.log(`[DEBUG] calculateSplit: Omitido participante ${phone} (normalized: ${normalized}, es bot: ${normalized === botPhoneNormalized})`);
      }
    });
  } else {
    // Fallback: obtener participantes de la base de datos (excluyendo el bot)
    console.log(`[DEBUG] calculateSplit: Obteniendo participantes de la base de datos (excluyendo bot: ${botPhoneNormalized})`);
    let participants = [];
    if (botPhoneNormalized) {
      participants = db.prepare(`
        SELECT DISTINCT phone, name 
        FROM group_participants 
        WHERE group_id = ? AND phone != ?
      `).all(groupId, botPhoneNormalized);
    } else {
      participants = db.prepare(`
        SELECT DISTINCT phone, name 
        FROM group_participants 
        WHERE group_id = ?
      `).all(groupId);
    }
    
    console.log(`[DEBUG] calculateSplit: Participantes encontrados en BD: ${participants.length}`);
    participants.forEach((p, idx) => {
      const normalized = normalizePhone(p.phone);
      console.log(`[DEBUG] calculateSplit: Procesando participante BD ${idx + 1}: ${p.phone} → ${normalized} (bot: ${normalized === botPhoneNormalized})`);
      if (normalized && normalized !== botPhoneNormalized) {
        normalizedPhones.add(normalized);
        participantMap.set(normalized, p.name || formatPhoneForDisplay(p.phone));
        console.log(`[DEBUG] calculateSplit: Agregado participante BD: ${normalized} (${p.name || formatPhoneForDisplay(p.phone)})`);
      } else {
        console.log(`[DEBUG] calculateSplit: Omitido participante BD ${p.phone} (normalized: ${normalized}, es bot: ${normalized === botPhoneNormalized})`);
      }
    });
  }

  console.log(`[DEBUG] calculateSplit: Total de participantes humanos: ${normalizedPhones.size}`);
  normalizedPhones.forEach((phone, idx) => {
    console.log(`[DEBUG] calculateSplit: Participante humano ${idx + 1}: ${phone} (${participantMap.get(phone)})`);
  });

  if (normalizedPhones.size === 0) {
    console.log(`[DEBUG] calculateSplit: No hay participantes humanos, retornando valores vacíos`);
    return {
      total: '0.00',
      perPerson: '0.00',
      transactions: []
    };
  }

  const totalAmount = expenses.reduce((sum, e) => {
    const normalizedPayer = normalizePhone(e.payer_phone);
    // Solo contar gastos de participantes humanos (excluir el bot)
    if (normalizedPayer && normalizedPayer !== botPhoneNormalized) {
      console.log(`[DEBUG] calculateSplit: Gasto de ${normalizedPayer}: ${e.total}`);
      return sum + e.total;
    } else {
      console.log(`[DEBUG] calculateSplit: Omitido gasto de ${e.payer_phone} (normalized: ${normalizedPayer}, es bot: ${normalizedPayer === botPhoneNormalized})`);
    }
    return sum;
  }, 0);
  
  const validParticipantCount = normalizedPhones.size;
  const perPerson = validParticipantCount > 0 ? totalAmount / validParticipantCount : 0;
  
  console.log(`[DEBUG] calculateSplit: Total: ${totalAmount}, Participantes: ${validParticipantCount}, Por persona: ${perPerson}`);

  // IMPORTANTE: Usar un Map con teléfonos normalizados como clave para evitar duplicados
  const balances = new Map(); // normalizedPhone -> balance
  
  // Inicializar balances SOLO con participantes humanos actuales (todos deben pagar su parte)
  // IMPORTANTE: Asegurar que cada participante solo aparezca una vez
  normalizedPhones.forEach(phone => {
    const normalized = normalizePhone(phone);
    if (normalized && !balances.has(normalized)) {
      balances.set(normalized, -perPerson);
      console.log(`[DEBUG] calculateSplit: Balance inicial para ${normalized}: -${perPerson}`);
    } else if (normalized && balances.has(normalized)) {
      console.warn(`[WARN] calculateSplit: Participante duplicado detectado: ${phone} → ${normalized}, ya existe en balances`);
    }
  });
  
  console.log(`[DEBUG] calculateSplit: Balances inicializados para ${balances.size} participantes únicos`);

  // IMPORTANTE: Crear un mapa de todos los participantes en la BD (normalizados)
  // para poder buscar coincidencias incluso si los teléfonos no coinciden exactamente
  const allParticipantsInDB = db.prepare(`
    SELECT DISTINCT phone, name
    FROM group_participants
    WHERE group_id = ? AND phone != ?
  `).all(groupId, botPhoneNormalized || '');
  
  // Crear un mapa de teléfonos normalizados a teléfonos en la BD
  const dbPhoneMap = new Map(); // normalized -> { phone, name }
  allParticipantsInDB.forEach(p => {
    const normalized = normalizePhone(p.phone);
    if (normalized && normalized !== botPhoneNormalized) {
      // Si ya existe una entrada, mantener la que tiene mejor nombre
      if (!dbPhoneMap.has(normalized) || isMeaningfulName(p.name)) {
        dbPhoneMap.set(normalized, { phone: p.phone, normalized, name: p.name });
      }
    }
  });
  
  console.log(`[DEBUG] calculateSplit: Mapa de participantes en BD: ${dbPhoneMap.size} participantes`);
  dbPhoneMap.forEach((data, normalized) => {
    console.log(`[DEBUG] calculateSplit: BD: ${normalized} → ${data.phone} (${data.name})`);
  });
  
  // CRÍTICO: Necesitamos asegurar que TODOS los gastos se asignen correctamente a los balances
  // Si un gasto no se asigna, se cuenta en el total pero no se suma al balance del pagador
  // Esto causa que el cálculo sea incorrecto
  
  // Agregar gastos (normalizando teléfonos de pagadores y excluyendo el bot)
  console.log(`[DEBUG] calculateSplit: Procesando ${expenses.length} gastos`);
  let totalProcessed = 0; // Total de gastos procesados correctamente
  let totalOmitted = 0; // Total de gastos omitidos
  
  expenses.forEach((e, idx) => {
    const normalizedPayer = normalizePhone(e.payer_phone);
    console.log(`[DEBUG] calculateSplit: Gasto ${idx + 1}: payer_phone=${e.payer_phone} → normalized=${normalizedPayer}, total=${e.total}`);
    
    if (normalizedPayer && normalizedPayer !== botPhoneNormalized) {
      // CRÍTICO: Buscar el participante correspondiente en los participantes humanos actuales
      // Primero intentar buscar directamente por teléfono normalizado
      let matchingParticipantPhone = null;
      
      // Si el teléfono normalizado está directamente en los participantes humanos, usarlo
      if (normalizedPhones.has(normalizedPayer)) {
        matchingParticipantPhone = normalizedPayer;
        console.log(`[DEBUG] calculateSplit: Coincidencia directa: ${normalizedPayer}`);
      } else {
        // Si no está directamente, buscar en la BD por teléfono normalizado
        if (dbPhoneMap.has(normalizedPayer)) {
          const dbParticipant = dbPhoneMap.get(normalizedPayer);
          const dbNormalized = dbParticipant.normalized;
          console.log(`[DEBUG] calculateSplit: Participante encontrado en BD: ${normalizedPayer} → ${dbNormalized} (${dbParticipant.name})`);
          
          // Si el participante de la BD está en los participantes humanos actuales, usarlo
          if (normalizedPhones.has(dbNormalized)) {
            matchingParticipantPhone = dbNormalized;
            console.log(`[DEBUG] calculateSplit: Coincidencia por BD: ${dbNormalized}`);
          } else {
            // Si no está en los participantes humanos actuales, intentar buscar por nombre
            // o por últimos dígitos del teléfono
            for (const humanPhone of normalizedPhones) {
              const humanName = participantMap.get(humanPhone);
              if (humanName && dbParticipant.name && 
                  humanName.toLowerCase() === dbParticipant.name.toLowerCase()) {
                matchingParticipantPhone = humanPhone;
                console.log(`[DEBUG] calculateSplit: Coincidencia por nombre: ${normalizedPayer} (${dbParticipant.name}) → ${humanPhone} (${humanName})`);
                break;
              }
            }
            
            // Si aún no se encontró, intentar por últimos dígitos del teléfono
            if (!matchingParticipantPhone && normalizedPayer.length >= 4) {
              const lastDigits = normalizedPayer.slice(-4);
              for (const humanPhone of normalizedPhones) {
                if (humanPhone.endsWith(lastDigits)) {
                  matchingParticipantPhone = humanPhone;
                  console.log(`[DEBUG] calculateSplit: Coincidencia por últimos dígitos: ${normalizedPayer} → ${humanPhone}`);
                  break;
                }
              }
            }
          }
        } else {
          // Si no se encuentra en la BD, intentar buscar directamente en los participantes humanos
          // por últimos dígitos del teléfono
          if (normalizedPayer.length >= 4) {
            const lastDigits = normalizedPayer.slice(-4);
            for (const humanPhone of normalizedPhones) {
              if (humanPhone.endsWith(lastDigits)) {
                matchingParticipantPhone = humanPhone;
                console.log(`[DEBUG] calculateSplit: Coincidencia por últimos dígitos (sin BD): ${normalizedPayer} → ${humanPhone}`);
                break;
              }
            }
          }
        }
      }
      
      // CRÍTICO: Si encontramos una coincidencia, procesar el gasto
      // Si no encontramos coincidencia, intentar asignar a cualquier participante que coincida por nombre
      if (matchingParticipantPhone && normalizedPhones.has(matchingParticipantPhone)) {
        // Normalizar el teléfono para asegurar consistencia
        const normalizedMatchingPhone = normalizePhone(matchingParticipantPhone);
        
        // Asegurar que el pagador esté en el mapa de balances
        if (!balances.has(normalizedMatchingPhone)) {
          // Si el pagador no está en participantes, agregarlo con balance inicial
          console.log(`[DEBUG] calculateSplit: Agregando balance inicial para ${normalizedMatchingPhone}: -${perPerson}`);
          balances.set(normalizedMatchingPhone, -perPerson);
        }
        // Agregar al mapa de participantes si no está (para obtener el nombre)
        if (!participantMap.has(normalizedMatchingPhone)) {
          const participant = db.prepare(`
            SELECT name 
            FROM group_participants 
            WHERE group_id = ? AND phone = ?
          `).get(groupId, normalizedMatchingPhone);
          participantMap.set(normalizedMatchingPhone, participant?.name || formatPhoneForDisplay(normalizedMatchingPhone));
        }
        const balanceBefore = balances.get(normalizedMatchingPhone);
        balances.set(normalizedMatchingPhone, balanceBefore + e.total);
        const balanceAfter = balances.get(normalizedMatchingPhone);
        totalProcessed += e.total;
        console.log(`[DEBUG] calculateSplit: ✅ Gasto asignado: ${normalizedMatchingPhone} (${participantMap.get(normalizedMatchingPhone)}): ${balanceBefore} + ${e.total} = ${balanceAfter}`);
      } else {
        // ERROR CRÍTICO: El gasto no se puede asignar a ningún participante
        // Intentar una última búsqueda más agresiva: buscar por nombre en todos los participantes
        console.error(`[ERROR] calculateSplit: No se encontró coincidencia para ${normalizedPayer} (${e.payer_phone}), gasto: ${e.total}`);
        console.error(`[ERROR] calculateSplit: Participantes humanos disponibles: ${Array.from(normalizedPhones).join(', ')}`);
        console.error(`[ERROR] calculateSplit: Teléfonos en BD: ${Array.from(dbPhoneMap.keys()).join(', ')}`);
        
        // Última búsqueda: intentar encontrar el participante por nombre en la BD
        const participantInDB = db.prepare(`
          SELECT phone, name 
          FROM group_participants 
          WHERE group_id = ? AND phone = ?
        `).get(groupId, e.payer_phone);
        
        if (participantInDB) {
          const participantNormalized = normalizePhone(participantInDB.phone);
          console.log(`[ERROR] calculateSplit: Participante encontrado en BD por teléfono exacto: ${participantInDB.phone} → ${participantNormalized} (${participantInDB.name})`);
          
          // Intentar buscar por nombre en los participantes humanos
          if (participantInDB.name) {
            for (const humanPhone of normalizedPhones) {
              const humanName = participantMap.get(humanPhone);
              if (humanName && participantInDB.name && 
                  humanName.toLowerCase().trim() === participantInDB.name.toLowerCase().trim()) {
                matchingParticipantPhone = humanPhone;
                console.log(`[ERROR] calculateSplit: ✅ Coincidencia encontrada por nombre después de error: ${participantInDB.name} → ${humanPhone}`);
                
                // Normalizar el teléfono para asegurar consistencia
                const normalizedMatchingPhone = normalizePhone(matchingParticipantPhone);
                
                // Asignar el gasto
                if (!balances.has(normalizedMatchingPhone)) {
                  balances.set(normalizedMatchingPhone, -perPerson);
                }
                if (!participantMap.has(normalizedMatchingPhone)) {
                  participantMap.set(normalizedMatchingPhone, participantInDB.name);
                }
                const balanceBefore = balances.get(normalizedMatchingPhone);
                balances.set(normalizedMatchingPhone, balanceBefore + e.total);
                const balanceAfter = balances.get(normalizedMatchingPhone);
                totalProcessed += e.total;
                console.log(`[ERROR] calculateSplit: ✅ Gasto asignado después de error: ${normalizedMatchingPhone} (${participantMap.get(normalizedMatchingPhone)}): ${balanceBefore} + ${e.total} = ${balanceAfter}`);
                break;
              }
            }
          }
        }
        
        // Si aún no se asignó, contar como omitido
        if (!matchingParticipantPhone || !normalizedPhones.has(matchingParticipantPhone)) {
          totalOmitted += e.total;
          console.error(`[ERROR] calculateSplit: ❌ Gasto NO asignado: ${e.total} de ${normalizedPayer} (${e.payer_phone})`);
        }
      }
    } else {
      console.log(`[DEBUG] calculateSplit: Omitido gasto de ${e.payer_phone} (normalized: ${normalizedPayer}, es bot: ${normalizedPayer === botPhoneNormalized})`);
      if (normalizedPayer === botPhoneNormalized) {
        // Si es el bot, no contar en totalOmitted
      } else {
        totalOmitted += e.total;
      }
    }
  });
  
  console.log(`[DEBUG] calculateSplit: Total procesado: ${totalProcessed}, Total omitido: ${totalOmitted}, Total esperado: ${totalAmount}`);
  
  // CRÍTICO: Verificar que todos los gastos se procesaron correctamente
  if (totalProcessed + totalOmitted !== totalAmount) {
    console.error(`[ERROR] calculateSplit: Discrepancia en totales: procesado=${totalProcessed}, omitido=${totalOmitted}, esperado=${totalAmount}, diferencia=${totalAmount - totalProcessed - totalOmitted}`);
  }
  
  // CRÍTICO: Si hay gastos omitidos, el cálculo será incorrecto
  // Necesitamos asegurar que todos los gastos se asignen correctamente
  if (totalOmitted > 0) {
    console.error(`[ERROR] calculateSplit: ${totalOmitted} en gastos no se pudieron asignar a participantes. El cálculo será incorrecto.`);
  }
  
  console.log(`[DEBUG] calculateSplit: Balances después de procesar gastos:`);
  balances.forEach((balance, phone) => {
    console.log(`[DEBUG] calculateSplit: ${phone} (${participantMap.get(phone)}): ${balance}`);
  });

  // IMPORTANTE: Considerar pagos realizados en los balances
  // Los pagos realizados reducen las deudas entre usuarios
  const paymentMap = getTotalPaymentsByGroup(groupId);
  console.log(`[DEBUG] calculateSplit: Pagos realizados en el grupo: ${paymentMap.size} pares de usuarios`);
  
  // Aplicar pagos realizados a los balances
  paymentMap.forEach((toMap, fromPhone) => {
    const normalizedFromPhone = normalizePhone(fromPhone);
    
    // Solo procesar si el pagador está en los participantes humanos
    if (!normalizedFromPhone || !normalizedPhones.has(normalizedFromPhone)) {
      console.log(`[DEBUG] calculateSplit: Pagador ${normalizedFromPhone} no está en participantes humanos, omitiendo pagos`);
      return;
    }
    
    // Asegurar que el pagador esté en el mapa de balances
    if (!balances.has(normalizedFromPhone)) {
      balances.set(normalizedFromPhone, -perPerson);
    }
    
    toMap.forEach((paidAmount, toPhone) => {
      const normalizedToPhone = normalizePhone(toPhone);
      
      // Solo procesar si el receptor está en los participantes humanos
      if (!normalizedToPhone || !normalizedPhones.has(normalizedToPhone)) {
        console.log(`[DEBUG] calculateSplit: Receptor ${normalizedToPhone} no está en participantes humanos, omitiendo pago`);
        return;
      }
      
      // Asegurar que el receptor esté en el mapa de balances
      if (!balances.has(normalizedToPhone)) {
        balances.set(normalizedToPhone, -perPerson);
      }
      
      // Aplicar el pago: el pagador reduce su deuda y el receptor reduce su crédito
      // Si A debe a B 100 y A pagó a B 50, entonces:
      // - Balance de A: -100 + 50 = -50 (debe 50)
      // - Balance de B: +100 - 50 = +50 (le deben 50)
      const balanceBeforeFrom = balances.get(normalizedFromPhone);
      const balanceBeforeTo = balances.get(normalizedToPhone);
      
      // El pagador reduce su deuda (aumenta su balance)
      balances.set(normalizedFromPhone, balanceBeforeFrom + paidAmount);
      
      // El receptor reduce su crédito (disminuye su balance)
      balances.set(normalizedToPhone, balanceBeforeTo - paidAmount);
      
      const balanceAfterFrom = balances.get(normalizedFromPhone);
      const balanceAfterTo = balances.get(normalizedToPhone);
      
      console.log(`[DEBUG] calculateSplit: Pago aplicado - ${normalizedFromPhone} → ${normalizedToPhone}: ${paidAmount}`);
      console.log(`[DEBUG] calculateSplit: Balance de ${normalizedFromPhone} (${participantMap.get(normalizedFromPhone)}): ${balanceBeforeFrom} + ${paidAmount} = ${balanceAfterFrom}`);
      console.log(`[DEBUG] calculateSplit: Balance de ${normalizedToPhone} (${participantMap.get(normalizedToPhone)}): ${balanceBeforeTo} - ${paidAmount} = ${balanceAfterTo}`);
    });
  });

  console.log(`[DEBUG] calculateSplit: Balances después de aplicar pagos realizados:`);
  balances.forEach((balance, phone) => {
    console.log(`[DEBUG] calculateSplit: ${phone} (${participantMap.get(phone)}): ${balance}`);
  });

  // Separar en deudores y acreedores, ordenando de mayor a menor
  // IMPORTANTE: Los balances ya están normalizados en el Map, pero verificamos que todos los participantes sean únicos
  // El Map 'balances' ya usa teléfonos normalizados como clave, por lo que no debería haber duplicados
  const normalizedBalances = new Map(); // normalizedPhone -> { phone, name, balance }
  
  balances.forEach((balance, normalizedPhone) => {
    // CRÍTICO: Solo procesar participantes humanos actuales, excluir el bot
    if (!normalizedPhone || (botPhoneNormalized && normalizedPhone === botPhoneNormalized)) {
      return;
    }
    
    // Solo procesar si el teléfono está en el conjunto de participantes humanos
    if (!normalizedPhones.has(normalizedPhone)) {
      return;
    }

    // Buscar nombre en el mapa, usar formato de teléfono como fallback
    const name = participantMap.get(normalizedPhone) || formatPhoneForDisplay(normalizedPhone);
    
    // Los balances ya están normalizados, pero verificamos que no haya duplicados
    if (normalizedBalances.has(normalizedPhone)) {
      const existing = normalizedBalances.get(normalizedPhone);
      existing.balance += balance; // Sumar balances si hay duplicados (no debería pasar)
      console.error(`[ERROR] calculateSplit: Balance duplicado detectado para ${normalizedPhone} (${name}), consolidando: ${existing.balance - balance} + ${balance} = ${existing.balance}`);
    } else {
      normalizedBalances.set(normalizedPhone, {
        phone: normalizedPhone,
        name,
        balance
      });
    }
  });
  
  console.log(`[DEBUG] calculateSplit: Balances normalizados: ${normalizedBalances.size} participantes únicos`);
  
  // Ahora separar en deudores y acreedores usando los balances normalizados
  const debtors = [];
  const creditors = [];
  
  normalizedBalances.forEach((data, normalizedPhone) => {
    // Usar un umbral más estricto (0.05) para evitar problemas de precisión de punto flotante
    // Esto asegura que solo se creen transacciones para balances significativos
    const roundedBalance = Math.round(data.balance * 100) / 100; // Redondear a 2 decimales
    
    if (roundedBalance < -0.05) {
      // Debe dinero (pagó menos de lo que debe)
      debtors.push({ 
        phone: normalizedPhone, 
        name: data.name, 
        amount: Math.abs(roundedBalance) 
      });
    } else if (roundedBalance > 0.05) {
      // Le deben dinero (pagó más de lo que debe)
      creditors.push({ 
        phone: normalizedPhone, 
        name: data.name, 
        amount: roundedBalance 
      });
    }
    // Si balance está entre -0.05 y 0.05, está balanceado (considerado como 0), no agregar a ninguna lista
  });

  console.log(`[DEBUG] calculateSplit: Deudores: ${debtors.length}, Acreedores: ${creditors.length}`);
  debtors.forEach((d, idx) => {
    console.log(`[DEBUG] calculateSplit: Deudor ${idx + 1}: ${d.phone} (${d.name}) debe ${d.amount}`);
  });
  creditors.forEach((c, idx) => {
    console.log(`[DEBUG] calculateSplit: Acreedor ${idx + 1}: ${c.phone} (${c.name}) le deben ${c.amount}`);
  });

  // Verificar que no haya nadie que aparezca en ambas listas (después de normalizar)
  const debtorPhones = new Set(debtors.map(d => normalizePhone(d.phone)));
  const creditorPhones = new Set(creditors.map(c => normalizePhone(c.phone)));
  const overlap = [...debtorPhones].filter(phone => creditorPhones.has(phone));
  
  if (overlap.length > 0) {
    console.error(`[ERROR] calculateSplit: Se encontraron ${overlap.length} participantes que aparecen como deudor y acreedor simultáneamente: ${overlap.join(', ')}`);
    // Filtrar estos participantes de ambas listas
    debtors.forEach((d, idx) => {
      if (overlap.includes(normalizePhone(d.phone))) {
        console.warn(`[WARN] calculateSplit: Removiendo ${d.name} (${d.phone}) de deudores porque también aparece como acreedor`);
      }
    });
    creditors.forEach((c, idx) => {
      if (overlap.includes(normalizePhone(c.phone))) {
        console.warn(`[WARN] calculateSplit: Removiendo ${c.name} (${c.phone}) de acreedores porque también aparece como deudor`);
      }
    });
    
    // Filtrar los participantes que aparecen en ambas listas
    const debtorsFiltered = debtors.filter(d => !overlap.includes(normalizePhone(d.phone)));
    const creditorsFiltered = creditors.filter(c => !overlap.includes(normalizePhone(c.phone)));
    
    console.log(`[DEBUG] calculateSplit: Después de filtrar solapamientos - Deudores: ${debtorsFiltered.length}, Acreedores: ${creditorsFiltered.length}`);
    
    // Usar las listas filtradas
    debtors.length = 0;
    debtors.push(...debtorsFiltered);
    creditors.length = 0;
    creditors.push(...creditorsFiltered);
  }

  // Ordenar de mayor a menor para optimizar las transferencias
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;

  // Algoritmo para minimizar transferencias: emparejar deudores con acreedores
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    // TRIPLE VERIFICACIÓN: Normalizar ambos teléfonos y verificar que no sean iguales
    const normalizedDebtorPhone = normalizePhone(debtor.phone);
    const normalizedCreditorPhone = normalizePhone(creditor.phone);
    
    if (normalizedDebtorPhone === normalizedCreditorPhone) {
      // Si son la misma persona después de normalizar, saltar ambas entradas
      console.error(`[ERROR] calculateSplit: ${debtor.name} (${normalizedDebtorPhone}) aparece como deudor y acreedor en el mismo emparejamiento, saltando`);
      // Si el deudor tiene más deuda, avanzar solo el acreedor (o viceversa)
      // Pero mejor saltar ambos ya que esto indica un error en la lógica anterior
      i++;
      j++;
      continue;
    }

    const amount = Math.min(debtor.amount, creditor.amount);

    // Solo crear transacción si el monto es significativo (>= 0.05) y no es la misma persona
    if (amount >= 0.05 && normalizedDebtorPhone !== normalizedCreditorPhone) {
      transactions.push({
        from: debtor.name,
        fromPhone: normalizedDebtorPhone,
        to: creditor.name,
        toPhone: normalizedCreditorPhone,
        amount: parseFloat(amount.toFixed(2))
      });
      
      console.log(`[DEBUG] calculateSplit: Transacción creada: ${debtor.name} (${normalizedDebtorPhone}) → ${creditor.name} (${normalizedCreditorPhone}): ${amount.toFixed(2)}`);
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    // Avanzar índices si las cantidades se agotaron (con tolerancia)
    if (debtor.amount < 0.05) i++;
    if (creditor.amount < 0.05) j++;
  }
  
  // FILTRO FINAL CRÍTICO: Eliminar cualquier transacción donde fromPhone === toPhone
  // Esto es una última verificación de seguridad
  const validTransactions = [];
  const seenTransactions = new Set(); // Para evitar transacciones duplicadas
  
  transactions.forEach(t => {
    const normalizedFrom = normalizePhone(t.fromPhone);
    const normalizedTo = normalizePhone(t.toPhone);
    
    // Verificar que no sea una transacción a uno mismo
    if (normalizedFrom === normalizedTo) {
      console.error(`[ERROR] calculateSplit: FILTRADA transacción a uno mismo: ${t.from} (${normalizedFrom}) → ${t.to} (${normalizedTo}): ${t.amount}`);
      return; // Saltar esta transacción
    }
    
    // Verificar que no sea una transacción duplicada
    const transactionKey = `${normalizedFrom}→${normalizedTo}`;
    if (seenTransactions.has(transactionKey)) {
      console.warn(`[WARN] calculateSplit: FILTRADA transacción duplicada: ${t.from} → ${t.to}: ${t.amount}`);
      return; // Saltar esta transacción
    }
    
    seenTransactions.add(transactionKey);
    validTransactions.push(t);
  });
  
  if (validTransactions.length !== transactions.length) {
    console.warn(`[WARN] calculateSplit: Se filtraron ${transactions.length - validTransactions.length} transacciones inválidas (auto-transferencias o duplicados)`);
  }
  
  console.log(`[DEBUG] calculateSplit: Transacciones finales válidas: ${validTransactions.length}`);
  validTransactions.forEach((t, idx) => {
    console.log(`[DEBUG] calculateSplit: Transacción válida ${idx + 1}: ${t.from} (${t.fromPhone}) → ${t.to} (${t.toPhone}): ${t.amount}`);
  });
  
  // Usar solo las transacciones válidas
  transactions.length = 0;
  transactions.push(...validTransactions);

  return {
    total: totalAmount.toFixed(2),
    perPerson: perPerson.toFixed(2),
    transactions
  };
}

// ============================================
// MÓDULO DE IA (CLAUDE)
// ============================================

async function processWithAI(userMessage, userPhone) {
  if (!anthropic) {
    console.warn('IA solicitada pero ANTHROPIC_API_KEY no está configurada.');
    return '⚠️ El asistente de IA no está disponible en este momento porque falta la configuración necesaria.';
  }

  try {
    const session = getSession(userPhone);
    const context = session?.context || '';
    
    // Obtener fecha y hora actual
    const ahora = new Date();
    const fechaActual = ahora.toLocaleDateString('es-AR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const horaActual = ahora.toLocaleTimeString('es-AR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Eres un asistente personal de WhatsApp. 

INFORMACIÓN ACTUAL:
- Fecha de hoy: ${fechaActual}
- Hora actual: ${horaActual}
- Zona horaria: America/Argentina/Mendoza

El usuario dice: "${userMessage}"
Contexto previo: ${context}

Analiza si quiere:
1. Crear/ver recordatorios (responde con "CALENDAR: [acción]")
2. Gestionar gastos (responde con "EXPENSES: [acción]")
3. Conversación general (responde directamente)

Si detectas una fecha/hora, extráela en formato ISO (YYYY-MM-DD HH:MM).
Sé breve y amigable.`
        }
      ],
    });

    const response = message.content[0].text;

    if (response.startsWith('CALENDAR:')) {
      return '📅 Entendido. ¿Cuándo es el recordatorio? (Ej: "Mañana a las 3pm")\n\n💡 Escribí *"menu"* para volver al inicio.';
    } else if (response.startsWith('EXPENSES:')) {
      return '💰 ¿Quieres crear un nuevo grupo de gastos o agregar a uno existente?\n\n💡 Escribí *"menu"* para volver al inicio.';
    } else {
      const trimmed = response.trim();
      return `${trimmed}\n\n💡 Escribí *"menu"* para volver al inicio.`;
    }
  } catch (error) {
    console.error('Error con Claude:', error);
    return '❌ Error al procesar con IA. Intenta de nuevo.';
  }
}

// ============================================
// MÓDULO DE FEEDBACK
// ============================================

function saveFeedback(userPhone, userName, type, message) {
  const stmt = db.prepare(`
    INSERT INTO feedback (user_phone, user_name, type, message)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(userPhone, userName, type, message);
  return { success: true, id: result.lastInsertRowid };
}

function getAllFeedback() {
  const stmt = db.prepare(`
    SELECT * FROM feedback 
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

function getPendingFeedback() {
  const stmt = db.prepare(`
    SELECT * FROM feedback 
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

function markFeedbackAsRead(id) {
  const stmt = db.prepare(`
    UPDATE feedback 
    SET status = 'read' 
    WHERE id = ?
  `);
  stmt.run(id);
}

// ============================================
// GENERADOR DE MENÚS
// ============================================

function getMainMenu(userName = '', userPhone = null) {
  const greeting = userName ? `Hola *${userName}*! 👋\n\n` : '';
  let menu = `${greeting}🤖 *Soy Milo, tu asistente personal*\n\nSelecciona una opción:\n\n1️⃣ 🌤️ Pronóstico para hoy\n2️⃣ 📅 Calendario & Recordatorios\n3️⃣ 🗓️ Programar Mensajes\n4️⃣ 💰 Dividir Gastos\n5️⃣ 🏫 Google Classroom\n6️⃣ 🤖 Asistente IA\n7️⃣ 💱 Conversor de Monedas\n8️⃣ 🤝 Invitar a un amigo\n`;
  
  // Agregar opción de administrar suscripción si es Premium
  if (userPhone) {
    const premiumModule = require('./modules/premium-module');
    const isPremium = premiumModule.isPremiumUser(db, userPhone);
    if (isPremium) {
      menu += `9️⃣ 💎 Mi Suscripción Premium\n`;
      menu += `🔟 ⚙️ Configuración\n`;
      menu += `1️⃣1️⃣ ℹ️ Ayuda\n`;
    } else {
      menu += `9️⃣ ⚙️ Configuración\n`;
      menu += `🔟 ℹ️ Ayuda\n`;
    }
  } else {
    menu += `9️⃣ ⚙️ Configuración\n`;
    menu += `🔟 ℹ️ Ayuda\n`;
  }
  
  menu += `\n_Escribe el número o habla naturalmente_\n\n💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar al menú principal.`;
  return menu;
}

function getScheduledMessagesMenu(userPhone, userName = '') {
  const scheduledMessagesModule = require('./modules/scheduled-messages');
  const normalizedPhone = normalizePhone(userPhone);
  const limitInfo = scheduledMessagesModule.checkDailyLimit(db, normalizedPhone);
  const pendingCount = scheduledMessagesModule.getPendingCount(db, normalizedPhone);
  
  let menu = `🗓️ *Programar Mensajes*\n\n`;
  menu += `📊 Estado: ${pendingCount}/${limitInfo.limit} mensajes programados\n\n`;
  menu += `*Opciones:*\n\n`;
  menu += `1️⃣ Programar nuevo mensaje\n`;
  menu += `2️⃣ Ver mensajes programados\n`;
  menu += `3️⃣ Cancelar mensaje (por ID)\n`;
  menu += `4️⃣ Cancelar todos los mensajes\n`;
  menu += `5️⃣ Volver al menú principal\n\n`;
  menu += `💡 *Tips:*\n`;
  menu += `• Podés programar mensajes con lenguaje natural\n`;
  menu += `• Ejemplos: "en 2 minutos", "mañana 10:00", "hoy 11:45 am"\n`;
  menu += `• Podés enviar a vos mismo o a otros contactos\n\n`;
  menu += `Escribí *"volver"* o *"menu"* para regresar.`;
  
  return menu;
}

calendarModule.setMainMenuProvider(getMainMenu);
classroomModule.setMainMenuProvider(getMainMenu);

function getExpensesMenu(userPhone = null) {
  let menu = '💰 *Dividir Gastos*\n\n';
  
  // Verificar si el usuario tiene deudas pendientes
  if (userPhone) {
    const pendingDebts = getUserPendingDebts(userPhone);
    if (pendingDebts.length > 0) {
      const totalDebt = pendingDebts.reduce((sum, debt) => sum + debt.amount, 0);
      menu += `⚠️ *Tienes ${pendingDebts.length} deuda${pendingDebts.length > 1 ? 's' : ''} pendiente${pendingDebts.length > 1 ? 's' : ''}*\n`;
      menu += `💸 Total: ${formatAmount(totalDebt)}\n\n`;
    }
  }
  
  menu += '1. Crear nuevo grupo\n2. Mis grupos activos\n';
  
  // Agregar opción para ver deudas pendientes si existen
  if (userPhone) {
    const pendingDebts = getUserPendingDebts(userPhone);
    if (pendingDebts.length > 0) {
      menu += `3. Ver mis deudas pendientes (${pendingDebts.length})\n4. Volver al menú\n\n`;
    } else {
      menu += '3. Volver al menú\n\n';
    }
  } else {
    menu += '3. Volver al menú\n\n';
  }
  
  menu += '¿Qué deseas hacer?\n\n💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.';
  
  return menu;
}

function buildKeywordGuide() {
  const lines = KEYWORD_SHORTCUTS.map(shortcut => {
    const example = shortcut.example || shortcut.keywords[0];
    return `• *${shortcut.label}:* "${example}"`;
  }).join('\n');
  return `🔑 *Atajos por palabras clave*\n${lines}\n\n_Podés escribir estas palabras en cualquier momento para saltar directo a la acción._`;
}

function detectKeywordShortcut(message = '') {
  if (!message) {
    return null;
  }

  const cleanedMessage = message.toLowerCase();

  for (const shortcut of KEYWORD_SHORTCUTS) {
    for (const keyword of shortcut.keywords) {
      if (keyword && cleanedMessage.includes(keyword.toLowerCase())) {
        return shortcut;
      }
    }
  }

  return null;
}

async function handleKeywordShortcutAction({ shortcut, msg, userPhone, userName, session }) {
  if (!shortcut) {
    return false;
  }

  console.log(`[DEBUG] Atajo por palabra clave detectado: ${shortcut.action} para ${userPhone}`);
  let response = '';

  try {
    switch (shortcut.action) {
      case 'weather': {
        statsModule.trackModuleAccess(db, userPhone, 'weather');
        const weatherModule = require('./modules/weather-module');
        const forecast = await weatherModule.getWeatherForecast(db, userPhone, userName, {
          forceIpSuggestion: true
        });
        response = forecast?.message || '🌤️ No pude obtener el pronóstico en este momento. Intenta nuevamente en unos instantes.';

        if (forecast?.pendingLocation) {
          updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation: forecast.pendingLocation }));
        } else {
          updateSession(userPhone, 'weather', null);
        }
        break;
      }
      case 'expenses': {
        statsModule.trackModuleAccess(db, userPhone, 'expenses');
        response = getExpensesMenu(userPhone);
        updateSession(userPhone, 'expenses');
        break;
      }
      case 'calendar': {
        statsModule.trackModuleAccess(db, userPhone, 'calendar');
        response = await calendarModule.handleCalendarMessage(
          msg,
          userPhone,
          userName,
          '1',
          'main',
          session,
          db,
          client
        );
        updateSession(userPhone, 'calendar');
        break;
      }
      case 'ai': {
        statsModule.trackModuleAccess(db, userPhone, 'ai');
        response = `Hola *${userName}*! 🤖\n\nModo IA activado. Habla naturalmente y te ayudaré.\n\n_La sesión se cerrará automáticamente después de 5 minutos de inactividad._`;
        updateSession(userPhone, 'ai');
        break;
      }
      case 'currency': {
        statsModule.trackModuleAccess(db, userPhone, 'currency');
        const startCurrency = currencyModule.startCurrencyFlow(db, userPhone);
        response = startCurrency.message;
        updateSession(userPhone, 'currency', startCurrency.context);
        break;
      }
    case 'scheduled_message': {
      const flowStart = scheduledMessagesModule.startSchedulingFlow(db, userPhone, userName);
      response = flowStart.message;
      if (!flowStart.abort) {
        updateSession(userPhone, flowStart.nextModule, flowStart.context);
      }
      break;
    }
      default:
        return false;
    }
  } catch (error) {
    console.error(`[ERROR] Error manejando atajo ${shortcut.action}:`, error);
    response = `❌ Ocurrió un error ejecutando el atajo "${shortcut.label}". Intenta nuevamente en unos instantes.`;
  }

  if (!response) {
    return false;
  }

  try {
    await msg.reply(response);
    console.log(`[DEBUG] Respuesta enviada por atajo ${shortcut.action} a ${userPhone}`);
    return true;
  } catch (replyError) {
    console.error('[ERROR] No se pudo responder al atajo:', replyError);
    return false;
  }
}

async function handleGroupMention({ msg, groupChat, groupId, groupName, rawMessage, inviterPhone, inviterName }) {
  console.log(`[DEBUG] handleGroupMention: procesando mensaje: "${rawMessage}"`);
  
  // Limpiar el mensaje de menciones para análisis
  const cleanedMessage = rawMessage.replace(/@\S+/g, ' ').trim();
  const messageLower = cleanedMessage.toLowerCase();
  
  // Detectar comando de programar mensaje
  if (messageLower.includes('programar') && (messageLower.includes('mensaje') || messageLower.includes('envío') || messageLower.includes('envio'))) {
    console.log(`[DEBUG] Comando de programar mensaje detectado en grupo: "${cleanedMessage}"`);
    
    // Obtener teléfono del autor del mensaje
    let authorPhone = null;
    let authorName = 'Usuario';
    try {
      if (msg.author) {
        authorPhone = msg.author.replace('@c.us', '').replace('@g.us', '').replace('@lid', '');
      }
      const authorContact = await msg.getContact();
      authorName = authorContact.pushname || authorContact.name || authorContact.number || 'Usuario';
      
      const normalizedAuthorPhone = normalizePhone(authorPhone);
      if (normalizedAuthorPhone) {
        // Iniciar flujo de programación de mensajes en el contexto del grupo
        const scheduledMessagesModule = require('./modules/scheduled-messages');
        
        // Crear contexto especial para grupo
        const groupContext = {
          isGroup: true,
          groupId: groupId,
          groupName: groupName,
          groupChatId: groupId
        };
        
        // Iniciar el flujo con contexto de grupo
        const flowStart = scheduledMessagesModule.startSchedulingFlow(db, normalizedAuthorPhone, authorName);
        
        if (flowStart && flowStart.message && !flowStart.abort) {
          // Actualizar la sesión con el contexto del grupo
          const session = getSession(normalizedAuthorPhone);
          if (session) {
            try {
              const context = session.context ? JSON.parse(session.context) : {};
              context.groupContext = groupContext;
              // Pre-seleccionar el grupo actual como destino
              context.preSelectedGroup = {
                id: groupId,
                name: groupName
              };
              updateSession(normalizedAuthorPhone, flowStart.nextModule || 'scheduled_message_collect_text', JSON.stringify(context));
            } catch (error) {
              console.warn('[WARN] Error actualizando contexto de grupo:', error.message);
            }
          }
          
          // Enviar mensaje al grupo explicando que debe continuar por privado
          await msg.reply(
            `🗓️ *Programar Mensaje para el Grupo*\n\n` +
            `Para programar un mensaje para este grupo (*${groupName}*), continuá la conversación por privado conmigo.\n\n` +
            `Te acabo de enviar un mensaje privado para continuar. 👇`
          );
          
          // Enviar mensaje privado al usuario con información del grupo
          try {
            const userChatId = `${normalizedAuthorPhone}@c.us`;
            const enhancedMessage = flowStart.message + 
              `\n\n💡 *Nota:* Estás programando un mensaje para el grupo *"${groupName}"*. ` +
              `Cuando te pregunte a quién enviarlo, elegí la opción *4️⃣ Enviar a grupo de WhatsApp* y seleccioná este grupo.`;
            await client.sendMessage(userChatId, enhancedMessage);
            console.log(`✅ Flujo de programación iniciado para grupo ${groupName} (${groupId})`);
          } catch (error) {
            console.error('[ERROR] No se pudo enviar mensaje privado:', error.message);
            await msg.reply(
              `⚠️ No pude enviarte un mensaje privado. Por favor, escribime por privado con *"programar mensaje"* para continuar.`
            );
          }
          
          return true;
        } else if (flowStart && flowStart.abort) {
          // El usuario alcanzó el límite
          await msg.reply(flowStart.message || '⚠️ Alcanzaste el límite de mensajes programados.');
          return true;
        }
      }
    } catch (error) {
      console.error('[ERROR] Error iniciando programación de mensaje en grupo:', error);
      await msg.reply('❌ Ocurrió un error al iniciar la programación. Por favor, intentá más tarde.');
      return true;
    }
  }
  
  // Detectar preguntas sobre clima en lenguaje natural
  if (cleanedMessage && cleanedMessage.trim()) {
    try {
      const weatherIntentDetector = require('./modules/weather-module/intent-detector');
      const weatherIntent = weatherIntentDetector.detectWeatherIntent(cleanedMessage);
      
      if (weatherIntent) {
        console.log(`[DEBUG] Pregunta sobre clima detectada en grupo: "${cleanedMessage}"`);
        
        // Obtener teléfono del autor del mensaje
        let authorPhone = null;
        let authorName = 'Usuario';
        try {
          if (msg.author) {
            authorPhone = msg.author.replace('@c.us', '').replace('@g.us', '');
          }
          const authorContact = await msg.getContact();
          authorName = authorContact.pushname || authorContact.name || authorContact.number || 'Usuario';
          
          const normalizedAuthorPhone = normalizePhone(authorPhone);
          if (normalizedAuthorPhone) {
            const weatherModule = require('./modules/weather-module');
            const weatherAnswer = await weatherModule.answerWeatherQuestion(
              db,
              normalizedAuthorPhone,
              authorName,
              cleanedMessage
            );
            
            if (weatherAnswer && weatherAnswer.directAnswer) {
              await msg.reply(weatherAnswer.message);
              return true;
            }
          }
        } catch (error) {
          console.warn('[WARN] Error respondiendo pregunta de clima en grupo:', error.message);
        }
      }
    } catch (error) {
      console.warn('[WARN] Error detectando pregunta de clima en grupo:', error.message);
    }
  }
  
  const parsed = parseGroupExpenseMessage(rawMessage);
  if (!parsed) {
    console.log(`[DEBUG] handleGroupMention: mensaje no parseado, podría ser un saludo u otro comando`);
    
    // Si el bot fue mencionado pero el mensaje no es un comando reconocido, responder con ayuda
    // Responder a saludos comunes
    if (messageLower.includes('hola') || messageLower.includes('hi') || messageLower.includes('hello') || 
        messageLower.includes('buenos días') || messageLower.includes('buenas') || messageLower.includes('buenas tardes') ||
        messageLower.includes('buenas noches')) {
      const helpMessage = `👋 ¡Hola! Soy *Milo*, tu asistente de gastos.\n\n` +
        `💡 *Comandos disponibles:*\n` +
        `• Mencioname con "crea el grupo [nombre]" para crear un grupo de gastos\n` +
        `• /gasto 5000 pizza - Agregar un gasto\n` +
        `• /resumen - Ver resumen de gastos\n` +
        `• /calcular - Ver división de gastos\n` +
        `• Preguntame sobre el clima: "va a llover hoy?", "qué pronóstico hace?"\n\n` +
        `_También podés escribirme por privado con *hola* o *menu* para más opciones._`;
      await msg.reply(helpMessage);
      return true;
    }
    
    // Si no es un saludo, mostrar ayuda general
    const helpMessage = `🤖 *Comandos disponibles:*\n\n` +
      `*Para crear un grupo de gastos:*\n` +
      `Mencioname con "crea el grupo [nombre]" o "crear gastos [nombre]"\n\n` +
      `*Comandos de gastos:*\n` +
      `• /gasto 5000 pizza - Agregar un gasto\n` +
      `• /resumen - Ver resumen de gastos\n` +
      `• /calcular - Ver división de gastos\n\n` +
      `*Preguntas sobre clima:*\n` +
      `• "va a llover hoy?"\n` +
      `• "qué pronóstico hace?"\n` +
      `• "cómo está el clima?"\n\n` +
      `_También podés escribirme por privado con *hola* o *menu* para más opciones._`;
    await msg.reply(helpMessage);
    return true;
  }

  if (parsed.type === 'expense') {
    const cleanedLower = parsed.cleaned?.toLowerCase() || '';
    let alias = '/gasto';
    if (cleanedLower.startsWith('/gasté')) {
      alias = '/gasté';
    } else if (cleanedLower.startsWith('/gaste')) {
      alias = '/gaste';
    } else if (cleanedLower.startsWith('/gasto')) {
      alias = '/gasto';
    }

    const handled = await processGroupExpenseCommand({
      msg,
      groupChat,
      groupId,
      alias,
      commandText: cleanedLower,
      parsedExpense: parsed
    });
    return handled;
  }

  if (parsed.type === 'create') {
    const baseName = parsed.name && parsed.name.trim().length
      ? parsed.name.trim().replace(/\s+/g, ' ')
      : `Gastos ${groupName}`;
    const finalName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    ensureGroupInUsersTable(groupId, groupName);
    const existingGroup = getActiveExpenseGroupForChat(groupId);

    if (existingGroup) {
      // Ya existe un grupo de gastos activo (creado automáticamente cuando Milo fue agregado)
      await msg.reply(`✅ El grupo de gastos *"${existingGroup.name}"* ya está activo en este chat.\n\n` +
        `💡 *Nota:* El grupo de gastos se crea automáticamente cuando me agregás al grupo.\n\n` +
        `💰 *Comandos disponibles:*\n` +
        `• \`/gasto 5000 pizza\` - Agregar un gasto\n` +
        `• \`/resumen\` - Ver resumen de gastos\n` +
        `• \`/calcular\` - Ver división de gastos\n\n` +
        `_También podés escribirme por privado con *hola* o *menu* para más opciones._`);
      return true;
    }

    let closedGroupNotice = '';
    if (existingGroup) {
      try {
        db.prepare(`
          UPDATE expense_groups
          SET is_closed = 1
          WHERE id = ?
        `).run(existingGroup.id);
        closedGroupNotice = `🔒 El grupo anterior "${existingGroup.name}" quedó cerrado.\n📊 La liquidación final ya está lista para consultarla desde el menú *Dividir Gastos* en tu chat con Milo.\n\n`;
      } catch (error) {
        console.error('[WARN] No se pudo cerrar el grupo anterior:', error.message);
      }
    } else {
      try {
        db.prepare(`
          UPDATE expense_groups
          SET is_closed = 1
          WHERE creator_phone = ?
        `).run(groupId);
      } catch (error) {
        console.error('[WARN] No se pudo cerrar grupos anteriores:', error.message);
      }
    }

    const creationResult = createExpenseGroup(finalName, groupId);
    const expenseGroupId = creationResult.groupId;

    const participants = groupChat.participants || [];
    const addedParticipants = await syncGroupParticipants(expenseGroupId, participants);
    const allowedPhones = (participants || []).map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
    cleanupGroupParticipants(expenseGroupId, allowedPhones);
    
    // Eliminar el bot de los participantes si se agregó por error
    if (botPhoneNormalized) {
      db.prepare(`
        DELETE FROM group_participants 
        WHERE group_id = ? AND phone = ?
      `).run(expenseGroupId, botPhoneNormalized);
    }
    
    await inviteMissingGroupMembers(participants, inviterPhone, inviterName);

    const totalHumanParticipants = participants.filter(p => {
      const serialized = p?.id?._serialized || '';
      return serialized && !serialized.includes('bot');
    }).length;

    const commandsHelp = '💰 *Comandos disponibles en este grupo:*\n' +
      '• `/gasto 5000 pizza`\n' +
      '• `/resumen`\n' +
      '• `/calcular`\n\n' +
      'También podés escribirme por privado con *hola* o *menu* para más opciones.';

    let response = `${closedGroupNotice}🎉 *¡Listo! Activé el grupo de gastos "${finalName}".*\n\n`;
    response += `👥 Participantes detectados: ${totalHumanParticipants}\n`;
    if (addedParticipants > 0) {
      response += `✅ Registré ${addedParticipants} participante(s) para seguir los gastos.\n\n`;
    } else {
      response += '\n';
    }
    response += commandsHelp;

    await msg.reply(response);
    return true;
  }

  return false;
}

// ============================================
// PROCESAR COMANDO DE GASTOS EN GRUPOS
// ============================================

async function processGroupExpenseCommand({ msg, groupChat, groupId, alias = '/gasto', commandText = '', gastoData = '', parsedExpense = null }) {
  const groupParticipants = groupChat.participants || [];

  const expenseGroup = db.prepare(`
    SELECT id FROM expense_groups 
    WHERE creator_phone = ? AND IFNULL(is_closed, 0) = 0
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(groupId);

  if (!expenseGroup) {
    await msg.reply('❌ No hay un grupo de gastos activo en este chat.\n\n💡 El grupo de gastos se crea automáticamente cuando me agregás al grupo.');
    return true;
  }

  const allowedPhones = (groupParticipants || []).map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
  await syncGroupParticipants(expenseGroup.id, groupParticipants);
  cleanupGroupParticipants(expenseGroup.id, allowedPhones);

  if (botPhoneNormalized) {
    db.prepare(`
      DELETE FROM group_participants 
      WHERE group_id = ? AND phone = ?
    `).run(expenseGroup.id, botPhoneNormalized);
  }

  const payerSerialized = msg.author || null;
  let payerPhone = null;
  let participant = null;

  if (payerSerialized && groupParticipants && groupParticipants.length > 0) {
    const matchingParticipant = groupParticipants.find(p => {
      const serialized = p?.id?._serialized || '';
      const normalizedSerialized = serialized.replace('@c.us', '').replace('@g.us', '');
      const normalizedAuthor = payerSerialized.replace('@c.us', '').replace('@g.us', '');
      return serialized === payerSerialized || normalizedSerialized === normalizedAuthor;
    });

    if (matchingParticipant) {
      const phone = normalizePhone(matchingParticipant?.id?.user);
      if (phone && phone !== botPhoneNormalized) {
        payerPhone = phone;
        console.log(`[DEBUG] processGroupExpenseCommand: Pagador encontrado en participantes del grupo: ${phone} (autor: ${payerSerialized})`);
      }
    }
  }

  if (!payerPhone && payerSerialized) {
    const rawPayerPhone = payerSerialized.replace('@c.us', '').replace('@g.us', '');
    payerPhone = normalizePhone(rawPayerPhone);
    console.log(`[DEBUG] processGroupExpenseCommand: Pagador obtenido desde msg.author: ${payerPhone} (autor: ${payerSerialized})`);
  }

  if (!payerPhone) {
    await msg.reply('❌ No pude identificar quién pagó. Intenta nuevamente.');
    return true;
  }

  participant = db.prepare(`
    SELECT phone, name FROM group_participants 
    WHERE group_id = ? AND phone = ?
  `).get(expenseGroup.id, payerPhone);

  if (!participant) {
    let payerName = null;
    try {
      const contact = await msg.getContact();
      payerName = contact?.pushname || contact?.name || contact?.number || `Participante ${payerPhone.slice(-4)}`;
    } catch (error) {
      console.warn('[WARN] No se pudo obtener nombre del contacto que paga:', error.message);
    }

    const safeName = payerName || `Participante ${payerPhone.slice(-4)}`;
    try {
      const addResult = addParticipant(expenseGroup.id, payerPhone, safeName);
      if (!addResult.added) {
        const existing = db.prepare(`
          SELECT name FROM group_participants WHERE id = ?
        `).get(addResult.id);
        participant = { phone: addResult.phone, name: existing?.name || safeName };
      } else {
        participant = { phone: addResult.phone, name: safeName };
      }
      console.log(`[DEBUG] processGroupExpenseCommand: Participante agregado a la BD: ${payerPhone} (${safeName})`);
    } catch (error) {
      console.warn('[WARN] No se pudo agregar participante automáticamente:', error.message);
      participant = { phone: payerPhone, name: safeName };
    }
  } else {
    participant.name = isMeaningfulName(participant.name) ? participant.name : formatPhoneForDisplay(participant.phone);
    console.log(`[DEBUG] processGroupExpenseCommand: Participante encontrado en BD: ${participant.phone} (${participant.name})`);
  }

  const normalizedPayerPhone = payerPhone;
  if (participant.phone !== normalizedPayerPhone) {
    console.log(`[DEBUG] processGroupExpenseCommand: Actualizando teléfono del participante en BD: ${participant.phone} → ${normalizedPayerPhone}`);
    try {
      db.prepare(`
        UPDATE group_participants 
        SET phone = ? 
        WHERE group_id = ? AND phone = ?
      `).run(normalizedPayerPhone, expenseGroup.id, participant.phone);
      participant.phone = normalizedPayerPhone;
      console.log('[DEBUG] processGroupExpenseCommand: Teléfono del participante actualizado en BD');
    } catch (error) {
      console.warn('[WARN] processGroupExpenseCommand: No se pudo actualizar el teléfono del participante en BD:', error.message);
    }
  }

  let amount = null;
  let description = '';

  if (parsedExpense) {
    amount = parseFloat(parsedExpense.amount);
    description = parsedExpense.description || 'Gasto registrado';
  } else {
    const amountMatch = gastoData.match(/(\d+[.,]?\d*(?:[.,]\d{1,2})?)/);
    if (!amountMatch) {
      await msg.reply('❌ Necesito un monto en el mensaje. Ejemplos: `/gasto 5000 pizza`, `/gasto cena 3200`.');
      return true;
    }

    const rawAmount = amountMatch[0];
    let normalizedAmount = rawAmount.replace(/\s/g, '');

    const commaCount = (normalizedAmount.match(/,/g) || []).length;
    const dotCount = (normalizedAmount.match(/\./g) || []).length;

    if (commaCount > 0) {
      normalizedAmount = normalizedAmount.replace(/\./g, '').replace(',', '.');
    } else if (dotCount > 1) {
      normalizedAmount = normalizedAmount.replace(/\./g, '');
    } else if (dotCount === 1) {
      const decimalPart = normalizedAmount.split('.')[1] || '';
      if (decimalPart.length > 2) {
        normalizedAmount = normalizedAmount.replace(/\./g, '');
      }
    }

    normalizedAmount = normalizedAmount.replace(',', '.');
    amount = parseFloat(normalizedAmount);

    description = gastoData.replace(rawAmount, '').replace(/\|/g, ' ').trim();
    if (!description) {
      const parts = gastoData.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        description = parts.find(part => !part.includes(rawAmount)) || '';
      }
    }
    description = description.replace(/\s+/g, ' ').trim();
    if (!description) {
      description = 'Gasto registrado';
    }
  }

  if (!amount || Number.isNaN(amount) || amount <= 0) {
    await msg.reply('❌ Monto inválido. Ejemplos: `/gasto 5000 pizza`, `/gasto cena 3200`.');
    return true;
  }

  console.log(`[DEBUG] processGroupExpenseCommand: Agregando gasto - Grupo: ${expenseGroup.id}, Pagador: ${normalizedPayerPhone} (${participant.name}), Monto: ${amount}, Descripción: ${description}`);

  const expenseResult = addExpense(expenseGroup.id, normalizedPayerPhone, amount, description);

  if (!expenseResult.success) {
    console.error(`[ERROR] processGroupExpenseCommand: No se pudo agregar el gasto: ${expenseResult.error}`);
    await msg.reply(`❌ No se pudo agregar el gasto. Error: ${expenseResult.error || 'Error desconocido'}`);
    return true;
  }

  console.log(`[DEBUG] processGroupExpenseCommand: Gasto agregado exitosamente - ID: ${expenseResult.expenseId}`);

  const verifyExpense = db.prepare(`
    SELECT id, amount, description, payer_phone, created_at
    FROM expenses
    WHERE id = ?
  `).get(expenseResult.expenseId);

  if (!verifyExpense) {
    console.error(`[ERROR] processGroupExpenseCommand: El gasto ${expenseResult.expenseId} no se encontró después de agregarlo`);
    await msg.reply(`❌ El gasto se agregó pero no se pudo verificar. Por favor, intenta con */resumen* para verificar.`);
    return true;
  }

  await msg.reply(
    `✅ *Gasto agregado*\n\n` +
    `💵 Monto: ${formatAmount(amount)}\n` +
    `📝 Concepto: ${description}\n` +
    `💳 Pagado por: ${participant.name}\n\n` +
    `Usa */resumen* para ver todos los gastos`
  );

  return true;
}

// ============================================
// MANEJADOR DE MENSAJES DE GRUPOS
// ============================================

async function handleGroupMessage(msg) {
  const rawMessage = msg.body || '';
  const messageText = rawMessage.toLowerCase().trim();
  const messageWithoutMentions = messageText.replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedCommandText = messageWithoutMentions || messageText;
  const groupId = msg.from;
  const groupChat = await msg.getChat();
  const groupName = groupChat.name || 'Grupo sin nombre';

  console.log(`[DEBUG] Mensaje de grupo recibido: "${rawMessage}" de ${groupId}`);
  console.log(`[DEBUG] botWid: ${botWid}`);

  let inviterPhone = null;
  let inviterName = 'Un integrante del grupo';
  try {
    if (msg.author) {
      inviterPhone = msg.author.replace('@c.us', '').replace('@g.us', '');
    }
    const authorContact = await msg.getContact();
    inviterName = authorContact.pushname || authorContact.name || authorContact.number || inviterName;
    console.log(`[DEBUG] Autor del mensaje: ${inviterName} (${inviterPhone})`);
  } catch (error) {
    console.warn('[WARN] No se pudo obtener datos del remitente del grupo:', error.message);
  }

  let mentionedBot = false;
  const botSimpleTag = botWid ? botWid.replace(/@c\.us$/, '').replace(/@g\.us$/, '') : null;

  // Método 1: Verificar menciones usando getMentions()
  try {
    const mentionContacts = await msg.getMentions();
    console.log(`[DEBUG] Menciones obtenidas: ${mentionContacts?.length || 0}`);
    if (Array.isArray(mentionContacts) && mentionContacts.length > 0 && botWid) {
      mentionedBot = mentionContacts.some(contact => {
        const contactId = contact?.id?._serialized || contact?.id?.user || contact?.id;
        const isMention = contactId === botWid || contactId === botWid.replace('@c.us', '@g.us');
        if (isMention) {
          console.log(`[DEBUG] Bot mencionado (método 1): ${contactId}`);
        }
        return isMention;
      });
    }
  } catch (error) {
    console.warn('[WARN] No se pudo obtener menciones del mensaje:', error.message);
  }

  // Método 2: Verificar mentionedIds directamente
  if (!mentionedBot && botWid) {
    try {
      if (Array.isArray(msg.mentionedIds)) {
        mentionedBot = msg.mentionedIds.some(id => {
          const normalizedId = id.replace('@c.us', '').replace('@g.us', '');
          const normalizedBotWid = botWid.replace('@c.us', '').replace('@g.us', '');
          return normalizedId === normalizedBotWid;
        });
        if (mentionedBot) {
          console.log(`[DEBUG] Bot mencionado (método 2): mentionedIds`);
        }
      }
    } catch (error) {
      console.warn('[WARN] Error verificando mentionedIds:', error.message);
    }
  }

  // Método 3: Verificar si el texto contiene @<id_del_bot> o @milobot
  if (!mentionedBot && botSimpleTag) {
    const botMentionPatterns = [
      `@${botSimpleTag}`,
      `@${botSimpleTag}@c.us`,
      `@${botSimpleTag}@g.us`,
      '@milobot',
      '@milo',
      '@30409056366839' // ID específico visto en los logs
    ];
    
    mentionedBot = botMentionPatterns.some(pattern => {
      const found = rawMessage.toLowerCase().includes(pattern.toLowerCase());
      if (found) {
        console.log(`[DEBUG] Bot mencionado (método 3): "${pattern}" encontrado en mensaje`);
      }
      return found;
    });
  }

  // Método 4: Verificar si el mensaje comienza con @ seguido de texto que podría ser el bot
  if (!mentionedBot && rawMessage.trim().startsWith('@')) {
    // Si el mensaje empieza con @, probablemente es una mención
    // Verificar si contiene palabras clave del bot
    const botKeywords = ['milobot', 'milo', 'bot', botSimpleTag];
    const hasBotKeyword = botKeywords.some(keyword => 
      keyword && rawMessage.toLowerCase().includes(keyword.toLowerCase())
    );
    if (hasBotKeyword) {
      mentionedBot = true;
      console.log(`[DEBUG] Bot mencionado (método 4): mención con palabra clave del bot`);
    }
  }

  console.log(`[DEBUG] Bot mencionado: ${mentionedBot}`);

  if (mentionedBot) {
    console.log(`[DEBUG] Procesando mención del bot con mensaje: "${rawMessage}"`);
    const handled = await handleGroupMention({
      msg,
      groupChat,
      groupId,
      groupName,
      rawMessage,
      inviterPhone,
      inviterName
    });
    if (handled) {
      console.log(`[DEBUG] Mención manejada correctamente`);
      return;
    } else {
      console.log(`[DEBUG] Mención no manejada, continuando con comandos normales`);
    }
  }

  if (groupChat.participants && groupChat.participants.length > 0) {
    await inviteMissingGroupMembers(groupChat.participants, inviterPhone, inviterName);
  }

  // Comandos disponibles en grupos
  const gastoCommandAliases = ['/gasto', '/gaste', '/gasté'];
  const findGastoAlias = (text) => {
    if (!text) {
      return null;
    }
    for (const alias of gastoCommandAliases) {
      if (text === alias) {
        return { alias, text };
      }
      if (text.startsWith(`${alias} `)) {
        return { alias, text };
      }
    }
    return null;
  };
  const gastoMatch = findGastoAlias(messageText) || findGastoAlias(messageWithoutMentions);
  const gastoAliasUsed = gastoMatch ? gastoMatch.alias : null;
  const gastoCommandText = gastoMatch ? gastoMatch.text : messageText;

  if (normalizedCommandText === '/dividir' || normalizedCommandText === '/gastos' || normalizedCommandText === '/split') {
    try {
      // Obtener todos los participantes del grupo
      const participants = groupChat.participants || [];
      
      if (participants.length < 2) {
        await msg.reply('❌ El grupo debe tener al menos 2 participantes para dividir gastos.');
        return;
      }

      // Crear grupo de gastos automáticamente
      const expenseGroupResult = createExpenseGroup(groupName, groupId);
      const expenseGroupId = expenseGroupResult.groupId;

      const allowedPhones = (participants || []).map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
      const addedCount = await syncGroupParticipants(expenseGroupId, participants);
      cleanupGroupParticipants(expenseGroupId, allowedPhones);

      // Eliminar el bot de los participantes si se agregó por error
      if (botPhoneNormalized) {
        db.prepare(`
          DELETE FROM group_participants 
          WHERE group_id = ? AND phone = ?
        `).run(expenseGroupId, botPhoneNormalized);
      }

      const { map: displayNameMap, count: participantCount } = await buildParticipantDisplayMap(expenseGroupId, allowedPhones);
      const participantList = Object.values(displayNameMap)
        .map((name, index) => `${index + 1}. ${name}`)
        .join('\n');

      const response = `🎉 *¡Grupo de gastos creado!*\n\n` +
        `📝 Nombre: ${groupName}\n` +
        `👥 Participantes: ${participantCount}\n\n` +
        `*Participantes agregados:*\n` +
        (participantList || '—') +
        `\n\n💰 *Para agregar gastos, usa:*\n` +
      `/gasto 5000 pizza\n\n` +
        `📊 *Para ver el resumen:*\n` +
        `/resumen\n\n` +
        `💸 *Para calcular división:*\n` +
        `/calcular\n\n` +
        `ℹ️ *Ver ayuda:*\n` +
        `/ayuda`;

      await msg.reply(response);

      // Guardar el ID del grupo de gastos asociado al grupo de WhatsApp
      db.prepare(`
        UPDATE expense_groups 
        SET creator_phone = ? 
        WHERE id = ?
      `).run(groupId, expenseGroupId);

      console.log(`✅ Grupo de gastos creado automáticamente: ${groupName} (${participantCount} participantes)`);

    } catch (error) {
      console.error('Error creando grupo de gastos:', error);
      await msg.reply('❌ Error al crear el grupo de gastos. Intenta de nuevo.');
    }
  }
  else if (gastoAliasUsed && gastoCommandText === gastoAliasUsed) {
    await msg.reply(
      '💵 *Agregar gasto rápido*\n\n' +
      'Escribí `/gasto 5000 pizza`, `/gaste 5000 pizza` o cualquier texto con el monto y la descripción.\n' +
      'El bot detecta automáticamente que el pago lo hiciste vos.\n\n' +
      'Ejemplos:\n' +
      '• `/gasto 4500 super`\n' +
      '• `/gasto compré bebidas 3200`\n' +
      '• `/gaste gasolina 18.500`\n\n' +
      'Usa */resumen* para ver todos los gastos.'
    );
  }
  else if (gastoAliasUsed) {
    const aliasLength = gastoAliasUsed.length;
    const gastoData = gastoCommandText.slice(aliasLength).trim();

    if (!gastoData) {
      await msg.reply(
        '💵 *Agregar gasto rápido*\n\n' +
        'Escribí `/gasto 5000 pizza`, `/gaste 5000 pizza` o cualquier texto con el monto y la descripción.\n' +
        'El bot detecta automáticamente que el pago lo hiciste vos.\n\n' +
        'Ejemplos:\n' +
        '• `/gasto 4500 super`\n' +
        '• `/gasto compré bebidas 3200`\n' +
        '• `/gaste gasolina 18.500`\n\n' +
        'Usa */resumen* para ver todos los gastos.'
      );
      return;
    }

    await processGroupExpenseCommand({
      msg,
      groupChat,
      groupId,
      alias: gastoAliasUsed,
      commandText: gastoCommandText,
      gastoData
    });
  }
  else if (normalizedCommandText === '/resumen') {
    // Ver resumen de gastos - solo grupos activos (no cerrados)
    console.log(`[DEBUG] /resumen: Buscando grupo activo para ${groupId}`);
    
    // Primero, obtener todos los grupos activos para este chat
    const allActiveGroups = db.prepare(`
      SELECT id, name, created_at, is_closed
      FROM expense_groups 
      WHERE creator_phone = ? AND IFNULL(is_closed, 0) = 0
      ORDER BY created_at DESC
    `).all(groupId);
    
    console.log(`[DEBUG] /resumen: Encontrados ${allActiveGroups.length} grupos activos para ${groupId}`);
    
    if (allActiveGroups.length === 0) {
      await msg.reply('❌ No hay un grupo de gastos activo en este chat.\n\n💡 El grupo de gastos se crea automáticamente cuando me agregás al grupo.');
      return;
    }
    
    // Si hay múltiples grupos activos, eliminar todos excepto el más reciente
    if (allActiveGroups.length > 1) {
      console.log(`[DEBUG] /resumen: Encontrados ${allActiveGroups.length} grupos activos, eliminando los anteriores`);
      const mostRecentGroup = allActiveGroups[0];
      
      // Eliminar gastos y participantes de grupos anteriores
      for (let i = 1; i < allActiveGroups.length; i++) {
        const oldGroup = allActiveGroups[i];
        try {
          console.log(`[DEBUG] /resumen: Eliminando grupo anterior ${oldGroup.id} (${oldGroup.name})`);
          db.prepare('DELETE FROM expenses WHERE group_id = ?').run(oldGroup.id);
          db.prepare('DELETE FROM group_participants WHERE group_id = ?').run(oldGroup.id);
          db.prepare('DELETE FROM expense_groups WHERE id = ?').run(oldGroup.id);
        } catch (err) {
          console.error(`[ERROR] Error eliminando grupo anterior ${oldGroup.id}:`, err.message);
        }
      }
    }
    
    // Obtener el grupo activo más reciente (después de limpiar)
    const expenseGroup = allActiveGroups[0];
    console.log(`[DEBUG] /resumen: Usando grupo activo ${expenseGroup.id} (${expenseGroup.name})`);

    if (!expenseGroup) {
      await msg.reply('❌ No hay un grupo de gastos activo en este chat.\n\n💡 El grupo de gastos se crea automáticamente cuando me agregás al grupo.');
      return;
    }

    // Verificar que el grupo existe y está activo
    const groupCheck = db.prepare(`
      SELECT id, name, is_closed, created_at, last_reset_at
      FROM expense_groups
      WHERE id = ? AND creator_phone = ?
    `).get(expenseGroup.id, groupId);
    
    if (!groupCheck) {
      console.error(`[ERROR] /resumen: Grupo ${expenseGroup.id} no encontrado para chat ${groupId}`);
      await msg.reply('❌ No hay un grupo de gastos activo en este chat.\n\n💡 El grupo de gastos se crea automáticamente cuando me agregás al grupo.');
      return;
    }
    
    console.log(`[DEBUG] /resumen: Grupo verificado - ID: ${groupCheck.id}, Nombre: ${groupCheck.name}, Cerrado: ${groupCheck.is_closed}, Creado: ${groupCheck.created_at}, last_reset_at: ${groupCheck.last_reset_at || 'NULL'}`);
    
    // IMPORTANTE: Si el grupo tiene last_reset_at establecido, eliminar todos los gastos creados ANTES de esa fecha
    // Esto limpia los gastos antiguos que no deberían aparecer
    // Luego establecer last_reset_at a NULL para que los nuevos gastos no se filtren
    if (groupCheck.last_reset_at) {
      console.log(`[DEBUG] /resumen: El grupo tiene last_reset_at establecido (${groupCheck.last_reset_at}), eliminando gastos antiguos`);
      
      // Eliminar todos los gastos creados ANTES de last_reset_at
      // IMPORTANTE: Comparar fechas usando formato ISO para evitar problemas de zona horaria
      const resetDate = new Date(groupCheck.last_reset_at);
      const resetDateISO = resetDate.toISOString();
      
      console.log(`[DEBUG] /resumen: Eliminando gastos creados antes de ${resetDateISO}`);
      
      // Obtener todos los gastos del grupo para debugging
      const allExpensesBefore = db.prepare(`
        SELECT id, amount, description, created_at
        FROM expenses
        WHERE group_id = ?
        ORDER BY created_at DESC
      `).all(expenseGroup.id);
      
      console.log(`[DEBUG] /resumen: Gastos antes de eliminar: ${allExpensesBefore.length}`);
      allExpensesBefore.forEach((exp, idx) => {
        const expDate = new Date(exp.created_at);
        const expDateISO = expDate.toISOString();
        const isBefore = expDate < resetDate;
        console.log(`[DEBUG] /resumen: Gasto ${idx + 1} - ID: ${exp.id}, Creado: ${exp.created_at} (${expDateISO}), Antes de reset: ${isBefore}`);
      });
      
      // Eliminar todos los gastos creados ANTES de last_reset_at
      // Usar comparación directa de fechas ISO para evitar problemas de zona horaria
      const deleteResult = db.prepare(`
        DELETE FROM expenses 
        WHERE group_id = ? 
          AND datetime(created_at) < datetime(?)
      `).run(expenseGroup.id, resetDateISO);
      
      console.log(`[DEBUG] /resumen: Eliminados ${deleteResult.changes || 0} gastos antiguos (creados antes de ${resetDateISO})`);
      
      // Establecer last_reset_at a NULL para que los nuevos gastos no se filtren
      db.prepare('UPDATE expense_groups SET last_reset_at = NULL WHERE id = ?').run(expenseGroup.id);
      console.log(`[DEBUG] /resumen: last_reset_at establecido a NULL para el grupo ${expenseGroup.id}`);
    }
    
    // Verificar cuántos gastos hay en la base de datos para este grupo (sin filtrar)
    const allExpensesInDB = db.prepare(`
      SELECT COUNT(*) as count
      FROM expenses
      WHERE group_id = ?
    `).get(expenseGroup.id);
    
    console.log(`[DEBUG] /resumen: Total de gastos en la base de datos para el grupo ${expenseGroup.id}: ${allExpensesInDB?.count || 0}`);
    
    // Obtener todos los gastos directamente de la base de datos para debugging
    const rawExpenses = db.prepare(`
      SELECT id, amount, description, payer_phone, created_at
      FROM expenses
      WHERE group_id = ?
      ORDER BY created_at DESC
    `).all(expenseGroup.id);
    
    console.log(`[DEBUG] /resumen: Gastos raw encontrados en DB: ${rawExpenses.length}`);
    rawExpenses.forEach((exp, idx) => {
      console.log(`[DEBUG] /resumen: Gasto raw ${idx + 1} - ID: ${exp.id}, Monto: ${exp.amount}, Desc: ${exp.description}, Pagador: ${exp.payer_phone}, Creado: ${exp.created_at}`);
    });

    // IMPORTANTE: Limpiar participantes duplicados antes de obtener el resumen
    const groupParticipantsForResumen = groupChat.participants || [];
    const allowedPhonesForResumen = groupParticipantsForResumen
      .map(p => convertRawPhone(p?.id?.user))
      .filter(Boolean);
    await syncGroupParticipants(expenseGroup.id, groupParticipantsForResumen);
    cleanupGroupParticipants(expenseGroup.id, allowedPhonesForResumen);
    
    // Eliminar el bot de los participantes si se agregó por error
    if (botPhoneNormalized) {
      db.prepare(`
        DELETE FROM group_participants 
        WHERE group_id = ? AND phone = ?
      `).run(expenseGroup.id, botPhoneNormalized);
    }
    
    // Obtener el resumen del grupo activo actual (después de limpiar)
    console.log(`[DEBUG] /resumen: Obteniendo resumen del grupo ${expenseGroup.id} para chat ${groupId}`);
    const summary = await getExpenseSummary(expenseGroup.id, groupId);
    console.log(`[DEBUG] /resumen: Resumen obtenido - ${summary.expenses.length} gastos encontrados, total: ${summary.total}`);

    if (summary.expenses.length === 0) {
      await msg.reply('📋 No hay gastos registrados todavía.\n\nUsa */gasto* para agregar uno.');
      return;
    }

    // Contar participantes humanos únicos del grupo de WhatsApp actual
    // IMPORTANTE: Solo contar los participantes humanos actuales del grupo, NO de la base de datos
    // NO contar pagadores de gastos que ya no están en el grupo
    const uniqueHumanPhones = new Set();
    
    // Crear un Set de teléfonos normalizados de participantes humanos actuales
    humanParticipants.forEach(p => {
      const phone = normalizePhone(convertRawPhone(p?.id?.user));
      if (phone && phone !== botPhoneNormalized) {
        uniqueHumanPhones.add(phone);
      }
    });

    // El conteo final es SOLO el número de participantes humanos actuales del grupo (excluyendo el bot)
    // NO incluir pagadores de gastos que ya no están en el grupo
    const finalParticipantCount = uniqueHumanPhones.size;
    const finalPerPerson = finalParticipantCount > 0 ? (parseFloat(summary.total) / finalParticipantCount).toFixed(2) : '0.00';

    // Obtener mapa de nombres para mostrar
    const extraPhones = summary.expenses.map(e => e.payer_phone).filter(Boolean);
    const { map: displayNameMap } = await buildParticipantDisplayMap(expenseGroup.id, extraPhones);

    const expenseLines = summary.expenses.map((e, i) => {
      const phoneKey = normalizePhone(e.payer_phone);
      const payerName = displayNameMap[phoneKey] || e.payer_name || formatPhoneForDisplay(e.payer_phone);
      return `${i + 1}. ${formatAmount(e.amount)} - ${e.description}\n   💳 ${payerName}`;
    }).join('\n\n');

    // Obtener pagos realizados
    const payments = getPaymentsByGroup(expenseGroup.id);
    
    let response = `📋 *Resumen de Gastos*\n\n` +
      `💰 *Total:* ${formatAmount(summary.total)}\n` +
      `👥 *Participantes:* ${finalParticipantCount} ${finalParticipantCount === 1 ? 'persona' : 'personas'}\n` +
      `📊 *Por persona:* ${formatAmount(finalPerPerson)}\n\n` +
      `*Gastos registrados:*\n\n${expenseLines}`;
    
    if (payments.length > 0) {
      response += `\n\n💵 *Pagos realizados:* ${payments.length}`;
    }
    
    response += `\n\n💡 Comandos rápidos:\n` +
      `• /gasto 5000 pizza\n` +
      `• /resumen\n` +
      `• /calcular\n\n` +
      `💬 Podés escribirme por privado con *hola* o *menu* para más opciones.`;

    await msg.reply(response);
  }
  else if (normalizedCommandText === '/calcular') {
    // Calcular división - solo grupos activos (no cerrados)
    const expenseGroup = db.prepare(`
      SELECT id FROM expense_groups 
      WHERE creator_phone = ? AND IFNULL(is_closed, 0) = 0
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(groupId);

    if (!expenseGroup) {
      await msg.reply('❌ No hay un grupo de gastos activo en este chat.\n\n💡 El grupo de gastos se crea automáticamente cuando me agregás al grupo.');
      return;
    }

    const groupParticipants = groupChat.participants || [];
    
    // Filtrar solo participantes humanos (excluir el bot)
    // Usar normalización de teléfono para detectar el bot de forma más robusta
    const humanParticipants = groupParticipants.filter(p => {
      const phone = normalizePhone(convertRawPhone(p?.id?.user));
      // Excluir el bot comparando teléfonos normalizados
      if (!phone || (botPhoneNormalized && phone === botPhoneNormalized)) {
        return false;
      }
      // También excluir si el ID serializado contiene "bot" (fallback)
      const serialized = p?.id?._serialized || '';
      return serialized && !serialized.toLowerCase().includes('bot');
    });
    
    const allowedPhones = humanParticipants.map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
    
    console.log(`[DEBUG] /calcular: Sincronizando participantes antes de limpiar...`);
    await syncGroupParticipants(expenseGroup.id, groupParticipants);
    
    console.log(`[DEBUG] /calcular: Limpiando participantes duplicados...`);
    cleanupGroupParticipants(expenseGroup.id, allowedPhones);

    // Eliminar el bot de los participantes si se agregó por error
    if (botPhoneNormalized) {
      db.prepare(`
        DELETE FROM group_participants 
        WHERE group_id = ? AND phone = ?
      `).run(expenseGroup.id, botPhoneNormalized);
    }

    // Verificar participantes después de limpiar
    const participantsAfterCleanup = db.prepare(`
      SELECT phone, name FROM group_participants 
      WHERE group_id = ? AND phone != ?
    `).all(expenseGroup.id, botPhoneNormalized || '');
    
    console.log(`[DEBUG] /calcular: Participantes después de limpiar: ${participantsAfterCleanup.length}`);
    participantsAfterCleanup.forEach((p, idx) => {
      console.log(`[DEBUG] /calcular: Participante ${idx + 1}: ${p.phone} (${p.name})`);
    });

    // IMPORTANTE: Obtener teléfonos normalizados de participantes humanos actuales del grupo
    // Estos son los únicos que deben participar en el cálculo
    const humanParticipantPhones = humanParticipants
      .map(p => normalizePhone(convertRawPhone(p?.id?.user)))
      .filter(phone => phone && phone !== botPhoneNormalized);
    
    console.log(`[DEBUG] /calcular: Participantes humanos actuales del grupo: ${humanParticipantPhones.length}`);
    humanParticipantPhones.forEach((phone, idx) => {
      console.log(`[DEBUG] /calcular: Participante humano ${idx + 1}: ${phone}`);
    });

    // Si no hay participantes humanos del grupo actual, obtener de la BD (después de limpiar)
    if (humanParticipantPhones.length === 0) {
      console.log(`[DEBUG] /calcular: No hay participantes humanos del grupo actual, usando participantes de BD después de limpiar`);
      const participantsFromDB = participantsAfterCleanup.map(p => normalizePhone(p.phone)).filter(Boolean);
      humanParticipantPhones.push(...participantsFromDB);
    }

    // Calcular división usando SOLO los participantes humanos actuales del grupo
    const split = calculateSplit(expenseGroup.id, humanParticipantPhones);
    
    console.log(`[DEBUG] /calcular: Total: ${split.total}, Por persona: ${split.perPerson}, Participantes: ${humanParticipantPhones.length}, Transacciones: ${split.transactions.length}`);
    split.transactions.forEach((t, idx) => {
      console.log(`[DEBUG] /calcular: Transacción ${idx + 1}: ${t.from} (${t.fromPhone}) → ${t.amount} → ${t.to} (${t.toPhone})`);
    });

    // Obtener pagos realizados
    const payments = getPaymentsByGroup(expenseGroup.id);
    
    if (split.transactions.length === 0) {
      let response = '✅ *¡Todo pagado!*\n\nNo hay deudas pendientes. Todos están al día.';
      if (payments.length > 0) {
        response += `\n\n💵 *Pagos realizados:* ${payments.length}`;
      }
      await msg.reply(response);
      return;
    }

    const involvedPhones = [];
    split.transactions.forEach(t => {
      if (t.fromPhone) involvedPhones.push(t.fromPhone);
      if (t.toPhone) involvedPhones.push(t.toPhone);
    });

    const { map: displayNameMap } = await buildParticipantDisplayMap(expenseGroup.id, involvedPhones);

    // Obtener alias bancarios para los receptores (a quienes se les debe pagar)
    const transactionLines = split.transactions.map((t, i) => {
      const normalizedFromPhone = normalizePhone(t.fromPhone);
      const normalizedToPhone = normalizePhone(t.toPhone);
      
      const fromName = displayNameMap[normalizedFromPhone] || t.from || formatPhoneForDisplay(t.fromPhone);
      const toName = displayNameMap[normalizedToPhone] || t.to || formatPhoneForDisplay(t.toPhone);
      
      // Obtener alias bancario del receptor (a quien se le debe pagar)
      // Normalizar el teléfono explícitamente para asegurar la búsqueda correcta
      const toAlias = getBankAliasForUser(normalizedToPhone);
      const toDisplay = toAlias ? `${toName} (${toAlias})` : toName;
      
      return `${i + 1}. *${fromName}* → *${formatAmount(t.amount)}* → *${toDisplay}*`;
    }).join('\n\n');

    let response = `💸 *División de Gastos*\n\n` +
      `💰 Total: ${formatAmount(split.total)}\n` +
      `👥 Por persona: ${formatAmount(split.perPerson)}\n\n` +
      `*Transferencias a realizar:*\n\n${transactionLines}`;
    
    if (payments.length > 0) {
      response += `\n\n💵 *Pagos realizados:* ${payments.length}\n` +
        `_Los pagos ya están considerados en el cálculo anterior._`;
    }
    
    response += `\n\n_💡 Estas transferencias minimizan la cantidad de pagos._\n\n` +
      `💡 Comandos rápidos:\n` +
      `• /gasto 5000 pizza\n` +
      `• /resumen\n` +
      `• /calcular`;

    await msg.reply(response);
  }
  else if (messageText === '/ayuda' || messageText === '/help') {
    const response = `🤖 *Comandos del Bot de Gastos*\n\n` +
      `*Configuración:*\n` +
      `• */dividir* - Crear o activar grupo de gastos\n\n` +
      `*Gestión de gastos:*\n` +
      `• */gasto 5000 pizza* - Agregar gasto rápido\n` +
      `• */resumen* - Ver todos los gastos\n` +
      `• */calcular* - Ver división optimizada\n\n` +
      `*Otros:*\n` +
      `• */ayuda* - Ver esta ayuda\n\n` +
      `_💡 El bot detecta automáticamente quién pagó (el que envía el comando)._`;

    await msg.reply(response);
  }
}

// ============================================
// MANEJADOR DE MENSAJES PRIVADOS
// ============================================

async function handleMessage(msg) {
  const messageText = msg.body;
  const userPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
  const isGroup = msg.from.includes('@g.us');
  const msgType = msg.type;
  
  // Verificar si es un vCard (contacto compartido)
  const isVCard = msgType === 'vcard' || (msg.vCards && msg.vCards.length > 0) || (msg.hasMedia && msg.type === 'vcard');
  
  // Verificar si es un mensaje de ubicación
  const isLocation = msgType === 'location' || (msg.location && (msg.location.latitude || msg.location.lat));
  
  // Si el mensaje está vacío (imagen, audio, etc.), ignorar - EXCEPTO vcards (contactos) y ubicaciones
  if ((!messageText || messageText.trim() === '') && !isVCard && !isLocation) {
    console.log(`📩 Mensaje de ${userPhone}: [Multimedia - ignorado]`);
    return;
  }
  
  // Si es vCard, loguear información
  if (isVCard) {
    console.log(`📩 Mensaje de ${userPhone}: [Contacto compartido]`);
    console.log(`[DEBUG] msgType: ${msgType}`);
    console.log(`[DEBUG] msg.vCards:`, msg.vCards);
    console.log(`[DEBUG] msg.hasMedia:`, msg.hasMedia);
  } else {
  console.log(`📩 Mensaje de ${isGroup ? 'GRUPO' : 'usuario'} ${userPhone}: ${messageText}`);
  }

  // FUNCIONALIDAD ESPECIAL PARA GRUPOS
  if (isGroup) {
    await handleGroupMessage(msg);
    return;
  }

  // Obtener nombre del contacto (una sola vez)
  const contact = await msg.getContact();
  const userName = contact.pushname || contact.name || contact.number || 'Usuario';
  
  // Verificar si el mensaje es una respuesta a un mensaje programado
  let isReplyToScheduled = false;
  let scheduledMessageInfo = null;
  
  try {
    if (msg.hasQuotedMsg) {
      const quotedMsg = await msg.getQuotedMessage();
      if (quotedMsg) {
        const quotedMsgId = quotedMsg.id?._serialized || quotedMsg.id || null;
        if (quotedMsgId) {
          // Buscar si este mensaje citado es un mensaje programado
          scheduledMessageInfo = db.prepare(`
            SELECT id, creator_phone, message_body, target_chat
            FROM scheduled_messages
            WHERE whatsapp_message_id = ?
              AND status = 'sent'
            LIMIT 1
          `).get(quotedMsgId);
          
          if (scheduledMessageInfo) {
            isReplyToScheduled = true;
            console.log(`[DEBUG] Mensaje es respuesta a mensaje programado #${scheduledMessageInfo.id}`);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[WARN] Error verificando si es respuesta a mensaje programado:', error.message);
  }
  
  // Si es respuesta a un mensaje programado, reenviar al creador original
  if (isReplyToScheduled && scheduledMessageInfo) {
    try {
      const creatorPhone = scheduledMessageInfo.creator_phone.replace(/@c\.us$|@g\.us$|@lid$/, '');
      const normalizedCreatorPhone = normalizePhone(creatorPhone);
      const creatorChatId = `${normalizedCreatorPhone}@c.us`;
      
      // Obtener información del remitente para el mensaje
      const senderPhoneDisplay = normalizedUserPhone.startsWith('+') 
        ? normalizedUserPhone 
        : `+${normalizedUserPhone}`;
      
      // Construir mensaje de reenvío
      let forwardedMessage = `📩 *Respuesta de ${userName}* (${senderPhoneDisplay}):\n\n`;
      
      if (messageText && messageText.trim()) {
        forwardedMessage += messageText;
      } else if (msg.hasMedia) {
        forwardedMessage += `[${msgType || 'Multimedia'}]`;
        // Intentar reenviar el media también
        try {
          const media = await msg.downloadMedia();
          if (media) {
            await client.sendMessage(creatorChatId, media, { caption: forwardedMessage });
            console.log(`✅ Respuesta con multimedia reenviada al creador original (${creatorPhone})`);
            await msg.reply('✅ Tu respuesta fue reenviada al remitente original.');
            return;
          }
        } catch (mediaError) {
          console.warn('[WARN] No se pudo reenviar multimedia:', mediaError.message);
          forwardedMessage += '[No se pudo adjuntar el archivo]';
        }
      } else {
        forwardedMessage += '[Mensaje vacío]';
      }
      
      // Agregar información sobre el mensaje original
      const originalMessagePreview = (scheduledMessageInfo.message_body || '').substring(0, 50);
      if (originalMessagePreview) {
        forwardedMessage += `\n\n_En respuesta a: "${originalMessagePreview}${scheduledMessageInfo.message_body.length > 50 ? '...' : ''}"_`;
      }
      
      // Enviar al creador original
      await client.sendMessage(creatorChatId, forwardedMessage);
      console.log(`✅ Respuesta reenviada al creador original (${creatorPhone})`);
      
      // Notificar al remitente que su respuesta fue reenviada
      await msg.reply('✅ Tu respuesta fue reenviada al remitente original.');
      
      return;
    } catch (error) {
      console.error('[ERROR] Error reenviando respuesta a creador:', error);
      // Continuar con el flujo normal si falla el reenvío
    }
  }
  
  // También detectar si el mensaje menciona un número de teléfono que corresponde a un remitente de mensaje programado
  // Esto permite responder directamente escribiendo al número sin necesidad de hacer reply
  if (messageText && !isReplyToScheduled) {
    try {
      // Buscar números de teléfono en el mensaje
      const phoneRegex = /\+?(\d{6,15})/g;
      const phoneMatches = messageText.match(phoneRegex);
      
      if (phoneMatches && phoneMatches.length > 0) {
        for (const phoneMatch of phoneMatches) {
          const normalizedMatch = normalizePhone(phoneMatch);
          if (normalizedMatch) {
            // Buscar si este número es el creador de algún mensaje programado reciente
            const recentScheduledMessage = db.prepare(`
              SELECT id, creator_phone, message_body, target_chat
              FROM scheduled_messages
              WHERE creator_phone = ?
                AND status = 'sent'
                AND datetime(updated_at) >= datetime('now', '-7 days')
              ORDER BY updated_at DESC
              LIMIT 1
            `).get(normalizedMatch);
            
            if (recentScheduledMessage) {
              // Es una respuesta directa mencionando el número del remitente
              const creatorPhone = recentScheduledMessage.creator_phone.replace(/@c\.us$|@g\.us$|@lid$/, '');
              const normalizedCreatorPhone = normalizePhone(creatorPhone);
              const creatorChatId = `${normalizedCreatorPhone}@c.us`;
              
              const senderPhoneDisplay = normalizedUserPhone.startsWith('+') 
                ? normalizedUserPhone 
                : `+${normalizedUserPhone}`;
              
              let forwardedMessage = `📩 *Mensaje directo de ${userName}* (${senderPhoneDisplay}):\n\n`;
              forwardedMessage += messageText;
              
              const originalMessagePreview = (recentScheduledMessage.message_body || '').substring(0, 50);
              if (originalMessagePreview) {
                forwardedMessage += `\n\n_En respuesta a tu mensaje programado: "${originalMessagePreview}${recentScheduledMessage.message_body.length > 50 ? '...' : ''}"_`;
              }
              
              await client.sendMessage(creatorChatId, forwardedMessage);
              console.log(`✅ Mensaje directo reenviado al creador original (${creatorPhone})`);
              await msg.reply('✅ Tu mensaje fue reenviado al remitente original.');
              return;
            }
          }
        }
      }
    } catch (error) {
      console.warn('[WARN] Error detectando respuesta directa por número:', error.message);
      // Continuar con el flujo normal
    }
  }
  
  console.log(`👤 Nombre del contacto: ${userName}`);

  // Normalizar el teléfono antes de guardarlo en la base de datos
  const normalizedUserPhone = normalizePhone(userPhone);
  if (!normalizedUserPhone) {
    console.error(`[ERROR] No se pudo normalizar el teléfono: ${userPhone}`);
    return;
  }

  const userInfo = registerUser(normalizedUserPhone, userName);
  
  // Reiniciar timeout cada vez que el usuario envía un mensaje
  resetTimeout(userPhone);

  const session = getSession(userPhone);
  const currentModule = session?.current_module || 'main';
  
  // Debug: Log del módulo actual para troubleshooting
  if (messageText && messageText.trim() && messageText.length <= 5) {
    console.log(`[DEBUG] Módulo actual: "${currentModule}", Mensaje: "${messageText}"`);
  }
  
  // Detectar preguntas sobre clima en lenguaje natural SOLO si:
  // 1. Estamos en el módulo 'main' (no en ningún otro módulo)
  // 2. El mensaje NO es solo un número o comando simple (podría ser una opción de menú)
  // 3. El mensaje es claramente una pregunta sobre clima
  if (messageText && messageText.trim() && currentModule === 'main') {
    // No procesar si es solo un número o comando simple (podría ser una opción de menú)
    const trimmedMessage = messageText.trim();
    const isSimpleCommand = /^[\d\s\W]+$/.test(trimmedMessage) && trimmedMessage.length <= 5;
    
    // Solo detectar si NO es un comando simple
    if (!isSimpleCommand) {
      try {
        const weatherIntentDetector = require('./modules/weather-module/intent-detector');
        const weatherIntent = weatherIntentDetector.detectWeatherIntent(messageText);
        
        if (weatherIntent) {
          console.log(`[DEBUG] Pregunta sobre clima detectada: "${messageText}"`);
          const weatherModule = require('./modules/weather-module');
          
          // Obtener respuesta directa
          const weatherAnswer = await weatherModule.answerWeatherQuestion(
            db,
            normalizedUserPhone,
            userName,
            messageText
          );
          
          if (weatherAnswer && weatherAnswer.directAnswer) {
            await msg.reply(weatherAnswer.message);
            return;
          }
        }
      } catch (error) {
        console.warn('[WARN] Error detectando pregunta de clima:', error.message);
        // Continuar con el flujo normal si falla
      }
    }
  }
  
  // Procesar mensaje de ubicación compartida
  if (isLocation) {
    try {
      console.log(`📍 Mensaje de ubicación recibido de ${userPhone}`);
      
      // Obtener coordenadas del mensaje de ubicación
      let lat = null;
      let lon = null;
      
      if (msg.location) {
        lat = msg.location.latitude || msg.location.lat;
        lon = msg.location.longitude || msg.location.lng || msg.location.lon;
      }
      
      if (!lat || !lon) {
        console.error('[ERROR] No se pudieron obtener coordenadas del mensaje de ubicación');
        await msg.reply('❌ No pude leer las coordenadas de la ubicación compartida. Por favor intentá compartirla nuevamente.');
        return;
      }
      
      console.log(`[DEBUG] Coordenadas recibidas: ${lat}, ${lon}`);
      
      // Procesar la ubicación compartida usando el módulo de clima
      const weatherModule = require('./modules/weather-module');
      const result = await weatherModule.processSharedLocation(db, normalizedUserPhone, userName, lat, lon);
      
      if (result && result.message) {
        await msg.reply(result.message);
      } else {
        await msg.reply('✅ Ubicación recibida y guardada. Podés consultar el pronóstico escribiendo "pronostico".');
      }
      
      // Limpiar sesión si estaba en un módulo relacionado con ubicación
      const session = getSession(userPhone);
      if (session && (session.current_module === 'weather' || session.current_module === 'weather_save_location')) {
        updateSession(userPhone, 'main');
      }
      
      return;
    } catch (error) {
      console.error('[ERROR] Error procesando mensaje de ubicación:', error);
      await msg.reply('❌ Ocurrió un error al procesar tu ubicación. Por favor intentá nuevamente o escribí el nombre de tu ciudad.');
      return;
    }
  }

  // Track cualquier mensaje directo recibido para estadísticas del dashboard
  try {
    const messagePreview = messageText ? messageText.slice(0, 200) : '';
    statsModule.trackEvent(db, normalizedUserPhone, 'direct_message', {
      messageType: msgType,
      length: messageText ? messageText.length : 0,
      hasMedia: msg.hasMedia || false,
      preview: messagePreview,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[WARN] No se pudo registrar el mensaje directo en estadísticas:', error.message);
  }

  let response = '';

  // Normalizar mensaje para comparaciones
  const mensajeLower = messageText ? messageText.toLowerCase().trim() : '';

  // Si es usuario nuevo, dar bienvenida personalizada
  if (userInfo.isNewUser) {
    // Trackear registro de nuevo usuario
    try {
      statsModule.trackEvent(db, normalizedUserPhone, 'user_registered', {
        userName,
        registrationMethod: 'whatsapp',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.warn('[WARN] No se pudo trackear registro de usuario:', error.message);
    }
    
    // Detectar automáticamente la ubicación del usuario nuevo (en segundo plano)
    detectAndSaveUserLocation(userPhone).catch(error => {
      console.warn('[WARN] No se pudo detectar ubicación automáticamente:', error.message);
    });
    
    response = `¡Hola *${userName}*! 👋 Bienvenido/a.\n\nSoy tu asistente personal de WhatsApp.\n\n` + getMainMenu(userName, userPhone);
    response += `\n\n${buildKeywordGuide()}`;
    updateSession(userPhone, 'main');
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }
  
  // Para usuarios existentes, verificar si tienen ubicación y detectarla automáticamente si no la tienen
  const userLocation = db.prepare('SELECT location_city FROM users WHERE phone = ?').get(userPhone);
  if (!userLocation || !userLocation.location_city) {
    // La ubicación se sugerirá automáticamente cuando consultes el pronóstico.
  }

  if (mensajeLower === 'programar mensaje' || mensajeLower === 'programar mensajes' || mensajeLower === 'mensaje programado') {
    const flowStart = scheduledMessagesModule.startSchedulingFlow(db, userPhone, userName);
    await msg.reply(flowStart.message);
    if (!flowStart.abort) {
      updateSession(userPhone, flowStart.nextModule, flowStart.context);
    }
    return;
  }

  // Comando para información Premium
  if (mensajeLower === 'premium' || mensajeLower === 'premium info' || mensajeLower === 'info premium') {
    const premiumModule = require('./modules/premium-module');
    const info = premiumModule.getPremiumInfo(db, userPhone);
    const message = premiumModule.buildPremiumStatusMessage(info);
    await msg.reply(message);
    return;
  }

  // Comando para iniciar suscripción Premium
  if (mensajeLower === 'quiero premium' || mensajeLower === 'suscribirme' || mensajeLower === 'suscribirme premium' || mensajeLower === 'comprar premium') {
    const premiumModule = require('./modules/premium-module');
    const flowStart = premiumModule.startSubscriptionFlow(db, userPhone, userName);
    await msg.reply(flowStart.message);
    if (!flowStart.abort) {
      updateSession(userPhone, flowStart.nextModule, flowStart.context);
    }
    return;
  }

  if (['programados', 'mensajes programados', '/programados'].includes(mensajeLower)) {
    const items = scheduledMessagesModule.listScheduledMessages(db, userPhone);
    const tzInfo = scheduledMessagesModule.getUserTimezoneInfo(db, userPhone);
    const listMessage = scheduledMessagesModule.formatScheduledList(items, tzInfo.offsetMinutes);
    await msg.reply(listMessage);
    return;
  }

  // Cancelar todos los mensajes programados
  if (mensajeLower === 'cancelar todos' || mensajeLower === 'cancelar todos los mensajes' || mensajeLower === 'cancelar todo') {
    const cancelledCount = scheduledMessagesModule.cancelAllScheduledMessages(db, userPhone);
    if (cancelledCount > 0) {
      await msg.reply(`✅ Cancelé ${cancelledCount} mensaje${cancelledCount === 1 ? '' : 's'} programado${cancelledCount === 1 ? '' : 's'}.`);
    } else {
      await msg.reply('ℹ️ No tenés mensajes programados pendientes para cancelar.');
    }
    return;
  }

  // Cancelar múltiples mensajes por IDs (ej: "cancelar mensaje 1 2 3")
  const cancelMultipleMatch = mensajeLower.match(/^(?:cancelar mensaje|cancelar msg|cancelar)\s+(\d+(?:\s+\d+)*)$/);
  if (cancelMultipleMatch) {
    const idsText = cancelMultipleMatch[1];
    const messageIds = idsText.trim().split(/\s+/).map(id => parseInt(id, 10)).filter(id => !Number.isNaN(id));
    
    if (messageIds.length === 0) {
      await msg.reply('Necesito al menos un número de mensaje válido. Ejemplo: *cancelar mensaje 1 2 3*');
      return;
    }

    if (messageIds.length === 1) {
      // Un solo ID, usar la función simple
      const cancelled = scheduledMessagesModule.cancelScheduledMessage(db, userPhone, messageIds[0]);
      if (cancelled) {
        await msg.reply(`✅ Cancelé el mensaje programado #${messageIds[0]}.`);
      } else {
        await msg.reply(`❌ No encontré un mensaje programado pendiente con el ID #${messageIds[0]}.`);
      }
    } else {
      // Múltiples IDs
      const result = scheduledMessagesModule.cancelMultipleScheduledMessages(db, userPhone, messageIds);
      if (result.cancelled > 0) {
        let response = `✅ Cancelé ${result.cancelled} mensaje${result.cancelled === 1 ? '' : 's'} programado${result.cancelled === 1 ? '' : 's'}.`;
        if (result.failed > 0) {
          response += `\n⚠️ ${result.failed} mensaje${result.failed === 1 ? '' : 's'} no ${result.failed === 1 ? 'fue' : 'fueron'} encontrado${result.failed === 1 ? '' : 's'} o ya estaba${result.failed === 1 ? '' : 'n'} cancelado${result.failed === 1 ? '' : 's'}.`;
        }
        await msg.reply(response);
      } else {
        await msg.reply(`❌ No encontré ningún mensaje programado pendiente con esos IDs.`);
      }
    }
    return;
  }

  // Cancelar un solo mensaje (compatibilidad con formato anterior)
  const cancelScheduledMatch = mensajeLower.match(/^(?:cancelar mensaje|cancelar msg|cancelar)\s+(\d+)$/);
  if (cancelScheduledMatch) {
    const messageId = parseInt(cancelScheduledMatch[1], 10);
    if (Number.isNaN(messageId)) {
      await msg.reply('Necesito un número de mensaje válido. Ejemplo: *cancelar mensaje 12*');
      return;
    }
    const cancelled = scheduledMessagesModule.cancelScheduledMessage(db, userPhone, messageId);
    if (cancelled) {
      await msg.reply(`✅ Cancelé el mensaje programado #${messageId}.`);
    } else {
      await msg.reply(`❌ No encontré un mensaje programado pendiente con el ID #${messageId}.`);
    }
    return;
  }

  // Manejar contactos compartidos (vcard) para mensajes programados
  if (isVCard && currentModule === 'scheduled_message_waiting_contact') {
    console.log('[DEBUG] Procesando vCard para mensaje programado');
    const context = session?.context ? JSON.parse(session.context) : {};
    
    try {
      // Intentar obtener vCard de diferentes formas
      let vcardData = null;
      
      if (msg.vCards && msg.vCards.length > 0) {
        vcardData = Array.isArray(msg.vCards[0]) ? msg.vCards[0].join('\n') : msg.vCards[0];
        console.log('[DEBUG] vCard encontrado en msg.vCards');
      } else if (msg.body && msg.body.includes('BEGIN:VCARD')) {
        vcardData = msg.body;
        console.log('[DEBUG] vCard encontrado en msg.body');
      } else if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media && media.data) {
            vcardData = Buffer.from(media.data, 'base64').toString('utf-8');
            console.log('[DEBUG] vCard encontrado en media descargado');
          }
        } catch (e) {
          console.error('[ERROR] Error descargando media:', e);
        }
      }
      
      if (vcardData) {
        // Buscar nombre (FN: o N:)
        const nameMatch = vcardData.match(/FN[^:]*:(.*)/i) || vcardData.match(/N[^:]*:([^;]+)/i);
        // Buscar teléfono (TEL:)
        const telMatches = vcardData.match(/TEL[^:]*:([+\d\s\-\(\)]+)/gi);
        let contactPhone = null;
        
        if (telMatches && telMatches.length > 0) {
          contactPhone = telMatches[0].replace(/TEL[^:]*:/i, '').replace(/\D/g, '');
        }
        
        const contactName = nameMatch ? nameMatch[1].trim().replace(/;+/g, ' ').replace(/\s+/g, ' ') : 'Sin nombre';
        
        console.log('[DEBUG] Contacto extraído - Nombre:', contactName, 'Teléfono:', contactPhone);
        
        if (!contactPhone || contactPhone.length < 8) {
          await msg.reply('❌ No se pudo extraer el teléfono del contacto o el teléfono es inválido.\n\nIntenta compartir el contacto nuevamente o escribe el número manualmente.');
          return;
        }
        
        // Actualizar contexto con el contacto
        context.stage = 'collect_datetime';
        context.targetChat = contactPhone;
        context.targetType = 'user';
        context.targetName = contactName;
        
        const flowResult = {
          message: `Perfecto, se enviará a *${contactName}* (${contactPhone}). ¿Cuándo querés que lo envíe? Usa el formato \`AAAA-MM-DD HH:MM\` o algo como "mañana 09:00".\n\nEscribí *cancelar* si querés salir.`,
          nextModule: 'scheduled_message_collect_datetime',
          context: JSON.stringify(context)
        };
        
        await msg.reply(flowResult.message);
        updateSession(userPhone, flowResult.nextModule, flowResult.context);
        return;
      } else {
        await msg.reply('❌ No se pudo leer el contacto compartido. Intenta compartirlo nuevamente o escribe el número manualmente.');
        return;
      }
    } catch (error) {
      console.error('[ERROR] Error procesando vCard para mensaje programado:', error);
      await msg.reply('❌ Hubo un error al procesar el contacto. Intenta escribir el número manualmente.');
      return;
    }
  }

  // Manejar administración de suscripción Premium
  if (currentModule && currentModule === 'premium_management') {
    const premiumNotifications = require('./modules/premium-module/notifications');
    const lower = messageText.toLowerCase().trim();
    
    if (lower === 'menu' || lower === 'menú' || lower === 'volver' || messageText === '2' || messageText === '2️⃣') {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    } else if (messageText === '1' || messageText === '1️⃣') {
      // Cancelar suscripción
      const cancelResult = premiumNotifications.cancelSubscription(db, userPhone);
      if (cancelResult.success) {
        response = `✅ ${cancelResult.message}\n\n${getMainMenu(userName, userPhone)}`;
      } else {
        response = `❌ ${cancelResult.message}\n\n${getMainMenu(userName, userPhone)}`;
      }
      updateSession(userPhone, 'main');
    } else {
      const subscription = premiumNotifications.getSubscriptionInfo(db, userPhone);
      const subscriptionInfo = premiumNotifications.formatSubscriptionInfo(subscription);
      response = `${subscriptionInfo}\n\n*Opciones:*\n1️⃣ Cancelar suscripción\n2️⃣ Volver al menú principal\n\nEscribí el número de la opción.`;
    }
    
    await msg.reply(response);
    return;
  }

  // Manejar flujo de suscripción Premium
  if (currentModule && currentModule === 'premium_subscription') {
    const premiumModule = require('./modules/premium-module');
    const flowResult = await premiumModule.handleSubscriptionFlow({
      db,
      userPhone,
      userName,
      messageText,
      session,
      client
    });

    if (flowResult) {
      await msg.reply(flowResult.message);
      if (flowResult.nextModule) {
        updateSession(userPhone, flowResult.nextModule, flowResult.context || null);
      } else {
        updateSession(userPhone, 'main', null);
      }
      return;
    }
  }

  // Manejar menú de mensajes programados
  if (currentModule === 'scheduled_messages_menu') {
    const scheduledMessagesModule = require('./modules/scheduled-messages');
    const lower = messageText.toLowerCase().trim();
    const phoneToUse = normalizedUserPhone || normalizePhone(userPhone);
    
    if (lower === 'menu' || lower === 'menú' || lower === 'volver' || messageText === '5' || messageText === '5️⃣') {
      response = getMainMenu(userName, userPhone);
      updateSession(phoneToUse, 'main');
    }
    else if (messageText === '1' || messageText === '1️⃣') {
      // Programar nuevo mensaje
      const flowStart = scheduledMessagesModule.startSchedulingFlow(db, phoneToUse, userName);
      response = flowStart.message;
      if (!flowStart.abort) {
        updateSession(phoneToUse, flowStart.nextModule, flowStart.context);
      } else {
        updateSession(phoneToUse, 'scheduled_messages_menu');
      }
    }
    else if (messageText === '2' || messageText === '2️⃣') {
      // Ver mensajes programados
      const items = scheduledMessagesModule.listScheduledMessages(db, phoneToUse);
      const tzInfo = scheduledMessagesModule.getUserTimezoneInfo(db, phoneToUse);
      response = scheduledMessagesModule.formatScheduledList(items, tzInfo.offsetMinutes);
      updateSession(phoneToUse, 'scheduled_messages_menu');
    }
    else if (messageText === '3' || messageText === '3️⃣') {
      // Cancelar mensaje por ID
      response = '🗓️ *Cancelar Mensaje*\n\nEscribí el ID del mensaje que querés cancelar:\n\n_Ejemplo: cancelar mensaje 5_\n\nO escribí *"volver"* para regresar.';
      updateSession(phoneToUse, 'scheduled_messages_cancel');
    }
    else if (messageText === '4' || messageText === '4️⃣') {
      // Cancelar todos los mensajes
      const cancelledCount = scheduledMessagesModule.cancelAllScheduledMessages(db, phoneToUse);
      if (cancelledCount > 0) {
        response = `✅ Cancelé ${cancelledCount} mensaje${cancelledCount === 1 ? '' : 's'} programado${cancelledCount === 1 ? '' : 's'}.\n\n${getScheduledMessagesMenu(phoneToUse, userName)}`;
      } else {
        response = `ℹ️ No tenés mensajes programados pendientes para cancelar.\n\n${getScheduledMessagesMenu(phoneToUse, userName)}`;
      }
      updateSession(phoneToUse, 'scheduled_messages_menu');
    }
    else {
      response = getScheduledMessagesMenu(phoneToUse, userName);
    }
    
    await msg.reply(response);
    return;
  }
  
  // Manejar cancelación de mensaje por ID
  if (currentModule === 'scheduled_messages_cancel') {
    const scheduledMessagesModule = require('./modules/scheduled-messages');
    const lower = messageText.toLowerCase().trim();
    const phoneToUse = normalizedUserPhone || normalizePhone(userPhone);
    
    if (lower === 'menu' || lower === 'menú' || lower === 'volver') {
      response = getScheduledMessagesMenu(phoneToUse, userName);
      updateSession(phoneToUse, 'scheduled_messages_menu');
      await msg.reply(response);
      return;
    }
    
    // Intentar parsear "cancelar mensaje X" o solo el número
    const cancelMatch = lower.match(/^(?:cancelar mensaje|cancelar msg|cancelar)\s*(\d+)$/) || lower.match(/^(\d+)$/);
    if (cancelMatch) {
      const messageId = parseInt(cancelMatch[1], 10);
      const cancelled = scheduledMessagesModule.cancelScheduledMessage(db, phoneToUse, messageId);
      if (cancelled) {
        response = `✅ Mensaje programado #${messageId} cancelado.\n\n${getScheduledMessagesMenu(phoneToUse, userName)}`;
      } else {
        response = `❌ No encontré un mensaje programado pendiente con el ID #${messageId}.\n\n${getScheduledMessagesMenu(phoneToUse, userName)}`;
      }
      updateSession(phoneToUse, 'scheduled_messages_menu');
    } else {
      response = `❌ Necesito un número de mensaje válido. Ejemplo: *cancelar mensaje 12*\n\nO escribí *"volver"* para regresar.`;
    }
    
    await msg.reply(response);
    return;
  }

  if (currentModule && currentModule.startsWith('scheduled_message')) {
    const phoneToUse = normalizedUserPhone || normalizePhone(userPhone);
    const flowResult = await scheduledMessagesModule.handleFlowMessage({
      db,
      userPhone: phoneToUse,
      userName,
      messageText,
      session,
      client
    });

    if (flowResult) {
      await msg.reply(flowResult.message);
      if (flowResult.nextModule) {
        updateSession(phoneToUse, flowResult.nextModule, flowResult.context || null);
      } else {
        updateSession(phoneToUse, 'main', null);
      }
      return;
    }
  }

  const keywordShortcut = detectKeywordShortcut(mensajeLower);
  if (keywordShortcut) {
    const handledByKeyword = await handleKeywordShortcutAction({
      shortcut: keywordShortcut,
      msg,
      userPhone,
      userName,
      session
    });
    if (handledByKeyword) {
      return;
    }
  }

  // Comando para ver estadísticas (solo admin)
  if (mensajeLower === '/stats' && userPhone === '5492615176403') {
    try {
      // Obtener resumen general
      const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const totalEvents = db.prepare('SELECT COUNT(*) as count FROM calendar_events').get();
      const totalExpenses = db.prepare('SELECT COUNT(*) as count FROM expenses').get();
      const totalGroups = db.prepare('SELECT COUNT(*) as count FROM expense_groups').get();
      const totalStats = db.prepare('SELECT COUNT(*) as count FROM bot_usage_stats').get();

      // Usuarios activos últimos 7 días
      const activeUsers = db.prepare(`
        SELECT COUNT(DISTINCT user_phone) as count
        FROM bot_usage_stats
        WHERE datetime(created_at) >= datetime('now', '-7 days')
      `).get();

      // Top eventos
      const topEvents = statsModule.getTopEvents(db, 5);

      response = `📊 *Estadísticas del Bot*\n\n` +
        `👥 *Usuarios:*\n` +
        `   Total: ${totalUsers.count}\n` +
        `   Activos (7 días): ${activeUsers.count}\n\n` +
        `📅 *Eventos:* ${totalEvents.count}\n` +
        `💰 *Gastos:* ${totalExpenses.count}\n` +
        `👥 *Grupos:* ${totalGroups.count}\n` +
        `📊 *Eventos trackeados:* ${totalStats.count}\n\n` +
        `📈 *Top 5 Eventos:*\n` +
        topEvents.map((e, i) => `   ${i + 1}. ${e.event_type}: ${e.count} (${e.unique_users} usuarios)`).join('\n') +
        `\n\n📊 *Dashboard Web:*\n` +
        `   http://localhost:${process.env.ADMIN_PORT || 3000}\n\n` +
        `💡 Usa */stats_modulos* para ver estadísticas por módulo`;
    } catch (error) {
      console.error('[ERROR] Error obteniendo estadísticas:', error);
      response = `❌ Error obteniendo estadísticas: ${error.message}`;
    }
    await msg.reply(response);
    return;
  }

  // Comando para ver estadísticas por módulo (solo admin)
  if (mensajeLower === '/stats_modulos' && userPhone === '5492615176403') {
    try {
      const moduleStats = statsModule.getModuleStats(db);
      response = `📊 *Estadísticas por Módulo*\n\n` +
        Object.entries(moduleStats)
          .map(([module, count]) => `   ${module}: ${count}`)
          .join('\n') +
        `\n\n💡 Usa */stats* para ver resumen general`;
    } catch (error) {
      console.error('[ERROR] Error obteniendo estadísticas por módulo:', error);
      response = `❌ Error obteniendo estadísticas: ${error.message}`;
    }
    await msg.reply(response);
    return;
  }

  // Saludos comunes que activan el menú
  const saludos = ['hola', 'hi', 'hello', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'ola'];
  
  if (saludos.includes(mensajeLower)) {
    response = getMainMenu(userName);
    updateSession(userPhone, 'main');
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  // Comandos especiales de feedback
  if (mensajeLower.startsWith('/feedback') || mensajeLower.startsWith('/bug') || mensajeLower.startsWith('/sugerencia')) {
    const feedbackText = messageText.substring(messageText.indexOf(' ') + 1).trim();
    
    if (feedbackText && feedbackText !== messageText) {
      const type = mensajeLower.startsWith('/bug') ? 'bug' : 
                   mensajeLower.startsWith('/sugerencia') ? 'sugerencia' : 'feedback';
      
      const result = saveFeedback(userPhone, userName, type, feedbackText);
      
      // Trackear feedback enviado
      statsModule.trackFeedbackSent(db, userPhone, {
        type,
        feedbackId: result.id,
        messageLength: feedbackText.length
      });
      
      response = `✅ ¡Gracias *${userName}*!\n\n` +
        `Tu ${type} ha sido registrado (#${result.id})\n\n` +
        `Estamos trabajando para mejorar el bot continuamente.\n\n` +
        `🔔 Te notificaremos cuando sea revisado.`;
      
      // Notificar al admin (tú)
      const ADMIN_PHONE = '5492615176403';
      if (userPhone !== ADMIN_PHONE) {
        try {
          await client.sendMessage(
            `${ADMIN_PHONE}@c.us`,
            `🔔 *Nuevo ${type}*\n\n` +
            `👤 De: ${userName} (${userPhone})\n` +
            `📝 Mensaje:\n${feedbackText}\n\n` +
            `ID: #${result.id}`
          );
        } catch (error) {
          console.error('Error notificando admin:', error);
        }
      }
      
      console.log(`📝 Feedback recibido de ${userName}: ${feedbackText}`);
    } else {
      response = `📝 *Reportar Feedback/Bug*\n\n` +
        `Usa uno de estos comandos:\n\n` +
        `• */feedback [mensaje]*\n` +
        `  Para cualquier comentario\n\n` +
        `• */bug [descripción]*\n` +
        `  Para reportar errores\n\n` +
        `• */sugerencia [idea]*\n` +
        `  Para nuevas ideas\n\n` +
        `*Ejemplo:*\n` +
        `/bug El bot no respondió cuando intenté crear un evento`;
    }
    
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  // Comando para ver feedback (solo admin)
  if (mensajeLower === '/ver_feedback' && userPhone === '5492615176403') {
    const pending = getPendingFeedback();
    const all = getAllFeedback();
    
    if (all.length === 0) {
      response = '📝 No hay feedback registrado todavía.';
    } else {
      response = `📊 *Feedback registrado*\n\n` +
        `📥 Pendientes: ${pending.length}\n` +
        `📋 Total: ${all.length}\n\n` +
        `*Últimos 5:*\n\n` +
        all.slice(0, 5).map((f, i) =>
          `${i + 1}. [#${f.id}] ${f.type.toUpperCase()}\n` +
          `   👤 ${f.user_name || f.user_phone}\n` +
          `   📝 ${f.message.substring(0, 80)}${f.message.length > 80 ? '...' : ''}\n` +
          `   🕐 ${f.created_at}\n` +
          `   Status: ${f.status === 'pending' ? '⏳ Pendiente' : '✅ Leído'}`
        ).join('\n\n') +
        `\n\n_Usa /marcar_leido [ID] para marcar como leído_`;
    }
    
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  // Interceptar "menu" para volver al menú principal desde cualquier módulo
  if (messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'menú' || messageText.toLowerCase() === 'volver') {
    response = getMainMenu(userName);
    updateSession(userPhone, 'main');
    await msg.reply(response);
    return;
  }

  if (mensajeLower.startsWith('convert') || mensajeLower.startsWith('convers')) {
    const currencyResult = await currencyModule.handleCurrencyMessage(
      db,
      userPhone,
      userName,
      messageText,
      session
    );
    if (currencyResult.exit) {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    } else {
      response = currencyResult.message || currencyModule.buildHelpMessage();
      updateSession(userPhone, 'currency', currencyResult.context || null);
    }
    await msg.reply(response);
    return;
  }

  if (mensajeLower === 'classroom' || mensajeLower === 'resumen classroom' || mensajeLower === 'resumen de classroom') {
    response = await classroomModule.handleClassroomMessage(
      msg,
      userPhone,
      userName,
      messageText,
      'main',
      session,
      db,
      client
    );
    await msg.reply(response);
    return;
  }
  
  if (currentModule === 'main') {
    switch(messageText) {
      case '1':
        // Pronóstico del tiempo
        statsModule.trackModuleAccess(db, userPhone, 'weather');
        const weatherModule = require('./modules/weather-module');
        const forecastMain = await weatherModule.getWeatherForecast(db, userPhone, userName, {
          forceIpSuggestion: true
        });
        response = forecastMain.message;
        if (forecastMain.pendingLocation) {
          updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation: forecastMain.pendingLocation }));
        } else {
          updateSession(userPhone, 'weather', null);
        }
        break;
      case '2':
        statsModule.trackModuleAccess(db, userPhone, 'calendar');
        response = await calendarModule.handleCalendarMessage(
          msg,
          userPhone,
          userName,
          '1',  // Esto simula que el usuario está entrando al menú de calendario
          'main',  // Viene del módulo main
          session,
          db,
          client
        );
        updateSession(userPhone, 'calendar');
        break;
      case '3': {
        // Programar Mensajes
        const phoneToUse = normalizedUserPhone || normalizePhone(userPhone);
        statsModule.trackModuleAccess(db, phoneToUse, 'scheduled_messages');
        response = getScheduledMessagesMenu(phoneToUse, userName);
        updateSession(phoneToUse, 'scheduled_messages_menu');
        break;
      }
      case '4':
        statsModule.trackModuleAccess(db, userPhone, 'expenses');
        response = getExpensesMenu(userPhone);
        updateSession(userPhone, 'expenses');
        break;
      case '5': {
        statsModule.trackModuleAccess(db, userPhone, 'classroom');
        response = await classroomModule.handleClassroomMessage(
          msg,
          userPhone,
          userName,
          messageText,
          'main',
          session,
          db,
          client
        );
        break;
      }
      case '6':
        statsModule.trackModuleAccess(db, userPhone, 'ai');
        response = `Hola *${userName}*! 🤖\n\nModo IA activado. Habla naturalmente y te ayudaré.\n\n_La sesión se cerrará automáticamente después de 5 minutos de inactividad._`;
        updateSession(userPhone, 'ai');
        break;
      case '7': {
        statsModule.trackModuleAccess(db, userPhone, 'currency');
        const startCurrency = currencyModule.startCurrencyFlow(db, userPhone);
        response = startCurrency.message;
        updateSession(userPhone, 'currency', startCurrency.context);
        break;
      }
      case '8':
        statsModule.trackModuleAccess(db, userPhone, 'invite');
        response = '🤝 *Invitar a un amigo*\n\n¿Cómo querés compartir la invitación?\n\n1️⃣ Compartir contacto de WhatsApp\n2️⃣ Escribir número manualmente\n3️⃣ Cancelar\n\n💡 Podés escribir *"volver"* en cualquier momento para regresar al menú.';
        updateSession(userPhone, 'invite_friend_method', JSON.stringify({ inviterName: userName, inviterPhone: userPhone }));
        break;
      case '9': {
        const premiumModule = require('./modules/premium-module');
        const isPremium = premiumModule.isPremiumUser(db, userPhone);
        
        if (isPremium) {
          // Menú de administración de suscripción Premium
          statsModule.trackModuleAccess(db, userPhone, 'premium_management');
          const premiumNotifications = require('./modules/premium-module/notifications');
          const subscription = premiumNotifications.getSubscriptionInfo(db, userPhone);
          const subscriptionInfo = premiumNotifications.formatSubscriptionInfo(subscription);
          
          response = `${subscriptionInfo}\n\n*Opciones:*\n1️⃣ Cancelar suscripción\n2️⃣ Volver al menú principal\n\nEscribí el número de la opción.`;
          updateSession(userPhone, 'premium_management');
        } else {
          statsModule.trackModuleAccess(db, userPhone, 'settings');
          response = '⚙️ *Configuración general*\n\nPronto vas a poder administrar preferencias generales desde aquí.\nPor ahora, configura cada módulo desde sus propios menús.\n\nEscribe *menu* para volver al inicio.';
        }
        break;
      }
      case '10':
      case '0':
        statsModule.trackModuleAccess(db, userPhone, 'help');
        response = 'ℹ️ *Ayuda*\n\nPuedes interactuar de dos formas:\n\n*📱 Por menús:* Navega con números\n*💬 Por voz:* Habla naturalmente\n\nEjemplos:\n- "Recuérdame mañana comprar pan"\n- "Crea un grupo para el asado"\n- "¿Cuánto debo?"\n\nEscribe *menu* para volver al inicio.\n\n*📝 Reportar problemas:*\n• */feedback* - Dejar comentario\n• */bug* - Reportar error\n• */sugerencia* - Nueva idea\n\n_⚠️ Importante: La sesión se cierra después de 5 min sin actividad._';
        break;
      case '11': {
        // Opción 11 solo visible para usuarios Premium (cuando opción 9 es suscripción)
        const premiumModule = require('./modules/premium-module');
        const isPremium = premiumModule.isPremiumUser(db, userPhone);
        
        if (isPremium) {
          statsModule.trackModuleAccess(db, userPhone, 'help');
          response = 'ℹ️ *Ayuda*\n\nPuedes interactuar de dos formas:\n\n*📱 Por menús:* Navega con números\n*💬 Por voz:* Habla naturalmente\n\nEjemplos:\n- "Recuérdame mañana comprar pan"\n- "Crea un grupo para el asado"\n- "¿Cuánto debo?"\n\nEscribe *menu* para volver al inicio.\n\n*📝 Reportar problemas:*\n• */feedback* - Dejar comentario\n• */bug* - Reportar error\n• */sugerencia* - Nueva idea\n\n_⚠️ Importante: La sesión se cierra después de 5 min sin actividad._';
        } else {
          response = getMainMenu(userName, userPhone);
        }
        break;
      }
      default:
        response = getMainMenu(userName, userPhone);
    }
  }
  else if (currentModule === 'weather') {
    // Manejar configuración de ubicación o solicitudes de clima
    const weatherModule = require('./modules/weather-module');
    const weatherAPI = require('./modules/weather-module/weather-api');
    
    if (messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'menú' || messageText === '0' || messageText.toLowerCase() === 'volver') {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    }
    // Opción 1: Compartir ubicación actual (recomendado)
    else if (messageText === '1' || messageText === '1️⃣') {
      response = '📍 *Compartir Ubicación*\n\nPor favor compartí tu ubicación actual desde WhatsApp:\n\n' +
        `1. Toca el ícono de 📎 (clip)\n` +
        `2. Selecciona "Ubicación"\n` +
        `3. Toca "Compartir ubicación en vivo" o "Enviar ubicación actual"\n\n` +
        `_💡 Al compartir tu ubicación, el bot la detecta automáticamente y busca el nombre de tu ciudad para darte el pronóstico más preciso._`;
      // Mantener en módulo weather para que cuando comparta la ubicación, se procese correctamente
      updateSession(userPhone, 'weather');
    }
    // Opción 2: Detectar automáticamente (por IP)
    else if (messageText === '2' || messageText === '2️⃣') {
      const forecast = await weatherModule.getWeatherForecast(db, userPhone, userName, {
        autoDetect: true
      });
      response = forecast.message;
      if (forecast.pendingLocation) {
        updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation: forecast.pendingLocation }));
      } else {
        updateSession(userPhone, 'weather', null);
      }
    }
    // Opción 3: Escribir ciudad manualmente
    else if (messageText === '3' || messageText === '3️⃣') {
      response = '🌤️ *Escribir Ciudad*\n\nEscribe el nombre de tu ciudad:\n\n_Ejemplos:_\n• Nombre completo: Buenos Aires, Mendoza, Córdoba\n• Abreviado: bue, mend, cord\n• También podés escribir directamente la ciudad';
      updateSession(userPhone, 'weather_city');
    }
    // Opción 4: Volver al menú principal
    else if (messageText === '4' || messageText === '4️⃣') {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    }
    // Si el usuario escribe una ciudad (más de 2 caracteres)
    else if (messageText && messageText.trim().length > 2) {
      // Buscar coordenadas de la ciudad
      const cityResult = await weatherAPI.getCityCoordinates(messageText.trim());
      
      if (cityResult.success) {
        // Guardar ubicación
        weatherModule.saveUserLocation(
          db,
          userPhone,
          cityResult.data.name,
          cityResult.data.lat,
          cityResult.data.lon,
          cityResult.data.state || null,
          cityResult.data.country || null,
          cityResult.data.countryCode || cityResult.data.country || null
        );
        
        // Obtener pronóstico
        const forecastManual = await weatherModule.getWeatherForecast(db, userPhone, userName, {
          forceIpSuggestion: true
        });
        response = forecastManual.message;
        if (forecastManual.pendingLocation) {
          updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation: forecastManual.pendingLocation }));
        } else {
          updateSession(userPhone, 'weather', null);
        }
      } else {
        response = `❌ No pude encontrar la ciudad "${messageText}".\n\n` +
          `Intenta escribir el nombre completo de la ciudad:\n\n` +
          `_Ejemplo: Mendoza, Buenos Aires, Córdoba, Rosario_\n\n` +
          `O escribe *"menu"* para volver al inicio.`;
        updateSession(userPhone, 'weather', null);
      }
    } else {
      response = '❌ Por favor escribe el nombre de tu ciudad (mínimo 3 caracteres).\n\n' +
        `_Ejemplo: Mendoza, Buenos Aires, Córdoba_\n\n` +
        `O escribe *"menu"* para volver al inicio.`;
      updateSession(userPhone, 'weather', null);
    }
  }
  else if (currentModule === 'classroom' || currentModule.startsWith('classroom_')) {
    response = await classroomModule.handleClassroomMessage(
      msg,
      userPhone,
      userName,
      messageText,
      currentModule,
      session,
      db,
      client
    );
  }
  else if (currentModule === 'weather_city') {
    // Usuario está escribiendo el nombre de la ciudad
    const weatherModule = require('./modules/weather-module');
    const weatherAPI = require('./modules/weather-module/weather-api');

    if (messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'menú' || messageText === '0' || messageText.toLowerCase() === 'volver') {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    } else if (messageText && messageText.trim().length > 2) {
      const cityResult = await weatherAPI.getCityCoordinates(messageText.trim());

      if (cityResult.success) {
        weatherModule.saveUserLocation(
          db,
          userPhone,
          cityResult.data.name,
          cityResult.data.lat,
          cityResult.data.lon,
          cityResult.data.state || null,
          cityResult.data.country || null,
          cityResult.data.countryCode || cityResult.data.country || null
        );

        const forecastCity = await weatherModule.getWeatherForecast(db, userPhone, userName, {
          forceIpSuggestion: true
        });
        // El tracking de clima se hace dentro de getWeatherForecast
        response = forecastCity.message;
        if (forecastCity.pendingLocation) {
          updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation: forecastCity.pendingLocation }));
    } else {
          updateSession(userPhone, 'weather');
        }
      } else {
        response = `❌ No pude encontrar la ciudad "${messageText}".\n\n` +
          `Intenta escribir el nombre completo de la ciudad:\n\n` +
          `_Ejemplo: Mendoza, Buenos Aires, Córdoba, Rosario_\n\n` +
          `O escribe *"menu"* para volver al inicio.`;
        updateSession(userPhone, 'weather_city', JSON.stringify(session?.context || {}));
      }
    } else {
      response = '❌ Por favor escribe el nombre de tu ciudad (mínimo 3 caracteres).\n\n' +
        `_Ejemplo: Mendoza, Buenos Aires, Córdoba_`;
    }
  }
  else if (currentModule === 'currency') {
    const currencyResult = await currencyModule.handleCurrencyMessage(
      db,
      userPhone,
      userName,
      messageText,
      session
    );
    if (currencyResult.exit) {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    } else {
      response = currencyResult.message || currencyModule.buildHelpMessage();
      updateSession(userPhone, 'currency', currencyResult.context || session?.context || null);
    }
  }
  else if (currentModule === 'invite_friend_method') {
    const normalized = messageText.trim().toLowerCase();
    const contextPayload = JSON.stringify({ inviterName: userName, inviterPhone: userPhone });

    if (['1', '1️⃣'].includes(normalized)) {
      response = '📇 *Compartir contacto*\n\nToca el ícono de 📎 y elegí *Contacto* para enviarme el número de tu amigo.\n\nCuando estés listo, envía el contacto o escribe *"volver"* para cancelar.';
      updateSession(userPhone, 'invite_friend_waiting_contact', contextPayload);
    } else if (['2', '2️⃣'].includes(normalized)) {
      response = '✍️ *Ingresar número manualmente*\n\nEscribe el número con código de país. Podés agregar el nombre separando con coma.\n\n_Ejemplos:_\n• 5492611234567\n• Ana,549113334455\n\nEscribe *"volver"* para cancelar.';
      updateSession(userPhone, 'invite_friend_waiting_phone', contextPayload);
    } else if (['3', '3️⃣', 'volver', 'menu', 'menú', 'cancelar'].includes(normalized)) {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    } else {
      response = '❌ Opción no válida.\n\n1️⃣ Compartir contacto\n2️⃣ Escribir número manualmente\n3️⃣ Cancelar\n\nEscribe *"volver"* para regresar al menú.';
    }
  }
  else if (currentModule === 'invite_friend_waiting_contact') {
    const normalized = messageText.trim().toLowerCase();
    const baseContext = session?.context ? JSON.parse(session.context) : {};
    const inviterName = baseContext.inviterName || userName;
    const inviterPhone = baseContext.inviterPhone || userPhone;

    if (['volver', 'menu', 'menú', 'cancelar', '3', '3️⃣'].includes(normalized)) {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    } else if (['2', '2️⃣'].includes(normalized)) {
      response = '✍️ *Ingresar número manualmente*\n\nEscribe el número con código de país. Podés agregar el nombre separando con coma.\n\n_Ejemplos:_\n• 5492611234567\n• Ana,549113334455\n\nEscribe *"volver"* para cancelar.';
      updateSession(userPhone, 'invite_friend_waiting_phone', JSON.stringify(baseContext));
    } else if (['1', '1️⃣'].includes(normalized)) {
      response = '📇 *Compartir contacto*\n\nToca el ícono de 📎 y elegí *Contacto* para enviarme el número de tu amigo.\n\nCuando estés listo, envía el contacto o escribe *"volver"* para cancelar.';
    } else if (isVCard) {
      try {
        const contactInfo = await extractContactFromSharedContact(msg);
        if (!contactInfo || !contactInfo.phone) {
          response = '❌ No pude leer el contacto. Compartilo nuevamente o prueba escribiendo el número manualmente.';
        } else {
          const inviteResult = await sendFriendInviteMessage(
            client,
            inviterName,
            inviterPhone,
            contactInfo.name,
            contactInfo.phone
          );

          if (inviteResult.success) {
            response = `✅ Invitación enviada a *${contactInfo.name}*.\n\n${getMainMenu(userName)}`;
            updateSession(userPhone, 'main');
          } else {
            response = `❌ No pude enviar la invitación: ${inviteResult.error || 'Motivo desconocido'}.\n\nIntenta nuevamente o escribe el número manualmente.`;
            updateSession(userPhone, 'invite_friend_waiting_contact', JSON.stringify(baseContext));
          }
        }
      } catch (error) {
        console.error('[ERROR] No se pudo procesar el contacto para invitación:', error);
        response = '❌ Ocurrió un error al procesar el contacto. Intenta nuevamente o escribe el número manualmente.';
        updateSession(userPhone, 'invite_friend_waiting_contact', JSON.stringify(baseContext));
      }
    } else {
      response = '❌ Necesito que compartas un contacto usando el ícono de 📎.\n\nTambién podés escribir *"volver"* para cancelar o elegir la opción de ingresar el número manualmente.';
    }
  }
  else if (currentModule === 'invite_friend_waiting_phone') {
    const normalized = messageText.trim().toLowerCase();
    const baseContext = session?.context ? JSON.parse(session.context) : {};
    const inviterName = baseContext.inviterName || userName;
    const inviterPhone = baseContext.inviterPhone || userPhone;

    if (['volver', 'menu', 'menú', 'cancelar', '3', '3️⃣'].includes(normalized)) {
      response = getMainMenu(userName, userPhone);
      updateSession(userPhone, 'main');
    } else if (['1', '1️⃣'].includes(normalized)) {
      response = '📇 *Compartir contacto*\n\nToca el ícono de 📎 y elegí *Contacto* para enviarme el número de tu amigo.\n\nCuando estés listo, envía el contacto o escribe *\"volver\"* para cancelar.';
      updateSession(userPhone, 'invite_friend_waiting_contact', JSON.stringify(baseContext));
    } else {
      const parts = messageText.split(',');
      let friendName = 'Tu amigo';
      let phoneInput = messageText;

      if (parts.length > 1) {
        friendName = parts[0].trim() || 'Tu amigo';
        phoneInput = parts.slice(1).join(',').trim();
      }

      const digits = phoneInput.replace(/\D/g, '');

      if (!digits || digits.length < 8) {
        response = '❌ El número parece inválido. Asegurate de incluir el código de país (ej: 5492611234567).\n\nPodés escribir *"volver"* para cancelar.';
      } else {
        const inviteResult = await sendFriendInviteMessage(
          client,
          inviterName,
          inviterPhone,
          friendName,
          digits
        );

        if (inviteResult.success) {
          response = `✅ Invitación enviada a *${friendName}*.\n\n${getMainMenu(userName)}`;
          updateSession(userPhone, 'main');
        } else {
          response = `❌ No pude enviar la invitación: ${inviteResult.error || 'Motivo desconocido'}.\n\nVerificá el número e intenta nuevamente o escribe *"volver"* para cancelar.`;
          updateSession(userPhone, 'invite_friend_waiting_phone', JSON.stringify(baseContext));
        }
      }
    }
  }
  else if (currentModule === 'weather_save_location') {
    const lowerMsg = messageText.trim().toLowerCase();
    const weatherModule = require('./modules/weather-module');
    const contextData = session?.context ? JSON.parse(session.context) : {};
    const pendingLocation = contextData.pendingLocation || null;

    if (['1', '1️⃣', 'sí', 'si', 'quiero', 'guardar'].includes(lowerMsg)) {
      if (pendingLocation && (pendingLocation.city || pendingLocation.rawCity)) {
        const cityToSave = pendingLocation.rawCity || pendingLocation.city;
        weatherModule.saveUserLocation(
          db,
          userPhone,
          cityToSave,
          pendingLocation.lat,
          pendingLocation.lon,
          pendingLocation.state || null,
          pendingLocation.country || null,
          pendingLocation.countryCode || null
        );

        if (pendingLocation.timezone) {
          const offsetMinutes = pendingLocation.timezoneOffset ?? computeTimezoneOffsetMinutes(pendingLocation.timezone);
          try {
            db.prepare(`
              UPDATE users
              SET timezone_name = ?,
                  timezone_offset_minutes = ?
              WHERE phone = ?
            `).run(pendingLocation.timezone, offsetMinutes, userPhone);
          } catch (tzError) {
            console.warn('[WARN] No se pudo actualizar timezone al guardar ubicación:', tzError.message);
          }
        }

        const updatedForecast = await weatherModule.getWeatherForecast(db, userPhone, userName, {
          forceIpSuggestion: true
        });
        const displayName = pendingLocation.city || cityToSave;
        response = `✅ Ubicación guardada como *${displayName}*.\n\n${updatedForecast.message}`;
      } else {
        response = `❌ No encontré una ubicación para guardar.\n\nEscribe el nombre de tu ciudad o usa la detección automática nuevamente.`;
      }
      updateSession(userPhone, 'weather');
    } else if (['2', '2️⃣', 'no', 'más tarde', 'después'].includes(lowerMsg)) {
      const displayName = pendingLocation?.city || 'esta ubicación';
      response = `👌 Perfecto, no guardaré la ubicación.\n\n${weatherModule.buildWeatherMenu(displayName)}`;
      updateSession(userPhone, 'weather');
    } else {
      response = `❌ Opción no válida.\n\n1️⃣ Sí, guardala\n2️⃣ No, gracias`;
    }
  }
  else if (currentModule === 'calendar' || currentModule.startsWith('calendar_')) {
    // Manejar contactos compartidos (vcard) para invitados de eventos
    const isVCard = msgType === 'vcard' || (msg.vCards && msg.vCards.length > 0) || (msg.hasMedia && msg.type === 'vcard');
    
    if (isVCard && (currentModule === 'calendar_waiting_contact' || currentModule === 'calendar_edit_invitees_waiting_contact')) {
      console.log('[DEBUG] Procesando vCard para invitado de evento');
      const context = JSON.parse(session.context || '{}');
      // Manejar tanto calendar_waiting_contact como calendar_edit_invitees_waiting_contact
      const eventId = context.eventId || (context.event ? context.event.id : null);
      let invitees = context.invitees || [];
      const isEditing = currentModule === 'calendar_edit_invitees_waiting_contact';
      const eventForContext = context.event || null;
      
      if (isEditing && (!invitees || invitees.length === 0)) {
        try {
          const calendarDatabase = require('./modules/calendar-module/database');
          invitees = calendarDatabase.getEventInvitees(db, eventId);
        } catch (dbError) {
          console.warn('[WARN] No se pudo sincronizar la lista de invitados desde la base de datos:', dbError);
        }
      }
      
      console.log('[DEBUG] Procesando contacto - Modo:', isEditing ? 'editar evento' : 'crear evento');
      console.log('[DEBUG] Contexto recibido - eventId:', eventId, 'invitees actuales:', invitees.length);
      
      if (!eventId) {
        console.error('[ERROR] No se encontró eventId en el contexto');
        response = '❌ Error: No se encontró el evento. Por favor intenta nuevamente.';
        await msg.reply(response);
        return;
      }
      
      try {
        // Intentar obtener vCard de diferentes formas
        let vcardData = null;
        
        if (msg.vCards && msg.vCards.length > 0) {
          vcardData = Array.isArray(msg.vCards[0]) ? msg.vCards[0].join('\n') : msg.vCards[0];
          console.log('[DEBUG] vCard encontrado en msg.vCards');
        } else if (msg.body && msg.body.includes('BEGIN:VCARD')) {
          vcardData = msg.body;
          console.log('[DEBUG] vCard encontrado en msg.body');
        } else if (msg.hasMedia) {
          // Intentar obtener el vCard del media
          try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
              vcardData = Buffer.from(media.data, 'base64').toString('utf-8');
              console.log('[DEBUG] vCard encontrado en media descargado');
            }
          } catch (e) {
            console.error('[ERROR] Error descargando media:', e);
          }
        }
        
        console.log('[DEBUG] vcardData encontrado:', vcardData ? 'Sí' : 'No');
        if (vcardData) {
          console.log('[DEBUG] vcardData (primeros 200 chars):', vcardData.substring(0, Math.min(200, vcardData.length)));
        }
        
        if (vcardData) {
          // Buscar nombre (FN: o N:)
          const nameMatch = vcardData.match(/FN[^:]*:(.*)/i) || vcardData.match(/N[^:]*:([^;]+)/i);
          // Buscar teléfono (TEL:) - buscar todas las ocurrencias
          const telMatches = vcardData.match(/TEL[^:]*:([+\d\s\-\(\)]+)/gi);
          let contactPhone = null;
          
          if (telMatches && telMatches.length > 0) {
            // Tomar el primer teléfono encontrado
            contactPhone = telMatches[0].replace(/TEL[^:]*:/i, '').replace(/\D/g, '');
          }
          
          const contactName = nameMatch ? nameMatch[1].trim().replace(/;+/g, ' ').replace(/\s+/g, ' ') : 'Sin nombre';
          
          console.log('[DEBUG] Contacto extraído - Nombre:', contactName, 'Teléfono encontrado:', contactPhone ? 'Sí' : 'No');
          if (contactPhone) {
            console.log('[DEBUG] Teléfono original:', contactPhone);
          }
          
          if (!contactPhone || contactPhone.length < 8) {
            response = '❌ No se pudo extraer el teléfono del contacto o el teléfono es inválido.\n\nIntenta compartir el contacto nuevamente o escribe el nombre manualmente.';
            await msg.reply(response);
            return;
          }
          
          // Limpiar y formatear teléfono
          if (!contactPhone.startsWith('549')) {
            contactPhone = '549' + contactPhone.replace(/^0+/, '');
          }
          
          console.log('[DEBUG] Teléfono formateado:', contactPhone);
          
          // Verificar si el invitado ya existe
          const existingInvitee = invitees.find(inv => inv.phone === contactPhone);
          if (existingInvitee) {
            if (isEditing) {
              response = `⚠️ *${contactName}* ya está en la lista de invitados.\n\n¿Deseas agregar otro invitado?\n\n1️⃣ Sí, agregar otro\n2️⃣ No, volver`;
              updateSession(userPhone, 'calendar_edit_invitees_post_add', JSON.stringify({ event: eventForContext || { id: eventId }, invitees }));
            } else {
              response = `⚠️ *${contactName}* ya está en la lista de invitados.\n\n¿Deseas agregar otro invitado?\n\n1️⃣ Sí, agregar otro\n2️⃣ No, listo\n3️⃣ Volver al menú`;
              updateSession(userPhone, 'calendar_add_invitees_confirm', JSON.stringify({ eventId, invitees }));
            }
            await msg.reply(response);
            return;
          }
          
          // Agregar invitado
          const calendarDatabase = require('./modules/calendar-module/database');
          const calendarHandlers = require('./modules/calendar-module/handlers');
          calendarDatabase.addEventInvitee(db, eventId, contactName, contactPhone);
          invitees.push({ name: contactName, phone: contactPhone });
          
          if (isEditing) {
            try {
              invitees = calendarDatabase.getEventInvitees(db, eventId);
            } catch (refreshError) {
              console.warn('[WARN] No se pudo refrescar la lista de invitados recién agregados:', refreshError);
            }
          }
          
          console.log('[DEBUG] Invitado agregado. Total de invitados:', invitees.length);
          
          // Enviar mensaje de bienvenida al invitado
          const sendResult = await calendarHandlers.sendInviteeWelcomeMessage(
            client,
            db,
            eventId,
            contactPhone,
            contactName,
            userPhone,
            userName
          );
          
          if (isEditing) {
            response = `✅ *${contactName}* agregado correctamente!\n\n📊 Total de invitados: ${invitees.length}\n\n¿Deseas agregar otro invitado?\n\n1️⃣ Sí, agregar otro\n2️⃣ No, volver`;
          } else {
            response = `✅ *${contactName}* agregado correctamente!\n\n📊 Total de invitados: ${invitees.length}\n\n¿Deseas agregar otro invitado?\n\n1️⃣ Sí, agregar otro\n2️⃣ No, listo\n3️⃣ Volver al menú`;
          }

          if (!sendResult || !sendResult.success) {
            const errorMsg = sendResult?.error || 'No se pudo notificar automáticamente al invitado.';
            console.warn(`[WARN] No se pudo enviar mensaje de bienvenida a ${contactName}: ${errorMsg}`);
            response += `\n\n⚠️ *Aviso:* No pude notificar automáticamente a ${contactName}. Podés avisarle manualmente.\nMotivo: ${errorMsg}`;
          }
          
          // Actualizar sesión con los invitados actualizados
          if (isEditing) {
            updateSession(userPhone, 'calendar_edit_invitees_post_add', JSON.stringify({ event: eventForContext || { id: eventId }, invitees }));
          } else {
            updateSession(userPhone, 'calendar_add_invitees_confirm', JSON.stringify({ eventId, invitees }));
          }
          await msg.reply(response);
          return;
        } else {
          response = '❌ No se pudo leer el contacto. Intenta compartirlo nuevamente.\n\n💡 Asegúrate de compartir el contacto desde la lista de contactos de WhatsApp.';
          await msg.reply(response);
          return;
        }
      } catch (error) {
        console.error('[ERROR] Error procesando contacto:', error);
        console.error('[ERROR] Stack:', error.stack);
        response = '❌ Error al procesar el contacto. Por favor intenta de nuevo.\n\nSi el problema persiste, intenta agregar el invitado escribiendo el nombre manualmente.';
        await msg.reply(response);
        return;
      }
    } else {
      response = await calendarModule.handleCalendarMessage(
        msg,
        userPhone,
        userName,
        messageText,
        currentModule,
        session,
        db,
        client
      );
    }
  }
  else if (currentModule === 'expenses') {
    const pendingDebts = getUserPendingDebts(userPhone);
    const hasDebts = pendingDebts.length > 0;
    
    switch(messageText) {
      case '1':
        response = '💰 Escribe el nombre del grupo (ej: "Asado del sábado")';
        updateSession(userPhone, 'expenses_create');
        break;
      case '2': {
        const groups = getUserExpenseGroups(userPhone);
        if (!groups || groups.length === 0) {
          response = '❌ No tenés grupos activos todavía.\n\nSelecciona *1* para crear un nuevo grupo.';
        } else {
          const list = groups.map((g, i) => `${i + 1}. ${g.name} • ${g.participant_count} participante(s)`).join('\n');
          response = `📊 *Tus grupos activos*\n\n${list}\n\nEscribe el número del grupo que querés administrar, *"0"* para eliminar todos los grupos, o *"menu"* para volver.`;
          updateSession(userPhone, 'expenses_select_group', JSON.stringify({ groups }));
        }
        break;
      }
      case '3':
        if (hasDebts) {
          // Mostrar deudas pendientes
          const debtsList = pendingDebts.map((debt, i) => {
            const toAlias = getBankAliasForUser(debt.toPhone);
            const toDisplay = toAlias ? `${debt.to} (${toAlias})` : debt.to;
            return `${i + 1}. *${debt.groupName}*\n   Debes *${formatAmount(debt.amount)}* a *${toDisplay}*${debt.paidAmount ? ` (Pagado: ${formatAmount(debt.paidAmount)})` : ''}`;
          }).join('\n\n');
          
          const totalDebt = pendingDebts.reduce((sum, debt) => sum + debt.amount, 0);
          response = `💸 *Tus deudas pendientes*\n\n${debtsList}\n\n💸 *Total pendiente: ${formatAmount(totalDebt)}*\n\nEscribe el número de la deuda que querés marcar como pagada, o *"menu"* para volver.`;
          updateSession(userPhone, 'expenses_view_debts', JSON.stringify({ debts: pendingDebts }));
        } else {
          // Volver al menú principal
          response = getMainMenu(userName, userPhone);
          updateSession(userPhone, 'main');
        }
        break;
      case '4':
        if (hasDebts) {
          // Volver al menú principal (solo aparece si hay deudas)
          response = getMainMenu(userName, userPhone);
          updateSession(userPhone, 'main');
        } else {
          response = getExpensesMenu(userPhone);
        }
        break;
      default:
        response = getExpensesMenu(userPhone);
    }
  }
  else if (currentModule === 'expenses_create') {
    const result = createExpenseGroup(messageText, userPhone);
    response = `✅ Grupo "${messageText}" creado (ID: ${result.groupId}).\n\n👥 *Agregar participantes:*\n\n¿Cómo quieres agregarlos?\n\n*1* - Uno por uno (te pregunto nombre y teléfono)\n*2* - Compartir contacto 📱\n*3* - Agregar yo mismo (formato: Nombre,Teléfono)\n*4* - Listo, no agregar más`;
    updateSession(userPhone, 'expenses_add_method', JSON.stringify({ groupId: result.groupId, groupName: messageText, participants: [] }));
  }
  else if (currentModule === 'expenses_add_method') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    if (messageText === '1') {
      response = '👤 Perfecto!\n\nEscribe el *nombre* del primer participante:\n\n_Ejemplo: Juan_';
      updateSession(userPhone, 'expenses_add_name', JSON.stringify({ groupId, groupName, participants }));
    } else if (messageText === '2') {
      response = '📱 *Compartir contacto*\n\nToca el ícono de 📎 (adjuntar)\nSelecciona *"Contacto"*\nElige el contacto a agregar\n\n_También puedes escribir *"3"* para usar el formato manual_';
      updateSession(userPhone, 'expenses_waiting_contact', JSON.stringify({ groupId, groupName, participants }));
    } else if (messageText === '3') {
      response = '📝 *Agregar participantes*\n\nEnvía en formato: *Nombre,Teléfono*\n\n*Ejemplos:*\n• Juan,5492614567890\n• María,5492615123456\n\nCuando termines, escribe *"listo"*';
      updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, groupName, participants }));
    } else if (messageText === '4') {
      if (participants.length === 0) {
        response = '❌ Debes agregar al menos un participante.\n\n*1* - Agregar uno por uno\n*2* - Compartir contacto\n*3* - Agregar con formato\n*4* - Listo';
      } else {
        const listado = participants.map((p, i) => `${i+1}. ${p.name}`).join('\n');
        response = `✅ Perfecto *${userName}*!\n\nGrupo configurado con ${participants.length} participante(s):\n\n${listado}\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
      }
    } else {
      response = '❌ Opción no válida.\n\n*1* - Uno por uno\n*2* - Compartir contacto\n*3* - Formato Nombre,Teléfono\n*4* - Listo';
    }
  }
  else if (currentModule === 'expenses_waiting_contact') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    // Verificar si es un contacto compartido
    if (msgType === 'vcard') {
      try {
        // Obtener la información del vcard
        const vcardData = msg.vCards && msg.vCards.length > 0 ? msg.vCards[0] : null;
        
        if (vcardData) {
          // Parsear el vcard para extraer nombre y teléfono
          const nameMatch = vcardData.match(/FN:(.*)/);
          const telMatch = vcardData.match(/TEL[^:]*:([+\d]+)/);
          
          const contactName = nameMatch ? nameMatch[1].trim() : 'Sin nombre';
          let contactPhone = telMatch ? telMatch[1].replace(/\D/g, '') : null;
          
          if (!contactPhone) {
            response = '❌ No se pudo extraer el teléfono del contacto.\n\nIntenta compartir el contacto nuevamente o usa la opción *3* para agregar manualmente.';
          } else {
            // Limpiar y formatear teléfono
            if (!contactPhone.startsWith('549')) {
              contactPhone = '549' + contactPhone.replace(/^0+/, '');
            }
            
            // Agregar participante
            const result = addParticipant(groupId, contactPhone, contactName);
            const normalizedPhone = result.phone || normalizePhone(contactPhone);
            const existingIndex = participants.findIndex(p => normalizePhone(p.phone) === normalizedPhone);
            const finalName = contactName && contactName.trim() ? contactName.trim() : `Participante ${normalizedPhone ? normalizedPhone.slice(-4) : ''}`;

            if (existingIndex >= 0) {
              participants[existingIndex] = { name: finalName, phone: normalizedPhone };
            } else if (normalizedPhone) {
              participants.push({ name: finalName, phone: normalizedPhone });
            }
            
            response = `✅ *${finalName}* agregado correctamente!\n\n` +
              `📊 Total de participantes: ${participants.length}\n\n` +
              `¿Qué deseas hacer?\n\n` +
              `*1* - Compartir otro contacto 📱\n` +
              `*2* - Agregar manualmente\n` +
              `*3* - Terminar y continuar`;
            
            updateSession(userPhone, 'expenses_after_contact', JSON.stringify({ groupId, groupName, participants }));
          }
        } else {
          response = '❌ No se pudo leer el contacto compartido.\n\nIntenta de nuevo o usa la opción *3* para agregar manualmente.';
        }
      } catch (error) {
        console.error('Error procesando vcard:', error);
        response = '❌ Error al procesar el contacto.\n\n¿Qué deseas hacer?\n\n*1* - Intentar otro contacto\n*2* - Agregar manualmente\n*3* - Volver al menú';
      }
    } else {
      // Si escribió texto en lugar de compartir contacto
      if (messageText === '3') {
        response = '📝 *Agregar participantes manualmente*\n\nEnvía en formato: *Nombre,Teléfono*\n\n*Ejemplos:*\n• Juan,5492614567890\n• María,2615123456\n\nCuando termines, escribe *"listo"*';
        updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, groupName, participants }));
      } else {
        response = '❌ Por favor, comparte un contacto usando el ícono 📎\n\nO escribe *"3"* para usar el formato manual (Nombre,Teléfono)';
      }
    }
  }
  else if (currentModule === 'expenses_after_contact') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    if (messageText === '1') {
      response = '📱 *Compartir otro contacto*\n\nToca el ícono de 📎 (adjuntar)\nSelecciona *"Contacto"*\nElige el contacto a agregar';
      updateSession(userPhone, 'expenses_waiting_contact', JSON.stringify({ groupId, groupName, participants }));
    } else if (messageText === '2') {
      response = '📝 *Agregar manualmente*\n\nEnvía en formato: *Nombre,Teléfono*\n\n*Ejemplo:*\nJuan,5492614567890';
      updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, groupName, participants }));
    } else if (messageText === '3') {
      const listado = participants.map((p, i) => `${i+1}. ${p.name}`).join('\n');
      response = `✅ Perfecto!\n\nGrupo configurado con ${participants.length} participante(s):\n\n${listado}\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      response = '❌ Opción no válida.\n\n*1* - Compartir otro contacto\n*2* - Agregar manualmente\n*3* - Terminar';
    }
  }
  else if (currentModule === 'expenses_add_name') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    // Guardar el nombre temporalmente
    response = `👤 *${messageText}*\n\nAhora escribe el *número de teléfono*:\n\n_Ejemplo: 2615176403_\n\n_Sin espacios, sin guiones, solo números_`;
    updateSession(userPhone, 'expenses_add_phone', JSON.stringify({ groupId, groupName, participants, tempName: messageText }));
  }
  else if (currentModule === 'expenses_add_phone') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    const name = context.tempName;
    
    // Validar teléfono
    const phone = messageText.replace(/\D/g, ''); // Eliminar todo lo que no sea número
    
    if (phone.length < 10 || phone.length > 15) {
      response = '❌ Teléfono inválido. Debe tener entre 10 y 15 dígitos.\n\nIntenta de nuevo:\n_Ejemplo: 2615176403_';
    } else {
      // Agregar código de país si no lo tiene
      const fullPhone = phone.startsWith('549') ? phone : `549${phone}`;
      
      const result = addParticipant(groupId, fullPhone, name);
      const normalizedPhone = result.phone || normalizePhone(fullPhone);
      const finalName = name && name.trim() ? name.trim() : `Participante ${normalizedPhone ? normalizedPhone.slice(-4) : ''}`;
      const existingIndex = participants.findIndex(p => normalizePhone(p.phone) === normalizedPhone);

      if (existingIndex >= 0) {
        participants[existingIndex] = { name: finalName, phone: normalizedPhone };
      } else if (normalizedPhone) {
        participants.push({ name: finalName, phone: normalizedPhone });
      }
      
      response = `✅ *${finalName}* agregado correctamente!\n\n` +
        `📊 Total de participantes: ${participants.length}\n\n` +
        `¿Qué deseas hacer?\n\n` +
        `*1* - Agregar otro participante\n` +
        `*2* - Terminar y continuar`;
      updateSession(userPhone, 'expenses_after_add', JSON.stringify({ groupId, groupName, participants }));
    }
  }
  else if (currentModule === 'expenses_after_add') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    if (messageText === '1') {
      response = '👤 Escribe el *nombre* del siguiente participante:';
      updateSession(userPhone, 'expenses_add_name', JSON.stringify({ groupId, groupName, participants }));
    } else if (messageText === '2') {
      const listado = participants.map((p, i) => `${i+1}. ${p.name}`).join('\n');
      response = `✅ Perfecto!\n\nGrupo configurado con ${participants.length} participante(s):\n\n${listado}\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      response = '❌ Opción no válida.\n\n*1* - Agregar otro participante\n*2* - Terminar';
    }
  }
  else if (currentModule === 'expenses_add_participants') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    if (messageText.toLowerCase() === 'listo') {
      if (participants.length === 0) {
        response = '❌ Necesitas agregar al menos un participante.\n\nEnvía *Nombre,Teléfono* o escribe *"cancelar"* para volver.';
      } else {
        const listado = participants.map((p, i) => `${i+1}. ${p.name}`).join('\n');
        response = `✅ Participantes agregados:\n\n${listado}\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
      }
    } else if (messageText.toLowerCase() === 'cancelar') {
      response = getExpensesMenu(userPhone);
      updateSession(userPhone, 'expenses');
    } else {
      // Parsear participante: Nombre,Teléfono
      const parts = messageText.split(',').map(p => p.trim());
      if (parts.length === 2) {
        const [name, phone] = parts;
        const cleanPhone = phone.replace(/\D/g, '');
        // Validar formato de teléfono básico
        if (cleanPhone.match(/^\d{10,15}$/)) {
          const fullPhone = cleanPhone.startsWith('549') ? cleanPhone : `549${cleanPhone}`;
          const result = addParticipant(groupId, fullPhone, name);
          const normalizedPhone = result.phone || normalizePhone(fullPhone);
          const finalName = name && name.trim() ? name.trim() : `Participante ${normalizedPhone ? normalizedPhone.slice(-4) : ''}`;
          const existingIndex = participants.findIndex(p => normalizePhone(p.phone) === normalizedPhone);
          
          if (existingIndex >= 0) {
            participants[existingIndex] = { name: finalName, phone: normalizedPhone };
          } else if (normalizedPhone) {
            participants.push({ name: finalName, phone: normalizedPhone });
          }

          response = `✅ *${finalName}* agregado (${participants.length} participante(s))\n\nAgrega otro o escribe *"listo"* para continuar.`;
          updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, groupName, participants }));
        } else {
          response = '❌ Teléfono inválido. Debe tener 10-15 dígitos.\n\nEjemplo: María,5492615123456';
        }
      } else {
        response = '❌ Formato incorrecto.\n\nUsa: *Nombre,Teléfono*\nEjemplo: Juan,5492614567890\n\nO escribe *"listo"* para continuar.';
      }
    }
  }
  else if (currentModule === 'expenses_manage') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    
    switch(messageText) {
      case '1':
        response = '💵 *Agregar gasto*\n\nEnvía en este formato:\nMonto | Descripción | Quién pagó\n\n*Ejemplo:*\n5000 | Carne | Juan\n\n_El monto debe ser solo números (sin $ ni puntos)_';
        updateSession(userPhone, 'expenses_add_expense', JSON.stringify({ groupId, groupName }));
        break;
      case '2': {
        const summary = await getExpenseSummary(groupId);
        if (summary.expenses.length === 0) {
          response = '📋 No hay gastos registrados todavía.\n\nSelecciona *1* para agregar el primer gasto.';
        } else {
          response = `📋 *Resumen del grupo*\n\n` +
            `💰 *Total gastado:* ${summary.total}\n` +
            `👥 *Participantes:* ${summary.participantCount}\n` +
            `📊 *Por persona:* ${summary.perPerson}\n\n` +
            `*Gastos registrados:*\n\n` +
            summary.expenses.map((e, i) => 
              `${i+1}. ${formatAmount(e.amount)} - ${e.description}\n   💳 Pagó: ${e.payer_name || 'N/A'}`
            ).join('\n\n');
          
          const payments = getPaymentsByGroup(groupId);
          if (payments.length > 0) {
            response += `\n\n💵 *Pagos realizados:* ${payments.length}\n` +
              `_Usa la opción 6 para ver detalles de los pagos._`;
          }
          
          response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        }
        break;
      }
      case '3': {
        const split = calculateSplit(groupId);
        const payments = getPaymentsByGroup(groupId);
        
        if (split.transactions.length === 0) {
          response = '✅ *¡Todo pagado!*\n\nNo hay deudas pendientes. Todos están al día.';
        } else {
          response = `💸 *División de gastos*\n\n` +
            `💰 Total: ${formatAmount(split.total)}\n` +
            `👥 Por persona: ${formatAmount(split.perPerson)}\n\n` +
            `*Transferencias a realizar:*\n\n` +
            split.transactions.map((t, i) => {
              // Obtener alias bancario del receptor (a quien se le debe pagar)
              // Normalizar el teléfono explícitamente para asegurar la búsqueda correcta
              const normalizedToPhone = normalizePhone(t.toPhone);
              const toAlias = getBankAliasForUser(normalizedToPhone);
              const toDisplay = toAlias ? `${t.to} (${toAlias})` : t.to;
              return `${i+1}. *${t.from}* → *${formatAmount(t.amount)}* → *${toDisplay}*`;
            }).join('\n\n');
          
          if (payments.length > 0) {
            response += `\n\n💵 *Pagos realizados:* ${payments.length}\n` +
              `_Los pagos ya están considerados en el cálculo anterior._`;
          }
          
          response += '\n\n_Estas transferencias minimizan la cantidad de pagos necesarios._';
        }
        response += `\n\n${buildExpensesManageMenu(groupName, userPhone)}`;
        break;
      }
      case '4': {
        const participants = getGroupParticipants(groupId);
        if (participants.length === 0) {
          response = '❌ El grupo no tiene participantes cargados.';
          response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        } else {
          const list = participants.map((p, i) => `${i + 1}. ${p.name} (${p.phone})`).join('\n');
          response = `👥 *Participantes del grupo*\n\n${list}\n\nEscribe el número del participante que querés quitar o *0* para cancelar.`;
          updateSession(userPhone, 'expenses_manage_participants', JSON.stringify({ groupId, groupName, participants }));
        }
        break;
      }
      case '5': {
        // Avisar pago - Marcar gastos como pagados
        const summary = await getExpenseSummary(groupId);
        const unpaidExpenses = summary.expenses.filter(e => !e.is_paid);
        
        if (unpaidExpenses.length === 0) {
          response = '✅ *¡Todo pagado!*\n\nNo hay gastos pendientes de pago.';
          response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        } else {
          // Mostrar gastos pendientes para que el usuario seleccione cuál marcar como pagado
          const expensesList = unpaidExpenses.map((e, i) => {
            return `${i + 1}. ${formatAmount(e.amount)} ${e.currency || 'ARS'} - ${e.description}\n   💳 Pagó: ${e.payer_name || 'N/A'}`;
          }).join('\n\n');
          
          response = `💵 *Avisar pago realizado*\n\n` +
            `*Gastos pendientes:*\n\n${expensesList}\n\n` +
            `Escribe el número del gasto que querés marcar como pagado, o *0* para cancelar.`;
          updateSession(userPhone, 'expenses_notify_payment', JSON.stringify({ groupId, groupName, expenses: unpaidExpenses }));
        }
        break;
      }
      case '6': {
        // Ver gastos pagados y pendientes
        const summary = await getExpenseSummary(groupId);
        const paidExpenses = summary.expenses.filter(e => e.is_paid);
        const unpaidExpenses = summary.expenses.filter(e => !e.is_paid);
        
        if (paidExpenses.length === 0 && unpaidExpenses.length === 0) {
          response = '📋 No hay gastos registrados todavía.';
        } else {
          response = `💵 *Estado de Gastos*\n\n`;
          
          if (unpaidExpenses.length > 0) {
            response += `⏳ *Gastos pendientes (${unpaidExpenses.length}):*\n\n`;
            unpaidExpenses.forEach((e, i) => {
              response += `${i + 1}. ${formatAmount(e.amount)} ${e.currency || 'ARS'} - ${e.description}\n`;
              response += `   💳 Pagó: ${e.payer_name || 'N/A'}\n\n`;
            });
          }
          
          if (paidExpenses.length > 0) {
            response += `\n✅ *Gastos pagados (${paidExpenses.length}):*\n\n`;
            paidExpenses.forEach((e, i) => {
              response += `${i + 1}. ${formatAmount(e.amount)} ${e.currency || 'ARS'} - ${e.description}\n`;
              response += `   💳 Pagó: ${e.payer_name || 'N/A'}\n`;
              response += `   ✅ Marcado como pagado por: ${e.paid_by || 'N/A'}\n`;
              if (e.paid_at) {
                response += `   📅 Fecha: ${new Date(e.paid_at).toLocaleDateString('es-AR')}\n`;
              }
              response += `\n`;
            });
          }
        }
        response += `\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        break;
      }
      case '7': {
        // Gestionar cuentas bancarias
        const accounts = getUserBankAccounts(userPhone);
        if (accounts.length === 0) {
          response = `💳 *Agregar cuenta bancaria*\n\n` +
            `Escribe el *alias* de tu cuenta bancaria.\n\n` +
            `*Ejemplo:*\n` +
            `mi.cuenta.alias\n` +
            `o\n` +
            `MI.CUENTA.ALIAS\n\n` +
            `_El alias es suficiente para recibir transferencias._\n\n` +
            `O escribe *cancelar* para volver.`;
          updateSession(userPhone, 'expenses_add_bank_account', JSON.stringify({ groupId, groupName }));
        } else {
          // Mostrar cuentas existentes (solo alias)
          const accountsList = accounts.map((a, i) => 
            `${i + 1}. *${a.alias || 'Sin alias'}*${a.is_default ? ' ⭐ (Por defecto)' : ''}`
          ).join('\n');
          
          response = `💳 *Mis cuentas bancarias*\n\n${accountsList}\n\n` +
            `*Opciones:*\n` +
            `• Escribe el número de la cuenta para gestionarla\n` +
            `• Escribe *agregar* para agregar una nueva cuenta\n` +
            `• Escribe *cancelar* para volver`;
          updateSession(userPhone, 'expenses_manage_bank_accounts', JSON.stringify({ groupId, groupName, accounts }));
        }
        break;
      }
      case '8': {
        // Cerrar o reabrir grupo
        const group = db.prepare('SELECT is_closed FROM expense_groups WHERE id = ?').get(groupId);
        const isClosed = group && group.is_closed === 1;
        
        if (isClosed) {
          // Reabrir grupo
          db.prepare('UPDATE expense_groups SET is_closed = 0, closed_at = NULL WHERE id = ?').run(groupId);
          response = `✅ *Grupo reabierto*\n\nEl grupo "${groupName}" ha sido reabierto. Ahora podés agregar nuevos gastos y pagos.\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        } else {
          // Cerrar grupo
          response = `🔒 *Cerrar grupo*\n\n¿Querés cerrar el grupo "${groupName}"?\n\nUn grupo cerrado:\n• No permite agregar nuevos gastos\n• No permite agregar nuevos pagos\n• Mantiene el historial completo\n• Puede ser reabierto en cualquier momento\n\n1️⃣ Sí, cerrar grupo\n2️⃣ No, volver`;
          updateSession(userPhone, 'expenses_close_confirm', JSON.stringify({ groupId, groupName }));
        }
        break;
      }
      case '9': {
        // Compartir grupo en WhatsApp
        const shareResult = await shareExpenseGroupInWhatsApp(client, groupId, userPhone);
        response = shareResult.message;
        if (!shareResult.error) {
          response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        } else {
          response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        }
        break;
      }
      case '10':
      case '🔟': {
        // Exportar resumen a PDF
        const pdfResult = await exportExpenseGroupToPDF(groupId, userPhone);
        if (pdfResult.success) {
          try {
            const userChatId = `${normalizePhone(userPhone)}@c.us`;
            await client.sendMessage(userChatId, {
              document: pdfResult.filePath,
              mimetype: 'application/pdf',
              filename: pdfResult.fileName
            });
            response = `✅ *Resumen exportado*\n\nEl PDF del grupo "${groupName}" fue enviado a tu chat privado.`;
          } catch (error) {
            console.error('[ERROR] Error enviando PDF:', error);
            response = `❌ Error al enviar el PDF: ${error.message}`;
          }
        } else {
          response = `❌ ${pdfResult.error}`;
        }
        response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        break;
      }
      case '11':
      case '1️⃣1️⃣':
        response = `⚠️ *Eliminar grupo*\n\n¿Seguro que querés eliminar "${groupName}"? Esta acción no se puede deshacer.\n\n1️⃣ Sí, eliminar\n2️⃣ No, volver`;
        updateSession(userPhone, 'expenses_delete_confirm', JSON.stringify({ groupId, groupName }));
        break;
      case '12':
      case '1️⃣2️⃣':
        response = getExpensesMenu(userPhone);
        updateSession(userPhone, 'expenses');
        break;
      default:
        response = buildExpensesManageMenu(groupName, userPhone, groupId);
    }
  }
  else if (currentModule === 'expenses_add_expense') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    
    // Parsear: Monto | Descripción | Quién pagó
    const parts = messageText.split('|').map(p => p.trim());
    if (parts.length === 3) {
      const [amountStr, description, payerName] = parts;
      const amount = parseFloat(amountStr);
      
      if (isNaN(amount) || amount <= 0) {
        response = '❌ Monto inválido. Debe ser un número mayor a 0.\n\nEjemplo: 5000 | Carne | Juan';
      } else {
        // Buscar teléfono del pagador por nombre
        const participant = db.prepare(`
          SELECT phone FROM group_participants 
          WHERE group_id = ? AND LOWER(name) = LOWER(?)
        `).get(groupId, payerName);
        
        if (!participant) {
          response = `❌ "${payerName}" no está en el grupo.\n\nParticipantes actuales:\n` +
            db.prepare('SELECT name FROM group_participants WHERE group_id = ?')
              .all(groupId)
              .map((p, i) => `${i+1}. ${p.name}`)
              .join('\n');
        } else {
          addExpense(groupId, participant.phone, amount, description);
          response = `✅ Gasto agregado:\n\n💵 ${amount}\n📝 ${description}\n💳 Pagado por: ${payerName}\n\n¿Agregar otro gasto?\n\nEnvía: Monto | Descripción | Quién pagó\nO escribe *"ver"* para ver el resumen`;
        }
      }
    } else if (messageText.toLowerCase() === 'ver') {
      response = `${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      response = '❌ Formato incorrecto.\n\nUsa: *Monto | Descripción | Quién pagó*\n\nEjemplo:\n3500 | Bebidas | María';
    }
  }
  else if (currentModule === 'ai') {
    // Trackear uso de IA
    try {
      statsModule.trackAIMessage(db, userPhone, {
        messageLength: messageText.length,
        hasContext: !!(session?.context)
      });
    } catch (error) {
      console.error('[ERROR] Error trackeando mensaje de IA:', error.message);
    }
    response = await processWithAI(messageText, userPhone);
  }
  else if (currentModule === 'expenses_select_group') {
    const context = JSON.parse(session.context || '{}');
    const groups = context.groups || [];

    if (['menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      response = getExpensesMenu();
      updateSession(userPhone, 'expenses');
    } else if (messageText === '0' || messageText.toLowerCase() === 'eliminar todos') {
      // Pedir confirmación para eliminar todos los grupos
      const groupNamesList = groups.map((g, i) => `${i + 1}. ${g.name}`).join('\n');
      response = `⚠️ *¿Estás seguro que querés eliminar todos los grupos activos?*\n\n` +
        `📊 *Grupos que se eliminarán:*\n\n${groupNamesList}\n\n` +
        `⚠️ *Esta acción no se puede deshacer.*\n\n` +
        `*1* - Sí, eliminar todos los grupos\n` +
        `*2* - No, cancelar`;
      updateSession(userPhone, 'expenses_delete_all_confirm', JSON.stringify({ groups }));
    } else {
      const index = parseInt(messageText, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= groups.length) {
        response = '❌ Opción inválida. Escribe el número del grupo que querés administrar, *"0"* para eliminar todos, o *"menu"* para volver.';
      } else {
        const selected = groups[index];
        const groupName = getExpenseGroupName(selected.id);
        response = buildExpensesManageMenu(groupName, userPhone, selected.id);
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId: selected.id, groupName }));
      }
    }
  }
  else if (currentModule === 'expenses_delete_all_confirm') {
    if (messageText === '1') {
      // Eliminar todos los grupos activos
      const result = await deleteAllExpenseGroups(userPhone, client);
      if (result.success) {
        response = `🗑️ *Todos los grupos eliminados*\n\n✅ Se eliminaron ${result.count} grupo(s) correctamente:\n\n`;
        if (result.groupNames && result.groupNames.length > 0) {
          response += result.groupNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
        }
        response += `\n\n📊 Los participantes fueron notificados de la eliminación.`;
      } else {
        response = `❌ ${result.message}`;
      }
      response += `\n\n${getExpensesMenu(userPhone)}`;
      updateSession(userPhone, 'expenses');
    } else if (messageText === '2' || ['menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      // Cancelar eliminación
      const groups = getUserExpenseGroups(userPhone);
      if (!groups || groups.length === 0) {
        response = getExpensesMenu(userPhone);
        updateSession(userPhone, 'expenses');
      } else {
        const list = groups.map((g, i) => `${i + 1}. ${g.name} • ${g.participant_count} participante(s)`).join('\n');
        response = `📊 *Tus grupos activos*\n\n${list}\n\nEscribe el número del grupo que querés administrar, *"0"* para eliminar todos los grupos, o *"menu"* para volver.`;
        updateSession(userPhone, 'expenses_select_group', JSON.stringify({ groups }));
      }
    } else {
      response = '❌ Opción inválida. Responde con *1* para eliminar todos los grupos o *2* para cancelar.';
    }
  }
  else if (currentModule === 'expenses_manage_participants') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    if (['0', 'menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      response = buildExpensesManageMenu(groupName, userPhone, groupId);
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      const index = parseInt(messageText, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= participants.length) {
        response = '❌ Opción inválida. Escribe el número del participante que querés quitar o *0* para cancelar.';
      } else {
        const participant = participants[index];
        const removal = removeGroupParticipant(groupId, participant.id);
        if (!removal.success) {
          response = `❌ ${removal.message}`;
          response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
          updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
        } else {
          const updatedParticipants = getGroupParticipants(groupId);
          if (updatedParticipants.length === 0) {
            response = '✅ Participante eliminado. El grupo quedó sin participantes.';
            response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
            updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
          } else {
            const list = updatedParticipants.map((p, i) => `${i + 1}. ${p.name} (${p.phone})`).join('\n');
            response = `✅ Participante eliminado.

👥 *Participantes restantes:*

${list}

Escribe otro número para quitar otro participante o *0* para volver.`;
            updateSession(userPhone, 'expenses_manage_participants', JSON.stringify({ groupId, groupName, participants: updatedParticipants }));
          }
        }
      }
    }
  }
  else if (currentModule === 'expenses_close_confirm') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    
    if (messageText === '1' || messageText === '1️⃣') {
      // Cerrar el grupo
      db.prepare('UPDATE expense_groups SET is_closed = 1, closed_at = CURRENT_TIMESTAMP WHERE id = ?').run(groupId);
      response = `🔒 *Grupo cerrado*\n\nEl grupo "${groupName}" ha sido cerrado.\n\n• No se pueden agregar nuevos gastos\n• No se pueden agregar nuevos pagos\n• El historial se mantiene intacto\n• Podés reabrirlo en cualquier momento desde el menú\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else if (messageText === '2' || messageText === '2️⃣' || ['menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      response = buildExpensesManageMenu(groupName, userPhone, groupId);
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      response = '❌ Opción inválida. Responde con 1 para cerrar el grupo o 2 para cancelar.';
    }
  }
  else if (currentModule === 'expenses_delete_confirm') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    
    if (messageText === '1') {
      const result = await deleteExpenseGroup(groupId, userPhone, client);
      if (result.success) {
        response = `🗑️ *Grupo eliminado*\n\n"${groupName}" fue eliminado correctamente.\n\n📊 Los participantes fueron notificados de la eliminación.`;
      } else {
        response = `❌ ${result.message}`;
      }
      response += `\n\n${getExpensesMenu(userPhone)}`;
      updateSession(userPhone, 'expenses');
    } else if (messageText === '2' || ['menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      response = buildExpensesManageMenu(groupName, userPhone, groupId);
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      response = '❌ Opción inválida. Responde con 1 para eliminar el grupo o 2 para cancelar.';
    }
  }
  else if (currentModule === 'expenses_view_debts') {
    // Manejar selección de deuda para marcar como pagada
    const context = JSON.parse(session.context || '{}');
    const debts = context.debts || [];
    
    if (messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'menú' || messageText.toLowerCase() === 'volver') {
      response = getExpensesMenu(userPhone);
      updateSession(userPhone, 'expenses');
    } else {
      const debtIndex = parseInt(messageText) - 1;
      
      if (isNaN(debtIndex) || debtIndex < 0 || debtIndex >= debts.length) {
        response = `❌ Número inválido. Escribe un número del 1 al ${debts.length}, o *"menu"* para volver.`;
      } else {
        const selectedDebt = debts[debtIndex];
        
        // Marcar la deuda como pagada usando addPayment
        const result = addPayment(
          selectedDebt.groupId,
          userPhone,
          selectedDebt.toPhone,
          selectedDebt.amount,
          'Manual', // payment_method
          null, // bank_account_id
          `Deuda marcada como pagada desde el menú de deudas pendientes` // notes
        );
        
        if (result.success) {
          const toAlias = getBankAliasForUser(selectedDebt.toPhone);
          const toDisplay = toAlias ? `${selectedDebt.to} (${toAlias})` : selectedDebt.to;
          
          response = `✅ *Deuda marcada como pagada*\n\n`;
          response += `Grupo: *${selectedDebt.groupName}*\n`;
          response += `Monto: *${formatAmount(selectedDebt.amount)}*\n`;
          response += `A: *${toDisplay}*\n\n`;
          response += `La deuda ha sido registrada como pagada.\n\n`;
          
          // Obtener las deudas restantes
          const remainingDebts = getUserPendingDebts(userPhone);
          if (remainingDebts.length === 0) {
            response += `🎉 *¡Excelente! No tienes más deudas pendientes.*\n\n`;
            response += getExpensesMenu(userPhone);
            updateSession(userPhone, 'expenses');
          } else {
            response += `📊 *Tus deudas pendientes restantes:*\n\n`;
            const debtsList = remainingDebts.map((debt, i) => {
              const toAlias = getBankAliasForUser(debt.toPhone);
              const toDisplay = toAlias ? `${debt.to} (${toAlias})` : debt.to;
              return `${i + 1}. *${debt.groupName}*\n   Debes *${formatAmount(debt.amount)}* a *${toDisplay}*${debt.paidAmount ? ` (Pagado: ${formatAmount(debt.paidAmount)})` : ''}`;
            }).join('\n\n');
            
            const totalDebt = remainingDebts.reduce((sum, debt) => sum + debt.amount, 0);
            response += `${debtsList}\n\n💸 *Total pendiente: ${formatAmount(totalDebt)}*\n\n`;
            response += `Escribe el número de otra deuda para marcarla como pagada, o *"menu"* para volver.`;
            updateSession(userPhone, 'expenses_view_debts', JSON.stringify({ debts: remainingDebts }));
          }
        } else {
          response = `❌ Error al marcar la deuda como pagada: ${result.error || 'Error desconocido'}\n\n`;
          response += `Intenta nuevamente o escribe *"menu"* para volver.`;
        }
      }
    }
  }
  else if (currentModule === 'expenses_add_bank_account') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    
    if (messageText.toLowerCase() === 'cancelar') {
      response = buildExpensesManageMenu(groupName, userPhone, groupId);
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      // Solo se requiere el alias
      const alias = messageText.trim();
      
      if (!alias || alias.length < 3) {
        response = '❌ El alias debe tener al menos 3 caracteres.\n\n' +
          `Escribe el *alias* de tu cuenta bancaria.\n\n` +
          `*Ejemplo:*\n` +
          `mi.cuenta.alias\n\n` +
          `O escribe *cancelar* para volver.`;
      } else {
        const result = addBankAccount(userPhone, alias);
        
        if (result.success) {
          response = `✅ *Cuenta bancaria agregada*\n\n` +
            `📝 Alias: *${alias}*\n\n` +
            `⭐ Esta cuenta quedó configurada como cuenta por defecto.`;
        } else {
          response = `❌ No se pudo agregar la cuenta: ${result.error}\n\n` +
            `Intenta con otro alias o escribe *cancelar* para volver.`;
        }
        
        if (result.success) {
          response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
          updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
        }
      }
    }
  }
  else if (currentModule === 'expenses_manage_bank_accounts') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const accounts = context.accounts || [];
    
    if (messageText.toLowerCase() === 'cancelar') {
      response = buildExpensesManageMenu(groupName, userPhone, groupId);
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else if (messageText.toLowerCase() === 'agregar') {
      response = `💳 *Agregar cuenta bancaria*\n\n` +
        `Escribe el *alias* de tu cuenta bancaria.\n\n` +
        `*Ejemplo:*\n` +
        `mi.cuenta.alias\n\n` +
        `_El alias es suficiente para recibir transferencias._\n\n` +
        `O escribe *cancelar* para volver.`;
      updateSession(userPhone, 'expenses_add_bank_account', JSON.stringify({ groupId, groupName }));
    } else {
      const accountIndex = parseInt(messageText, 10) - 1;
      if (Number.isNaN(accountIndex) || accountIndex < 0 || accountIndex >= accounts.length) {
        response = '❌ Opción inválida. Escribe el número de la cuenta, *agregar* para agregar una nueva, o *cancelar* para volver.';
      } else {
        const account = accounts[accountIndex];
        response = `💳 *Cuenta bancaria*\n\n` +
          `📝 Alias: *${account.alias || 'Sin alias'}*\n` +
          (account.is_default ? `⭐ Cuenta por defecto\n` : '') +
          `\n*Opciones:*\n` +
          `• Escribe *eliminar* para eliminar esta cuenta\n` +
          (account.is_default ? '' : `• Escribe *default* para marcar como cuenta por defecto\n`) +
          `• Escribe *cancelar* para volver`;
        updateSession(userPhone, 'expenses_manage_bank_account_detail', JSON.stringify({ groupId, groupName, accountId: account.id }));
      }
    }
  }
  else if (currentModule === 'expenses_manage_bank_account_detail') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const accountId = context.accountId;
    
    if (messageText.toLowerCase() === 'cancelar') {
      const accounts = getUserBankAccounts(userPhone);
      const accountsList = accounts.map((a, i) => 
        `${i + 1}. *${a.alias || 'Sin alias'}*${a.is_default ? ' ⭐ (Por defecto)' : ''}`
      ).join('\n');
      
      response = `💳 *Mis cuentas bancarias*\n\n${accountsList}\n\n` +
        `*Opciones:*\n` +
        `• Escribe el número de la cuenta para gestionarla\n` +
        `• Escribe *agregar* para agregar una nueva cuenta\n` +
        `• Escribe *cancelar* para volver`;
      updateSession(userPhone, 'expenses_manage_bank_accounts', JSON.stringify({ groupId, groupName, accounts }));
    } else if (messageText.toLowerCase() === 'eliminar') {
      const result = deleteBankAccount(accountId, userPhone);
      if (result.success) {
        response = `✅ *Cuenta eliminada*\n\nLa cuenta ha sido eliminada exitosamente.`;
      } else {
        response = `❌ No se pudo eliminar la cuenta: ${result.error}`;
      }
      
      const accounts = getUserBankAccounts(userPhone);
      if (accounts.length === 0) {
        response += `\n\n${buildExpensesManageMenu(groupName, userPhone)}`;
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
      } else {
        const accountsList = accounts.map((a, i) => 
          `${i + 1}. *${a.alias || 'Sin alias'}*${a.is_default ? ' ⭐ (Por defecto)' : ''}`
        ).join('\n');
        
        response += `\n\n💳 *Mis cuentas bancarias*\n\n${accountsList}\n\n` +
          `*Opciones:*\n` +
          `• Escribe el número de la cuenta para gestionarla\n` +
          `• Escribe *agregar* para agregar una nueva cuenta\n` +
          `• Escribe *cancelar* para volver`;
        updateSession(userPhone, 'expenses_manage_bank_accounts', JSON.stringify({ groupId, groupName, accounts }));
      }
    } else if (messageText.toLowerCase() === 'default') {
      const result = setDefaultBankAccount(accountId, userPhone);
      if (result.success) {
        response = `✅ *Cuenta por defecto configurada*\n\nEsta cuenta quedó configurada como cuenta por defecto para pagos.`;
      } else {
        response = `❌ No se pudo configurar la cuenta por defecto: ${result.error}`;
      }
      
      const accounts = getUserBankAccounts(userPhone);
      const accountsList = accounts.map((a, i) => 
        `${i + 1}. *${a.alias || 'Sin alias'}*${a.is_default ? ' ⭐ (Por defecto)' : ''}`
      ).join('\n');
      
      response += `\n\n💳 *Mis cuentas bancarias*\n\n${accountsList}\n\n` +
        `*Opciones:*\n` +
        `• Escribe el número de la cuenta para gestionarla\n` +
        `• Escribe *agregar* para agregar una nueva cuenta\n` +
        `• Escribe *cancelar* para volver`;
      updateSession(userPhone, 'expenses_manage_bank_accounts', JSON.stringify({ groupId, groupName, accounts }));
    } else {
      response = '❌ Opción inválida. Escribe *eliminar*, *default*, o *cancelar*.';
    }
  }
  else if (currentModule === 'expenses_notify_payment') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const expenses = context.expenses || [];
    
    if (messageText === '0' || messageText.toLowerCase() === 'cancelar') {
      response = buildExpensesManageMenu(groupName, userPhone, groupId);
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      const expenseIndex = parseInt(messageText, 10) - 1;
      if (Number.isNaN(expenseIndex) || expenseIndex < 0 || expenseIndex >= expenses.length) {
        response = '❌ Opción inválida. Escribe el número del gasto que querés marcar como pagado o *0* para cancelar.';
      } else {
        const expense = expenses[expenseIndex];
        
        // Marcar el gasto como pagado
        const user = db.prepare('SELECT name FROM users WHERE phone = ?').get(userPhone);
        const userName = user?.name || 'Usuario';
        
        db.prepare(`
          UPDATE expenses 
          SET is_paid = 1, paid_at = CURRENT_TIMESTAMP, paid_by = ?
          WHERE id = ?
        `).run(userName, expense.id);
        
        response = `✅ *Gasto marcado como pagado*\n\n` +
          `💵 ${formatAmount(expense.amount)} ${expense.currency || 'ARS'} - ${expense.description}\n` +
          `💳 Pagó: ${expense.payer_name || 'N/A'}\n` +
          `✅ Marcado como pagado por: ${userName}\n\n` +
          `⚠️ *Nota:* Este aviso es solo de referencia. El gasto seguirá siendo considerado en el cálculo de deudas.\n\n` +
          `_El cálculo de deudas se mantiene igual para que el usuario que pagó pueda cobrar su parte._`;
        
        response += `\n\n${buildExpensesManageMenu(groupName, userPhone, groupId)}`;
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
      }
    }
  }

  // Validar respuesta antes de enviar
  if (!response || response.trim() === '') {
    console.error(`❌ ERROR: Respuesta vacía para módulo: ${currentModule}, mensaje: ${messageText}`);
    console.error(`❌ Stack trace:`, new Error().stack);
    response = '❌ No se pudo procesar tu solicitud. Por favor intenta de nuevo o escribe *"menu"* para volver al inicio.';
  }

  // Verificar que response sea string
  if (typeof response !== 'string') {
    console.error(`❌ ERROR: Respuesta no es string, tipo: ${typeof response}`);
    response = String(response) || '❌ Error al procesar la respuesta.';
  }

  // Log antes de enviar
  console.log(`\n📤 Enviando respuesta (${response.length} caracteres):`);
  console.log(`   Módulo: ${currentModule}`);
  console.log(`   Mensaje recibido: ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`);
  console.log(`   Respuesta: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}\n`);

  try {
  await msg.reply(response);
    console.log(`✅ Respuesta enviada exitosamente\n`);
  } catch (error) {
    console.error(`❌ ERROR al enviar respuesta:`, error);
    console.error(`❌ Error details:`, {
      message: error.message,
      stack: error.stack
    });
  }
}

async function extractContactFromSharedContact(msg) {
  let vcardData = null;

  if (msg.vCards && msg.vCards.length > 0) {
    vcardData = Array.isArray(msg.vCards[0]) ? msg.vCards[0].join('\n') : msg.vCards[0];
  } else if (msg.body && msg.body.includes('BEGIN:VCARD')) {
    vcardData = msg.body;
  } else if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      if (media && media.data) {
        vcardData = Buffer.from(media.data, 'base64').toString('utf-8');
      }
    } catch (error) {
      console.error('[ERROR] extractContactFromSharedContact - descarga fallida:', error.message);
    }
  }

  if (!vcardData) {
    return null;
  }

  const nameMatch = vcardData.match(/FN[^:]*:(.*)/i) || vcardData.match(/N[^:]*:([^;]+)/i);
  const telMatches = vcardData.match(/TEL[^:]*:([+\d\s\-\(\)]+)/gi);
  let contactPhone = null;

  if (telMatches && telMatches.length > 0) {
    contactPhone = telMatches[0].replace(/TEL[^:]*:/i, '').replace(/\D/g, '');
  }

  const contactName = nameMatch ? nameMatch[1].trim().replace(/;+/g, ' ').replace(/\s+/g, ' ') : 'Tu amigo';

  return {
    name: contactName || 'Tu amigo',
    phone: contactPhone
  };
}

async function sendFriendInviteMessage(client, inviterName, inviterPhone, friendName, friendPhone) {
  if (!client || !friendPhone) {
    return { success: false, error: 'Teléfono del invitado no disponible' };
  }

  const digitsFriend = friendPhone.replace(/\D/g, '');
  if (!digitsFriend || digitsFriend.length < 8) {
    return { success: false, error: 'Número inválido' };
  }

  const digitsInviter = (inviterPhone || '').replace(/\D/g, '');
  if (digitsInviter && digitsInviter === digitsFriend) {
    return { success: false, error: 'No podés invitarte a vos mismo 😉' };
  }

  try {
    const chatId = `${digitsFriend}@c.us`;
    const numberId = await client.getNumberId(chatId);

    if (!numberId) {
      return { success: false, error: 'El número no está registrado en WhatsApp' };
    }

    const safeInviterName = inviterName || 'Un amigo';
    const safeFriendName = friendName && friendName.trim() ? friendName.trim() : 'amigo';

    const message = `👋 ¡Hola *${safeFriendName}*!\n\n*${safeInviterName}* te invitó a usar *Milo*, tu asistente personal en WhatsApp.\n\nCon Milo podés:\n• 📅 Crear eventos y recordatorios\n• 💰 Dividir gastos con tus contactos\n• 🌤️ Consultar el pronóstico del tiempo\n• 🏫 Te resumo todo lo que pasa en Classroom 😉\n• 🤖 Chatear con un asistente IA y mucho más\n\n📌 Guardame como *"Milo 💬"* y escribí *hola* o *menu* cuando quieras empezar.`;

    const targetId = numberId._serialized || chatId;
    await client.sendMessage(targetId, message);
    console.log(`✅ Invitación enviada a ${safeFriendName} (${digitsFriend}) por ${safeInviterName} (${digitsInviter})`);
    
    // Trackear invitación enviada
    try {
      statsModule.trackInviteSent(db, inviterPhone, {
        friendName: safeFriendName,
        friendPhone: digitsFriend,
        method: 'manual'
      });
    } catch (error) {
      console.error('[ERROR] Error trackeando invitación:', error.message);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[ERROR] No se pudo enviar invitación:', error);
    return { success: false, error: error.message || 'Error enviando la invitación' };
  }
}

// ============================================
// INICIALIZAR CLIENTE DE WHATSAPP
// ============================================

let botWid = null;
let botPhoneNormalized = null;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'bot-asistente'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// Evento: QR Code
client.on('qr', (qr) => {
  console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n👆 Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo\n');
});

// Evento: Conectado
client.on('ready', () => {
  botWid = client?.info?.wid?._serialized || null;
  botPhoneNormalized = normalizePhone(client?.info?.wid?.user || botWid);
  console.log('\n✅ ¡BOT CONECTADO A WHATSAPP!\n');
  console.log('💬 El bot está listo para recibir mensajes\n');
  console.log('📋 Para probar, envía "hola" desde otro teléfono\n');
  console.log('👥 También puedes agregar el bot a un grupo para dividir gastos\n');
});

// Evento: Bot agregado a un grupo
client.on('group_join', async (notification) => {
  try {
    const recipientIds = notification?.recipientIds || [];
    const chatId = notification?.chatId;

    const botAdded = botWid && recipientIds.includes(botWid);

    if (botAdded && chatId) {
      const groupChat = await client.getChatById(chatId);
      const groupName = groupChat?.name || 'este grupo';
      const groupId = chatId;

      console.log(`[DEBUG] Bot agregado al grupo: ${groupName} (${groupId})`);

      // Asegurar que el grupo esté en la tabla de usuarios
      ensureGroupInUsersTable(groupId, groupName);

      // Verificar si ya existe un grupo de gastos activo para este chat
      let existingGroup = getActiveExpenseGroupForChat(groupId);
      
      let expenseGroupId;
      let expenseGroupName;

      if (existingGroup) {
        // Ya existe un grupo de gastos activo
        // IMPORTANTE: Solo actualizar el nombre del grupo con el nombre actual del grupo de WhatsApp
        // NO eliminar los gastos - mantener todos los gastos existentes
        expenseGroupId = existingGroup.id;
        expenseGroupName = groupName.charAt(0).toUpperCase() + groupName.slice(1);
        
        console.log(`[DEBUG] Grupo de gastos existente encontrado: ${existingGroup.name} (ID: ${expenseGroupId})`);
        console.log(`[DEBUG] Actualizando nombre del grupo a: ${expenseGroupName}`);
        
        // Solo actualizar el nombre del grupo si es diferente
        if (existingGroup.name !== expenseGroupName) {
          try {
            db.prepare('UPDATE expense_groups SET name = ? WHERE id = ?').run(expenseGroupName, expenseGroupId);
            console.log(`[DEBUG] Nombre del grupo actualizado: ${existingGroup.name} → ${expenseGroupName}`);
          } catch (error) {
            console.warn(`[WARN] Error actualizando nombre del grupo ${expenseGroupId}:`, error.message);
          }
        } else {
          console.log(`[DEBUG] Nombre del grupo ya está actualizado: ${expenseGroupName}`);
        }
        
        // IMPORTANTE: NO eliminar los gastos existentes - solo actualizar el nombre
        // Los gastos se mantienen intactos cuando el bot se vuelve a agregar al grupo
        // Establecer last_reset_at a NULL para que no filtre gastos (si estaba establecido)
        try {
          db.prepare('UPDATE expense_groups SET last_reset_at = NULL WHERE id = ?').run(expenseGroupId);
          console.log(`[DEBUG] last_reset_at establecido a NULL para el grupo ${expenseGroupId} (si estaba establecido)`);
        } catch (error) {
          console.warn(`[WARN] Error actualizando last_reset_at del grupo ${expenseGroupId}:`, error.message);
        }
      } else {
        // Crear nuevo grupo de gastos automáticamente con el nombre del grupo de WhatsApp
        expenseGroupName = groupName.charAt(0).toUpperCase() + groupName.slice(1);
        
        // Cerrar y eliminar grupos anteriores si existen
        // IMPORTANTE: Eliminar completamente los grupos anteriores y sus gastos para evitar confusiones
        try {
          // Obtener IDs de grupos anteriores
          const oldGroups = db.prepare(`
            SELECT id FROM expense_groups
            WHERE creator_phone = ? AND IFNULL(is_closed, 0) = 0
          `).all(groupId);
          
          // Eliminar gastos y participantes de grupos anteriores
          for (const oldGroup of oldGroups) {
            try {
              db.prepare('DELETE FROM expenses WHERE group_id = ?').run(oldGroup.id);
              db.prepare('DELETE FROM group_participants WHERE group_id = ?').run(oldGroup.id);
              db.prepare('DELETE FROM expense_groups WHERE id = ?').run(oldGroup.id);
              console.log(`[DEBUG] Grupo anterior ${oldGroup.id} eliminado completamente`);
            } catch (err) {
              console.warn(`[WARN] Error eliminando grupo anterior ${oldGroup.id}:`, err.message);
            }
          }
        } catch (error) {
          console.warn('[WARN] No se pudieron eliminar grupos anteriores:', error.message);
        }

        // Crear el nuevo grupo de gastos
        const creationResult = createExpenseGroup(expenseGroupName, groupId);
        expenseGroupId = creationResult.groupId;
        console.log(`[DEBUG] Grupo de gastos creado automáticamente: ${expenseGroupName} (ID: ${expenseGroupId})`);
        
        // Asegurar que last_reset_at sea NULL para el nuevo grupo
        db.prepare('UPDATE expense_groups SET last_reset_at = NULL WHERE id = ?').run(expenseGroupId);
        console.log(`[DEBUG] last_reset_at establecido a NULL para el nuevo grupo ${expenseGroupId}`);
      }

      // Sincronizar participantes del grupo
      const participants = groupChat?.participants || [];
      let addedParticipants = 0;
      let participantCount = 0;

      if (participants.length > 0) {
        // Filtrar solo participantes humanos (excluir bots)
        const humanParticipants = participants.filter(p => {
          const serialized = p?.id?._serialized || '';
          return serialized && !serialized.includes('bot');
        });

        // Sincronizar participantes
        addedParticipants = await syncGroupParticipants(expenseGroupId, participants);
        
        // Limpiar participantes que ya no están en el grupo
        const allowedPhones = participants.map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
        cleanupGroupParticipants(expenseGroupId, allowedPhones);

        // Eliminar el bot de los participantes si se agregó por error
        if (botPhoneNormalized) {
          db.prepare(`
            DELETE FROM group_participants 
            WHERE group_id = ? AND phone = ?
          `).run(expenseGroupId, botPhoneNormalized);
        }

        // Construir mapa de participantes para el mensaje
        const { map: displayNameMap, count: count } = await buildParticipantDisplayMap(expenseGroupId, allowedPhones);
        participantCount = count;
      }

      // Obtener información del invitador
      let inviterPhone = null;
      let inviterName = 'Un integrante del grupo';
      if (notification.author) {
        inviterPhone = notification.author.replace('@c.us', '').replace('@g.us', '');
        try {
          const authorContact = await client.getContactById(notification.author);
          inviterName = authorContact?.pushname || authorContact?.name || authorContact?.number || inviterName;
        } catch (error) {
          console.warn('[WARN] No se pudo obtener información del autor del grupo:', error.message);
        }
      }

      // Invitar a miembros que no estén registrados
      if (participants.length > 0) {
        await inviteMissingGroupMembers(participants, inviterPhone, inviterName);
      }

      // Construir mensaje de bienvenida completo
      const welcomeMessage = `👋 ¡Hola a todos!\n\n` +
        `Soy *Milo*, tu asistente personal en WhatsApp. He creado automáticamente el grupo de gastos *"${expenseGroupName}"* para este chat.\n\n` +
        `💰 *¿Qué puedo hacer por vos?*\n\n` +
        `• *Indicar quién pagó qué:* Registrá los gastos del grupo indicando el monto y la descripción\n` +
        `• *Ver resumen de gastos:* Consultá todos los gastos registrados y el total\n` +
        `• *Calcular división:* Obtén la división optimizada de gastos y a quién hay que pagar\n` +
        `• *Gestionar participantes:* Los participantes del grupo se agregan automáticamente\n\n` +
        `📋 *Comandos disponibles:*\n\n` +
        `• \`/gasto 5000 pizza\` - Agregar un gasto (el bot detecta automáticamente quién lo pagó)\n` +
        `• \`/resumen\` - Ver resumen de todos los gastos\n` +
        `• \`/calcular\` - Ver división optimizada de gastos y transferencias a realizar\n` +
        `• \`/ayuda\` - Ver ayuda completa\n\n` +
        `💡 *Ejemplos de uso:*\n` +
        `• \`/gasto 4500 super\` - Agregar gasto de $4500 en supermercado\n` +
        `• \`/gasto compré bebidas 3200\` - Agregar gasto de $3200 en bebidas\n` +
        `• \`/resumen\` - Ver todos los gastos registrados\n` +
        `• \`/calcular\` - Ver quién le debe a quién\n\n` +
        `👥 *Participantes detectados:* ${participantCount}\n\n` +
        `_💬 También podés escribirme por privado con *hola* o *menu* para más opciones._\n\n` +
        `¡Gracias por invitarme a *${groupName}*! 🎉`;

      await client.sendMessage(chatId, welcomeMessage);
      console.log(`✅ Mensaje de bienvenida enviado al grupo: ${groupName}`);
    }
  } catch (error) {
    console.error('[ERROR] Error en group_join:', error);
    console.error('[ERROR] Stack:', error.stack);
  }
});

// Evento: Mensaje recibido
client.on('message', async (msg) => {
  try {
    // Ignorar estados de WhatsApp
    if (msg.from === 'status@broadcast') {
      return;
    }
    
    // Ignorar mensajes propios
    if (msg.fromMe) {
      return;
    }
    
    await handleMessage(msg);
  } catch (error) {
    console.error('Error manejando mensaje:', error);
    try {
      await msg.reply('❌ Ocurrió un error. Por favor intenta de nuevo.');
    } catch (replyError) {
      console.error('Error enviando mensaje de error:', replyError);
    }
  }
});

// Evento: Desconectado
client.on('disconnected', (reason) => {
  console.log('❌ Bot desconectado:', reason);
});

// ============================================
// FUNCIÓN DE BIENVENIDA
// ============================================

async function sendWelcomeMessage(client, phone, name, groupName, creatorName) {
  const formattedNumber = `${phone}@c.us`;
  const message = `👋 ¡Hola *${name}*!\n\nFuiste agregado por *${creatorName}* al grupo de gastos *\"${groupName}\"*.\n\n🤖 Soy *Milo*, tu asistente personal en WhatsApp.\nPuedo ayudarte a dividir gastos, crear recordatorios y organizar eventos.\n\n📌 Guardame como *\"Milo 💬\"* para poder chatear conmigo directamente.\n\nEscribí *hola* o *menu* cuando quieras empezar.`;
  try {
    await client.sendMessage(formattedNumber, message);
    console.log(`✅ Bienvenida enviada a ${name} (${phone})`);
  } catch (error) {
    console.error(`⚠️ No se pudo enviar la bienvenida a ${name} (${phone}):`, error.message);
  }
}

// ============================================
// INICIALIZACIÓN DEL BOT
// ============================================

// Iniciar servicio de notificaciones de calendario
calendarModule.startNotificationService(client, db);
console.log('🔔 Servicio de notificaciones de calendario iniciado');

// Iniciar servicio de recap semanal
weeklyRecapModule.startService(client, db);
console.log('📊 Servicio de recap semanal iniciado');

// Iniciar servicio de mensajes programados
try {
  const scheduledMessagesService = require('./modules/scheduled-messages/service');
  scheduledMessagesService.startService(client, db);
  console.log('🗓️ Servicio de mensajes programados iniciado');

  // Servicio para procesar notificaciones de Premium
  setInterval(async () => {
    try {
      const notifications = db.prepare(`
        SELECT id, user_phone, notification_type
        FROM premium_notifications_queue
        WHERE processed = 0
        ORDER BY created_at ASC
        LIMIT 10
      `).all();

      if (notifications.length > 0) {
        const premiumNotifications = require('./modules/premium-module/notifications');
        
        for (const notification of notifications) {
          try {
            if (notification.notification_type === 'payment_approved') {
              await premiumNotifications.notifyPaymentApproved(client, db, notification.user_phone);
            } else if (notification.notification_type === 'payment_rejected') {
              await premiumNotifications.notifyPaymentRejected(client, db, notification.user_phone);
            }
            
            // Marcar como procesada
            db.prepare(`
              UPDATE premium_notifications_queue
              SET processed = 1, processed_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(notification.id);
          } catch (error) {
            console.error(`[ERROR] Error procesando notificación ${notification.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[ERROR] Error en servicio de notificaciones Premium:', error);
    }
  }, 30000); // Cada 30 segundos
  console.log('💎 Servicio de notificaciones Premium iniciado');
} catch (error) {
  console.warn('[WARN] No se pudo iniciar el servicio de mensajes programados:', error.message);
}

// Iniciar dashboard de administración (opcional, solo si ADMIN_PORT está configurado)
if (process.env.ADMIN_PORT || process.env.ENABLE_DASHBOARD === 'true') {
  try {
    const { startDashboard } = require('./admin-dashboard/server');
    const dashboardPort = process.env.ADMIN_PORT || 3000;
    const server = startDashboard();
    console.log(`📊 Dashboard de administración disponible en http://localhost:${dashboardPort}`);
    console.log(`💡 El dashboard se ejecuta en el mismo proceso que el bot`);
    console.log(`💡 Puedes acceder al dashboard mientras el bot está corriendo`);
  } catch (error) {
    console.warn('[WARN] No se pudo iniciar el dashboard:', error.message);
    console.log('💡 Para iniciar el dashboard, ejecuta: npm run dashboard');
  }
}

function getUserExpenseGroups(userPhone) {
  // IMPORTANTE: Normalizar el teléfono del usuario para que coincida con los teléfonos en group_participants
  const normalizedUserPhone = normalizePhone(userPhone);
  
  console.log(`[DEBUG] getUserExpenseGroups: Buscando grupos para userPhone=${userPhone} (normalized=${normalizedUserPhone})`);
  
  // Obtener todos los grupos activos donde el usuario participa
  // Buscar en group_participants por teléfono (normalizado o no) para encontrar grupos
  const participantGroups = db.prepare(`
    SELECT DISTINCT gp.group_id
    FROM group_participants gp
    WHERE (gp.phone = ? OR gp.phone = ?)
  `).all(userPhone, normalizedUserPhone);
  
  console.log(`[DEBUG] getUserExpenseGroups: Encontrados ${participantGroups.length} grupos donde el usuario participa`);
  
  // Obtener IDs de grupos
  const groupIds = participantGroups.map(g => g.group_id);
  
  // Si no hay grupos, buscar también por creator_phone (para grupos creados manualmente)
  if (groupIds.length === 0) {
    const creatorGroups = db.prepare(`
      SELECT id FROM expense_groups
      WHERE creator_phone = ? OR creator_phone = ?
    `).all(userPhone, normalizedUserPhone);
    groupIds.push(...creatorGroups.map(g => g.id));
    console.log(`[DEBUG] getUserExpenseGroups: Encontrados ${creatorGroups.length} grupos creados por el usuario`);
  }
  
  // Si aún no hay grupos, retornar vacío
  if (groupIds.length === 0) {
    console.log(`[DEBUG] getUserExpenseGroups: No se encontraron grupos para ${userPhone}`);
    return [];
  }
  
  // Obtener información de los grupos activos
  // IMPORTANTE: Excluir el bot del conteo de participantes
  const placeholders = groupIds.map(() => '?').join(',');
  
  // Obtener información básica de los grupos
  const allGroups = db.prepare(`
    SELECT g.id, g.name, g.created_at, g.creator_phone
    FROM expense_groups g
    WHERE g.id IN (${placeholders})
      AND IFNULL(g.is_closed, 0) = 0
    ORDER BY g.created_at DESC
  `).all(...groupIds);
  
  // Calcular el conteo de participantes únicos excluyendo el bot para cada grupo
  // IMPORTANTE: Normalizar teléfonos para evitar duplicados y excluir el bot
  const groups = allGroups.map(g => {
    // Obtener todos los participantes del grupo
    const participants = db.prepare(`
      SELECT phone
      FROM group_participants
      WHERE group_id = ?
    `).all(g.id);
    
    // Normalizar teléfonos y crear un Set para obtener participantes únicos
    const uniqueParticipants = new Set();
    
    participants.forEach(p => {
      const normalizedPhone = normalizePhone(p.phone);
      if (normalizedPhone) {
        // Excluir el bot si está configurado
        if (botPhoneNormalized && normalizedPhone === botPhoneNormalized) {
          return; // Saltar el bot
        }
        uniqueParticipants.add(normalizedPhone);
      }
    });
    
    const participantCount = uniqueParticipants.size;
    
    // Log detallado para debugging
    console.log(`[DEBUG] getUserExpenseGroups: Grupo ${g.id} (${g.name}): ${participants.length} registros en BD, ${participantCount} participantes únicos después de normalizar (bot excluido: ${botPhoneNormalized || 'N/A'})`);
    if (participants.length !== participantCount) {
      console.log(`[DEBUG] getUserExpenseGroups: Grupo ${g.id} tiene duplicados o participantes inválidos (${participants.length} registros vs ${participantCount} únicos)`);
    }
    
    return {
      ...g,
      participant_count: participantCount
    };
  });
  
  console.log(`[DEBUG] getUserExpenseGroups: Encontrados ${groups.length} grupos activos para ${userPhone}`);
  groups.forEach((g, idx) => {
    console.log(`[DEBUG] getUserExpenseGroups: Grupo ${idx + 1}: ID=${g.id}, Nombre=${g.name}, creator_phone=${g.creator_phone}, participantes=${g.participant_count} (bot excluido: ${botPhoneNormalized || 'N/A'})`);
  });
  
  return groups;
}

// Obtener todas las deudas pendientes del usuario en todos sus grupos activos
function getUserPendingDebts(userPhone) {
  const normalizedUserPhone = normalizePhone(userPhone);
  if (!normalizedUserPhone) {
    return [];
  }

  // Obtener todos los grupos activos donde el usuario participa
  const groups = getUserExpenseGroups(userPhone);
  if (groups.length === 0) {
    return [];
  }

  const allDebts = [];

  // Para cada grupo, calcular las deudas pendientes del usuario
  // calculateSplit ya considera los pagos realizados, por lo que las transacciones
  // que devuelve son las deudas netas pendientes
  for (const group of groups) {
    try {
      const split = calculateSplit(group.id);
      
      // Filtrar transacciones donde el usuario es el deudor (fromPhone)
      const userDebts = split.transactions.filter(t => {
        const normalizedFromPhone = normalizePhone(t.fromPhone);
        return normalizedFromPhone === normalizedUserPhone;
      });

      // Agregar información del grupo a cada deuda
      userDebts.forEach(debt => {
        // El monto ya es neto (considerando pagos realizados) porque calculateSplit
        // aplica los pagos a los balances antes de calcular las transacciones
        allDebts.push({
          groupId: group.id,
          groupName: group.name,
          to: debt.to,
          toPhone: debt.toPhone,
          amount: debt.amount,
          isPaid: false // calculateSplit ya filtra las deudas pagadas
        });
      });
    } catch (error) {
      console.error(`[ERROR] Error calculando deudas para grupo ${group.id}:`, error);
      // Continuar con el siguiente grupo si hay un error
    }
  }

  // Filtrar solo las deudas con monto significativo (> 0.01)
  return allDebts.filter(debt => debt.amount > 0.01);
}

// Iniciar el cliente de WhatsApp
console.log('🚀 Iniciando bot...');
client.initialize();

function getGroupParticipants(groupId) {
  // Obtener todos los participantes
  const allParticipants = db.prepare(`
    SELECT id, name, phone
    FROM group_participants
    WHERE group_id = ?
    ORDER BY id
  `).all(groupId);
  
  if (allParticipants.length === 0) {
    return [];
  }
  
  // Agrupar por nombre normalizado para detectar duplicados
  // Preferir números que empiezan con 549 (formato argentino completo)
  const participantsByName = new Map();
  
  for (const participant of allParticipants) {
    const normalizedPhone = normalizePhone(participant.phone);
    
    // Excluir el bot
    if (botPhoneNormalized && normalizedPhone === botPhoneNormalized) {
      continue;
    }
    
    if (!normalizedPhone) {
      continue;
    }
    
    const phoneStr = normalizedPhone.toString();
    const startsWith549 = phoneStr.startsWith('549');
    const name = (participant.name || '').trim().toLowerCase();
    
    // Usar el nombre como clave (ignorando mayúsculas/minúsculas)
    if (!name) {
      // Si no hay nombre, usar el teléfono como clave
      const phoneKey = `phone_${phoneStr}`;
      if (!participantsByName.has(phoneKey)) {
        participantsByName.set(phoneKey, []);
      }
      participantsByName.get(phoneKey).push(participant);
    } else {
      if (!participantsByName.has(name)) {
        participantsByName.set(name, []);
      }
      participantsByName.get(name).push(participant);
    }
  }
  
  // Para cada grupo de participantes con el mismo nombre, seleccionar el mejor
  const finalParticipants = [];
  
  for (const [key, group] of participantsByName.entries()) {
    if (group.length === 1) {
      // Solo hay un participante con este nombre, agregarlo
      finalParticipants.push(group[0]);
    } else {
      // Hay múltiples participantes con el mismo nombre, preferir el que empieza con 549
      const with549 = group.find(p => {
        const phoneStr = normalizePhone(p.phone).toString();
        return phoneStr.startsWith('549');
      });
      
      if (with549) {
        // Usar el participante que empieza con 549
        finalParticipants.push(with549);
      } else {
        // Si ninguno empieza con 549, usar el primero (ya ordenado por nombre)
        finalParticipants.push(group[0]);
      }
    }
  }
  
  // Ordenar por nombre
  finalParticipants.sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  return finalParticipants;
}

async function deleteExpenseGroup(groupId, userPhone, client = null) {
  const group = db.prepare(`
    SELECT id, name, creator_phone
    FROM expense_groups
    WHERE id = ?
  `).get(groupId);

  if (!group) {
    return { success: false, message: 'Grupo no encontrado.' };
  }

  if (group.creator_phone !== userPhone) {
    return { success: false, message: 'Solo el creador puede eliminar el grupo.' };
  }

  // Obtener nombre del creador desde la base de datos
  const creator = db.prepare('SELECT name FROM users WHERE phone = ?').get(userPhone);
  const creatorName = creator?.name || 'El creador';

  // Notificar a los participantes ANTES de eliminar el grupo
  if (client) {
    try {
      await notifyParticipantsGroupDeleted(client, groupId, group.name, userPhone, creatorName);
    } catch (error) {
      console.error(`[ERROR] Error notificando participantes al eliminar grupo ${groupId}:`, error);
      // Continuar con la eliminación aunque falle la notificación
    }
  }

  // Eliminar datos del grupo
  db.prepare('DELETE FROM expenses WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM group_participants WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM expense_groups WHERE id = ?').run(groupId);

  return { success: true, name: group.name };
}

async function deleteAllExpenseGroups(userPhone, client = null) {
  // Obtener todos los grupos activos del usuario
  const groups = db.prepare(`
    SELECT id, name
    FROM expense_groups
    WHERE creator_phone = ? AND IFNULL(is_closed, 0) = 0
  `).all(userPhone);

  if (!groups || groups.length === 0) {
    return { success: false, message: 'No tenés grupos activos para eliminar.', count: 0 };
  }

  // Obtener nombre del creador desde la base de datos
  const creator = db.prepare('SELECT name FROM users WHERE phone = ?').get(userPhone);
  const creatorName = creator?.name || 'El creador';

  let deletedCount = 0;
  const groupNames = [];

  // Eliminar cada grupo y sus datos relacionados
  for (const group of groups) {
    try {
      // Notificar a los participantes ANTES de eliminar el grupo
      if (client) {
        try {
          await notifyParticipantsGroupDeleted(client, group.id, group.name, userPhone, creatorName);
        } catch (error) {
          console.error(`[ERROR] Error notificando participantes al eliminar grupo ${group.id}:`, error);
          // Continuar con la eliminación aunque falle la notificación
        }
      }

      // Eliminar datos del grupo
      db.prepare('DELETE FROM expenses WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM group_participants WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM expense_groups WHERE id = ?').run(group.id);
      deletedCount++;
      groupNames.push(group.name);
    } catch (error) {
      console.error(`[ERROR] Error eliminando grupo ${group.id}:`, error.message);
    }
  }

  return { 
    success: true, 
    count: deletedCount,
    groupNames 
  };
}

function removeGroupParticipant(groupId, participantId) {
  const participant = db.prepare(`
    SELECT id, name, phone
    FROM group_participants
    WHERE id = ? AND group_id = ?
  `).get(participantId, groupId);

  if (!participant) {
    return { success: false, message: 'Participante no encontrado.' };
  }

  db.prepare('DELETE FROM expenses WHERE group_id = ? AND payer_phone = ?').run(groupId, participant.phone);
  db.prepare('DELETE FROM group_participants WHERE id = ?').run(participantId);

  return { success: true, participant };
}

function buildExpensesManageMenu(groupName = '', userPhone = null, groupId = null) {
  const header = groupName ? `💰 *${groupName}*` : '💰 *Dividir Gastos*';
  let menu = `${header}\n\n1. Agregar gasto\n2. Ver resumen\n3. Calcular división\n4. Ver/Quitar participantes\n5. Avisar pago\n6. Ver pagos realizados`;
  
  // Agregar opciones de cuentas bancarias si el usuario tiene acceso
  if (userPhone) {
    const accounts = getUserBankAccounts(userPhone);
    if (accounts.length > 0) {
      menu += `\n7. Mis cuentas bancarias`;
    } else {
      menu += `\n7. Agregar cuenta bancaria`;
    }
  } else {
    menu += `\n7. Agregar cuenta bancaria`;
  }
  
  // Verificar si el grupo está cerrado
  let isClosed = false;
  if (groupId) {
    const group = db.prepare('SELECT is_closed FROM expense_groups WHERE id = ?').get(groupId);
    isClosed = group && group.is_closed === 1;
  }
  
  if (isClosed) {
    menu += `\n8. Reabrir grupo`;
  } else {
    menu += `\n8. Cerrar grupo`;
  }
  
  menu += `\n9. Compartir grupo en WhatsApp\n`;
  menu += `🔟 Exportar resumen (PDF)\n`;
  menu += `1️⃣1️⃣ Eliminar grupo\n`;
  menu += `1️⃣2️⃣ Volver al menú de gastos\n\n💡 Escribí *"menu"* para volver al inicio.`;
  return menu;
}

function getExpenseGroupName(groupId) {
  const row = db.prepare(`
    SELECT name FROM expense_groups WHERE id = ?
  `).get(groupId);
  return row ? row.name : 'Grupo de gastos';
}

async function shareExpenseGroupInWhatsApp(client, groupId, userPhone) {
  try {
    const group = db.prepare(`
      SELECT id, name, created_at, is_closed, closed_at, currency
      FROM expense_groups
      WHERE id = ?
    `).get(groupId);
    
    if (!group) {
      return { error: true, message: '❌ Grupo no encontrado.' };
    }
    
    const summary = await getExpenseSummary(groupId);
    const split = calculateSplit(groupId);
    const payments = getPaymentsByGroup(groupId);
    const participants = getGroupParticipants(groupId);
    
    // Obtener información del creador
    const creator = db.prepare('SELECT name FROM users WHERE phone = ?').get(userPhone);
    const creatorName = creator?.name || 'Usuario';
    
    // Construir mensaje de resumen
    let shareMessage = `📋 *Resumen de Gastos: ${group.name}*\n\n`;
    shareMessage += `👤 Creado por: *${creatorName}*\n`;
    shareMessage += `📅 Fecha: ${new Date(group.created_at).toLocaleDateString('es-AR')}\n`;
    if (group.is_closed === 1) {
      shareMessage += `🔒 Estado: *Cerrado*\n`;
      if (group.closed_at) {
        shareMessage += `📅 Cerrado: ${new Date(group.closed_at).toLocaleDateString('es-AR')}\n`;
      }
    } else {
      shareMessage += `✅ Estado: *Activo*\n`;
    }
    shareMessage += `💱 Moneda: ${group.currency || 'ARS'}\n\n`;
    
    shareMessage += `💰 *Total gastado:* ${formatAmount(summary.total)} ${group.currency || 'ARS'}\n`;
    shareMessage += `👥 *Participantes:* ${participants.length}\n`;
    shareMessage += `📊 *Por persona:* ${formatAmount(summary.perPerson)} ${group.currency || 'ARS'}\n\n`;
    
    if (summary.expenses.length > 0) {
      shareMessage += `*Gastos registrados:*\n\n`;
      summary.expenses.forEach((e, i) => {
        shareMessage += `${i + 1}. ${formatAmount(e.amount)} ${e.currency || group.currency || 'ARS'} - ${e.description}\n`;
        shareMessage += `   💳 Pagó: ${e.payer_name || 'N/A'}\n\n`;
      });
    }
    
    if (payments.length > 0) {
      shareMessage += `\n💵 *Pagos realizados:*\n\n`;
      payments.forEach((p, i) => {
        const toAlias = p.bank_alias || getBankAliasForUser(p.to_user_phone);
        const toDisplay = toAlias ? `${p.to_user_name || p.to_user_phone} (${toAlias})` : (p.to_user_name || p.to_user_phone);
        shareMessage += `${i + 1}. *${p.from_user_name || p.from_user_phone}* pagó *${formatAmount(p.amount)} ${p.currency || group.currency || 'ARS'}* a *${toDisplay}*\n`;
        shareMessage += `   📅 ${new Date(p.payment_date).toLocaleDateString('es-AR')}${p.payment_method ? ` • ${p.payment_method}` : ''}\n\n`;
      });
    }
    
    if (split.transactions.length > 0) {
      shareMessage += `\n💸 *Transferencias pendientes:*\n\n`;
      split.transactions.forEach((t, i) => {
        const toAlias = getBankAliasForUser(t.toPhone);
        const toDisplay = toAlias ? `${t.to} (${toAlias})` : t.to;
        shareMessage += `${i + 1}. *${t.from}* → *${formatAmount(t.amount)} ${group.currency || 'ARS'}* → *${toDisplay}*\n\n`;
      });
    } else {
      shareMessage += `\n✅ *¡Todo pagado!* No hay deudas pendientes.\n\n`;
    }
    
    shareMessage += `\n─\n`;
    shareMessage += `📱 *Compartido desde Milo Bot*\n`;
    shareMessage += `💡 Para gestionar este grupo, escribí "gastos" a Milo`;
    
    // Enviar mensaje al usuario que comparte
    const userChatId = `${normalizePhone(userPhone)}@c.us`;
    await client.sendMessage(userChatId, shareMessage);
    
    return { 
      error: false, 
      message: `✅ *Resumen compartido*\n\nEl resumen del grupo "${group.name}" fue enviado a tu chat privado.\n\nPodés copiar y compartir el mensaje con quien quieras.` 
    };
  } catch (error) {
    console.error('[ERROR] Error compartiendo grupo:', error);
    return { 
      error: true, 
      message: `❌ No se pudo compartir el grupo: ${error.message}` 
    };
  }
}

async function exportExpenseGroupToPDF(groupId, userPhone) {
  const fs = require('fs');
  const path = require('path');
  const PDFDocument = require('pdfkit');
  
  try {
    const group = db.prepare(`
      SELECT id, name, created_at, is_closed, closed_at, currency
      FROM expense_groups
      WHERE id = ?
    `).get(groupId);
    
    if (!group) {
      return { success: false, error: 'Grupo no encontrado.' };
    }
    
    const summary = await getExpenseSummary(groupId);
    const split = calculateSplit(groupId);
    const payments = getPaymentsByGroup(groupId);
    const participants = getGroupParticipants(groupId);
    
    // Obtener información del creador
    const creator = db.prepare('SELECT name FROM users WHERE phone = ?').get(userPhone);
    const creatorName = creator?.name || 'Usuario';
    
    // Crear directorio de exports si no existe
    const exportsDir = path.join(__dirname, 'data', 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Nombre del archivo
    const fileName = `resumen_${group.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
    const filePath = path.join(exportsDir, fileName);
    
    // Crear documento PDF
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    
    // Encabezado
    doc.fontSize(20).text(`Resumen de Gastos: ${group.name}`, { align: 'center' });
    doc.moveDown();
    
    // Información del grupo
    doc.fontSize(12);
    doc.text(`Creado por: ${creatorName}`);
    doc.text(`Fecha: ${new Date(group.created_at).toLocaleDateString('es-AR')}`);
    if (group.is_closed === 1) {
      doc.text(`Estado: Cerrado`);
      if (group.closed_at) {
        doc.text(`Cerrado: ${new Date(group.closed_at).toLocaleDateString('es-AR')}`);
      }
    } else {
      doc.text(`Estado: Activo`);
    }
    doc.text(`Moneda: ${group.currency || 'ARS'}`);
    doc.moveDown();
    
    // Resumen general
    doc.fontSize(14).text('Resumen General', { underline: true });
    doc.fontSize(12);
    doc.text(`Total gastado: ${formatAmount(summary.total)} ${group.currency || 'ARS'}`);
    doc.text(`Participantes: ${participants.length}`);
    doc.text(`Por persona: ${formatAmount(summary.perPerson)} ${group.currency || 'ARS'}`);
    doc.moveDown();
    
    // Gastos registrados
    if (summary.expenses.length > 0) {
      doc.fontSize(14).text('Gastos Registrados', { underline: true });
      doc.moveDown(0.5);
      summary.expenses.forEach((e, i) => {
        const status = e.is_paid ? '✅ Pagado' : '⏳ Pendiente';
        doc.fontSize(10);
        doc.text(`${i + 1}. ${formatAmount(e.amount)} ${e.currency || group.currency || 'ARS'} - ${e.description}`, { continued: false });
        doc.text(`   Pagó: ${e.payer_name || 'N/A'} | ${status}`, { indent: 20 });
        if (e.is_paid && e.paid_by) {
          doc.text(`   Marcado como pagado por: ${e.paid_by}`, { indent: 20 });
          if (e.paid_at) {
            doc.text(`   Fecha de pago: ${new Date(e.paid_at).toLocaleDateString('es-AR')}`, { indent: 20 });
          }
        }
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }
    
    // Pagos realizados (si hay)
    if (payments.length > 0) {
      doc.fontSize(14).text('Pagos Realizados', { underline: true });
      doc.moveDown(0.5);
      payments.forEach((p, i) => {
        const toAlias = p.bank_alias || getBankAliasForUser(p.to_user_phone);
        const toDisplay = toAlias ? `${p.to_user_name || p.to_user_phone} (${toAlias})` : (p.to_user_name || p.to_user_phone);
        doc.fontSize(10);
        doc.text(`${i + 1}. ${p.from_user_name || p.from_user_phone} pagó ${formatAmount(p.amount)} ${p.currency || group.currency || 'ARS'} a ${toDisplay}`);
        doc.text(`   Fecha: ${new Date(p.payment_date).toLocaleDateString('es-AR')}${p.payment_method ? ` | Método: ${p.payment_method}` : ''}`, { indent: 20 });
        if (p.notes) {
          doc.text(`   Notas: ${p.notes}`, { indent: 20 });
        }
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }
    
    // Transferencias pendientes
    if (split.transactions.length > 0) {
      doc.fontSize(14).text('Transferencias Pendientes', { underline: true });
      doc.moveDown(0.5);
      split.transactions.forEach((t, i) => {
        const toAlias = getBankAliasForUser(t.toPhone);
        const toDisplay = toAlias ? `${t.to} (${toAlias})` : t.to;
        doc.fontSize(10);
        doc.text(`${i + 1}. ${t.from} → ${formatAmount(t.amount)} ${group.currency || 'ARS'} → ${toDisplay}`);
        doc.moveDown(0.3);
      });
    } else {
      doc.fontSize(14).text('✅ ¡Todo pagado!', { underline: true });
      doc.fontSize(12);
      doc.text('No hay deudas pendientes.');
    }
    
    // Pie de página
    doc.moveDown(2);
    doc.fontSize(8).text('Generado por Milo Bot', { align: 'center' });
    doc.text(new Date().toLocaleString('es-AR'), { align: 'center' });
    
    // Finalizar PDF
    doc.end();
    
    // Esperar a que el stream termine
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({
          success: true,
          filePath: filePath,
          fileName: fileName
        });
      });
      stream.on('error', (error) => {
        reject({ success: false, error: error.message });
      });
    });
  } catch (error) {
    console.error('[ERROR] Error exportando a PDF:', error);
    return { success: false, error: error.message };
  }
}

function getMotivationalPhrase() {
  const phrases = [
    '¡Seguí organizando tus gastos con Milo! 💪',
    'Milo está listo para ayudarte con más grupos 😊',
    '¡No te desanimes! Milo está acá para ayudarte 🚀',
    'Creá nuevos grupos y seguí organizando tus finanzas 📊',
    '¡Milo sigue disponible para tus próximos proyectos! ✨',
    'Aprovechá todas las funciones que Milo tiene para ofrecerte 🌟',
    '¡Seguí usando Milo para organizar mejor tu vida! 💼',
    'Milo está siempre disponible para ayudarte 🎯',
    '¡Explorá todas las funciones que Milo tiene para vos! 🔥',
    'Milo está acá para hacer tu vida más fácil 😎',
    '¡No olvides que Milo puede ayudarte con calendarios y más! 📅',
    'Seguí descubriendo todo lo que Milo puede hacer por vos 🎉',
    '¡Milo está esperando tu próximo grupo de gastos! 💰',
    'Aprovechá Milo para organizar mejor tus eventos y gastos 📋',
    '¡Milo está listo para tu próxima aventura! 🌈'
  ];
  
  const randomIndex = Math.floor(Math.random() * phrases.length);
  return phrases[randomIndex];
}

async function notifyParticipantsGroupDeleted(client, groupId, groupName, creatorPhone, creatorName) {
  if (!client || !groupId) {
    return { success: false, error: 'Cliente o grupo no disponible' };
  }

  try {
    // Obtener participantes antes de eliminarlos
    const participants = db.prepare(`
      SELECT DISTINCT phone, name 
      FROM group_participants 
      WHERE group_id = ? AND phone != ?
    `).all(groupId, creatorPhone);

    if (!participants || participants.length === 0) {
      return { success: true, notified: 0 };
    }

    const normalizedCreatorPhone = normalizePhone(creatorPhone);
    const safeCreatorName = creatorName || 'El creador';
    const motivationalPhrase = getMotivationalPhrase();
    let notifiedCount = 0;

    // Notificar a cada participante
    for (const participant of participants) {
      try {
        const normalizedParticipantPhone = normalizePhone(participant.phone);
        if (!normalizedParticipantPhone || normalizedParticipantPhone === normalizedCreatorPhone) {
          continue;
        }

        const participantName = participant.name || 'Participante';
        const chatId = `${normalizedParticipantPhone}@c.us`;
        
        // Verificar que el número existe en WhatsApp
        const numberId = await client.getNumberId(chatId);
        if (!numberId) {
          console.warn(`[WARN] No se pudo enviar notificación a ${participantName} (${normalizedParticipantPhone}): número no registrado en WhatsApp`);
          continue;
        }

        const message = `📢 *Grupo eliminado*\n\n` +
          `*${safeCreatorName}* ha eliminado el grupo de gastos "*${groupName}*".\n\n` +
          `${motivationalPhrase}\n\n` +
          `💬 Escribí *hola* o *menu* para seguir usando Milo.`;

        const targetId = numberId._serialized || chatId;
        await client.sendMessage(targetId, message);
        notifiedCount++;
        console.log(`✅ Notificación de eliminación enviada a ${participantName} (${normalizedParticipantPhone})`);
      } catch (error) {
        console.error(`[ERROR] No se pudo enviar notificación a ${participant.phone}:`, error.message);
      }
    }

    return { success: true, notified: notifiedCount };
  } catch (error) {
    console.error(`[ERROR] Error notificando participantes del grupo ${groupId}:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getMainMenu
};

