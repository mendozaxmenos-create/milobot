// ============================================
// MÓDULO: CALENDARIO
// Gestión de eventos y recordatorios
// ============================================

const { db } = require('./database');

function addEvent(userPhone, title, description, eventDate) {
  const stmt = db.prepare(`
    INSERT INTO calendar_events (user_phone, title, description, event_date)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(userPhone, title, description, eventDate);
  return { success: true, message: '✅ Recordatorio agregado exitosamente' };
}

function getTodayEvents(userPhone) {
  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ? 
    AND DATE(event_date) = DATE('now', 'localtime')
    AND reminder_sent = 0
    ORDER BY event_date
  `);
  return stmt.all(userPhone);
}

function getUpcomingEvents(userPhone, days = 7) {
  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ? 
    AND event_date >= datetime('now', 'localtime')
    AND event_date <= datetime('now', '+${days} days', 'localtime')
    ORDER BY event_date
    LIMIT 10
  `);
  return stmt.all(userPhone);
}

module.exports = {
  addEvent,
  getTodayEvents,
  getUpcomingEvents
};