// ============================================
// ☁️ INTEGRACIÓN CON GOOGLE CALENDAR
// ============================================

const { google } = require('googleapis');
const database = require('./database');
const cron = require('node-cron');

let autoSyncJob = null;
const DEFAULT_AUTO_SYNC_INTERVAL_MINUTES = parseInt(process.env.GOOGLE_AUTO_SYNC_INTERVAL || '30', 10);
const MIN_AUTO_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutos en milisegundos

function hasGoogleCredentials() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Crear cliente OAuth2
 */
function getOAuth2Client() {
  if (!hasGoogleCredentials()) {
    throw new Error('Credenciales de Google Calendar faltantes. Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI.');
  }
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
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
    'https://www.googleapis.com/auth/classroom.profile.emails',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students.readonly'
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
  console.log(`[DEBUG] getTokensFromCode - Iniciando con código: ${code.substring(0, 30)}...`);
  const oauth2Client = getOAuth2Client();
  
  // Verificar que las credenciales estén configuradas
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('[ERROR] getTokensFromCode - Credenciales de Google no configuradas');
    return { success: false, error: 'Credenciales de Google no configuradas en el servidor' };
  }
  
  try {
    console.log(`[DEBUG] getTokensFromCode - Llamando a oauth2Client.getToken()...`);
    const { tokens } = await oauth2Client.getToken(code);
    console.log(`[DEBUG] getTokensFromCode - Tokens recibidos:`, { 
      hasAccessToken: !!tokens.access_token, 
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date 
    });
    return { success: true, tokens };
  } catch (error) {
    console.error('[ERROR] getTokensFromCode - Error obteniendo tokens:', error);
    console.error('[ERROR] getTokensFromCode - Error details:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    return { success: false, error: error.message || 'Error desconocido al obtener tokens' };
  }
}

/**
 * Configurar cliente autenticado
 */
async function getAuthenticatedClient(db, userPhone) {
  if (!hasGoogleCredentials()) {
    console.warn('⚠️ Credenciales de Google no configuradas. Saltando operaciones de sincronización.');
    return null;
  }

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

  if (!eventData || !eventData.event_date) {
    return {
      success: false,
      skipped: true,
      error: 'El evento no tiene fecha programada.'
    };
  }
  
  const calendar = google.calendar({ version: 'v3', auth });
  
  // Convertir fecha a formato de Google Calendar
  const startDateTime = new Date(eventData.event_date);
  if (Number.isNaN(startDateTime.getTime())) {
    return {
      success: false,
      skipped: true,
      error: `Fecha inválida para el evento "${eventData.title || 'Sin título'}" (${eventData.event_date}).`
    };
  }

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
  const results = { synced: 0, errors: 0, skipped: 0 };
  
  for (const event of events) {
    // Saltar eventos que ya están sincronizados
    if (event.google_event_id) {
      continue;
    }

    if (!event.event_date || event.has_due_date === 0) {
      results.skipped++;
      continue;
    }

    const eventDate = new Date(event.event_date);
    if (Number.isNaN(eventDate.getTime())) {
      results.skipped++;
      continue;
    }
    
    const result = await createGoogleEvent(db, userPhone, event);
    
    if (result.success) {
      database.updateGoogleEventId(db, event.id, result.eventId);
      results.synced++;
    } else if (result.skipped) {
      results.skipped++;
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
    
    // Mejorar mensaje de error para casos comunes
    let errorMessage = error.message;
    
    if (error.code === 403 || error.status === 403) {
      if (error.message.includes('API has not been used') || error.message.includes('is disabled')) {
        errorMessage = 'La API de Google Calendar no está habilitada en tu proyecto.\n\n' +
          'Para habilitarla:\n' +
          '1. Ve a: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com\n' +
          '2. Selecciona tu proyecto\n' +
          '3. Haz clic en "Habilitar"\n' +
          '4. Espera unos minutos y vuelve a intentar';
      } else if (error.message.includes('PERMISSION_DENIED')) {
        errorMessage = 'No tienes permisos para acceder a Google Calendar.\n\n' +
          'Verifica que:\n' +
          '• La API de Google Calendar esté habilitada\n' +
          '• Los tokens de autenticación sean válidos\n' +
          '• Hayas autorizado los permisos necesarios';
      }
    } else if (error.code === 401 || error.status === 401) {
      errorMessage = 'La autenticación con Google ha expirado.\n\n' +
        'Por favor, vuelve a conectar tu cuenta de Google Calendar desde Configuración.';
    }
    
    return { success: false, error: errorMessage };
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

async function syncUserWithGoogle(db, userPhone) {
  try {
    const authStatus = await checkAuthStatus(db, userPhone);
    if (!authStatus.authenticated) {
      return { success: false, userPhone, error: 'No autenticado con Google' };
    }

    const result = {
      success: false,
      userPhone,
      import: null,
      export: null,
      error: null
    };

    try {
      result.import = await importFromGoogle(db, userPhone);
    } catch (error) {
      console.error(`❌ Error importando eventos de Google para ${userPhone}:`, error);
      result.import = { success: false, error: error.message };
    }

    try {
      result.export = await syncLocalToGoogle(db, userPhone);
    } catch (error) {
      console.error(`❌ Error sincronizando eventos locales hacia Google para ${userPhone}:`, error);
      result.export = { success: false, error: error.message };
    }

    const importSuccess = result.import && result.import.success;
    const exportSuccess = result.export && result.export.synced !== undefined;

    if (importSuccess || exportSuccess) {
      database.updateGoogleLastSync(db, userPhone, Date.now());
      result.success = true;
    } else if (result.import?.error) {
      result.error = result.import.error;
    } else if (result.export?.error) {
      result.error = result.export.error;
    }

    return result;
  } catch (error) {
    console.error(`❌ Error general sincronizando usuario ${userPhone}:`, error);
    return { success: false, userPhone, error: error.message };
  }
}

async function syncAllUsers(db) {
  if (!hasGoogleCredentials()) {
    console.warn('⚠️ syncAllUsers: faltan credenciales de Google, omitiendo sincronización.');
    return { processed: 0, skipped: 0 };
  }

  const users = database.getUsersWithGoogleTokens(db);
  if (!users || users.length === 0) {
    return { processed: 0, skipped: 0 };
  }

  const now = Date.now();
  let processed = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user || !user.user_phone) {
      continue;
    }

    if (user.last_sync && now - user.last_sync < MIN_AUTO_SYNC_INTERVAL) {
      skipped++;
      continue;
    }

    await syncUserWithGoogle(db, user.user_phone);
    processed++;
  }

  console.log(`☁️ Sincronización automática Google → procesados: ${processed}, omitidos por intervalo: ${skipped}`);
  return { processed, skipped };
}

function startAutoSyncService(db, intervalMinutes = DEFAULT_AUTO_SYNC_INTERVAL_MINUTES) {
  if (!hasGoogleCredentials()) {
    console.warn('⚠️ No se iniciará la sincronización automática de Google: faltan credenciales (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).');
    return;
  }

  if (!db) {
    console.warn('⚠️ No se pudo iniciar la sincronización automática de Google: base de datos no disponible.');
    return;
  }

  const sanitizedInterval = Math.max(10, Number.isFinite(intervalMinutes) ? intervalMinutes : DEFAULT_AUTO_SYNC_INTERVAL_MINUTES);

  if (autoSyncJob) {
    console.log('ℹ️ Servicio de sincronización automática de Google ya estaba iniciado.');
    return;
  }

  const cronExpression = `*/${sanitizedInterval} * * * *`;

  console.log(`☁️ Iniciando servicio de sincronización automática de Google (cada ${sanitizedInterval} minutos)...`);
  autoSyncJob = cron.schedule(cronExpression, async () => {
    try {
      await syncAllUsers(db);
    } catch (error) {
      console.error('❌ Error en sincronización automática de Google:', error);
    }
  });

  autoSyncJob.start();
  console.log('✅ Servicio de sincronización automática de Google activo.');
}

module.exports = {
  hasGoogleCredentials,
  getOAuth2Client,
  getAuthUrl,
  getTokensFromCode,
  getAuthenticatedClient,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  syncLocalToGoogle,
  importFromGoogle,
  checkAuthStatus,
  syncUserWithGoogle,
  syncAllUsers,
  startAutoSyncService
};
  