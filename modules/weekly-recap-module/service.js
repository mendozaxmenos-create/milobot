// ============================================
// 📊 SERVICIO DE RECAP SEMANAL
// ============================================

const cron = require('node-cron');
const database = require('./database');

let whatsappClient = null;
let db = null;
let recapJob = null;

/**
 * Iniciar servicio de recaps semanales
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} dbInstance - Instancia de base de datos
 */
function startService(client, dbInstance) {
  whatsappClient = client;
  db = dbInstance;

  if (recapJob) {
    console.log('ℹ️ Servicio de recap semanal ya estaba iniciado.');
    return;
  }

  console.log('📊 Iniciando servicio de recap semanal...');
  
  // Ejecutar cada lunes a las 9:00 AM (ajustar según zona horaria)
  // Formato cron: minuto hora día-mes mes día-semana
  // 0 9 * * 1 = Lunes 9:00 AM
  recapJob = cron.schedule('0 9 * * 1', async () => {
    try {
      await sendWeeklyRecaps();
    } catch (error) {
      console.error('❌ Error en servicio de recap semanal:', error);
    }
  }, {
    scheduled: false,
    timezone: 'America/Argentina/Buenos_Aires'
  });

  recapJob.start();
  console.log('✅ Servicio de recap semanal activo (cada lunes a las 9:00 AM)');
}

/**
 * Detener servicio de recaps
 */
function stopService() {
  if (recapJob) {
    recapJob.stop();
    recapJob = null;
    console.log('⏸️ Servicio de recap semanal detenido');
  }
}

/**
 * Enviar recaps semanales a todos los usuarios activos
 */
async function sendWeeklyRecaps() {
  if (!whatsappClient || !db) {
    console.warn('⚠️ Cliente de WhatsApp o base de datos no disponible para recaps');
    return;
  }

  console.log('📊 Iniciando envío de recaps semanales...');

  const activeUsers = database.getActiveUsers(db);
  console.log(`👥 Usuarios activos encontrados: ${activeUsers.length}`);

  let sentCount = 0;
  let skippedCount = 0;

  for (const user of activeUsers) {
    try {
      // Verificar si el usuario tiene recaps habilitados
      if (!user.recap_enabled) {
        skippedCount++;
        continue;
      }

      // Obtener actividad de la semana (las fechas se calculan en la query SQL)
      const activity = database.getUserWeeklyActivity(
        db,
        user.phone,
        null, // startDate - no se usa, se calcula en SQL
        null  // endDate - no se usa, se calcula en SQL
      );

      // Generar hash de actividad
      const activityHash = database.generateActivityHash(activity);

      // Verificar si hubo cambios desde el último recap
      if (user.last_activity_hash === activityHash && user.last_sent_at) {
        // Calcular días desde el último recap usando SQLite
        const daysSinceLastSent = db.prepare(`
          SELECT (julianday('now') - julianday(?)) as days
        `).get(user.last_sent_at);
        
        // Si no hay cambios y ya se envió un recap hace menos de 10 días, saltar
        if (daysSinceLastSent && daysSinceLastSent.days < 10) {
          skippedCount++;
          continue;
        }
      }

      // Verificar si hay actividad significativa
      const hasActivity = activity.eventsCreated > 0 ||
                         activity.expensesAdded > 0 ||
                         activity.expenseGroupsCreated > 0 ||
                         activity.upcomingEvents > 0;

      // Si no hay actividad y ya se envió un recap antes, verificar si es necesario enviar
      if (!hasActivity && user.last_sent_at) {
        // Calcular días desde el último recap
        const daysSinceLastSent = db.prepare(`
          SELECT (julianday('now') - julianday(?)) as days
        `).get(user.last_sent_at);
        
        // Si no hay actividad y pasaron menos de 14 días desde el último recap, saltar
        if (daysSinceLastSent && daysSinceLastSent.days < 14) {
          skippedCount++;
          continue;
        }
        // Si pasaron más de 14 días sin actividad, enviar recap de todos modos (para mantener engagement)
      } else if (!hasActivity && !user.last_sent_at) {
        // Si es la primera vez y no hay actividad, no enviar (esperar a que haya actividad)
        skippedCount++;
        continue;
      }

      // Generar y enviar mensaje de recap
      const message = buildRecapMessage(user.name || 'Usuario', activity);
      const chatId = `${user.phone}@c.us`;

      try {
        // Verificar que el número existe en WhatsApp
        const numberId = await whatsappClient.getNumberId(chatId);
        if (!numberId) {
          console.warn(`[WARN] No se pudo enviar recap a ${user.phone}: número no registrado`);
          skippedCount++;
          continue;
        }

        const targetId = numberId._serialized || chatId;
        await whatsappClient.sendMessage(targetId, message);
        
        // Actualizar último recap enviado
        database.updateLastRecapSent(db, user.phone, activityHash);
        
        sentCount++;
        console.log(`✅ Recap enviado a ${user.name || user.phone} (${user.phone})`);
      } catch (error) {
        console.error(`[ERROR] No se pudo enviar recap a ${user.phone}:`, error.message);
        skippedCount++;
      }
    } catch (error) {
      console.error(`[ERROR] Error procesando recap para ${user.phone}:`, error.message);
      skippedCount++;
    }
  }

  console.log(`📊 Recaps semanales completados: ${sentCount} enviados, ${skippedCount} omitidos`);
}

/**
 * Construir mensaje de recap semanal
 */
function buildRecapMessage(userName, activity) {
  let message = `📊 *Resumen Semanal de Milo*\n\n`;
  message += `¡Hola *${userName}*! 👋\n\n`;
  message += `Te resumo tu actividad de esta semana:\n\n`;

  const sections = [];

  // Eventos creados
  if (activity.eventsCreated > 0) {
    sections.push(`📅 *${activity.eventsCreated}* evento${activity.eventsCreated > 1 ? 's' : ''} creado${activity.eventsCreated > 1 ? 's' : ''}`);
  }

  // Gastos agregados
  if (activity.expensesAdded > 0) {
    const totalFormatted = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(activity.expensesTotal || 0);
    sections.push(`💰 *${activity.expensesAdded}* gasto${activity.expensesAdded > 1 ? 's' : ''} registrado${activity.expensesAdded > 1 ? 's' : ''} (Total: ${totalFormatted})`);
  }

  // Grupos de gastos creados
  if (activity.expenseGroupsCreated > 0) {
    sections.push(`👥 *${activity.expenseGroupsCreated}* grupo${activity.expenseGroupsCreated > 1 ? 's' : ''} de gastos creado${activity.expenseGroupsCreated > 1 ? 's' : ''}`);
  }

  // Próximos eventos
  if (activity.upcomingEvents > 0) {
    sections.push(`⏰ *${activity.upcomingEvents}* evento${activity.upcomingEvents > 1 ? 's' : ''} próximo${activity.upcomingEvents > 1 ? 's' : ''} esta semana`);
  }

  // Estadísticas de uso del bot
  if (activity.botStats) {
    const botSections = [];
    if (activity.botStats.currencyConversions > 0) {
      botSections.push(`💱 *${activity.botStats.currencyConversions}* conversión${activity.botStats.currencyConversions > 1 ? 'es' : ''} de moneda`);
    }
    if (activity.botStats.weatherQueries > 0) {
      botSections.push(`🌤️ *${activity.botStats.weatherQueries}* consulta${activity.botStats.weatherQueries > 1 ? 's' : ''} de clima`);
    }
    if (activity.botStats.aiMessages > 0) {
      botSections.push(`🤖 *${activity.botStats.aiMessages}* mensaje${activity.botStats.aiMessages > 1 ? 's' : ''} con IA`);
    }
    if (activity.botStats.invitesSent > 0) {
      botSections.push(`🤝 *${activity.botStats.invitesSent}* invitación${activity.botStats.invitesSent > 1 ? 'es' : ''} enviada${activity.botStats.invitesSent > 1 ? 's' : ''}`);
    }
    if (botSections.length > 0) {
      sections.push(...botSections);
    }
  }

  if (sections.length > 0) {
    message += sections.join('\n') + '\n\n';
  } else {
    message += `✅ Sin actividad esta semana.\n\n`;
  }

  // Mensaje motivador
  message += `💡 *¿Sabías que...?*\n\n`;
  message += getMotivationalTip() + '\n\n';

  // CTA
  message += `💬 Escribí *hola* o *menu* para seguir usando Milo.`;

  return message;
}

/**
 * Obtener tip motivador aleatorio
 */
function getMotivationalTip() {
  const tips = [
    'Podés crear eventos directamente desde WhatsApp usando lenguaje natural 🗓️',
    'Milo puede ayudarte a dividir gastos con tus amigos de forma automática 💰',
    'Sincronizá tu calendario con Google Calendar para tener todo en un solo lugar 📅',
    'Usá el asistente IA para crear eventos y gestionar gastos de forma inteligente 🤖',
    'Podés consultar el pronóstico del tiempo y convertir monedas directamente desde Milo 🌤️',
    'Milo puede recordarte eventos importantes antes de que sucedan 🔔',
    'Compartí eventos con tus contactos directamente desde WhatsApp 👥',
    'Creá grupos de gastos mencionando a Milo en un chat grupal 💸',
    'Usá el conversor de monedas para saber cuánto vale algo en otras divisas 💱',
    'Milo puede ayudarte a organizar tu semana de forma más eficiente 📊'
  ];

  const randomIndex = Math.floor(Math.random() * tips.length);
  return tips[randomIndex];
}

/**
 * Enviar recap manualmente a un usuario (para testing)
 */
async function sendManualRecap(userPhone) {
  if (!whatsappClient || !db) {
    return { success: false, error: 'Cliente o base de datos no disponible' };
  }

  const user = db.prepare('SELECT phone, name FROM users WHERE phone = ?').get(userPhone);
  if (!user) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  // Obtener actividad de la semana (las fechas se calculan en la query SQL)
  const activity = database.getUserWeeklyActivity(
    db,
    userPhone,
    null, // startDate - no se usa, se calcula en SQL
    null  // endDate - no se usa, se calcula en SQL
  );

  const message = buildRecapMessage(user.name || 'Usuario', activity);
  const chatId = `${userPhone}@c.us`;

  try {
    const numberId = await whatsappClient.getNumberId(chatId);
    if (!numberId) {
      return { success: false, error: 'Número no registrado en WhatsApp' };
    }

    const targetId = numberId._serialized || chatId;
    await whatsappClient.sendMessage(targetId, message);

    const activityHash = database.generateActivityHash(activity);
    database.updateLastRecapSent(db, userPhone, activityHash);

    return { success: true };
  } catch (error) {
    console.error(`[ERROR] Error enviando recap manual a ${userPhone}:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  startService,
  stopService,
  sendWeeklyRecaps,
  sendManualRecap,
  buildRecapMessage
};

