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
const currencyModule = require('./modules/currency-module');
const googleIntegration = require('./modules/calendar-module/google');
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
    home_country_code TEXT
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
`);

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
  db.exec('ALTER TABLE google_auth_tokens ADD COLUMN last_sync INTEGER');
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
  const row = db.prepare('SELECT 1 FROM user_invites WHERE phone = ?').get(phone);
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
      } else if (inviteResult.error && inviteResult.error.toLowerCase().includes('no está registrado')) {
        recordInvite(participantPhone, normalizedInviterPhone);
      }
    } catch (error) {
      console.error('[ERROR] invitando miembro del grupo:', error);
    }
  }
}

function getSession(phone) {
  const stmt = db.prepare('SELECT * FROM sessions WHERE user_phone = ?');
  return stmt.get(phone);
}

function updateSession(phone, module, context = null) {
  const stmt = db.prepare(`
    INSERT INTO sessions (user_phone, current_module, context, last_updated)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_phone) DO UPDATE SET 
      current_module = ?,
      context = ?,
      last_updated = CURRENT_TIMESTAMP
  `);
  stmt.run(phone, module, context, module, context);
  
  // Reiniciar el timeout cada vez que hay actividad
  resetTimeout(phone);
}

function clearSession(phone) {
  const stmt = db.prepare('DELETE FROM sessions WHERE user_phone = ?');
  stmt.run(phone);
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
  const stmt = db.prepare(`
    INSERT INTO expense_groups (name, creator_phone)
    VALUES (?, ?)
  `);
  const result = stmt.run(name, creatorPhone);
  return { success: true, groupId: result.lastInsertRowid };
}

function normalizePhone(phone = '') {
  if (!phone) {
    return null;
  }
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (digits.length < 6 || digits.length > 15) {
    return null;
  }
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

  const existing = db.prepare(`
    SELECT id, name FROM group_participants 
    WHERE group_id = ? AND phone = ?
  `).get(groupId, normalizedPhone);

  const trimmedName = name ? name.trim() : '';
  const meaningfulName = isMeaningfulName(trimmedName) ? trimmedName : null;

  if (existing) {
    if (meaningfulName && (!existing.name || !isMeaningfulName(existing.name))) {
      db.prepare(`
        UPDATE group_participants
        SET name = ?
        WHERE id = ?
      `).run(meaningfulName, existing.id);
    }
    return { added: false, id: existing.id, phone: normalizedPhone };
  }

  const finalName = meaningfulName || `Participante ${normalizedPhone.slice(-4) || normalizedPhone}`;

  const stmt = db.prepare(`
    INSERT INTO group_participants (group_id, phone, name)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(groupId, normalizedPhone, finalName);
  return { added: true, id: result.lastInsertRowid, phone: normalizedPhone };
}

function addExpense(groupId, payerPhone, amount, description) {
  const stmt = db.prepare(`
    INSERT INTO expenses (group_id, payer_phone, amount, description)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(groupId, payerPhone, amount, description);
  return { success: true };
}

function getActiveExpenseGroupForChat(chatId) {
  return db.prepare(`
    SELECT id, name, created_at
    FROM expense_groups
    WHERE creator_phone = ? AND IFNULL(is_closed, 0) = 0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(chatId);
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

  const rows = db.prepare(`
    SELECT id, phone FROM group_participants WHERE group_id = ?
  `).all(expenseGroupId);

  const deleteStmt = db.prepare('DELETE FROM group_participants WHERE id = ?');

  for (const row of rows) {
    const phone = normalizePhone(row.phone);
    if (!phone) {
      deleteStmt.run(row.id);
      continue;
    }

    if (botPhoneNormalized && phone === botPhoneNormalized) {
      deleteStmt.run(row.id);
      continue;
    }

    if (normalizedAllowed.size && !normalizedAllowed.has(phone)) {
      const expenseCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM expenses
        WHERE group_id = ? AND payer_phone = ?
      `).get(expenseGroupId, phone);

      if (!expenseCount?.count) {
        deleteStmt.run(row.id);
      }
    }
  }
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

  const enrichPhones = new Set(rows.map(row => row.phone));
  extraPhones.forEach(phone => {
    const normalized = normalizePhone(phone);
    if (normalized) {
      enrichPhones.add(normalized);
    }
  });

  for (const phone of enrichPhones) {
    const existingRow = rows.find(row => row.phone === phone);
    let displayName = existingRow?.name;

    if (!isMeaningfulName(displayName)) {
      const resolved = await resolveContactDisplayName(phone);
      if (isMeaningfulName(resolved)) {
        displayName = resolved.trim();
        updateParticipantNameIfBetter(groupId, phone, displayName);
      }
    }

    if (!isMeaningfulName(displayName)) {
      displayName = formatPhoneForDisplay(phone);
    }

    map[phone] = displayName;
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

function parseGroupExpenseMessage(rawText = '') {
  if (!rawText) {
    return null;
  }

  const cleaned = rawText.replace(/@\S+/g, ' ').trim();
  const lower = cleaned.toLowerCase();

  if (lower.startsWith('crear') || lower.includes(' crear ')) {
    const createMatch = cleaned.match(/crear\s+(.+)/i);
    let groupLabel = createMatch && createMatch[1] ? createMatch[1].trim() : null;
    if (groupLabel) {
      groupLabel = groupLabel.replace(/[.,;:]+$/g, '').trim();
    }
    return { type: 'create', raw: cleaned, lower, name: groupLabel };
  }

  if (lower.includes('resumen') || lower.includes('estado')) {
    return { type: 'summary' };
  }

  if (lower.includes('calcular') || lower.includes('dividir')) {
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

function getExpenseSummary(groupId) {
  // Obtener participantes
  const participants = db.prepare(`
    SELECT COUNT(DISTINCT phone) as count FROM group_participants WHERE group_id = ?
  `).get(groupId);

  // Obtener gastos con nombre del pagador
  const expenses = db.prepare(`
    SELECT e.amount, e.description, e.payer_phone, p.name as payer_name
    FROM expenses e
    LEFT JOIN group_participants p ON e.payer_phone = p.phone AND e.group_id = p.group_id
    WHERE e.group_id = ?
    ORDER BY e.created_at DESC
  `).all(groupId);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPerson = participants.count > 0 ? (total / participants.count).toFixed(2) : 0;

  return {
    expenses,
    total: total.toFixed(2),
    perPerson,
    participantCount: participants.count
  };
}

function calculateSplit(groupId) {
  const participants = db.prepare(`
    SELECT DISTINCT phone, name FROM group_participants WHERE group_id = ?
  `).all(groupId);

  const expenses = db.prepare(`
    SELECT payer_phone, SUM(amount) as total 
    FROM expenses 
    WHERE group_id = ? 
    GROUP BY payer_phone
  `).all(groupId);

  if (!participants.length) {
    return {
      total: '0.00',
      perPerson: '0.00',
      transactions: []
    };
  }

  const totalAmount = expenses.reduce((sum, e) => sum + e.total, 0);
  const perPerson = participants.length ? totalAmount / participants.length : 0;

  const balances = {};
  participants.forEach(p => {
    balances[p.phone] = -perPerson;
  });

  expenses.forEach(e => {
    balances[e.payer_phone] += e.total;
  });

  const debtors = [];
  const creditors = [];

  for (const [phone, balance] of Object.entries(balances)) {
    const name = participants.find(p => p.phone === phone).name;
    if (balance < -0.01) {
      debtors.push({ phone, name, amount: -balance });
    } else if (balance > 0.01) {
      creditors.push({ phone, name, amount: balance });
    }
  }

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (debtor.phone === creditor.phone) {
      if (debtor.amount <= creditor.amount) {
        creditor.amount -= debtor.amount;
        debtor.amount = 0;
        i++;
      } else {
        debtor.amount -= creditor.amount;
        creditor.amount = 0;
        j++;
      }
      continue;
    }

    transactions.push({
      from: debtor.name,
      fromPhone: debtor.phone,
      to: creditor.name,
      toPhone: creditor.phone,
      amount: amount.toFixed(2)
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

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

function getMainMenu(userName = '') {
  const greeting = userName ? `Hola *${userName}*! 👋\n\n` : '';
  return `${greeting}🤖 *Soy Milo, tu asistente personal*\n\nSelecciona una opción:\n\n1️⃣ 🌤️ Pronóstico para hoy\n2️⃣ 📅 Calendario & Recordatorios\n3️⃣ 💰 Dividir Gastos\n4️⃣ 🏫 Google Classroom\n5️⃣ 🤖 Asistente IA\n6️⃣ 💱 Conversor de Monedas\n7️⃣ 🤝 Invitar a un amigo\n8️⃣ ⚙️ Configuración\n9️⃣ ℹ️ Ayuda\n\n_Escribe el número o habla naturalmente_\n\n💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar al menú principal.`;
}

calendarModule.setMainMenuProvider(getMainMenu);
classroomModule.setMainMenuProvider(getMainMenu);

function getExpensesMenu() {
  return '💰 *Dividir Gastos*\n\n1. Crear nuevo grupo\n2. Mis grupos activos\n3. Volver al menú\n\n¿Qué deseas hacer?\n\n💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.';
}

async function handleGroupMention({ msg, groupChat, groupId, groupName, rawMessage, inviterPhone, inviterName }) {
  const parsed = parseGroupExpenseMessage(rawMessage);
  if (!parsed) {
    return false;
  }

  if (parsed.type === 'create') {
    const baseName = parsed.name && parsed.name.trim().length
      ? parsed.name.trim().replace(/\s+/g, ' ')
      : `Gastos ${groupName}`;
    const finalName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    ensureGroupInUsersTable(groupId, groupName);
    const existingGroup = getActiveExpenseGroupForChat(groupId);

    if (existingGroup && existingGroup.name === finalName) {
      await msg.reply(`✅ El grupo de gastos "${finalName}" ya está activo en este chat.\n\nUsá:\n• /gasto 5000 pizza\n• /resumen\n• /calcular\n\n💡 Si necesitás otro grupo, mencioname con "crear" y el nuevo nombre.`);
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
// MANEJADOR DE MENSAJES DE GRUPOS
// ============================================

async function handleGroupMessage(msg) {
  const rawMessage = msg.body || '';
  const messageText = rawMessage.toLowerCase().trim();
  const groupId = msg.from;
  const groupChat = await msg.getChat();
  const groupName = groupChat.name || 'Grupo sin nombre';

  let inviterPhone = null;
  let inviterName = 'Un integrante del grupo';
  try {
    if (msg.author) {
      inviterPhone = msg.author.replace('@c.us', '');
    }
    const authorContact = await msg.getContact();
    inviterName = authorContact.pushname || authorContact.name || authorContact.number || inviterName;
  } catch (error) {
    console.warn('[WARN] No se pudo obtener datos del remitente del grupo:', error.message);
  }

  let mentionedBot = false;
  const botSimpleTag = botWid ? botWid.replace(/@c\.us$/, '') : null;

  try {
    const mentionContacts = await msg.getMentions();
    if (Array.isArray(mentionContacts) && mentionContacts.length > 0 && botWid) {
      mentionedBot = mentionContacts.some(contact => contact?.id?._serialized === botWid);
    }
  } catch (error) {
    console.warn('[WARN] No se pudo obtener menciones del mensaje:', error.message);
    if (botWid && Array.isArray(msg.mentionedIds)) {
      mentionedBot = msg.mentionedIds.includes(botWid);
    }
  }

  // Fallback: Si el texto contiene @<id_del_bot>, lo consideramos mención explícita
  if (!mentionedBot && botSimpleTag && rawMessage.includes(`@${botSimpleTag}`)) {
    mentionedBot = true;
  }

  if (mentionedBot) {
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
      return;
    }
  }

  if (groupChat.participants && groupChat.participants.length > 0) {
    await inviteMissingGroupMembers(groupChat.participants, inviterPhone, inviterName);
  }

  // Comandos disponibles en grupos
  if (messageText === '/dividir' || messageText === '/gastos' || messageText === '/split') {
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
  else if (messageText === '/gasto') {
    await msg.reply(
      '💵 *Agregar gasto rápido*\n\n' +
      'Escribí `/gasto 5000 pizza` o cualquier texto con el monto y la descripción.\n' +
      'El bot detecta automáticamente que el pago lo hiciste vos.\n\n' +
      'Ejemplos:\n' +
      '• `/gasto 4500 super`\n' +
      '• `/gasto compré bebidas 3200`\n' +
      '• `/gasto gasolina 18.500`\n\n' +
      'Usa */resumen* para ver todos los gastos.'
    );
  }
  else if (messageText.startsWith('/gasto')) {
    const gastoData = messageText.slice('/gasto'.length).trim();

    if (!gastoData) {
      await msg.reply(
        '💵 *Agregar gasto rápido*\n\n' +
        'Escribí `/gasto 5000 pizza` o cualquier texto con el monto y la descripción.\n' +
        'El bot detecta automáticamente que el pago lo hiciste vos.\n\n' +
        'Ejemplos:\n' +
        '• `/gasto 4500 super`\n' +
        '• `/gasto compré bebidas 3200`\n' +
        '• `/gasto gasolina 18.500`\n\n' +
        'Usa */resumen* para ver todos los gastos.'
      );
      return;
    }

    const amountMatch = gastoData.match(/(\d+[.,]?\d*(?:[.,]\d{1,2})?)/);
    if (!amountMatch) {
      await msg.reply('❌ Necesito un monto en el mensaje. Ejemplos: `/gasto 5000 pizza`, `/gasto cena 3200`.');
        return;
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
    const amount = parseFloat(normalizedAmount);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      await msg.reply('❌ Monto inválido. Ejemplos: `/gasto 5000 pizza`, `/gasto cena 3200`.');
      return;
    }

    let description = gastoData.replace(rawAmount, '').replace(/\|/g, ' ').trim();
    if (!description) {
      // Intentar tomar descripción del segmento después de |
      const parts = gastoData.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        description = parts.find(part => !part.includes(rawAmount)) || '';
      }
    }
    description = description.replace(/\s+/g, ' ').trim();
    if (!description) {
      description = 'Gasto registrado';
    }

    const groupParticipants = groupChat.participants || [];
      const expenseGroup = db.prepare(`
        SELECT id FROM expense_groups 
        WHERE creator_phone = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(groupId);

      if (!expenseGroup) {
        await msg.reply('❌ Primero debes crear un grupo de gastos con */dividir*');
        return;
      }

    const allowedPhones = (groupParticipants || []).map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
    await syncGroupParticipants(expenseGroup.id, groupParticipants);
    cleanupGroupParticipants(expenseGroup.id, allowedPhones);

    const payerSerialized = msg.author || null;
    const payerPhone = payerSerialized ? payerSerialized.replace('@c.us', '') : null;

    if (!payerPhone) {
      await msg.reply('❌ No pude identificar quién pagó. Intenta nuevamente.');
      return;
    }

    let participant = db.prepare(`
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
      } catch (error) {
        console.warn('[WARN] No se pudo agregar participante automáticamente:', error.message);
        participant = { phone: payerPhone, name: safeName };
      }
    } else {
      participant.name = isMeaningfulName(participant.name) ? participant.name : formatPhoneForDisplay(participant.phone);
      }

      addExpense(expenseGroup.id, participant.phone, amount, description);
      
      await msg.reply(
        `✅ *Gasto agregado*\n\n` +
      `💵 Monto: ${formatAmount(amount)}\n` +
        `📝 Concepto: ${description}\n` +
        `💳 Pagado por: ${participant.name}\n\n` +
        `Usa */resumen* para ver todos los gastos`
      );
  }
  else if (messageText === '/resumen') {
    // Ver resumen de gastos
    const expenseGroup = db.prepare(`
      SELECT id FROM expense_groups 
      WHERE creator_phone = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(groupId);

    if (!expenseGroup) {
      await msg.reply('❌ Primero debes crear un grupo de gastos con */dividir*');
      return;
    }

    const groupParticipants = groupChat.participants || [];
    const allowedPhones = (groupParticipants || []).map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
    await syncGroupParticipants(expenseGroup.id, groupParticipants);
    cleanupGroupParticipants(expenseGroup.id, allowedPhones);

    const summary = getExpenseSummary(expenseGroup.id);

    if (summary.expenses.length === 0) {
      await msg.reply('📋 No hay gastos registrados todavía.\n\nUsa */gasto* para agregar uno.');
      return;
    }

    const extraPhones = summary.expenses.map(e => e.payer_phone).filter(Boolean);
    const { map: displayNameMap, count: participantCount } = await buildParticipantDisplayMap(expenseGroup.id, extraPhones);

    const expenseLines = summary.expenses.map((e, i) => {
      const phoneKey = normalizePhone(e.payer_phone);
      const payerName = displayNameMap[phoneKey] || e.payer_name || formatPhoneForDisplay(e.payer_phone);
      return `${i + 1}. ${formatAmount(e.amount)} - ${e.description}\n   💳 ${payerName}`;
    }).join('\n\n');

    const response = `📋 *Resumen de Gastos*\n\n` +
      `💰 *Total:* ${formatAmount(summary.total)}\n` +
      `👥 *Participantes:* ${participantCount}\n` +
      `📊 *Por persona:* ${formatAmount(summary.perPerson)}\n\n` +
      `*Gastos registrados:*\n\n${expenseLines}\n\n` +
      `💡 Comandos rápidos:\n` +
      `• /gasto 5000 pizza\n` +
      `• /resumen\n` +
      `• /calcular\n\n` +
      `💬 Podés escribirme por privado con *hola* o *menu* para más opciones.`;

    await msg.reply(response);
  }
  else if (messageText === '/calcular') {
    // Calcular división
    const expenseGroup = db.prepare(`
      SELECT id FROM expense_groups 
      WHERE creator_phone = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(groupId);

    if (!expenseGroup) {
      await msg.reply('❌ Primero debes crear un grupo de gastos con */dividir*');
      return;
    }

    const groupParticipants = groupChat.participants || [];
    const allowedPhones = (groupParticipants || []).map(p => convertRawPhone(p?.id?.user)).filter(Boolean);
    await syncGroupParticipants(expenseGroup.id, groupParticipants);
    cleanupGroupParticipants(expenseGroup.id, allowedPhones);

    const split = calculateSplit(expenseGroup.id);

    if (split.transactions.length === 0) {
      await msg.reply('✅ *¡Todo pagado!*\n\nNo hay deudas pendientes. Todos están al día.');
      return;
    }

    const involvedPhones = [];
    split.transactions.forEach(t => {
      if (t.fromPhone) involvedPhones.push(t.fromPhone);
      if (t.toPhone) involvedPhones.push(t.toPhone);
    });

    const { map: displayNameMap } = await buildParticipantDisplayMap(expenseGroup.id, involvedPhones);

    const transactionLines = split.transactions.map((t, i) => {
      const fromName = displayNameMap[normalizePhone(t.fromPhone)] || t.from || formatPhoneForDisplay(t.fromPhone);
      const toName = displayNameMap[normalizePhone(t.toPhone)] || t.to || formatPhoneForDisplay(t.toPhone);
      return `${i + 1}. *${fromName}* → *${formatAmount(t.amount)}* → *${toName}*`;
    }).join('\n\n');

    const response = `💸 *División de Gastos*\n\n` +
      `💰 Total: ${formatAmount(split.total)}\n` +
      `👥 Por persona: ${formatAmount(split.perPerson)}\n\n` +
      `*Transferencias a realizar:*\n\n${transactionLines}\n\n` +
      `_💡 Estas transferencias minimizan la cantidad de pagos._\n\n` +
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
  
  // Si el mensaje está vacío (imagen, audio, etc.), ignorar - EXCEPTO vcards (contactos)
  if ((!messageText || messageText.trim() === '') && !isVCard) {
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

  // Obtener nombre del contacto
  const contact = await msg.getContact();
  const userName = contact.pushname || contact.name || contact.number || 'Usuario';
  
  console.log(`👤 Nombre del contacto: ${userName}`);

  const userInfo = registerUser(userPhone, userName);

  // Reiniciar timeout cada vez que el usuario envía un mensaje
  resetTimeout(userPhone);

  const session = getSession(userPhone);
  const currentModule = session?.current_module || 'main';

  let response = '';

  // Si es usuario nuevo, dar bienvenida personalizada
  if (userInfo.isNewUser) {
    response = `¡Hola *${userName}*! 👋 Bienvenido/a.\n\nSoy tu asistente personal de WhatsApp.\n\n` + getMainMenu();
    updateSession(userPhone, 'main');
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  // Saludos comunes que activan el menú
  const saludos = ['hola', 'hi', 'hello', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'ola'];
  const mensajeLower = messageText.toLowerCase().trim();
  
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
      response = getMainMenu(userName);
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
        const weatherModule = require('./modules/weather-module');
        const forecastMain = await weatherModule.getWeatherForecast(db, userPhone, userName);
        response = forecastMain.message;
        if (forecastMain.pendingLocation) {
          updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation: forecastMain.pendingLocation }));
        } else {
          updateSession(userPhone, 'weather', null);
        }
        break;
      case '2':
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
      case '3':
        response = getExpensesMenu();
        updateSession(userPhone, 'expenses');
        break;
      case '4': {
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
      case '5':
        response = `Hola *${userName}*! 🤖\n\nModo IA activado. Habla naturalmente y te ayudaré.\n\n_La sesión se cerrará automáticamente después de 5 minutos de inactividad._`;
        updateSession(userPhone, 'ai');
        break;
      case '6': {
        const startCurrency = currencyModule.startCurrencyFlow(db, userPhone);
        response = startCurrency.message;
        updateSession(userPhone, 'currency', startCurrency.context);
        break;
      }
      case '7':
        response = '🤝 *Invitar a un amigo*\n\n¿Cómo querés compartir la invitación?\n\n1️⃣ Compartir contacto de WhatsApp\n2️⃣ Escribir número manualmente\n3️⃣ Cancelar\n\n💡 Podés escribir *"volver"* en cualquier momento para regresar al menú.';
        updateSession(userPhone, 'invite_friend_method', JSON.stringify({ inviterName: userName, inviterPhone: userPhone }));
        break;
      case '8':
        response = '⚙️ *Configuración general*\n\nPronto vas a poder administrar preferencias generales desde aquí.\nPor ahora, configura cada módulo desde sus propios menús.\n\nEscribe *menu* para volver al inicio.';
        break;
      case '9':
        response = 'ℹ️ *Ayuda*\n\nPuedes interactuar de dos formas:\n\n*📱 Por menús:* Navega con números\n*💬 Por voz:* Habla naturalmente\n\nEjemplos:\n- "Recuérdame mañana comprar pan"\n- "Crea un grupo para el asado"\n- "¿Cuánto debo?"\n\nEscribe *menu* para volver al inicio.\n\n*📝 Reportar problemas:*\n• */feedback* - Dejar comentario\n• */bug* - Reportar error\n• */sugerencia* - Nueva idea\n\n_⚠️ Importante: La sesión se cierra después de 5 min sin actividad._';
        break;
      default:
        response = getMainMenu(userName);
    }
  }
  else if (currentModule === 'weather') {
    // Manejar configuración de ubicación o solicitudes de clima
    const weatherModule = require('./modules/weather-module');
    const weatherAPI = require('./modules/weather-module/weather-api');
    
    if (messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'menú' || messageText === '0' || messageText.toLowerCase() === 'volver') {
      response = getMainMenu(userName);
      updateSession(userPhone, 'main');
    }
    else if (messageText === '1' || messageText === '1️⃣' || messageText.toLowerCase() === 'automático' || messageText.toLowerCase() === 'automatico') {
      try {
        const forecastAuto = await weatherModule.getWeatherForecast(db, userPhone, userName, true);
        response = forecastAuto.message;
        if (!response) {
          response = '⏳ Detectando tu ubicación... Por favor espera un momento.';
        }
        if (forecastAuto.pendingLocation) {
          updateSession(userPhone, 'weather_save_location', JSON.stringify({ pendingLocation: forecastAuto.pendingLocation }));
        } else {
          updateSession(userPhone, 'weather', null);
        }
      } catch (error) {
        console.error('[ERROR] Error en detección automática:', error);
        console.error('[ERROR] Stack:', error.stack);
        response = `❌ Error al detectar tu ubicación automáticamente.\n\n` +
          `Error: ${error.message}\n\n` +
          `Por favor intenta escribir el nombre de tu ciudad manualmente (opción 2).`;
        updateSession(userPhone, 'weather', null);
      }
    }
    // Opción 2: Escribir ciudad manualmente
    else if (messageText === '2' || messageText === '2️⃣') {
      response = '🌤️ *Escribir Ciudad*\n\nEscribe el nombre de tu ciudad:\n\n_Ejemplo: Mendoza, Buenos Aires, Córdoba, Rosario_';
      updateSession(userPhone, 'weather_city');
    }
    else if (messageText === '3' || messageText === '3️⃣') {
      response = getMainMenu(userName);
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
        const forecastManual = await weatherModule.getWeatherForecast(db, userPhone, userName);
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
      response = getMainMenu(userName);
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

        const forecastCity = await weatherModule.getWeatherForecast(db, userPhone, userName);
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
      response = getMainMenu(userName);
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
      response = getMainMenu(userName);
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
      response = getMainMenu(userName);
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
      response = getMainMenu(userName);
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

        const updatedForecast = await weatherModule.getWeatherForecast(db, userPhone, userName);
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
          response = `📊 *Tus grupos activos*\n\n${list}\n\nEscribe el número del grupo que querés administrar o *"menu"* para volver.`;
          updateSession(userPhone, 'expenses_select_group', JSON.stringify({ groups }));
        }
        break;
      }
      case '3':
        response = getMainMenu(userName);
        updateSession(userPhone, 'main');
        break;
      default:
        response = getExpensesMenu();
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
        response = `✅ Perfecto *${userName}*!\n\nGrupo configurado con ${participants.length} participante(s):\n\n${listado}\n\n${buildExpensesManageMenu(groupName)}`;
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
      response = `✅ Perfecto!\n\nGrupo configurado con ${participants.length} participante(s):\n\n${listado}\n\n${buildExpensesManageMenu(groupName)}`;
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
      response = `✅ Perfecto!\n\nGrupo configurado con ${participants.length} participante(s):\n\n${listado}\n\n${buildExpensesManageMenu(groupName)}`;
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
        response = `✅ Participantes agregados:\n\n${listado}\n\n${buildExpensesManageMenu(groupName)}`;
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
      }
    } else if (messageText.toLowerCase() === 'cancelar') {
      response = getExpensesMenu();
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
        const summary = getExpenseSummary(groupId);
        if (summary.expenses.length === 0) {
          response = '📋 No hay gastos registrados todavía.\n\nSelecciona *1* para agregar el primer gasto.';
        } else {
          response = `📋 *Resumen del grupo*\n\n` +
            `💰 *Total gastado:* ${summary.total}\n` +
            `👥 *Participantes:* ${summary.participantCount}\n` +
            `📊 *Por persona:* ${summary.perPerson}\n\n` +
            `*Gastos registrados:*\n\n` +
            summary.expenses.map((e, i) => 
              `${i+1}. ${e.amount} - ${e.description}\n   💳 Pagó: ${e.payer_name || 'N/A'}`
            ).join('\n\n') +
            `\n\n${buildExpensesManageMenu(groupName)}`;
        }
        break;
      }
      case '3': {
        const split = calculateSplit(groupId);
        if (split.transactions.length === 0) {
          response = '✅ *¡Todo pagado!*\n\nNo hay deudas pendientes. Todos están al día.';
        } else {
          response = `💸 *División de gastos*\n\n` +
            `💰 Total: ${split.total}\n` +
            `👥 Por persona: ${split.perPerson}\n\n` +
            `*Transferencias a realizar:*\n\n` +
            split.transactions.map((t, i) => 
              `${i+1}. *${t.from}* paga *${t.amount}* a *${t.to}*`
            ).join('\n\n') +
            '\n\n_Estas transferencias minimizan la cantidad de pagos necesarios._';
        }
        response += `\n\n${buildExpensesManageMenu(groupName)}`;
        break;
      }
      case '4': {
        const participants = getGroupParticipants(groupId);
        if (participants.length === 0) {
          response = '❌ El grupo no tiene participantes cargados.';
          response += `\n\n${buildExpensesManageMenu(groupName)}`;
        } else {
          const list = participants.map((p, i) => `${i + 1}. ${p.name} (${p.phone})`).join('\n');
          response = `👥 *Participantes del grupo*\n\n${list}\n\nEscribe el número del participante que querés quitar o *0* para cancelar.`;
          updateSession(userPhone, 'expenses_manage_participants', JSON.stringify({ groupId, groupName, participants }));
        }
        break;
      }
      case '5':
        response = `⚠️ *Eliminar grupo*\n\n¿Seguro que querés eliminar "${groupName}"? Esta acción no se puede deshacer.\n\n1️⃣ Sí, eliminar\n2️⃣ No, volver`;
        updateSession(userPhone, 'expenses_delete_confirm', JSON.stringify({ groupId, groupName }));
        break;
      case '6':
        response = getExpensesMenu();
        updateSession(userPhone, 'expenses');
        break;
      default:
        response = buildExpensesManageMenu(groupName);
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
      response = `${buildExpensesManageMenu(groupName)}`;
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      response = '❌ Formato incorrecto.\n\nUsa: *Monto | Descripción | Quién pagó*\n\nEjemplo:\n3500 | Bebidas | María';
    }
  }
  else if (currentModule === 'ai') {
    response = await processWithAI(messageText, userPhone);
  }
  else if (currentModule === 'expenses_select_group') {
    const context = JSON.parse(session.context || '{}');
    const groups = context.groups || [];

    if (['menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      response = getExpensesMenu();
      updateSession(userPhone, 'expenses');
    } else {
      const index = parseInt(messageText, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= groups.length) {
        response = '❌ Opción inválida. Escribe el número del grupo que querés administrar o *"menu"* para volver.';
      } else {
        const selected = groups[index];
        const groupName = getExpenseGroupName(selected.id);
        response = buildExpensesManageMenu(groupName);
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId: selected.id, groupName }));
      }
    }
  }
  else if (currentModule === 'expenses_manage_participants') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    const participants = context.participants || [];
    
    if (['0', 'menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      response = buildExpensesManageMenu(groupName);
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
          response += `\n\n${buildExpensesManageMenu(groupName)}`;
          updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
        } else {
          const updatedParticipants = getGroupParticipants(groupId);
          if (updatedParticipants.length === 0) {
            response = '✅ Participante eliminado. El grupo quedó sin participantes.';
            response += `\n\n${buildExpensesManageMenu(groupName)}`;
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
  else if (currentModule === 'expenses_delete_confirm') {
    const context = JSON.parse(session.context || '{}');
    const groupId = context.groupId;
    const groupName = context.groupName || getExpenseGroupName(groupId);
    
    if (messageText === '1') {
      const result = deleteExpenseGroup(groupId, userPhone);
      if (result.success) {
        response = `🗑️ *Grupo eliminado*\n\n"${groupName}" fue eliminado correctamente.\n\n📊 La liquidación final ya está guardada y podés consultarla desde el menú *Dividir Gastos* en Milo.`;
      } else {
        response = `❌ ${result.message}`;
      }
      response += `\n\n${getExpensesMenu()}`;
      updateSession(userPhone, 'expenses');
    } else if (messageText === '2' || ['menu', 'menú', 'volver'].includes(messageText.toLowerCase())) {
      response = buildExpensesManageMenu(groupName);
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId, groupName }));
    } else {
      response = '❌ Opción inválida. Responde con 1 para eliminar el grupo o 2 para cancelar.';
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

      const commandsHelp = '💰 *Comandos rápidos de gastos:*\n' +
        '• `/gasto 5000 pizza`\n' +
        '• `/resumen`\n' +
        '• `/calcular`\n\n';

      const welcomeMessage = `👋 ¡Hola a todos!\n\nSoy *Milo*, su asistente personal en WhatsApp. Estoy acá para ayudar a organizar eventos, dividir gastos, consultar el clima y más.\n\n${commandsHelp}💡 Escriban *"hola"* o *"menu"* en un chat privado conmigo para empezar.\n\n¡Gracias por invitarme a *${groupName}*!`;
      await client.sendMessage(chatId, welcomeMessage);

      let inviterPhone = null;
      let inviterName = 'Un integrante del grupo';
      if (notification.author) {
        inviterPhone = notification.author.replace('@c.us', '');
        try {
          const authorContact = await client.getContactById(notification.author);
          inviterName = authorContact?.pushname || authorContact?.name || authorContact?.number || inviterName;
        } catch (error) {
          console.warn('[WARN] No se pudo obtener información del autor del grupo:', error.message);
        }
      }

      if (groupChat?.participants?.length) {
        await inviteMissingGroupMembers(groupChat.participants, inviterPhone, inviterName);
      }
    }
  } catch (error) {
    console.error('Error en group_join:', error);
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

// Iniciar el cliente de WhatsApp
console.log('🚀 Iniciando bot...');
client.initialize();

function getUserExpenseGroups(userPhone) {
  return db.prepare(`
    SELECT g.id, g.name, g.created_at,
      (SELECT COUNT(*) FROM group_participants gp WHERE gp.group_id = g.id) AS participant_count
    FROM expense_groups g
    LEFT JOIN group_participants gp2 ON g.id = gp2.group_id
    WHERE g.creator_phone = ? OR gp2.phone = ?
    GROUP BY g.id
    HAVING IFNULL(g.is_closed, 0) = 0
    ORDER BY g.created_at DESC
  `).all(userPhone, userPhone);
}

function getGroupParticipants(groupId) {
  return db.prepare(`
    SELECT id, name, phone
    FROM group_participants
    WHERE group_id = ?
    ORDER BY id
  `).all(groupId);
}

function deleteExpenseGroup(groupId, userPhone) {
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

  db.prepare('DELETE FROM expenses WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM group_participants WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM expense_groups WHERE id = ?').run(groupId);

  return { success: true, name: group.name };
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

function buildExpensesManageMenu(groupName = '') {
  const header = groupName ? `💰 *${groupName}*` : '💰 *Dividir Gastos*';
  return `${header}\n\n1. Agregar gasto\n2. Ver resumen\n3. Calcular división\n4. Ver/Quitar participantes\n5. Eliminar grupo\n6. Volver al menú de gastos\n\n💡 Escribí *"menu"* para volver al inicio.`;
}

function getExpenseGroupName(groupId) {
  const row = db.prepare(`
    SELECT name FROM expense_groups WHERE id = ?
  `).get(groupId);
  return row ? row.name : 'Grupo de gastos';
}

module.exports = {
  getMainMenu
};

