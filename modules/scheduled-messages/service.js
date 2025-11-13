const { formatDateForDisplay } = require('../calendar-module/utils');
const scheduledMessages = require('./index');

const ENABLE_SCHEDULED_MESSAGES = process.env.ENABLE_SCHEDULED_MESSAGES !== 'false';
const INTERVAL_MINUTES = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_INTERVAL_MINUTES || '1', 10), 1);
const GRACE_MINUTES = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_GRACE_MINUTES || '1', 10), 0);
const MAX_ATTEMPTS = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_MAX_ATTEMPTS || '3', 10), 1);
const BATCH_SIZE = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_BATCH_SIZE || '20', 10), 1);

// Buscar mensajes que deberían enviarse ahora o en el pasado (hasta 10 minutos atrás por si se perdió algún ciclo)
const MAX_LOOKAHEAD_MINUTES = INTERVAL_MINUTES + GRACE_MINUTES + 10;

let whatsappClient = null;
let db = null;
let intervalHandle = null;
let running = false;
let lastClientWarning = 0;
let statsModule = null;

try {
  statsModule = require('../stats-module');
} catch (error) {
  console.warn('[WARN] Módulo de estadísticas no disponible para mensajes programados:', error.message);
}

function startService(client, dbInstance) {
  whatsappClient = client;
  db = dbInstance;

  if (!ENABLE_SCHEDULED_MESSAGES) {
    console.log('ℹ️ Servicio de mensajes programados deshabilitado (ENABLE_SCHEDULED_MESSAGES=false).');
    return;
  }

  if (!whatsappClient || !db) {
    console.warn('⚠️ No se puede iniciar el servicio de mensajes programados: cliente o base de datos no disponibles');
    return;
  }

  if (intervalHandle) {
    clearInterval(intervalHandle);
  }

  executeCycle().catch(error => {
    console.error('❌ Error en la primera ejecución del servicio de mensajes programados:', error);
  });

  const intervalMs = INTERVAL_MINUTES * 60 * 1000;
  intervalHandle = setInterval(() => {
    executeCycle().catch(error => {
      console.error('❌ Error en ciclo de mensajes programados:', error);
    });
  }, intervalMs);

  console.log(`🗓️ Servicio de mensajes programados activo (cada ${INTERVAL_MINUTES} minuto${INTERVAL_MINUTES === 1 ? '' : 's'})`);
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

async function executeCycle() {
  if (!whatsappClient || !db) {
    return;
  }

  if (running) {
    return;
  }

  if (!isClientReady()) {
    const now = Date.now();
    if (now - lastClientWarning > 60000) {
      console.warn('⚠️ Cliente de WhatsApp no está listo. Se omiten mensajes programados.');
      lastClientWarning = now;
    }
    return;
  }

  running = true;

  try {
    // Buscar mensajes que deberían enviarse ahora o en el pasado (con grace period)
    // Usamos datetime('now', 'localtime') para comparar correctamente con send_at que está en formato local
    const upcoming = db.prepare(`
      SELECT id, creator_phone, target_chat, target_type, message_body, send_at, timezone_offset, attempts
      FROM scheduled_messages
      WHERE status = 'pending'
        AND datetime(send_at) <= datetime('now', 'localtime', '+${GRACE_MINUTES} minutes')
        AND datetime(send_at) >= datetime('now', 'localtime', '-${MAX_LOOKAHEAD_MINUTES} minutes')
      ORDER BY datetime(send_at) ASC
      LIMIT ?
    `).all(BATCH_SIZE);

    if (!upcoming || upcoming.length === 0) {
      return;
    }

    for (const item of upcoming) {
      await processScheduledMessage(item);
    }
  } catch (error) {
    console.error('❌ Error procesando mensajes programados:', error);
  } finally {
    running = false;
  }
}

async function processScheduledMessage(item) {
  if (!item) {
    return;
  }

  const now = new Date();
  // send_at está en formato 'YYYY-MM-DD HH:MM:SS' en timezone local del servidor
  // Parsearlo como fecha local (no UTC)
  const [datePart, timePart] = item.send_at.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  const sendAtDate = new Date(year, month - 1, day, hour, minute, second || 0);
  
  // Calcular diferencia en minutos
  const diffMinutes = (sendAtDate.getTime() - now.getTime()) / 60000;
  
  // Enviar si el mensaje debería haberse enviado ya (pasado) o está dentro del grace period
  // No enviar si está más de grace period en el futuro (para evitar envíos anticipados)
  if (diffMinutes > GRACE_MINUTES) {
    return; // Todavía no es momento de enviar
  }

  const normalizedChat = normalizeChatId(item.target_chat);
  if (!normalizedChat) {
    markAsFailed(item, 'chat_invalid');
    return;
  }

  const messageBody = (item.message_body || '').trim();
  if (!messageBody) {
    markAsFailed(item, 'empty_message');
    return;
  }

  // Normalizar teléfonos para consultas en la base de datos
  // La función normalizePhone extrae solo los dígitos (sin @c.us, @g.us, @lid, etc.)
  function normalizePhone(phone = '') {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (!digits || digits.length < 6 || digits.length > 15) return null;
    return digits;
  }
  
  const normalizedCreatorPhone = normalizePhone(item.creator_phone);
  const normalizedTargetPhone = normalizePhone(item.target_chat);
  
  if (!normalizedCreatorPhone) {
    markAsFailed(item, 'creator_phone_invalid');
    return;
  }
  
  if (!normalizedTargetPhone) {
    markAsFailed(item, 'target_phone_invalid');
    return;
  }
  
  // Verificar si el destinatario es usuario del bot (usando teléfono normalizado)
  const isExistingUser = db.prepare('SELECT 1 FROM users WHERE phone = ?').get(normalizedTargetPhone);
  const isSelfMessage = normalizedTargetPhone === normalizedCreatorPhone;
  
  // Obtener nombre del creador para personalizar el mensaje (usando teléfono normalizado)
  const creatorInfo = db.prepare('SELECT name FROM users WHERE phone = ?').get(normalizedCreatorPhone);
  const creatorName = creatorInfo?.name || 'un usuario';
  
  // Construir mensaje final con encabezado personalizado
  let finalMessage = '';
  
  // Agregar encabezado indicando quién envió el mensaje (solo si no es a sí mismo)
  if (!isSelfMessage) {
    finalMessage += `💬 Mensaje de *${creatorName}*:\n\n`;
  }
  
  finalMessage += messageBody;
  
  // Agregar separador y pie de mensaje (solo si no es mensaje a sí mismo)
  if (!isSelfMessage) {
    finalMessage += '\n\n─\n';
    finalMessage += `📱 Enviado usando *Milo*`;
    
    // Si no es usuario existente, agregar invitación
    if (!isExistingUser) {
      // Obtener número del bot si está disponible
      let botPhoneNumber = null;
      try {
        if (whatsappClient && whatsappClient.info && whatsappClient.info.wid) {
          const botWid = whatsappClient.info.wid;
          botPhoneNumber = botWid.user || botWid._serialized?.replace('@c.us', '') || null;
        }
      } catch (e) {
        console.warn('[WARN] No se pudo obtener número del bot:', e.message);
      }
      
      finalMessage += '\n\n🤖 *Soy Milo, tu asistente personal*';
      finalMessage += '\nPuedo ayudarte a:';
      finalMessage += '\n• 📅 Gestionar tu calendario';
      finalMessage += '\n• 💰 Dividir gastos';
      finalMessage += '\n• 🌤️ Consultar el clima';
      finalMessage += '\n• 🗓️ Programar mensajes';
      
      if (botPhoneNumber) {
        finalMessage += `\n\n📌 *Agregame como contacto* para empezar a usarme.`;
        finalMessage += `\nMi número: *${botPhoneNumber}*`;
        finalMessage += `\n\nUna vez agregado, escribí *hola* para comenzar 👋`;
      } else {
        finalMessage += '\n\n📌 *Agregame como contacto* (busca "Milo" en WhatsApp) para empezar a usarme.';
        finalMessage += '\n\nUna vez agregado, escribí *hola* para comenzar 👋';
      }
    }
  }

  try {
    const sendPromise = whatsappClient.sendMessage(normalizedChat, finalMessage);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 10000);
    });

    const sentMessage = await Promise.race([sendPromise, timeoutPromise]);
    
    // Guardar el ID del mensaje de WhatsApp para poder detectar respuestas
    const whatsappMessageId = sentMessage?.id?._serialized || sentMessage?.id || null;

    db.prepare(`
      UPDATE scheduled_messages
      SET status = 'sent',
          updated_at = CURRENT_TIMESTAMP,
          last_attempt_at = CURRENT_TIMESTAMP,
          whatsapp_message_id = ?
      WHERE id = ?
    `).run(whatsappMessageId, item.id);

    db.prepare(`
      INSERT INTO scheduled_messages_log (scheduled_message_id, creator_phone, target_chat, status)
      VALUES (?, ?, ?, 'sent')
    `).run(item.id, item.creator_phone, item.target_chat);

    if (statsModule) {
      try {
        statsModule.trackEvent(db, item.creator_phone, 'scheduled_message_sent', {
          scheduledMessageId: item.id,
          targetChat: item.target_chat,
          timestamp: new Date().toISOString()
        });
      } catch (statsError) {
        console.warn('[WARN] No se pudo registrar estadística de mensajes programados:', statsError.message);
      }
    }
  } catch (error) {
    console.error(`❌ Error enviando mensaje programado ${item.id}:`, error.message || error);
    db.prepare(`
      UPDATE scheduled_messages
      SET attempts = attempts + 1,
          last_attempt_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(item.id);

    db.prepare(`
      INSERT INTO scheduled_messages_log (scheduled_message_id, creator_phone, target_chat, status, error_message)
      VALUES (?, ?, ?, 'failed', ?)
    `).run(item.id, item.creator_phone, item.target_chat, error.message || 'unknown error');

    const attempts = (item.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      db.prepare(`
        UPDATE scheduled_messages
        SET status = 'failed',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(item.id);

      try {
        await whatsappClient.sendMessage(normalizeChatId(item.creator_phone), `❌ No pude enviar tu mensaje programado (ID #${item.id}). Superé la cantidad de reintentos.`);
      } catch (notifyError) {
        console.warn('[WARN] No se pudo notificar fallo al creador:', notifyError.message);
      }
    }
  }
}

function normalizeChatId(chatId) {
  if (!chatId) {
    return null;
  }

  if (chatId.endsWith('@c.us') || chatId.endsWith('@g.us') || chatId.endsWith('@lid')) {
    return chatId;
  }

  const digits = chatId.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  return `${digits}@c.us`;
}

function markAsFailed(item, reason) {
  try {
    db.prepare(`
      UPDATE scheduled_messages
      SET status = 'failed',
          updated_at = CURRENT_TIMESTAMP,
          last_attempt_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(item.id);

    db.prepare(`
      INSERT INTO scheduled_messages_log (scheduled_message_id, creator_phone, target_chat, status, error_message)
      VALUES (?, ?, ?, 'failed', ?)
    `).run(item.id, item.creator_phone, item.target_chat, reason);
  } catch (error) {
    console.error(`❌ Error marcando mensaje ${item.id} como fallido:`, error.message || error);
  }
}

module.exports = {
  startService
};
