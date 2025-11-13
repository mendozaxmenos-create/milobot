// ============================================
// 📊 MÓDULO DE ESTADÍSTICAS DE USO
// ============================================

const database = require('./database');

/**
 * Trackear evento de uso del bot
 */
function trackEvent(db, userPhone, eventType, eventData = {}) {
  return database.trackEvent(db, userPhone, eventType, eventData);
}

/**
 * Obtener estadísticas de un usuario
 */
function getUserStats(db, userPhone, startDate = null, endDate = null) {
  return database.getUserStats(db, userPhone, startDate, endDate);
}

/**
 * Obtener estadísticas globales del bot
 */
function getGlobalStats(db, startDate = null, endDate = null) {
  return database.getGlobalStats(db, startDate, endDate);
}

/**
 * Obtener usuarios activos
 */
function getActiveUsers(db, days = 7) {
  return database.getActiveUsers(db, days);
}

/**
 * Obtener estadísticas por módulo
 */
function getModuleStats(db, startDate = null, endDate = null) {
  return database.getModuleStats(db, startDate, endDate);
}

/**
 * Obtener eventos más frecuentes
 */
function getTopEvents(db, limit = 10, startDate = null, endDate = null) {
  return database.getTopEvents(db, limit, startDate, endDate);
}

/**
 * Obtener estadísticas de uso diario
 */
function getDailyStats(db, days = 7) {
  return database.getDailyStats(db, days);
}

/**
 * Obtener estadísticas de conversión de monedas
 */
function getCurrencyConversionStats(db, userPhone = null, startDate = null, endDate = null) {
  return database.getCurrencyConversionStats(db, userPhone, startDate, endDate);
}

/**
 * Obtener estadísticas de retención
 */
function getRetentionStats(db, days = 30) {
  return database.getRetentionStats(db, days);
}

/**
 * Obtener estadísticas por país
 */
function getStatsByCountry(db, startDate = null, endDate = null) {
  return database.getStatsByCountry(db, startDate, endDate);
}

/**
 * Obtener estadísticas por ciudad
 */
function getStatsByCity(db, startDate = null, endDate = null, limit = 20) {
  return database.getStatsByCity(db, startDate, endDate, limit);
}

/**
 * Obtener estadísticas por región
 */
function getStatsByRegion(db, startDate = null, endDate = null) {
  return database.getStatsByRegion(db, startDate, endDate);
}

/**
 * Obtener distribución de usuarios por país
 */
function getUserDistributionByCountry(db) {
  return database.getUserDistributionByCountry(db);
}

/**
 * Obtener estadísticas geográficas generales
 */
function getGeographicStats(db, startDate = null, endDate = null) {
  return database.getGeographicStats(db, startDate, endDate);
}

/**
 * Helper: Trackear acceso a módulo
 */
function trackModuleAccess(db, userPhone, moduleName) {
  return trackEvent(db, userPhone, `${moduleName}_access`, {
    module: moduleName,
    timestamp: new Date().toISOString()
  });
}

/**
 * Helper: Trackear comando usado
 */
function trackCommand(db, userPhone, command, module = null) {
  return trackEvent(db, userPhone, 'command_used', {
    command,
    module,
    timestamp: new Date().toISOString()
  });
}

/**
 * Helper: Trackear evento creado
 */
function trackEventCreated(db, userPhone, eventData = {}) {
  return trackEvent(db, userPhone, 'calendar_event_created', eventData);
}

/**
 * Helper: Trackear gasto agregado
 */
function trackExpenseAdded(db, userPhone, expenseData = {}) {
  return trackEvent(db, userPhone, 'expense_added', expenseData);
}

/**
 * Helper: Trackear grupo de gastos creado
 */
function trackExpenseGroupCreated(db, userPhone, groupData = {}) {
  return trackEvent(db, userPhone, 'expense_group_created', groupData);
}

/**
 * Helper: Trackear conversión de moneda
 */
function trackCurrencyConversion(db, userPhone, conversionData = {}) {
  return trackEvent(db, userPhone, 'currency_conversion', conversionData);
}

/**
 * Helper: Trackear consulta de clima
 */
function trackWeatherQuery(db, userPhone, weatherData = {}) {
  return trackEvent(db, userPhone, 'weather_query', weatherData);
}

/**
 * Helper: Trackear uso de IA
 */
function trackAIMessage(db, userPhone, aiData = {}) {
  return trackEvent(db, userPhone, 'ai_message', aiData);
}

/**
 * Helper: Trackear invitación enviada
 */
function trackInviteSent(db, userPhone, inviteData = {}) {
  return trackEvent(db, userPhone, 'invite_sent', inviteData);
}

/**
 * Helper: Trackear feedback enviado
 */
function trackFeedbackSent(db, userPhone, feedbackData = {}) {
  return trackEvent(db, userPhone, 'feedback_sent', feedbackData);
}

module.exports = {
  trackEvent,
  getUserStats,
  getGlobalStats,
  getActiveUsers,
  getModuleStats,
  getTopEvents,
  getDailyStats,
  getCurrencyConversionStats,
  getRetentionStats,
  getStatsByCountry,
  getStatsByCity,
  getStatsByRegion,
  getUserDistributionByCountry,
  getGeographicStats,
  // Helpers
  trackModuleAccess,
  trackCommand,
  trackEventCreated,
  trackExpenseAdded,
  trackExpenseGroupCreated,
  trackCurrencyConversion,
  trackWeatherQuery,
  trackAIMessage,
  trackInviteSent,
  trackFeedbackSent
};
