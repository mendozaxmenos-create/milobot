// ============================================
// ☁️ INTEGRACIÓN CON GOOGLE CALENDAR
// ============================================

const { google } = require('googleapis');
const database = require('./database');

/**
 * Crear cliente OAuth2
 */
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  );
}

/**
 * Generar URL de autenticación
 */
function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

/**
 * Obtener tokens con el código de autorización
 */
async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return { success: true, tokens };
  } catch (error) {
    console.error('Error obteniendo tokens:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Configurar cliente autenticado
 */
async function getAuthenticatedClient(db, userPhone) {
  const tokens = database.getGoogleTokens(db, userPhone);
  
  if (!tokens) {
    return null;
  }
  
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });
  
  // Renovar token si está expirado
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      database.saveGoogleTokens(db, userPhone, credentials);
      oauth2Client.setCredentials(credentials);
    } catch (error) {
      console.error('Error renovando token:', error);
      return null;
    }
  }
  
  return oauth2Client;
}

/**
 * Crear evento en Google Calendar
 */
async function createGoogleEvent(db, userPhone, eventData) {
  const auth = await getAuthenticatedClient(db, userPhone);
  
  if (!auth) {
    return { success: false, error: 'No autenticado con Google' };
  }
  
  const calendar = google.calendar({ version: 'v3', auth });
  
  // Convertir fecha a formato de Google Calendar
  const startDateTime = new Date(eventData.event_date);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // +1 hora
  
  const event = {
    summary: eventData.title,
    description: eventData.description || '',
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'America/Argentina/Mendoza'
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'America/Argentina/Mendoza'
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: eventData.notification_time || 15 }
      ]
    }
  };
  
  // Agregar recurrencia si aplica
  if (eventData.is_recurring) {
    const recurrenceRule = getRecurrenceRule(
      eventData.recurring_type,
      eventData.recurring_end_date
    );
    if (recurrenceRule) {
      event.recurrence = [recurrenceRule];
    }
  }
  
  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });
    
    return {
      success: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink
    };
  } catch (error) {
    console.error('Error creando evento en Google:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualizar evento en Google Calendar
 */
async function updateGoogleEvent(db, userPhone, googleEventId, updates) {
  const auth = await getAuthenticatedClient(db, userPhone);
  
  if (!auth) {
    return { success: false, error: 'No autenticado con Google' };
  }
  
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    // Obtener evento actual
    const currentEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: googleEventId
    });
    
    // Preparar actualizaciones
    const event = { ...currentEvent.data };
    
    if (updates.title) {
      event.summary = updates.title;
    }
    if (updates.description !== undefined) {
      event.description = updates.description;
    }
    if (updates.event_date) {
      const startDateTime = new Date(updates.event_date);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
      event.start = {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Argentina/Mendoza'
      };
      event.end = {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Argentina/Mendoza'
      };
    }
    
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      resource: event
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error actualizando evento en Google:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Eliminar evento de Google Calendar
 */
async function deleteGoogleEvent(db, userPhone, googleEventId) {
  const auth = await getAuthenticatedClient(db, userPhone);
  
  if (!auth) {
    return { success: false, error: 'No autenticado con Google' };
  }
  
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error eliminando evento de Google:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sincronizar eventos locales con Google Calendar
 */
async function syncLocalToGoogle(db, userPhone) {
  const events = database.getAllUserEvents(db, userPhone);
  const results = { synced: 0, errors: 0 };
  
  for (const event of events) {
    // Saltar eventos que ya están sincronizados
    if (event.google_event_id) {
      continue;
    }
    
    const result = await createGoogleEvent(db, userPhone, event);
    
    if (result.success) {
      database.updateGoogleEventId(db, event.id, result.eventId);
      results.synced++;
    } else {
      results.errors++;
    }
  }
  
  return results;
}

/**
 * Importar eventos de Google Calendar
 */
async function importFromGoogle(db, userPhone) {
  const auth = await getAuthenticatedClient(db, userPhone);
  
  if (!auth) {
    return { success: false, error: 'No autenticado con Google' };
  }
  
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const googleEvents = response.data.items || [];
    let imported = 0;
    
    for (const gEvent of googleEvents) {
      // Verificar si ya existe
      const existing = database.getAllUserEvents(db, userPhone).find(
        e => e.google_event_id === gEvent.id
      );
      
      if (existing) {
        continue;
      }
      
      // Importar evento
      const eventData = {
        title: gEvent.summary || 'Sin título',
        description: gEvent.description || '',
        event_date: gEvent.start.dateTime || gEvent.start.date,
        category: 'personal',
        notification_time: 15,
        google_event_id: gEvent.id
      };
      
      database.addEvent(db, userPhone, eventData);
      imported++;
    }
    
    return { success: true, imported };
  } catch (error) {
    console.error('Error importando de Google:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generar regla de recurrencia para Google Calendar
 */
function getRecurrenceRule(type, endDate) {
  let rule = 'RRULE:';
  
  switch (type) {
    case 'daily':
      rule += 'FREQ=DAILY';
      break;
    case 'weekly':
      rule += 'FREQ=WEEKLY';
      break;
    case 'monthly':
      rule += 'FREQ=MONTHLY';
      break;
    default:
      return null;
  }
  
  if (endDate) {
    const until = new Date(endDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    rule += `;UNTIL=${until}`;
  }
  
  return rule;
}

/**
 * Verificar estado de autenticación
 */
async function checkAuthStatus(db, userPhone) {
  const tokens = database.getGoogleTokens(db, userPhone);
  
  if (!tokens) {
    return { authenticated: false };
  }
  
  const auth = await getAuthenticatedClient(db, userPhone);
  
  return {
    authenticated: auth !== null,
    hasRefreshToken: !!tokens.refresh_token
  };
}

module.exports = {
  getAuthUrl,
  getTokensFromCode,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  syncLocalToGoogle,
  importFromGoogle,
  checkAuthStatus
};
