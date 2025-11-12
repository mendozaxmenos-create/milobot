// ============================================
// 📅 MÓDULO DE CALENDARIO - MILOBOT
// Punto de entrada principal
// ============================================

const handlers = require('./handlers');
const database = require('./database');
const menus = require('./menus');
const google = require('./google');
const notifications = require('./notifications');
const utils = require('./utils');

function setMainMenuProvider(fn) {
  handlers.setGlobalMainMenu(fn);
}

/**
 * Manejador principal de mensajes del módulo de calendario
 * @param {Object} msg - Mensaje de WhatsApp
 * @param {String} userPhone - Teléfono del usuario
 * @param {String} userName - Nombre del usuario
 * @param {String} messageText - Texto del mensaje
 * @param {String} currentModule - Módulo actual de la sesión
 * @param {Object} session - Sesión del usuario
 * @param {Object} db - Instancia de base de datos
 * @param {Object} client - Cliente de WhatsApp
 * @returns {String} Respuesta para el usuario
 */
async function handleCalendarMessage(msg, userPhone, userName, messageText, currentModule, session, db, client) {
  try {
    return await handlers.handleMessage(
      msg,
      userPhone,
      userName,
      messageText,
      currentModule,
      session,
      db,
      client
    );
  } catch (error) {
    console.error('❌ Error en módulo de calendario:', error);
    return '❌ Ocurrió un error procesando tu solicitud de calendario. Por favor intenta de nuevo.';
  }
}

/**
 * Iniciar servicio de notificaciones
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} db - Instancia de base de datos
 */
function startNotificationService(client, db) {
  notifications.startService(client, db);
}

// Exportar módulo completo
module.exports = {
  // Función principal
  handleCalendarMessage,
  startNotificationService,
  setMainMenuProvider,
  
  // Submódulos (por si se necesitan acceder directamente)
  database,
  menus,
  google,
  notifications,
  utils
};
