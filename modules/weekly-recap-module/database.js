// ============================================
// 📊 BASE DE DATOS - RECAP SEMANAL
// ============================================

/**
 * Obtener configuración de recap del usuario
 */
function getUserRecapSettings(db, userPhone) {
  const row = db.prepare(`
    SELECT * FROM weekly_recaps WHERE user_phone = ?
  `).get(userPhone);

  if (!row) {
    // Crear registro por defecto
    db.prepare(`
      INSERT INTO weekly_recaps (user_phone, enabled, last_sent_at, last_activity_hash)
      VALUES (?, 1, NULL, NULL)
    `).run(userPhone);
    return {
      user_phone: userPhone,
      enabled: 1,
      last_sent_at: null,
      last_activity_hash: null
    };
  }

  return row;
}

/**
 * Actualizar última vez que se envió recap
 */
function updateLastRecapSent(db, userPhone, activityHash) {
  db.prepare(`
    INSERT INTO weekly_recaps (user_phone, last_sent_at, last_activity_hash, enabled)
    VALUES (?, CURRENT_TIMESTAMP, ?, 1)
    ON CONFLICT(user_phone) DO UPDATE SET
      last_sent_at = CURRENT_TIMESTAMP,
      last_activity_hash = ?
  `).run(userPhone, activityHash, activityHash);
}

/**
 * Habilitar/deshabilitar recaps para un usuario
 */
function setRecapEnabled(db, userPhone, enabled) {
  db.prepare(`
    INSERT INTO weekly_recaps (user_phone, enabled)
    VALUES (?, ?)
    ON CONFLICT(user_phone) DO UPDATE SET enabled = ?
  `).run(userPhone, enabled ? 1 : 0, enabled ? 1 : 0);
}

/**
 * Obtener todos los usuarios activos que deberían recibir recaps
 */
function getActiveUsers(db) {
  // Usuarios que han interactuado en los últimos 30 días
  // SQLite usa datetime('now', '-30 days') para fechas relativas
  
  return db.prepare(`
    SELECT DISTINCT u.phone, u.name, 
           COALESCE(wr.enabled, 1) as recap_enabled,
           wr.last_sent_at,
           wr.last_activity_hash
    FROM users u
    LEFT JOIN weekly_recaps wr ON u.phone = wr.user_phone
    WHERE u.last_interaction >= datetime('now', '-30 days')
       OR u.last_interaction IS NULL
    ORDER BY u.last_interaction DESC
  `).all();
}

/**
 * Obtener actividad del usuario en la última semana
 */
function getUserWeeklyActivity(db, userPhone, startDate, endDate) {
  // Eventos creados en la última semana (usando SQLite datetime)
  const events = db.prepare(`
    SELECT COUNT(*) as count
    FROM calendar_events
    WHERE user_phone = ? 
      AND datetime(created_at) >= datetime('now', '-7 days')
      AND datetime(created_at) <= datetime('now')
  `).get(userPhone);

  // Gastos agregados en la última semana (del creador del grupo)
  const expenses = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(e.amount), 0) as total
    FROM expenses e
    INNER JOIN expense_groups eg ON e.group_id = eg.id
    WHERE eg.creator_phone = ? 
      AND datetime(e.created_at) >= datetime('now', '-7 days')
      AND datetime(e.created_at) <= datetime('now')
  `).get(userPhone);

  // Grupos de gastos creados en la última semana
  const expenseGroups = db.prepare(`
    SELECT COUNT(*) as count
    FROM expense_groups
    WHERE creator_phone = ? 
      AND datetime(created_at) >= datetime('now', '-7 days')
      AND datetime(created_at) <= datetime('now')
      AND IFNULL(is_closed, 0) = 0
  `).get(userPhone);

  // Próximos eventos (para los próximos 7 días)
  const upcomingEvents = db.prepare(`
    SELECT COUNT(*) as count
    FROM calendar_events
    WHERE user_phone = ? 
      AND datetime(event_date) >= datetime('now', '+1 day')
      AND datetime(event_date) <= datetime('now', '+7 days')
  `).get(userPhone);

  // Estadísticas de uso del bot desde la tabla de estadísticas
  let botStats = {
    currencyConversions: 0,
    weatherQueries: 0,
    aiMessages: 0,
    moduleAccesses: 0,
    invitesSent: 0
  };

  try {
    // Conversiones de moneda
    const currencyStats = db.prepare(`
      SELECT COUNT(*) as count
      FROM bot_usage_stats
      WHERE user_phone = ? 
        AND event_type = 'currency_conversion'
        AND datetime(created_at) >= datetime('now', '-7 days')
        AND datetime(created_at) <= datetime('now')
    `).get(userPhone);
    botStats.currencyConversions = currencyStats?.count || 0;

    // Consultas de clima
    const weatherStats = db.prepare(`
      SELECT COUNT(*) as count
      FROM bot_usage_stats
      WHERE user_phone = ? 
        AND event_type = 'weather_query'
        AND datetime(created_at) >= datetime('now', '-7 days')
        AND datetime(created_at) <= datetime('now')
    `).get(userPhone);
    botStats.weatherQueries = weatherStats?.count || 0;

    // Mensajes de IA
    const aiStats = db.prepare(`
      SELECT COUNT(*) as count
      FROM bot_usage_stats
      WHERE user_phone = ? 
        AND event_type = 'ai_message'
        AND datetime(created_at) >= datetime('now', '-7 days')
        AND datetime(created_at) <= datetime('now')
    `).get(userPhone);
    botStats.aiMessages = aiStats?.count || 0;

    // Accesos a módulos
    const moduleStats = db.prepare(`
      SELECT COUNT(*) as count
      FROM bot_usage_stats
      WHERE user_phone = ? 
        AND event_type LIKE '%_access'
        AND datetime(created_at) >= datetime('now', '-7 days')
        AND datetime(created_at) <= datetime('now')
    `).get(userPhone);
    botStats.moduleAccesses = moduleStats?.count || 0;

    // Invitaciones enviadas
    const inviteStats = db.prepare(`
      SELECT COUNT(*) as count
      FROM bot_usage_stats
      WHERE user_phone = ? 
        AND event_type = 'invite_sent'
        AND datetime(created_at) >= datetime('now', '-7 days')
        AND datetime(created_at) <= datetime('now')
    `).get(userPhone);
    botStats.invitesSent = inviteStats?.count || 0;
  } catch (error) {
    console.warn('[WARN] No se pudieron obtener estadísticas de uso del bot:', error.message);
  }

  return {
    eventsCreated: events?.count || 0,
    expensesAdded: expenses?.count || 0,
    expensesTotal: expenses?.total || 0,
    expenseGroupsCreated: expenseGroups?.count || 0,
    upcomingEvents: upcomingEvents?.count || 0,
    botStats
  };
}

/**
 * Generar hash de actividad para detectar cambios
 */
function generateActivityHash(activity) {
  const crypto = require('crypto');
  const data = JSON.stringify({
    events: activity.eventsCreated,
    expenses: activity.expensesAdded,
    expenseTotal: activity.expensesTotal,
    groups: activity.expenseGroupsCreated,
    upcoming: activity.upcomingEvents
  });
  return crypto.createHash('md5').update(data).digest('hex');
}

module.exports = {
  getUserRecapSettings,
  updateLastRecapSent,
  setRecapEnabled,
  getActiveUsers,
  getUserWeeklyActivity,
  generateActivityHash
};

