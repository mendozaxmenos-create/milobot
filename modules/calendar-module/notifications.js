// ============================================
// 🔔 SISTEMA DE NOTIFICACIONES AUTOMÁTICAS
// ============================================

const cron = require('node-cron');
const database = require('./database');
const utils = require('./utils');

let whatsappClient = null;
let db = null;

/**
 * Iniciar servicio de notificaciones
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} database - Instancia de base de datos
 */
function startService(client, dbInstance) {
  whatsappClient = client;
  db = dbInstance;
  
  console.log('🔔 Iniciando servicio de notificaciones de calendario...');
  
  // Ejecutar cada minuto
  cron.schedule('* * * * *', () => {
    checkAndSendNotifications();
  });
  
  console.log('✅ Servicio de notificaciones activo (cada 1 minuto)');
}

/**
 * Verificar y enviar notificaciones pendientes
 */
async function checkAndSendNotifications() {
  if (!whatsappClient || !db) {
    return;
  }
  
  try {
    const events = database.getEventsNeedingNotification(db);
    const now = new Date();
    
    for (const event of events) {
      // Obtener configuración del usuario
      const settings = database.getUserSettings(db, event.user_phone);
      
      // Verificar si las notificaciones están habilitadas
      if (!settings.notifications_enabled) {
        continue;
      }
      
      // Determinar tiempo de notificación (usar configuración del usuario o del evento)
      const notificationTime = event.user_notification_time || event.notification_time || 15;
      
      // Calcular cuándo debe enviarse la notificación
      const eventDate = new Date(event.event_date);
      const notificationDate = new Date(eventDate.getTime() - (notificationTime * 60 * 1000));
      
      // Verificar si es tiempo de notificar
      if (now >= notificationDate && now < eventDate) {
        await sendNotification(event, notificationTime);
      }
    }
  } catch (error) {
    console.error('❌ Error en servicio de notificaciones:', error);
  }
}

/**
 * Enviar notificación de evento
 */
async function sendNotification(event, notificationTime) {
  if (!whatsappClient) {
    return;
  }
  
  try {
    const timeText = formatNotificationTime(notificationTime);
    const categoryEmoji = getCategoryEmoji(event.category);
    
    let message = `⏰ *RECORDATORIO*\n\n`;
    message += `${categoryEmoji} *${event.title}*\n\n`;
    message += `📅 ${utils.formatDateForDisplay(event.event_date)}\n`;
    
    if (event.description) {
      message += `📝 ${event.description}\n`;
    }
    
    message += `\n🔔 ${timeText}`;
    
    if (event.is_recurring) {
      const recurringText = getRecurringText(event.recurring_type);
      message += `\n🔄 ${recurringText}`;
    }
    
    // Enviar mensaje
    await whatsappClient.sendMessage(
      `${event.user_phone}@c.us`,
      message
    );
    
    // Marcar como enviado
    database.markReminderSent(db, event.id);
    
    console.log(`✅ Notificación enviada: ${event.title} → ${event.user_phone}`);
  } catch (error) {
    console.error(`❌ Error enviando notificación para evento ${event.id}:`, error);
  }
}

/**
 * Formatear tiempo de notificación para mostrar
 */
function formatNotificationTime(minutes) {
  if (minutes < 60) {
    return `Faltan ${minutes} minutos`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `Faltan ${hours} hora${hours > 1 ? 's' : ''}`;
  } else {
    const days = Math.floor(minutes / 1440);
    return `Faltan ${days} día${days > 1 ? 's' : ''}`;
  }
}

/**
 * Obtener emoji según categoría
 */
function getCategoryEmoji(category) {
  const emojis = {
    'personal': '👤',
    'trabajo': '💼',
    'urgente': '🚨',
    'familia': '👨‍👩‍👧‍👦'
  };
  
  return emojis[category] || '📌';
}

/**
 * Obtener texto de recurrencia
 */
function getRecurringText(type) {
  const texts = {
    'daily': 'Se repite diariamente',
    'weekly': 'Se repite semanalmente',
    'monthly': 'Se repite mensualmente'
  };
  
  return texts[type] || 'Evento recurrente';
}

/**
 * Enviar notificación inmediata (para pruebas)
 */
async function sendTestNotification(userPhone, eventTitle) {
  if (!whatsappClient) {
    return { success: false, error: 'Cliente no disponible' };
  }
  
  try {
    const message = `🔔 *Notificación de Prueba*\n\n` +
      `Este es un ejemplo de cómo recibirás las notificaciones de tus eventos.\n\n` +
      `Evento: ${eventTitle}\n` +
      `Hora: ${new Date().toLocaleTimeString('es-AR')}\n\n` +
      `✅ Sistema de notificaciones funcionando correctamente.`;
    
    await whatsappClient.sendMessage(`${userPhone}@c.us`, message);
    
    return { success: true };
  } catch (error) {
    console.error('Error enviando notificación de prueba:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener estadísticas del servicio de notificaciones
 */
function getNotificationStats(dbInstance) {
  try {
    const stmt = dbInstance.prepare(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN reminder_sent = 1 THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN reminder_sent = 0 AND event_date > datetime('now') THEN 1 ELSE 0 END) as pending
      FROM calendar_events
    `);
    
    return stmt.get();
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return { total_events: 0, sent: 0, pending: 0 };
  }
}

module.exports = {
  startService,
  sendTestNotification,
  getNotificationStats
};
