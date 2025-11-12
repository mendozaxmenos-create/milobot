// ============================================
// 🗄️ FUNCIONES DE BASE DE DATOS - CALENDARIO
// ============================================

let hasDueDateChecked = false;

function ensureHasDueDateColumn(db) {
  if (!db || hasDueDateChecked) {
    return;
  }

  try {
    const columns = db.prepare(`PRAGMA table_info(calendar_events)`).all();
    const exists = columns.some(col => col.name === 'has_due_date');

    if (!exists) {
      db.exec(`ALTER TABLE calendar_events ADD COLUMN has_due_date INTEGER DEFAULT 1`);
      console.log('✅ Columna has_due_date agregada automáticamente a calendar_events');
    }

    hasDueDateChecked = true;
  } catch (error) {
    console.error('❌ No se pudo verificar/agregar columna has_due_date:', error.message);
  }
}

function ensureSchemaCompatibility(db) {
  ensureHasDueDateColumn(db);
}

/**
 * Agregar evento al calendario
 */
function addEvent(db, userPhone, eventData) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    INSERT INTO calendar_events (
      user_phone, title, description, event_date, 
      category, is_recurring, recurring_type, recurring_end_date,
      notification_time, google_event_id, is_reminder, has_due_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    userPhone,
    eventData.title,
    eventData.description || null,
    eventData.event_date,
    eventData.category || 'personal',
    eventData.is_recurring || 0,
    eventData.recurring_type || null,
    eventData.recurring_end_date || null,
    eventData.notification_time || 15,
    eventData.google_event_id || null,
    eventData.is_reminder || 0,
    eventData.has_due_date === undefined ? 1 : eventData.has_due_date
  );
  
  return { success: true, id: result.lastInsertRowid };
}

/**
 * Obtener eventos de hoy
 */
function getTodayEvents(db, userPhone) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ? 
    AND DATE(event_date) = DATE('now', 'localtime')
    AND reminder_sent = 0
    AND has_due_date = 1
    ORDER BY event_date
  `);
  
  const events = stmt.all(userPhone);
  // Agregar invitados a cada evento
  return events.map(event => {
    event.invitees = getEventInvitees(db, event.id);
    return event;
  });
}

/**
 * Obtener próximos eventos
 */
function getUpcomingEvents(db, userPhone, days = 7) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ? 
    AND event_date >= datetime('now', 'localtime')
    AND event_date <= datetime('now', '+${days} days', 'localtime')
    AND has_due_date = 1
    ORDER BY event_date
    LIMIT 20
  `);
  
  const events = stmt.all(userPhone);
  // Agregar invitados a cada evento
  return events.map(event => {
    event.invitees = getEventInvitees(db, event.id);
    return event;
  });
}

/**
 * Obtener todos los eventos del usuario
 */
function getAllUserEvents(db, userPhone) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ?
    AND event_date >= datetime('now', 'localtime')
    AND has_due_date = 1
    ORDER BY event_date
    LIMIT 50
  `);
  
  const events = stmt.all(userPhone);
  // Agregar invitados a cada evento
  return events.map(event => {
    event.invitees = getEventInvitees(db, event.id);
    return event;
  });
}

/**
 * Buscar eventos por palabra clave
 */
function searchEvents(db, userPhone, keyword) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ?
    AND (
      LOWER(title) LIKE LOWER(?)
      OR LOWER(description) LIKE LOWER(?)
      OR LOWER(category) LIKE LOWER(?)
    )
    AND has_due_date = 1
    AND event_date >= datetime('now', '-1 day', 'localtime')
    ORDER BY event_date
    LIMIT 20
  `);
  
  const searchTerm = `%${keyword}%`;
  const events = stmt.all(userPhone, searchTerm, searchTerm, searchTerm);
  // Agregar invitados a cada evento
  return events.map(event => {
    event.invitees = getEventInvitees(db, event.id);
    return event;
  });
}

/**
 * Obtener evento por ID
 */
function getEventById(db, eventId, userPhone) {
  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE id = ? AND user_phone = ?
  `);
  
  return stmt.get(eventId, userPhone);
}

/**
 * Actualizar evento
 */
function updateEvent(db, eventId, userPhone, updates) {
  const fields = [];
  const values = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.event_date !== undefined) {
    fields.push('event_date = ?');
    values.push(updates.event_date);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    values.push(updates.category);
  }
  if (updates.notification_time !== undefined) {
    fields.push('notification_time = ?');
    values.push(updates.notification_time);
  }
  
  if (fields.length === 0) {
    return { success: false, message: 'No hay cambios para actualizar' };
  }
  
  values.push(eventId, userPhone);
  
  const stmt = db.prepare(`
    UPDATE calendar_events
    SET ${fields.join(', ')}
    WHERE id = ? AND user_phone = ?
  `);
  
  const result = stmt.run(...values);
  
  return {
    success: result.changes > 0,
    message: result.changes > 0 ? 'Evento actualizado' : 'Evento no encontrado'
  };
}

/**
 * Eliminar evento
 */
function deleteEvent(db, eventId, userPhone) {
  const stmt = db.prepare(`
    DELETE FROM calendar_events
    WHERE id = ? AND user_phone = ?
  `);
  
  const result = stmt.run(eventId, userPhone);
  
  return {
    success: result.changes > 0,
    message: result.changes > 0 ? 'Evento eliminado' : 'Evento no encontrado'
  };
}

/**
 * Obtener eventos del mes
 */
function getMonthEvents(db, userPhone, year, month) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ?
    AND strftime('%Y', event_date) = ?
    AND strftime('%m', event_date) = ?
    AND has_due_date = 1
    ORDER BY event_date
  `);
  
  const events = stmt.all(userPhone, year.toString(), month.toString().padStart(2, '0'));
  // Agregar invitados a cada evento
  return events.map(event => {
    event.invitees = getEventInvitees(db, event.id);
    return event;
  });
}

/**
 * Marcar recordatorio como enviado
 */
function markReminderSent(db, eventId) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    UPDATE calendar_events
    SET reminder_sent = 1
    WHERE id = ?
  `);
  
  stmt.run(eventId);
}

/**
 * Obtener eventos que necesitan notificación
 */
function getEventsNeedingNotification(db) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT ce.*, ucs.notification_time as user_notification_time
    FROM calendar_events ce
    LEFT JOIN user_calendar_settings ucs ON ce.user_phone = ucs.user_phone
    WHERE ce.reminder_sent = 0
    AND ce.event_date > datetime('now', 'localtime')
    AND ce.event_date <= datetime('now', '+2 hours', 'localtime')
    AND ce.has_due_date = 1
  `);
  
  return stmt.all();
}

/**
 * Actualizar Google Event ID
 */
function updateGoogleEventId(db, eventId, googleEventId) {
  const stmt = db.prepare(`
    UPDATE calendar_events
    SET google_event_id = ?
    WHERE id = ?
  `);
  
  stmt.run(googleEventId, eventId);
}

/**
 * Obtener configuración del usuario
 */
function getUserSettings(db, userPhone) {
  const stmt = db.prepare(`
    SELECT * FROM user_calendar_settings
    WHERE user_phone = ?
  `);
  
  let settings = stmt.get(userPhone);
  
  // Crear configuración por defecto si no existe
  if (!settings) {
    const insertStmt = db.prepare(`
      INSERT INTO user_calendar_settings (user_phone)
      VALUES (?)
    `);
    insertStmt.run(userPhone);
    settings = stmt.get(userPhone);
  }
  
  return settings;
}

/**
 * Actualizar configuración del usuario
 */
function updateUserSettings(db, userPhone, settings) {
  const fields = [];
  const values = [];
  
  if (settings.notifications_enabled !== undefined) {
    fields.push('notifications_enabled = ?');
    values.push(settings.notifications_enabled);
  }
  if (settings.notification_time !== undefined) {
    fields.push('notification_time = ?');
    values.push(settings.notification_time);
  }
  if (settings.sync_google_auto !== undefined) {
    fields.push('sync_google_auto = ?');
    values.push(settings.sync_google_auto);
  }
  if (settings.notification_channel !== undefined) {
    fields.push('notification_channel = ?');
    values.push(settings.notification_channel);
  }
  
  if (fields.length === 0) {
    return { success: false };
  }
  
  values.push(userPhone);
  
  const stmt = db.prepare(`
    UPDATE user_calendar_settings
    SET ${fields.join(', ')}
    WHERE user_phone = ?
  `);
  
  stmt.run(...values);
  return { success: true };
}

/**
 * Guardar tokens de Google
 */
function saveGoogleTokens(db, userPhone, tokens) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO google_auth_tokens (
      user_phone, access_token, refresh_token, expiry_date
    ) VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(
    userPhone,
    tokens.access_token,
    tokens.refresh_token || null,
    tokens.expiry_date || null
  );
}

/**
 * Obtener tokens de Google
 */
function getGoogleTokens(db, userPhone) {
  const stmt = db.prepare(`
    SELECT * FROM google_auth_tokens
    WHERE user_phone = ?
  `);
  
  return stmt.get(userPhone);
}

/**
 * Eliminar tokens de Google
 */
function deleteGoogleTokens(db, userPhone) {
  const stmt = db.prepare(`
    DELETE FROM google_auth_tokens
    WHERE user_phone = ?
  `);
  
  stmt.run(userPhone);
}

/**
 * Agregar invitado a un evento
 */
function addEventInvitee(db, eventId, name, phone) {
  const stmt = db.prepare(`
    INSERT INTO event_invitees (event_id, name, phone)
    VALUES (?, ?, ?)
  `);
  
  stmt.run(eventId, name, phone || null);
  return { success: true };
}

/**
 * Obtener invitados de un evento
 */
function getEventInvitees(db, eventId) {
  const stmt = db.prepare(`
    SELECT * FROM event_invitees
    WHERE event_id = ?
    ORDER BY created_at
  `);
  
  return stmt.all(eventId);
}

/**
 * Eliminar invitado de un evento
 */
function deleteEventInvitee(db, inviteeId) {
  const stmt = db.prepare(`
    DELETE FROM event_invitees
    WHERE id = ?
  `);
  
  stmt.run(inviteeId);
  return { success: true };
}

/**
 * Obtener recordatorios del usuario
 */
function getReminders(db, userPhone) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ? 
    AND is_reminder = 1
    ORDER BY 
      CASE WHEN has_due_date = 0 THEN 1 ELSE 0 END,
      event_date
  `);
  
  const reminders = stmt.all(userPhone);
  return reminders.map(reminder => {
    reminder.invitees = getEventInvitees(db, reminder.id);
    return reminder;
  });
}

/**
 * Obtener recordatorios de hoy
 */
function getTodayReminders(db, userPhone) {
  ensureHasDueDateColumn(db);

  const stmt = db.prepare(`
    SELECT * FROM calendar_events
    WHERE user_phone = ? 
    AND is_reminder = 1
    AND has_due_date = 1
    AND DATE(event_date) = DATE('now', 'localtime')
    ORDER BY event_date
  `);
  
  const reminders = stmt.all(userPhone);
  return reminders.map(reminder => {
    reminder.invitees = getEventInvitees(db, reminder.id);
    return reminder;
  });
}

function getUsersWithGoogleTokens(db) {
  const stmt = db.prepare(`
    SELECT user_phone, last_sync
    FROM google_auth_tokens
  `);

  return stmt.all();
}

function updateGoogleLastSync(db, userPhone, timestamp = Date.now()) {
  const stmt = db.prepare(`
    UPDATE google_auth_tokens
    SET last_sync = ?
    WHERE user_phone = ?
  `);
  stmt.run(timestamp, userPhone);
}

module.exports = {
  addEvent,
  getTodayEvents,
  getUpcomingEvents,
  getAllUserEvents,
  searchEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getMonthEvents,
  markReminderSent,
  getEventsNeedingNotification,
  updateGoogleEventId,
  getUserSettings,
  updateUserSettings,
  saveGoogleTokens,
  getGoogleTokens,
  deleteGoogleTokens,
  getUsersWithGoogleTokens,
  updateGoogleLastSync,
  addEventInvitee,
  getEventInvitees,
  deleteEventInvitee,
  getReminders,
  getTodayReminders,
  ensureSchemaCompatibility
};
