// ============================================
// 🔔 SISTEMA DE NOTIFICACIONES AUTOMÁTICAS
// ============================================

const database = require('./database');
const utils = require('./utils');
let statsModule = null;

try {
  statsModule = require('../stats-module');
} catch (error) {
  console.warn('[WARN] Módulo de estadísticas no disponible para recordatorios:', error.message);
}

const ENABLE_REMINDERS = process.env.ENABLE_CALENDAR_REMINDERS !== 'false';
const INTERVAL_MINUTES = Math.max(parseInt(process.env.CALENDAR_REMINDER_INTERVAL_MINUTES || '15', 10), 1);
const GRACE_MINUTES = Math.max(parseInt(process.env.CALENDAR_REMINDER_GRACE_MINUTES || '5', 10), 0);

const REMINDER_TYPES = [
  { type: '24h', label: '24 horas', offsetMinutes: 1440 },
  { type: '1h', label: '1 hora', offsetMinutes: 60 }
];

const MAX_LOOKAHEAD_MINUTES = Math.max(...REMINDER_TYPES.map(t => t.offsetMinutes)) + INTERVAL_MINUTES + GRACE_MINUTES;

let whatsappClient = null;
let db = null;
let intervalHandle = null;
let isRunning = false;
let lastClientWarning = 0;

function startService(client, dbInstance) {
  whatsappClient = client;
  db = dbInstance;

  if (!ENABLE_REMINDERS) {
    console.log('ℹ️ Recordatorios automáticos de calendario deshabilitados (ENABLE_CALENDAR_REMINDERS=false).');
    return;
  }

  try {
    database.ensureSchemaCompatibility(db);
  } catch (error) {
    console.error('❌ No se pudo garantizar la compatibilidad del esquema para recordatorios:', error.message);
  }

  if (intervalHandle) {
    clearInterval(intervalHandle);
  }

  const intervalMs = INTERVAL_MINUTES * 60 * 1000;
  console.log(`🔔 Servicio de recordatorios automáticos iniciado (cada ${INTERVAL_MINUTES} minuto${INTERVAL_MINUTES !== 1 ? 's' : ''})`);

  // Primera ejecución inmediata
  runReminderCycle().catch(error => {
    console.error('❌ Error en la primera ejecución del servicio de recordatorios:', error);
  });

  intervalHandle = setInterval(() => {
    runReminderCycle().catch(error => {
      console.error('❌ Error en ciclo de recordatorios:', error);
    });
  }, intervalMs);
}

function isClientReady() {
  if (!whatsappClient) {
    return false;
  }

  try {
    if (whatsappClient.info && whatsappClient.info.wid) {
      return true;
    }

    if (whatsappClient.pupPage && !whatsappClient.pupPage.isClosed()) {
      return true;
    }
  } catch (error) {
    return false;
  }

  return false;
}

async function runReminderCycle() {
  if (!whatsappClient || !db) {
    return;
  }

  if (isRunning) {
    return;
  }

  if (!isClientReady()) {
    const now = Date.now();
    if (now - lastClientWarning > 60000) {
      console.warn('⚠️ Cliente de WhatsApp no está listo. Se omiten recordatorios.');
      lastClientWarning = now;
    }
    return;
  }

  isRunning = true;

  try {
    const events = database.getUpcomingReminderEvents(db, MAX_LOOKAHEAD_MINUTES);
    const now = new Date();
    const windowSize = INTERVAL_MINUTES + GRACE_MINUTES;

    for (const event of events) {
      if (!event || Number(event.calendar_reminders_enabled) === 0) {
        continue;
      }

      const eventDate = new Date(event.event_date);
      const diffMinutes = (eventDate.getTime() - now.getTime()) / 60000;

      if (Number.isNaN(diffMinutes) || diffMinutes < -5) {
        continue;
      }

      const dueReminders = determineDueReminders(event, diffMinutes, windowSize);

      for (const reminder of dueReminders) {
        await processReminder(event, reminder, diffMinutes);
      }
    }
  } catch (error) {
    console.error('❌ Error procesando recordatorios de calendario:', error);
  } finally {
    isRunning = false;
  }
}

function determineDueReminders(event, diffMinutes, windowSize) {
  const due = [];

  for (const reminderType of REMINDER_TYPES) {
    const alreadySent = reminderType.type === '24h'
      ? Number(event.reminder_24h_sent)
      : Number(event.reminder_1h_sent);

    if (alreadySent) {
      continue;
    }

    const offset = reminderType.offsetMinutes;
    const windowStart = offset - windowSize;
    const windowEnd = offset + GRACE_MINUTES;

    if (diffMinutes <= windowEnd && diffMinutes > windowStart) {
      due.push(reminderType);
    }
  }

  return due;
}

async function processReminder(event, reminderType, diffMinutes) {
  const recipients = buildRecipientList(event);

  if (recipients.length === 0) {
    database.markReminderSentFlag(db, event.id, reminderType.type);
    return;
  }

  let allSucceeded = true;

  for (const recipient of recipients) {
    const message = buildReminderMessage(event, reminderType, diffMinutes, recipient);
    const result = await sendReminderMessage(recipient, message, event, reminderType);
    if (!result.success) {
      allSucceeded = false;
    }
  }

  database.markReminderSentFlag(db, event.id, reminderType.type);

  if (statsModule) {
    try {
      statsModule.trackEvent(db, event.user_phone, 'calendar_reminder_sent', {
        eventId: event.id,
        reminderType: reminderType.type,
        recipients: recipients.length,
        sentSuccessfully: allSucceeded,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.warn('[WARN] No se pudo registrar estadística de recordatorio:', error.message);
    }
  }
}

function buildRecipientList(event) {
  const recipients = [];
  const seen = new Set();

  const ownerPhone = normalizePhone(event.user_phone);
  if (ownerPhone) {
    recipients.push({
      phone: ownerPhone,
      rawPhone: event.user_phone,
      name: event.user_name || null,
      isOwner: true
    });
    seen.add(ownerPhone);
  }

  if (Array.isArray(event.invitees)) {
    for (const invitee of event.invitees) {
      const normalized = normalizePhone(invitee.phone);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      recipients.push({
        phone: normalized,
        rawPhone: invitee.phone,
        name: invitee.name || null,
        isOwner: false
      });
      seen.add(normalized);
    }
  }

  return recipients;
}

function buildReminderMessage(event, reminderType, diffMinutes, recipient) {
  const eventDate = new Date(event.event_date);
  let dateDisplay;

  try {
    dateDisplay = utils.formatDateForDisplay(event.event_date);
  } catch (error) {
    dateDisplay = eventDate.toLocaleString('es-AR');
  }

  const remainingText = formatRemainingTime(diffMinutes);

  let message = '🔔 *Recordatorio de calendario*\n\n';
  message += `📌 *${(event.title || 'Evento sin título').toString().trim()}*\n`;
  message += `🗓️ ${dateDisplay}\n`;
  message += `⏱️ ${remainingText}\n`;

  if (event.description && event.description.trim()) {
    const cleanDescription = event.description.toString().trim().substring(0, 400);
    message += `\n📝 ${cleanDescription}\n`;
  }

  if (!recipient.isOwner) {
    const ownerName = event.user_name || formatPhoneForDisplay(event.user_phone);
    message += `\n👥 Organiza: *${ownerName}*`;
  }

  message += `\n\n💡 Escribí *"evento ${event.id}"* para ver los detalles.`;

  if (recipient.isOwner) {
    message += `\n✅ Podés responder con *"listo ${event.id}"* cuando lo completes.`;
  }

  return message;
}

async function sendReminderMessage(recipient, message, event, reminderType) {
  const jid = `${recipient.phone}@c.us`;
  const timeoutMs = 10000;

  try {
    const sendPromise = whatsappClient.sendMessage(jid, message);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout enviando mensaje')), timeoutMs);
    });

    await Promise.race([sendPromise, timeoutPromise]);

    database.insertReminderLog(db, event.id, recipient.rawPhone, reminderType.type, 'sent', null);
    return { success: true };
  } catch (error) {
    const errorMessage = error && error.message ? error.message : 'Error desconocido';
    console.error(`❌ Error enviando recordatorio (${reminderType.type}) del evento ${event.id} a ${recipient.rawPhone}:`, errorMessage);
    database.insertReminderLog(db, event.id, recipient.rawPhone, reminderType.type, 'failed', errorMessage);
    return { success: false, error };
  }
}

function normalizePhone(phone = '') {
  if (!phone) {
    return null;
  }
  const digits = phone.toString().replace(/\D/g, '');
  if (!digits || digits.length < 6 || digits.length > 15) {
    return null;
  }
  return digits;
}

function formatPhoneForDisplay(phone = '') {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return 'Contacto';
  }
  return `+${normalized}`;
}

function formatRemainingTime(diffMinutes) {
  if (diffMinutes >= 1440) {
    const days = Math.round(diffMinutes / 1440);
    return `Faltan ${days} día${days !== 1 ? 's' : ''}`;
  }

  if (diffMinutes >= 60) {
    const hours = Math.round(diffMinutes / 60);
    return `Faltan ${hours} hora${hours !== 1 ? 's' : ''}`;
  }

  const minutes = Math.max(Math.round(diffMinutes), 1);
  return `Faltan ${minutes} minuto${minutes !== 1 ? 's' : ''}`;
}

async function sendTestNotification(userPhone, eventTitle) {
  if (!whatsappClient) {
    return { success: false, error: 'Cliente de WhatsApp no disponible' };
  }

  const normalized = normalizePhone(userPhone);
  if (!normalized) {
    return { success: false, error: 'Número inválido' };
  }

  const message = `🔔 *Notificación de Prueba*\n\n` +
    `Evento: ${eventTitle || 'Ejemplo'}\n` +
    `Hora: ${new Date().toLocaleString('es-AR')}\n\n` +
    `✅ El sistema de recordatorios está funcionando.`;

  try {
    await whatsappClient.sendMessage(`${normalized}@c.us`, message);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || 'Error enviando mensaje' };
  }
}

function getNotificationStats(dbInstance) {
  try {
    const stmt = dbInstance.prepare(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN reminder_24h_sent = 1 THEN 1 ELSE 0 END) as reminders_24h,
        SUM(CASE WHEN reminder_1h_sent = 1 THEN 1 ELSE 0 END) as reminders_1h,
        SUM(CASE WHEN reminder_24h_sent = 1 OR reminder_1h_sent = 1 THEN 1 ELSE 0 END) as reminders_any
      FROM calendar_events
      WHERE has_due_date = 1 AND is_reminder = 0
    `);

    const stats = stmt.get();
    const logCount = dbInstance.prepare('SELECT COUNT(*) as count FROM calendar_reminders_log').get();

    return {
      total_events: stats.total_events || 0,
      reminders_24h: stats.reminders_24h || 0,
      reminders_1h: stats.reminders_1h || 0,
      reminders_any: stats.reminders_any || 0,
      log_entries: logCount.count || 0
    };
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de recordatorios:', error);
    return {
      total_events: 0,
      reminders_24h: 0,
      reminders_1h: 0,
      reminders_any: 0,
      log_entries: 0
    };
  }
}

module.exports = {
  startService,
  sendTestNotification,
  getNotificationStats
};
