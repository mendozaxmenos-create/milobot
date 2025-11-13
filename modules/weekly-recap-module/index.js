// ============================================
// 📊 MÓDULO DE RECAP SEMANAL
// ============================================

const service = require('./service');
const database = require('./database');

/**
 * Iniciar servicio de recap semanal
 */
function startService(client, db) {
  service.startService(client, db);
}

/**
 * Detener servicio de recap semanal
 */
function stopService() {
  service.stopService();
}

/**
 * Enviar recap manual a un usuario
 */
async function sendManualRecap(userPhone) {
  return await service.sendManualRecap(userPhone);
}

/**
 * Obtener configuración de recap del usuario
 */
function getUserRecapSettings(db, userPhone) {
  return database.getUserRecapSettings(db, userPhone);
}

/**
 * Habilitar/deshabilitar recaps para un usuario
 */
function setRecapEnabled(db, userPhone, enabled) {
  database.setRecapEnabled(db, userPhone, enabled);
}

module.exports = {
  startService,
  stopService,
  sendManualRecap,
  getUserRecapSettings,
  setRecapEnabled
};

