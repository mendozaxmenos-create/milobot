// ============================================
// 🎮 MANEJADORES DE MENSAJES - CALENDARIO
// ============================================

const database = require('./database');
const menus = require('./menus');
const utils = require('./utils');
const google = require('./google');

let getGlobalMainMenu = null;
function setGlobalMainMenu(fn) {
  if (typeof fn === 'function') {
    getGlobalMainMenu = fn;
  }
}

/**
 * Función principal para manejar mensajes del módulo calendario
 */
async function handleMessage(msg, userPhone, userName, messageText, currentModule, session, db, client) {
  console.log(`\n[DEBUG] ===== handleMessage CALENDARIO =====`);
  console.log(`[DEBUG] currentModule recibido: "${currentModule}"`);
  console.log(`[DEBUG] messageText recibido: "${messageText}"`);
  console.log(`[DEBUG] userPhone: ${userPhone}`);
  
  let response = '';
  
  // Obtener o crear sesión del módulo
  const context = session?.context ? JSON.parse(session.context) : {};
  const normalizedMessage = messageText.trim().toLowerCase();
  
  // Función helper para actualizar sesión
  const updateSession = (newModule, newContext = null) => {
    const stmt = db.prepare(`
      INSERT INTO sessions (user_phone, current_module, context, last_updated)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_phone) DO UPDATE SET 
        current_module = ?,
        context = ?,
        last_updated = CURRENT_TIMESTAMP
    `);
    stmt.run(userPhone, newModule, newContext, newModule, newContext);
  };
  
  // Comando rápido para ver recordatorios desde cualquier estado
  if (['recordatorios', 'mis recordatorios', 'ver recordatorios'].includes(normalizedMessage)) {
    const reminders = database.getReminders(db, userPhone);
    
    if (reminders.length === 0) {
      response = '⏰ No tenés recordatorios pendientes.\n\n' + menus.getMainMenu();
      updateSession('calendar', null);
    } else {
      response = '⏰ *Tus Recordatorios*\n\n';
      reminders.forEach((reminder, index) => {
        const dateLabel = reminder.has_due_date
          ? utils.formatDateForDisplay(reminder.event_date)
          : 'Sin fecha programada';
        response += `${index + 1}. ⏰ ${reminder.title}\n`;
        response += `   📅 ${dateLabel}\n\n`;
      });
      response += 'Escribí el número del recordatorio que quieras completar, o *"volver"* para regresar:';
      updateSession('calendar_complete_reminder', JSON.stringify({ source: 'quick' }));
    }
    
    return response;
  }
  
  // Función helper para volver al menú principal del bot
  const getMainMenu = (name) => {
    if (getGlobalMainMenu) {
      return getGlobalMainMenu(name);
    }
    return `Hola *${name}*! 👋\n\n🤖 *Soy Milo, tu asistente personal*\n\nSelecciona una opción:\n\n1️⃣ 🌤️ Pronóstico para hoy\n2️⃣ 📅 Calendario & Recordatorios\n3️⃣ 💰 Dividir Gastos\n4️⃣ 🏫 Google Classroom\n5️⃣ 🤖 Asistente IA\n6️⃣ 💱 Conversor de Monedas\n7️⃣ 🤝 Invitar a un amigo\n8️⃣ ⚙️ Configuración\n9️⃣ ℹ️ Ayuda\n\n_Escribe el número o habla naturalmente_`;
  };

  const buildTodayAgendaResponse = (events = [], reminders = []) => {
    let text = '📅 *Agenda de Hoy*\n\n';

    if (events.length > 0) {
      text += '*Eventos:*\n\n';
      events.forEach((event, index) => {
        const recurring = event.is_recurring ? ' 🔄' : '';
        const googleBadge = event.google_event_id ? ' ☁️' : '';
        const formattedDate = utils.formatDateForDisplay(event.event_date);

        text += `${index + 1}. ${event.title}${recurring}${googleBadge}\n`;
        text += `   📅 ${formattedDate}\n`;
        text += `   🏷️ ${event.category || 'personal'}\n`;
        if (event.description) {
          text += `   📝 ${event.description}\n`;
        }
        text += '\n';
      });
    } else {
      text += '📅 Hoy no tenés eventos programados.\n\n';
    }

    if (reminders.length > 0) {
      text += '*Recordatorios:*\n\n';
      reminders.forEach((reminder, index) => {
        const dateLabel = reminder.has_due_date
          ? utils.formatDateForDisplay(reminder.event_date)
          : 'Sin fecha programada';
        text += `${index + 1}. ⏰ ${reminder.title}\n`;
        text += `   📅 ${dateLabel}\n\n`;
      });
      text += 'Para completar un recordatorio, escribí *R* seguido del número (ej: R1). También podés escribir *"recordatorios"* para verlos aparte.\n\n';
    }

    if (events.length > 0) {
      text += 'Escribí el número del evento que quieras gestionar, o *"volver"* para regresar.';
    } else {
      text += 'Escribí *"volver"* para regresar al menú.';
    }

    return text.trim();
  };

  const goBackToSource = (source = 'manage', contextData = {}) => {
    switch (source) {
      case 'today': {
        const todayEvents = database.getTodayEvents(db, userPhone);
        const todayReminders = database.getTodayReminders(db, userPhone);

        if (todayEvents.length === 0 && todayReminders.length === 0) {
          updateSession('calendar', null);
          return '📅 No tenés eventos ni recordatorios para hoy.\n\n' + menus.getMainMenu();
        }

        updateSession('calendar_today_select', JSON.stringify({ events: todayEvents, reminders: todayReminders }));
        return buildTodayAgendaResponse(todayEvents, todayReminders);
      }
      case 'search': {
        const keyword = contextData.keyword || '';
        const results = keyword ? database.searchEvents(db, userPhone, keyword) : [];

        if (!keyword || !results || results.length === 0) {
          updateSession('calendar_search', null);
          return keyword
            ? `❌ No encontré eventos que coincidan con "${keyword}".\n\n` + menus.getMainMenu()
            : menus.getMainMenu();
        }

        const listText = `📊 *Resultados para "${keyword}"*\n\n${menus.formatEventsList(results)}\nEscribe el número del evento para ver opciones o *"volver"* para regresar.`;
        updateSession('calendar_view_all', JSON.stringify({ source: 'search', keyword, events: results }));
        return listText;
      }
      case 'manage': {
        updateSession('calendar_manage', null);
        return menus.getManageMenu();
      }
      default: {
        updateSession('calendar', null);
        return menus.getMainMenu();
      }
    }
  };

  const rebuildEditMenu = (eventId, extraContext = {}) => {
    const { source = 'manage', events = [], reminders = [], keyword = '' } = extraContext || {};

    const refreshedEvent = database.getEventById(db, eventId, userPhone);
    if (!refreshedEvent) {
      updateSession('calendar', null);
      return '❌ No pude encontrar el evento. Volvamos al menú principal.\n\n' + menus.getMainMenu();
    }

    const invitees = database.getEventInvitees(db, eventId) || [];
    const menuResponse = buildEditEventMenuResponse(refreshedEvent, invitees);

    updateSession(
      'calendar_edit_field',
      JSON.stringify({ event: { ...refreshedEvent, invitees }, source, events, reminders, keyword })
    );

    return menuResponse;
  };

  const buildInviteesMenu = (eventData, extraContext = {}) => {
    const { source = 'manage', events = [], reminders = [], keyword = '' } = extraContext || {};
    const invitees = database.getEventInvitees(db, eventData.id) || [];

    let listText = '';
    if (invitees.length === 0) {
      listText = '🔹 Aún no hay invitados cargados.\n';
    } else {
      invitees.forEach((inv, index) => {
        const phoneLabel = inv.phone ? ` (${inv.phone})` : '';
        listText += `${index + 1}. ${inv.name}${phoneLabel}\n`;
      });
    }

    const menuText = `👥 *Gestionar Invitados*\n\n${listText}\n*Opciones:*\n1️⃣ Agregar invitado (escribir nombre)\n2️⃣ Compartir contacto\n3️⃣ Eliminar invitado\n4️⃣ Volver`;

    updateSession(
      'calendar_edit_invitees',
      JSON.stringify({ event: { ...eventData, invitees }, source, events, reminders, keyword })
    );

    return menuText;
  };
  
  // ============================================
  // AUTENTICACIÓN CON GOOGLE CALENDAR (MÁXIMA PRIORIDAD)
  // ============================================
  
  // IMPORTANTE: Verificar calendar_google_import primero para evitar conflictos
  if (currentModule === 'calendar_google_import') {
    if (messageText === '1' || messageText.toLowerCase() === 'sí' || messageText.toLowerCase() === 'si') {
      const importResult = await google.importFromGoogle(db, userPhone);
      
      if (importResult.success) {
        response = `✅ *Eventos importados exitosamente*\n\n` +
          `Se importaron ${importResult.imported} eventos de Google Calendar.\n\n` +
          menus.getMainMenu();
      } else {
        response = `❌ Error al importar eventos: ${importResult.error}\n\n` + menus.getMainMenu();
      }
      
      updateSession('calendar', null);
      return response;
    } else if (messageText === '2' || messageText.toLowerCase() === 'no') {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    } else {
      response = '❌ Opción no válida.\n\n' +
        '¿Deseas importar tus eventos existentes de Google?\n\n' +
        '1. Sí, importar ahora\n' +
        '2. No, continuar';
      return response;
    }
  }
  
  // ============================================
  // MENÚ DE GOOGLE CALENDAR (cuando ya está autenticado)
  // ============================================
  
  if (currentModule === 'calendar_google_sync') {
    console.log(`[DEBUG] ===== ENTRANDO A calendar_google_sync =====`);
    console.log(`[DEBUG] Opción seleccionada: "${messageText}"`);
    
    switch (messageText) {
      case '1': // Sincronizar eventos locales → Google
        console.log(`[DEBUG] Sincronizando eventos locales a Google`);
        const syncResult = await google.syncLocalToGoogle(db, userPhone);
        
        if (syncResult.success) {
          response = `✅ *Sincronización completada*\n\n` +
            `• Eventos sincronizados: ${syncResult.synced}\n` +
            `• Errores: ${syncResult.errors}\n\n` +
            `Tus eventos locales han sido subidos a Google Calendar.\n\n` +
            menus.getConfigMenu();
        } else {
          response = `❌ Error al sincronizar: ${syncResult.error || 'Error desconocido'}\n\n` +
            menus.getConfigMenu();
        }
        
        updateSession('calendar_config', null);
        return response;
        
      case '2': // Importar eventos de Google → Local
        console.log(`[DEBUG] Importando eventos de Google`);
        const importResult = await google.importFromGoogle(db, userPhone);
        
        if (importResult.success) {
          response = `✅ *Eventos importados exitosamente*\n\n` +
            `Se importaron ${importResult.imported} eventos de Google Calendar.\n\n` +
            menus.getConfigMenu();
        } else {
          response = `❌ Error al importar eventos: ${importResult.error || 'Error desconocido'}\n\n` +
            menus.getConfigMenu();
        }
        
        updateSession('calendar_config', null);
        return response;
        
      case '3': // Desconectar Google Calendar
        console.log(`[DEBUG] Desconectando Google Calendar`);
        database.deleteGoogleTokens(db, userPhone);
        database.updateUserSettings(db, userPhone, { sync_google_auto: 0 });
        response = `🔌 *Google Calendar desconectado*\n\n` +
          `Tu cuenta ha sido desconectada de Google Calendar.\n\n` +
          menus.getConfigMenu();
        updateSession('calendar_config', null);
        return response;
        
      case '4': // Volver
        response = menus.getConfigMenu();
        updateSession('calendar_config', null);
        return response;
        
      default:
        response = '❌ Opción no válida.\n\n' +
          `☁️ *Google Calendar*\n\n` +
          `✅ Conectado correctamente\n\n` +
          `*Opciones:*\n\n` +
          `1️⃣ Sincronizar eventos locales → Google\n` +
          `2️⃣ Importar eventos de Google → Local\n` +
          `3️⃣ Desconectar Google Calendar\n` +
          `4️⃣ Volver\n\n` +
          `_¿Qué deseas hacer?_`;
        return response;
    }
  }
  
  // Ahora verificar calendar_google_auth (solo cuando es exactamente este módulo)
  if (currentModule === 'calendar_google_auth') {
    console.log(`[DEBUG] ===== ENTRANDO A calendar_google_auth (PRIORIDAD) =====`);
    console.log(`[DEBUG] currentModule: ${currentModule}`);
    console.log(`[DEBUG] messageText: "${messageText}"`);
    
    const messageLower = messageText.toLowerCase().trim();
    const messageTrimmed = messageText.trim();
    
    console.log(`[DEBUG] calendar_google_auth - Mensaje recibido: "${messageTrimmed}"`);
    console.log(`[DEBUG] calendar_google_auth - Longitud: ${messageTrimmed.length}`);
    
    // Opción de cancelar
    if (messageLower === 'cancelar' || messageLower === 'cancel' || messageLower === 'volver') {
      console.log(`[DEBUG] Usuario canceló la autenticación`);
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }
    
    // Detectar si el mensaje parece un código de Google OAuth
    const basicPattern = /^[0-9]+\//;  // Patrón básico: número seguido de /
    const hasBasicFormat = basicPattern.test(messageTrimmed);
    
    console.log(`[DEBUG] calendar_google_auth - ¿Tiene formato básico (número/)? ${hasBasicFormat}`);
    
    // Si tiene el formato básico (número/), procesarlo directamente
    if (hasBasicFormat) {
      console.log(`[DEBUG] Procesando código de Google: ${messageTrimmed.substring(0, 30)}...`);
      try {
        response = await handleGoogleAuthCode(db, userPhone, messageTrimmed);
        console.log(`[DEBUG] Respuesta de handleGoogleAuthCode recibida`);
        console.log(`[DEBUG] Longitud de respuesta: ${response ? response.length : 0}`);
        console.log(`[DEBUG] Tipo de respuesta: ${typeof response}`);
        console.log(`[DEBUG] Primeros 150 caracteres: ${response ? response.substring(0, 150) : 'RESPUESTA VACÍA'}`);
        
        // Verificar que la respuesta no esté vacía
        if (!response || response.trim() === '') {
          console.error(`[ERROR] handleGoogleAuthCode retornó respuesta vacía`);
          response = '❌ Error: No se recibió respuesta del servidor. Por favor intenta de nuevo.';
        }
        
        // Si fue exitoso, preguntar si quiere importar eventos
        if (response && response.includes('✅')) {
          updateSession('calendar_google_import', null);
          console.log(`[DEBUG] Autenticación exitosa, cambiando a calendar_google_import`);
        } else {
          updateSession('calendar_google_auth', null);
          console.log(`[DEBUG] Autenticación falló, manteniendo en calendar_google_auth`);
        }
      } catch (error) {
        console.error(`[ERROR] Excepción procesando código de Google:`, error);
        console.error(`[ERROR] Stack trace:`, error.stack);
        response = `❌ Error al procesar el código de autorización:\n${error.message}\n\nPor favor intenta de nuevo o escribe *"cancelar"* para volver al menú.`;
        updateSession('calendar_google_auth', null);
      }
    } else {
      console.log(`[DEBUG] Código no coincide con patrón esperado`);
      response = '❌ El código no tiene el formato correcto.\n\n' +
        'Por favor, copia el código completo que te dio Google después de autorizar.\n\n' +
        'El código debería empezar con un número seguido de una barra (/).\n' +
        'Ejemplo: `4/1Ab32j93sqVFDhnP0cKl4ZO2e3uwGvoC3O9tzzF3716MgaAp8rYRYIEmN-vM`\n\n' +
        'O escribe *"cancelar"* para volver al menú.';
    }
    
    // Asegurar que siempre haya una respuesta
    if (!response || response.trim() === '') {
      console.error(`[ERROR] calendar_google_auth - Respuesta vacía después de procesar`);
      response = '❌ No se pudo procesar el código. Por favor verifica que copiaste el código completo y vuelve a intentar.\n\nO escribe *"cancelar"* para volver al menú.';
    }
    
    console.log(`[DEBUG] ===== SALIENDO DE calendar_google_auth =====`);
    console.log(`[DEBUG] Respuesta final (${response.length} chars): ${response.substring(0, 150)}...`);
    console.log(`[DEBUG] handleMessage - Tipo de respuesta: ${typeof response}`);
    
    return response;
  }
  
  
  // ============================================
  // ENTRADA DESDE MENÚ PRINCIPAL
  // ============================================
  
  // Si viene del menú principal con '1', mostrar menú del calendario
  if (currentModule === 'main' && messageText === '1') {
    console.log(`[DEBUG] Entrada desde menú principal - Mostrando menú de calendario`);
    response = menus.getMainMenu();
    updateSession('calendar', null);
    console.log(`[DEBUG] Sesión actualizada a 'calendar', respuesta: ${response.substring(0, 50)}...`);
    return response;
  }
  
  // ============================================
  // MENÚ PRINCIPAL DEL CALENDARIO
  // ============================================
  
  if (currentModule === 'calendar') {
    console.log(`[DEBUG] Procesando en módulo 'calendar' con mensaje: "${messageText}"`);
    switch (messageText) {
      case '1': { // Ver hoy
        console.log(`[DEBUG] Opción 1 seleccionada - Obteniendo eventos de hoy`);
        const todayEvents = database.getTodayEvents(db, userPhone);
        const todayReminders = database.getTodayReminders(db, userPhone);
        console.log(`[DEBUG] Eventos encontrados: ${todayEvents.length}, Recordatorios: ${todayReminders.length}`);

        if (todayEvents.length === 0 && todayReminders.length === 0) {
          response = '📅 No tenés eventos ni recordatorios para hoy.\n\n' + menus.getMainMenu();
          updateSession('calendar', null);
          console.log(`[DEBUG] Sin agenda para hoy, retornando al menú principal`);
          return response;
        }

        response = buildTodayAgendaResponse(todayEvents, todayReminders);
        updateSession(
          'calendar_today_select',
          JSON.stringify({ events: todayEvents, reminders: todayReminders })
        );

        console.log(`[DEBUG] Agenda del día generada, esperando selección del usuario`);
        return response;
      }
        
      case '2': // Agregar evento
        response = menus.getAddEventInstructions();
        updateSession('calendar_add', null);
        return response;
        
      case '3': // Agregar recordatorio
        response = menus.getAddReminderInstructions();
        updateSession('calendar_add_reminder', null);
        return response;
        
      case '4': { // Ver recordatorios
        const reminders = database.getReminders(db, userPhone);
        if (reminders.length === 0) {
          response = '⏰ No tenés recordatorios pendientes.\n\n' + menus.getMainMenu();
          updateSession('calendar', null);
        } else {
          response = '⏰ *Tus Recordatorios*\n\n';
          reminders.forEach((reminder, index) => {
            const dateLabel = reminder.has_due_date
              ? utils.formatDateForDisplay(reminder.event_date)
              : 'Sin fecha programada';
            response += `${index + 1}. ⏰ ${reminder.title}\n`;
            response += `   📅 ${dateLabel}\n\n`;
          });
          response += 'Escribí el número del recordatorio que quieras completar, o *"volver"* para regresar:';
          updateSession('calendar_complete_reminder', JSON.stringify({ source: 'calendar' }));
        }
        return response;
      }
      
      case '5': // Próximos eventos
        response = menus.getUpcomingMenu();
        updateSession('calendar_upcoming', null);
        return response;
        
      case '6': // Gestionar eventos
        response = menus.getManageMenu();
        updateSession('calendar_manage', null);
        return response;
        
      case '7': // Búsqueda
        response = '🔍 *Buscar Eventos*\n\nEscribe una palabra clave para buscar en tus eventos:\n\n_Ejemplo: reunión, cumpleaños, dentista_';
        updateSession('calendar_search', null);
        return response;
        
      case '8': // Vista semanal
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes = 1
        const weekStart = new Date(today.getFullYear(), today.getMonth(), diff);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEvents = database.getWeekEvents(db, userPhone, weekStart);
        response = menus.getWeekView(weekStart, weekEvents, true);
        // Guardar la fecha de inicio de la semana en la sesión para navegación
        updateSession('calendar_week_view', JSON.stringify({ 
          weekStart: weekStart.toISOString(),
          weekStartDate: weekStart.getTime()
        }));
        return response;
        
      case '9': // Vista mensual
        const now = new Date();
        const monthEvents = database.getMonthEvents(db, userPhone, now.getFullYear(), now.getMonth() + 1);
        response = menus.getMonthView(now.getFullYear(), now.getMonth(), monthEvents);
        response += '\n\n¿Quieres ver los eventos de los días marcados?\n\n1️⃣ Sí, mostrar eventos\n2️⃣ No, volver al menú';
        updateSession('calendar_month_view', JSON.stringify({ year: now.getFullYear(), month: now.getMonth(), events: monthEvents }));
        return response;
        
      case '10': // Configuración
        response = menus.getConfigMenu();
        updateSession('calendar_config', null);
        return response;
        
      case '11': // Sync Google Calendar
        response = await handleGoogleSync(db, userPhone, client);
        // Si ya está autenticado, cambiar a calendar_google_sync para manejar las opciones
        const authStatus = await google.checkAuthStatus(db, userPhone);
        if (authStatus.authenticated) {
          updateSession('calendar_google_sync', null);
        } else {
          updateSession('calendar_google_auth', null);
        }
        return response;
        
      case '12': // Volver al menú principal
        response = getMainMenu(userName);
        updateSession('main', null);
        return response;
        
      default:
        response = '❌ Opción no válida.\n\n' + menus.getMainMenu();
        return response;
    }
  }
  
  // ============================================
  // AGREGAR RECORDATORIO
  // ============================================

  else if (currentModule === 'calendar_today_select') {
    const events = Array.isArray(context.events) ? context.events : [];
    const reminders = Array.isArray(context.reminders) ? context.reminders : [];

    if (['volver', 'menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    const reminderMatch = normalizedMessage.match(/^r\s*(\d+)$/);
    if (reminderMatch) {
      const reminderIndex = parseInt(reminderMatch[1], 10) - 1;

      if (Number.isNaN(reminderIndex) || reminderIndex < 0 || reminderIndex >= reminders.length) {
        response = '❌ Número de recordatorio inválido. Escribí *R* seguido del número (ej: R1) o *"volver"* para regresar.';
        return response;
      }

      const reminder = reminders[reminderIndex];
      const deleteResult = database.deleteEvent(db, reminder.id, userPhone);

      if (!deleteResult.success) {
        response = '❌ No pude completar el recordatorio. Intenta nuevamente.';
        return response;
      }

      if (reminder.google_event_id) {
        try {
          await google.deleteGoogleEvent(db, userPhone, reminder.google_event_id);
        } catch (err) {
          console.warn('[WARN] No se pudo eliminar el recordatorio en Google Calendar:', err.message);
        }
      }

      const updatedEvents = database.getTodayEvents(db, userPhone);
      const updatedReminders = database.getTodayReminders(db, userPhone);

      if (updatedEvents.length === 0 && updatedReminders.length === 0) {
        response = `✅ *Recordatorio completado*\n\n"${reminder.title}" ha sido eliminado.\n\n${menus.getMainMenu()}`;
        updateSession('calendar', null);
      } else {
        response = `✅ *Recordatorio completado*\n\n"${reminder.title}" ha sido eliminado.\n\n${buildTodayAgendaResponse(updatedEvents, updatedReminders)}`;
        updateSession('calendar_today_select', JSON.stringify({ events: updatedEvents, reminders: updatedReminders }));
      }

      return response;
    }

    const eventIndex = parseInt(messageText, 10) - 1;

    if (!Number.isNaN(eventIndex) && eventIndex >= 0 && eventIndex < events.length) {
      const selectedEvent = events[eventIndex];
      const eventFromDb = database.getEventById(db, selectedEvent.id, userPhone) || selectedEvent;
      const invitees = database.getEventInvitees(db, selectedEvent.id);

      response = `📅 *${eventFromDb.title}*\n🕐 ${utils.formatDateForDisplay(eventFromDb.event_date)}\n🏷️ ${eventFromDb.category || 'personal'}\n👥 Invitados: ${invitees.length}\n\n¿Qué deseas hacer?\n1️⃣ Editar evento\n2️⃣ Eliminar evento\n3️⃣ Volver a la lista`;

      updateSession(
        'calendar_view_all_options',
        JSON.stringify({ source: 'today', event: { ...eventFromDb, invitees }, events, reminders })
      );
      return response;
    }

    response = '❌ Opción inválida. Escribí el número del evento, *R* + número para un recordatorio, o *"volver"* para regresar.';
    return response;
  }
  
  else if (currentModule === 'calendar_add_reminder') {
    try {
      console.log(`[DEBUG] calendar_add_reminder - Procesando recordatorio: "${messageText}"`);
      // Parsear directamente como recordatorio
      const result = await parseNaturalEvent(db, userPhone, messageText, true);
      
      console.log(`[DEBUG] calendar_add_reminder - Resultado:`, { 
        success: result?.success, 
        needsRecurrence: result?.needsRecurrence,
        hasError: !!result?.error,
        hasEventId: !!result?.eventId
      });
      
      if (!result) {
        console.error('[ERROR] calendar_add_reminder - processAddEvent retornó undefined');
        response = '❌ Error al procesar el recordatorio. Por favor intenta de nuevo.\n\n' + menus.getAddReminderInstructions();
        return response;
      }
      
      if (result.needsDateConfirmation) {
        const pendingContext = {
          pendingEvent: {
            title: result.eventData.title,
            category: result.eventData.category,
            notification_time: result.eventData.notification_time,
            is_reminder: 1,
            pendingTime: result.pendingTime || null
          }
        };
        response = '⏰ *Sin fecha detectada*\n\n¿Querés programar este recordatorio para un día específico?\n\n1️⃣ Sí, elegir fecha\n2️⃣ No, dejarlo sin fecha\n\nEscribí "cancelar" para volver al menú.';
        updateSession('calendar_add_reminder_date_choice', JSON.stringify(pendingContext));
        return response;
      }
      
      if (result.needsRecurrence) {
        response = menus.getRecurringMenu();
        updateSession('calendar_add_recurring', JSON.stringify(result.eventData));
        return response;
      } else if (result.success) {
        // Marcar como recordatorio directamente en addEvent
        // Ya se marca en el eventData, pero por si acaso lo actualizamos
        if (!result.eventData.is_reminder) {
          database.updateEvent(db, result.eventId, userPhone, { is_reminder: 1 });
        }
        
        // Sincronizar con Google si está configurado
        const settings = database.getUserSettings(db, userPhone);
        let googleSynced = false;
        
        if (settings && settings.sync_google_auto) {
          const googleResult = await google.createGoogleEvent(db, userPhone, result.eventData);
          if (googleResult.success) {
            database.updateGoogleEventId(db, result.eventId, googleResult.eventId);
            googleSynced = true;
          }
        }
        
      const dateLabel = result.eventData.has_due_date === 0
        ? '📅 Sin fecha programada'
        : `🕐 ${utils.formatDateForDisplay(result.eventData.event_date)}`;
      
        response = `⏰ *Recordatorio Agregado*\n\n` +
          `📅 ${result.eventData.title}\n` +
        `${dateLabel}\n` +
          `🔔 Notificación: ${result.eventData.notification_time || 15} min antes` +
          (googleSynced ? '\n✅ Sincronizado con Google Calendar' : '') +
          `\n\n${menus.getMainMenu()}`;
        updateSession('calendar', null);
        return response;
      } else {
        response = '❌ ' + (result.error || 'Error desconocido') + '\n\n' + menus.getAddReminderInstructions();
        return response;
      }
    } catch (error) {
      console.error('[ERROR] Error procesando recordatorio:', error);
      console.error('[ERROR] Stack:', error.stack);
      response = '❌ Ocurrió un error al procesar el recordatorio. Por favor intenta de nuevo.\n\n' + menus.getAddReminderInstructions();
      return response;
    }
  }
  else if (currentModule === 'calendar_add_reminder_date_choice') {
    const pendingEvent = context.pendingEvent || {};
    
    if (!pendingEvent.title) {
      response = '❌ No encontré el recordatorio pendiente. Volvamos a empezar.\n\n' + menus.getAddReminderInstructions();
      updateSession('calendar_add_reminder', null);
      return response;
    }
    
    if (['cancelar', 'volver', 'menu'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }
    
    if (['1', 'sí', 'si', '1️⃣'].includes(normalizedMessage)) {
      const payload = {
        pendingEvent,
        source: 'reminder'
      };
      response = '📅 Perfecto, indicame la fecha del recordatorio.\n\nEjemplos:\n• mañana\n• lunes\n• 15/11\n• 2025-11-15\n\nEscribí "cancelar" para volver al menú.';
      updateSession('calendar_add_date_input', JSON.stringify(payload));
      return response;
    }
    
    if (['2', 'no', '2️⃣'].includes(normalizedMessage)) {
      const now = new Date();
      const time = pendingEvent.pendingTime || '12:00';
      const placeholderDate = utils.combineDateAndTime(now, time);
      
      const eventData = {
        title: pendingEvent.title,
        event_date: placeholderDate,
        category: pendingEvent.category || 'personal',
        notification_time: pendingEvent.notification_time || 15,
        is_reminder: 1,
        has_due_date: 0
      };
      
      const insertResult = database.addEvent(db, userPhone, eventData);
      eventData.event_date = placeholderDate;
      
      if (!insertResult.success) {
        response = '❌ No se pudo guardar el recordatorio. Intenta de nuevo.';
        return response;
      }
      
      response = `⏰ *Recordatorio guardado*\n\n📌 ${eventData.title}\n📅 Sin fecha programada\n🔔 Notificación manual\n\n${menus.getMainMenu()}`;
      updateSession('calendar', null);
      return response;
    }
    
    response = '❌ Opción no válida. Elegí:\n\n1️⃣ Sí, elegir fecha\n2️⃣ No, dejarlo sin fecha\n\nO escribí "cancelar" para volver al menú.';
    return response;
  }
  
  // ============================================
  // AGREGAR EVENTO
  // ============================================
  
  else if (currentModule === 'calendar_add') {
    try {
      console.log(`[DEBUG] calendar_add - Procesando evento: "${messageText}"`);
    const result = await processAddEvent(db, userPhone, messageText);
      
      console.log(`[DEBUG] calendar_add - Resultado:`, { 
        success: result?.success, 
        needsRecurrence: result?.needsRecurrence,
        hasError: !!result?.error,
        hasEventId: !!result?.eventId
      });
      
      if (!result) {
        console.error('[ERROR] calendar_add - processAddEvent retornó undefined');
        response = '❌ Error al procesar el evento. Por favor intenta de nuevo.\n\n' + menus.getAddEventInstructions();
        return response;
      }
      
      if (result.needsDateConfirmation) {
        const pendingContext = {
          pendingEvent: {
            title: result.eventData.title,
            category: result.eventData.category,
            notification_time: result.eventData.notification_time,
            is_reminder: 0,
            pendingTime: result.pendingTime || null
          },
          source: 'event'
        };
        response = '📅 *Faltó la fecha*\n\nDecime para qué día querés agendarlo.\n\nEjemplos:\n• mañana\n• lunes\n• 15/11\n• 2025-11-15\n\nEscribí "cancelar" para volver al menú.';
        updateSession('calendar_add_date_input', JSON.stringify(pendingContext));
        return response;
      }
    
    if (result.needsRecurrence) {
      response = menus.getRecurringMenu();
      updateSession('calendar_add_recurring', JSON.stringify(result.eventData));
        return response;
    } else if (result.success) {
      // Sincronizar con Google si está configurado
      const settings = database.getUserSettings(db, userPhone);
      let googleSynced = false;
      
        if (settings && settings.sync_google_auto) {
        const googleResult = await google.createGoogleEvent(db, userPhone, result.eventData);
        if (googleResult.success) {
          database.updateGoogleEventId(db, result.eventId, googleResult.eventId);
          googleSynced = true;
        }
      }
      
      response = menus.getEventAddedMessage(result.eventData, googleSynced);
        response += '\n\n¿Deseas agregar invitados a este evento?\n\n1️⃣ Sí, agregar invitados\n2️⃣ No, continuar';
        updateSession('calendar_add_invitees', JSON.stringify({ eventId: result.eventId, invitees: [] }));
        return response;
    } else {
        response = '❌ ' + (result.error || 'Error desconocido') + '\n\n' + menus.getAddEventInstructions();
        return response;
      }
    } catch (error) {
      console.error('[ERROR] Error procesando evento:', error);
      console.error('[ERROR] Stack:', error.stack);
      response = '❌ Ocurrió un error al procesar el evento. Por favor intenta de nuevo.\n\n' + menus.getAddEventInstructions();
      return response;
    }
  }
  else if (currentModule === 'calendar_add_date_input') {
    if (['cancelar', 'volver', 'menu'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }
    
    const pendingEvent = context.pendingEvent || {};
    
    if (!pendingEvent.title) {
      const instructions = pendingEvent.is_reminder ? menus.getAddReminderInstructions() : menus.getAddEventInstructions();
      response = '❌ No encontré los datos pendientes. Volvamos a empezar.\n\n' + instructions;
      updateSession(pendingEvent.is_reminder ? 'calendar_add_reminder' : 'calendar_add', null);
      return response;
    }
    
    const parsedDate = utils.parseNaturalDate(messageText);
    if (!parsedDate) {
      response = '❌ No pude interpretar esa fecha. Probá con ejemplos como "mañana", "lunes", "15/11" o "2025-11-15".';
      return response;
    }
    
    const time = pendingEvent.pendingTime || '12:00';
    const eventDateTime = utils.combineDateAndTime(parsedDate, time);
    
    if (!eventDateTime) {
      response = '❌ No pude combinar la fecha y hora. Intentá de nuevo con otro formato.';
      return response;
    }
    
    const eventData = {
      title: pendingEvent.title,
      event_date: eventDateTime,
      category: pendingEvent.category || 'personal',
      notification_time: pendingEvent.notification_time || 15,
      is_reminder: pendingEvent.is_reminder ? 1 : 0,
      has_due_date: 1
    };
    
    const insertResult = database.addEvent(db, userPhone, eventData);
    eventData.event_date = eventDateTime;
    
    if (!insertResult.success) {
      response = '❌ No se pudo guardar. Intenta nuevamente.';
      return response;
    }
    
    if (pendingEvent.is_reminder) {
      // Sincronizar con Google si corresponde
      const settings = database.getUserSettings(db, userPhone);
      let googleSynced = false;
      
      if (settings && settings.sync_google_auto) {
        const googleResult = await google.createGoogleEvent(db, userPhone, eventData);
        if (googleResult.success) {
          database.updateGoogleEventId(db, insertResult.id, googleResult.eventId);
          googleSynced = true;
        }
      }
      
      response = `⏰ *Recordatorio Agregado*\n\n` +
        `📅 ${eventData.title}\n` +
        `🕐 ${utils.formatDateForDisplay(eventData.event_date)}\n` +
        `🔔 Notificación: ${eventData.notification_time || 15} min antes` +
        (googleSynced ? '\n✅ Sincronizado con Google Calendar' : '') +
        `\n\n${menus.getMainMenu()}`;
      updateSession('calendar', null);
      return response;
    }
    
    // Evento normal
    const settings = database.getUserSettings(db, userPhone);
    let googleSynced = false;
    
    if (settings && settings.sync_google_auto) {
      const googleResult = await google.createGoogleEvent(db, userPhone, eventData);
      if (googleResult.success) {
        database.updateGoogleEventId(db, insertResult.id, googleResult.eventId);
        googleSynced = true;
      }
    }
    
    response = menus.getEventAddedMessage(eventData, googleSynced);
    response += '\n\n¿Deseas agregar invitados a este evento?\n\n1️⃣ Sí, agregar invitados\n2️⃣ No, continuar';
    updateSession('calendar_add_invitees', JSON.stringify({ eventId: insertResult.id, invitees: [] }));
    return response;
  }
  
  // ============================================
  // AGREGAR INVITADOS AL EVENTO
  // ============================================
  
  else if (currentModule === 'calendar_add_invitees') {
    if (messageText === '1' || messageText.toLowerCase() === 'sí' || messageText.toLowerCase() === 'si' || messageText === '1️⃣') {
      response = '👥 *Agregar Invitados*\n\n¿Cómo deseas agregar invitados?\n\n1️⃣ Escribir nombre\n2️⃣ Compartir contacto\n3️⃣ Listo, no agregar más';
      updateSession('calendar_add_invitees_method', JSON.stringify(context));
      return response;
    } else if (messageText === '2' || messageText === '2️⃣' || messageText.toLowerCase() === 'no') {
      // Usuario no quiere agregar invitados, volver al menú del calendario
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    } else {
      // Respuesta no reconocida, mostrar opciones nuevamente
      response = '❌ Opción no válida.\n\n¿Deseas agregar invitados a este evento?\n\n1️⃣ Sí, agregar invitados\n2️⃣ No, continuar';
      return response;
    }
  }
  
  else if (currentModule === 'calendar_add_invitees_method') {
    if (messageText === '1') {
      response = '👤 *Agregar Invitado por Nombre*\n\nEscribe el nombre del invitado:\n\n_Ejemplo: Juan Pérez_';
      updateSession('calendar_add_invitee_name', JSON.stringify(context));
      return response;
    } else if (messageText === '2') {
      response = '📱 *Compartir Contacto*\n\nToca el ícono de 📎 (adjuntar)\nSelecciona *"Contacto"*\nElige el contacto a agregar\n\n_También puedes escribir *"3"* para terminar_';
      updateSession('calendar_waiting_contact', JSON.stringify(context));
      return response;
    } else if (messageText === '3' || messageText === '3️⃣' || messageText.toLowerCase() === 'listo' || messageText.toLowerCase() === 'volver' || messageText.toLowerCase() === 'menu') {
      const invitees = context.invitees || [];
      if (invitees.length === 0) {
        response = '✅ Evento creado sin invitados.\n\n' + menus.getMainMenu();
      } else {
        const inviteesList = invitees.map((inv, i) => `${i + 1}. ${inv.name}${inv.phone ? ` (${inv.phone})` : ''}`).join('\n');
        response = `✅ *Evento creado con ${invitees.length} invitado(s)*\n\n${inviteesList}\n\n` + menus.getMainMenu();
      }
      updateSession('calendar', null);
      return response;
    } else {
      response = '❌ Opción no válida.\n\n*1* - Escribir nombre\n*2* - Compartir contacto\n*3* - Listo';
      return response;
    }
  }
  
  else if (currentModule === 'calendar_add_invitee_name') {
    const event = context.event;
    const invitees = context.invitees || [];
    
    if (messageText.trim().length < 2) {
      response = '❌ El nombre debe tener al menos 2 caracteres.\n\nEscribe el nombre del invitado:';
      return response;
    }
    
    // Guardar el nombre y pedir el teléfono
    const inviteeName = messageText.trim();
    response = `👤 *Nombre guardado: ${inviteeName}*\n\n📱 Ahora escribe el número de teléfono del invitado:\n\n_Ejemplo: 2611234567 o +542611234567_\n\n💡 También puedes escribir *"saltar"* si no quieres agregar el teléfono ahora.`;
    updateSession('calendar_add_invitee_phone', JSON.stringify({ eventId, invitees, pendingInviteeName: inviteeName }));
    return response;
  }
  
  else if (currentModule === 'calendar_add_invitee_phone') {
    const event = context.event;
    const invitees = context.invitees || [];
    const inviteeName = context.pendingInviteeName;
    
    // Verificar si el usuario quiere saltar el teléfono
    if (messageText.toLowerCase() === 'saltar' || messageText.toLowerCase() === 'skip') {
      // Agregar sin teléfono
      database.addEventInvitee(db, event.id, inviteeName, null);
      invitees.push({ name: inviteeName, phone: null });
      
      response = `✅ *Invitado agregado: ${inviteeName}* (sin teléfono)\n\n📊 Total de invitados: ${invitees.length}\n\n¿Deseas agregar otro invitado?\n\n1️⃣ Sí, agregar otro\n2️⃣ No, listo\n3️⃣ Volver al menú`;
      updateSession('calendar_add_invitees_confirm', JSON.stringify({ eventId, invitees }));
      return response;
    }
    
    // Validar y limpiar teléfono
    let contactPhone = messageText.replace(/\D/g, ''); // Solo números
    
    if (contactPhone.length < 8) {
      response = '❌ El número de teléfono debe tener al menos 8 dígitos.\n\nEscribe el número de teléfono o *"saltar"* para continuar sin teléfono:';
      return response;
    }
    
    // Formatear teléfono (agregar código de país si no lo tiene)
    if (!contactPhone.startsWith('549')) {
      contactPhone = '549' + contactPhone.replace(/^0+/, '');
    }
    
    database.addEventInvitee(db, event.id, inviteeName, contactPhone);
    invitees.push({ name: inviteeName, phone: contactPhone });
    
    // Enviar mensaje de bienvenida al invitado
    const sendResult = await sendInviteeWelcomeMessage(
      client,
      db,
      event.id,
      contactPhone,
      inviteeName,
      userPhone,
      userName
    );
    
    response = `✅ *${inviteeName}* agregado correctamente!\n\n📊 Total de invitados: ${invitees.length}\n\n¿Deseas agregar otro invitado?\n\n1️⃣ Sí, agregar otro\n2️⃣ No, listo\n3️⃣ Volver al menú`;
    
    if (!sendResult || !sendResult.success) {
      const errorMsg = sendResult?.error || 'No se pudo notificar automáticamente al invitado.';
      console.warn(`[WARN] No se pudo enviar mensaje de bienvenida a ${inviteeName}: ${errorMsg}`);
      response += `\n\n⚠️ *Aviso:* No pude notificar automáticamente a ${inviteeName}. Podés avisarle manualmente.\nMotivo: ${errorMsg}`;
    }
    
    updateSession('calendar_add_invitees_confirm', JSON.stringify({ eventId, invitees }));
    return response;
  }
  
  else if (currentModule === 'calendar_add_invitees_confirm') {
    const invitees = context.invitees || [];
    const eventId = context.eventId;
    
    if (messageText === '1' || messageText === '1️⃣' || messageText.toLowerCase() === 'sí' || messageText.toLowerCase() === 'si') {
      // Usuario quiere agregar otro invitado
      response = '👥 *Agregar Invitados*\n\n¿Cómo deseas agregar invitados?\n\n1️⃣ Escribir nombre\n2️⃣ Compartir contacto\n3️⃣ Listo, no agregar más';
      updateSession('calendar_add_invitees_method', JSON.stringify({ eventId, invitees }));
      return response;
    } else if (messageText === '2' || messageText === '2️⃣' || messageText.toLowerCase() === 'no' || messageText.toLowerCase() === 'listo') {
      // Usuario no quiere agregar más invitados, finalizar
      if (invitees.length === 0) {
        response = '✅ Evento creado sin invitados.\n\n' + menus.getMainMenu();
      } else {
        const inviteesList = invitees.map((inv, i) => `${i+1}. ${inv.name}${inv.phone ? ` (${inv.phone})` : ''}`).join('\n');
        response = `✅ *Evento creado con ${invitees.length} invitado(s)*\n\n${inviteesList}\n\n` + menus.getMainMenu();
      }
      updateSession('calendar', null);
      return response;
    } else if (messageText === '3' || messageText === '3️⃣' || messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'menú' || messageText.toLowerCase() === 'volver') {
      // Usuario quiere volver al menú
      if (invitees.length === 0) {
        response = '✅ Evento creado sin invitados.\n\n' + menus.getMainMenu();
      } else {
        const inviteesList = invitees.map((inv, i) => `${i+1}. ${inv.name}${inv.phone ? ` (${inv.phone})` : ''}`).join('\n');
        response = `✅ *Evento creado con ${invitees.length} invitado(s)*\n\n${inviteesList}\n\n` + menus.getMainMenu();
      }
      updateSession('calendar', null);
      return response;
    } else {
      // Respuesta no reconocida
      response = '❌ Opción no válida.\n\n¿Deseas agregar otro invitado?\n\n1️⃣ Sí, agregar otro\n2️⃣ No, listo\n3️⃣ Volver al menú';
      return response;
    }
  }
  
  // ============================================
  // CONFIRMAR AGREGAR OTRO EVENTO
  // ============================================
  
  else if (currentModule === 'calendar_add_another') {
    if (messageText === '1') {
      response = menus.getAddEventInstructions();
      updateSession('calendar_add', null);
    } else {
      response = menus.getMainMenu();
      updateSession('calendar', null);
    }
  }
  
  // ============================================
  // CONFIGURAR RECURRENCIA
  // ============================================
  
  else if (currentModule === 'calendar_add_recurring') {
    const eventData = JSON.parse(context);
    
    switch (messageText) {
      case '1': // No recurrente
        eventData.is_recurring = 0;
        break;
      case '2': // Diario
        eventData.is_recurring = 1;
        eventData.recurring_type = 'daily';
        break;
      case '3': // Semanal
        eventData.is_recurring = 1;
        eventData.recurring_type = 'weekly';
        break;
      case '4': // Mensual
        eventData.is_recurring = 1;
        eventData.recurring_type = 'monthly';
        break;
      case '5': // Volver
        response = menus.getMainMenu();
        updateSession('calendar', null);
        return response;
      default:
        response = '❌ Opción no válida.\n\n' + menus.getRecurringMenu();
        return response;
    }
    
    if (eventData.is_recurring) {
      response = '📅 *¿Hasta cuándo se repite el evento?*\n\nEnvía la fecha final en formato:\n• YYYY-MM-DD\n• DD/MM/YYYY\n• mañana, lunes, etc.\n\nO escribe *nunca* si no tiene fecha final.';
      updateSession('calendar_add_recurring_end', JSON.stringify(eventData));
    } else {
      const result = database.addEvent(db, userPhone, eventData);
      response = menus.getEventAddedMessage(eventData, false);
      updateSession('calendar_add_another', null);
    }
  }
  
  // ============================================
  // FECHA FIN DE RECURRENCIA
  // ============================================
  
  else if (currentModule === 'calendar_add_recurring_end') {
    const eventData = JSON.parse(context);
    
    if (messageText.toLowerCase() === 'nunca') {
      eventData.recurring_end_date = null;
    } else {
      const endDate = utils.parseNaturalDate(messageText);
      if (!endDate) {
        response = '❌ Fecha no válida. Intenta de nuevo:\n\n*Ejemplos:*\n• 2025-12-31\n• 31/12/2025\n• diciembre\n• nunca';
        return response;
      }
      eventData.recurring_end_date = endDate.toISOString().split('T')[0];
    }
    
    const result = database.addEvent(db, userPhone, eventData);
    
    // Sincronizar con Google
    const settings = database.getUserSettings(db, userPhone);
    let googleSynced = false;
    
    if (settings.sync_google_auto) {
      const googleResult = await google.createGoogleEvent(db, userPhone, eventData);
      if (googleResult.success) {
        database.updateGoogleEventId(db, result.id, googleResult.eventId);
        googleSynced = true;
      }
    }
    
    response = menus.getEventAddedMessage(eventData, googleSynced);
    updateSession('calendar_add_another', null);
  }
  
  // ============================================
  // PRÓXIMOS EVENTOS
  // ============================================
  
  else if (currentModule === 'calendar_upcoming') {
    let days = 7;
    
    switch (messageText) {
      case '1':
        days = 7;
        break;
      case '2':
        days = 15;
        break;
      case '3':
        days = 30;
        break;
      case '4':
        response = menus.getMainMenu();
        updateSession('calendar', null);
        return response;
      default:
        response = '❌ Opción no válida.\n\n' + menus.getUpcomingMenu();
        return response;
    }
    
    const events = database.getUpcomingEvents(db, userPhone, days);
    response = menus.formatEventsList(events) + '\n' + menus.getMainMenu();
    updateSession('calendar', null);
    return response;
  }
  
  // ============================================
  // GESTIONAR EVENTOS (continuará...)
  // ============================================
  
  else if (currentModule === 'calendar_manage') {
    switch (messageText) {
      case '1': // Editar
        const allEvents = database.getAllUserEvents(db, userPhone);
        if (allEvents.length === 0) {
          response = '📅 No tienes eventos próximos para editar.\n\n' + menus.getMainMenu();
          updateSession('calendar', null);
        } else {
          response = '✏️ *Editar Evento*\n\nSelecciona el número del evento que deseas editar:\n\n';
          response += menus.formatEventsList(allEvents.slice(0, 10));
          response += '\n_Escribe el número del evento:_';
          updateSession('calendar_edit_select', JSON.stringify({ events: allEvents.slice(0, 10) }));
        }
        return response;
        
      case '2': // Eliminar
        const eventsToDelete = database.getAllUserEvents(db, userPhone);
        if (eventsToDelete.length === 0) {
          response = '📅 No tienes eventos próximos para eliminar.\n\n' + menus.getMainMenu();
          updateSession('calendar', null);
        } else {
          response = '🗑️ *Eliminar Evento*\n\nSelecciona el número del evento que deseas eliminar:\n\n';
          response += menus.formatEventsList(eventsToDelete.slice(0, 10));
          response += '\n_Escribe el número del evento:_';
          updateSession('calendar_delete_select', JSON.stringify({ events: eventsToDelete.slice(0, 10) }));
        }
        return response;
        
      case '3': // Ver todos
        const allUserEvents = database.getAllUserEvents(db, userPhone);
        if (allUserEvents.length === 0) {
          response = '📅 No tienes eventos próximos.\n\n' + menus.getMainMenu();
        updateSession('calendar', null);
        } else {
          response = '📅 *Todos tus eventos*\n\n' +
            menus.formatEventsList(allUserEvents) +
            '\nEscribe el número del evento para ver opciones o *"volver"* para regresar.';
          updateSession('calendar_view_all', JSON.stringify({ events: allUserEvents }));
        }
        return response;

      case '4': // Ver/Completar recordatorios
        const reminders = database.getReminders(db, userPhone);
        if (reminders.length === 0) {
          response = '⏰ No tienes recordatorios pendientes.\n\n' + menus.getMainMenu();
      updateSession('calendar', null);
    } else {
          response = '⏰ *Tus Recordatorios*\n\n';
          reminders.forEach((reminder, index) => {
            const dateLabel = reminder.has_due_date
              ? utils.formatDateForDisplay(reminder.event_date)
              : 'Sin fecha programada';
            response += `${index + 1}. ${reminder.title}\n`;
            response += `   📅 ${dateLabel}\n\n`;
          });
          response += 'Escribe el número del recordatorio que deseas completar, o *"volver"* para regresar:';
          updateSession('calendar_complete_reminder', JSON.stringify({ source: 'manage' }));
        }
      return response;
        
      case '5': // Volver
        response = menus.getMainMenu();
        updateSession('calendar', null);
        return response;
        
      default:
        response = '❌ Opción no válida.\n\n' + menus.getManageMenu();
        return response;
    }
  }
  else if (currentModule === 'calendar_edit_select') {
    const events = Array.isArray(context.events) ? context.events : [];
  
    if (['menu', 'menú', 'volver'].includes(normalizedMessage)) {
      response = menus.getManageMenu();
      updateSession('calendar_manage', null);
  return response;
}

    if (events.length === 0) {
      response = '❌ No se encontraron eventos pendientes de edición.\n\n' + menus.getManageMenu();
      updateSession('calendar_manage', null);
      return response;
    }
  
    const eventIndex = parseInt(messageText, 10) - 1;
  
    if (Number.isNaN(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
      response = '❌ Número inválido. Por favor selecciona un número válido de la lista o escribe *"volver"* para regresar.';
      return response;
    }
  
    const selectedEvent = events[eventIndex];
    const eventId = selectedEvent.id;
    const eventFromDb = database.getEventById(db, eventId, userPhone) || selectedEvent;
    const invitees = database.getEventInvitees(db, eventId);
  
    response = buildEditEventMenuResponse(eventFromDb, invitees);
  
    updateSession('calendar_edit_field', JSON.stringify({
      event: { ...eventFromDb, invitees },
      source: 'manage',
      events,
      reminders: [],
      keyword: ''
    }));
    return response;
  }
  else if (currentModule === 'calendar_view_all') {
    const source = context.source || 'manage';
    const keyword = context.keyword || '';
    const events = Array.isArray(context.events) ? context.events : [];

    if (['volver', 'menu', 'menú'].includes(normalizedMessage)) {
      if (source === 'search') {
        response = `🔍 *Buscar Eventos*\n\nEscribe una palabra clave para buscar en tus eventos:\n\n_Ejemplo: reunión, cumpleaños, dentista_`;
        updateSession('calendar_search', null);
  } else {
        response = menus.getManageMenu();
        updateSession('calendar_manage', null);
      }
      return response;
    }

    if (events.length === 0) {
      response = `❌ No se encontraron eventos.\n\n${menus.getManageMenu()}`;
      updateSession('calendar_manage', null);
      return response;
    }

    const eventIndex = parseInt(messageText, 10) - 1;

    if (Number.isNaN(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
      response = '❌ Número inválido. Escribe el número del evento o *"volver"* para regresar.';
      return response;
    }

    const selectedEvent = events[eventIndex];
    const eventFromDb = database.getEventById(db, selectedEvent.id, userPhone) || selectedEvent;
    const invitees = database.getEventInvitees(db, selectedEvent.id);

    response = `📅 *${eventFromDb.title}*\n🕐 ${utils.formatDateForDisplay(eventFromDb.event_date)}\n🏷️ ${eventFromDb.category || 'personal'}\n👥 Invitados: ${invitees.length}\n\n¿Qué deseas hacer?\n1️⃣ Editar evento\n2️⃣ Eliminar evento\n3️⃣ Volver a la lista`;

    updateSession('calendar_view_all_options', JSON.stringify({
      source,
      keyword,
      event: { ...eventFromDb, invitees },
      events,
      reminders: context.reminders || []
    }));
    return response;
  }
  else if (currentModule === 'calendar_view_all_options') {
    const source = context.source || 'manage';
    const keyword = context.keyword || '';
    const eventData = context.event;
    const eventsList = context.events || [];

    if (!eventData) {
      if (source === 'search') {
        response = `🔍 *Buscar Eventos*\n\nEscribe una palabra clave para buscar en tus eventos:\n\n_Ejemplo: reunión, cumpleaños, dentista_`;
        updateSession('calendar_search', null);
    } else {
        response = menus.getManageMenu();
        updateSession('calendar_manage', null);
      }
      return response;
    }
    
    switch (messageText) {
      case '1': {
        const invitees = eventData.invitees || [];
        response = buildEditEventMenuResponse(eventData, invitees);
        updateSession('calendar_edit_field', JSON.stringify({
          event: eventData,
          source,
          events: eventsList,
          reminders: context.reminders || [],
          keyword
        }));
        return response;
      }
      case '2': {
        const deleteResult = database.deleteEvent(db, eventData.id, userPhone);
        if (deleteResult.success) {
          if (source === 'today') {
            const updatedEvents = database.getTodayEvents(db, userPhone);
            const updatedReminders = database.getTodayReminders(db, userPhone);

            if (updatedEvents.length === 0 && updatedReminders.length === 0) {
              response = `🗑️ *Evento eliminado*\n\n${eventData.title}\n📅 ${utils.formatDateForDisplay(eventData.event_date)}\n\n${menus.getMainMenu()}`;
              updateSession('calendar', null);
            } else {
              const followUp = buildTodayAgendaResponse(updatedEvents, updatedReminders);
              response = `🗑️ *Evento eliminado*\n\n${eventData.title}\n📅 ${utils.formatDateForDisplay(eventData.event_date)}\n\n${followUp}`;
              updateSession('calendar_today_select', JSON.stringify({ events: updatedEvents, reminders: updatedReminders }));
            }
          } else {
            response = `🗑️ *Evento eliminado*\n\n${eventData.title}\n📅 ${utils.formatDateForDisplay(eventData.event_date)}\n\n${menus.getMainMenu()}`;
            updateSession('calendar', null);
          }
        } else {
          response = `❌ No se pudo eliminar el evento. ${deleteResult.message || ''}\n\n${menus.getManageMenu()}`;
          updateSession('calendar_manage', null);
        }
        return response;
      }
      case '3':
      case 'volver':
      case 'menu':
      case 'menú': {
        if (source === 'today') {
          const updatedEvents = database.getTodayEvents(db, userPhone);
          const updatedReminders = database.getTodayReminders(db, userPhone);

          if (updatedEvents.length === 0 && updatedReminders.length === 0) {
            response = menus.getMainMenu();
            updateSession('calendar', null);
          } else {
            response = buildTodayAgendaResponse(updatedEvents, updatedReminders);
            updateSession('calendar_today_select', JSON.stringify({ events: updatedEvents, reminders: updatedReminders }));
          }
          return response;
        }

        if (!eventsList.length) {
          if (source === 'search') {
            response = `🔍 *Buscar Eventos*\n\nEscribe una palabra clave para buscar en tus eventos:\n\n_Ejemplo: reunión, cumpleaños, dentista_`;
            updateSession('calendar_search', null);
          } else {
            response = menus.getManageMenu();
            updateSession('calendar_manage', null);
          }
    } else {
          const header = source === 'search'
            ? `📊 *Resultados para "${keyword}"*`
            : '📅 *Todos tus eventos*';
          response = `${header}\n\n${menus.formatEventsList(eventsList)}\nEscribe el número del evento para ver opciones o *"volver"* para regresar.`;
          updateSession('calendar_view_all', JSON.stringify({ source, keyword, events: eventsList }));
        }
        return response;
      }
      default:
        response = '❌ Opción no válida. Usa 1 para editar, 2 para eliminar o 3 para volver.';
        return response;
    }
  }
  else if (currentModule === 'calendar_edit_field') {
    const editContext = context || {};
    const eventData = editContext.event || null;
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';

    if (!eventData || !eventData.id) {
      const backMessage = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      response = '❌ No encontré el evento que querías editar.\n\n' + backMessage;
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['volver', 'cancelar', '5', '5️⃣'].includes(normalizedMessage)) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    const numericChoice = normalizedMessage.replace(/[^0-9]/g, '');

    switch (numericChoice) {
      case '1': {
        const currentTitle = eventData.title || 'Sin título';
        response = `✏️ *Editar título*\n\nTítulo actual: *${currentTitle}*\n\nEscribí el nuevo título para el evento.\n\n💡 Escribí *"cancelar"* para volver sin cambios.`;
        updateSession(
          'calendar_edit_title',
          JSON.stringify({ event: eventData, source, events: eventsList, reminders: remindersList, keyword })
        );
        return response;
      }
      case '2': {
        const currentDateLabel = utils.formatDateForDisplay(eventData.event_date);
        response = `🕐 *Editar fecha y hora*\n\nActual: ${currentDateLabel}\n\nEscribí la nueva fecha y hora. Podés usar lenguaje natural:\n• "viernes 18:30"\n• "15 de noviembre 10:00"\n• "2025-11-15 10:00"\n\n💡 Si solo escribís la hora, mantendré la fecha actual.\nEscribí *"cancelar"* para volver.`;
        updateSession(
          'calendar_edit_datetime',
          JSON.stringify({ event: eventData, source, events: eventsList, reminders: remindersList, keyword })
        );
        return response;
      }
      case '3': {
        const currentCategory = utils.formatCategoryWithEmoji(eventData.category || 'personal');
        response = `🏷️ *Editar categoría*\n\nCategoría actual: ${currentCategory}\n\n${menus.getCategoriesMenu()}`;
        updateSession(
          'calendar_edit_category',
          JSON.stringify({ event: eventData, source, events: eventsList, reminders: remindersList, keyword })
        );
        return response;
      }
      case '4': {
        const refreshedEvent = database.getEventById(db, eventData.id, userPhone) || eventData;
        response = buildInviteesMenu(refreshedEvent, { source, events: eventsList, reminders: remindersList, keyword });
        return response;
      }
      default: {
        response = '❌ Opción no válida. Elegí una opción del 1 al 4, o escribe *"volver"* para regresar.';
        return response;
      }
    }
  }
  else if (currentModule === 'calendar_delete_select') {
    const events = Array.isArray(context.events) ? context.events : [];

    if (events.length === 0) {
      response = '❌ No se encontró información del evento a eliminar. Volvamos al menú de gestión.\n\n' + menus.getManageMenu();
      updateSession('calendar_manage', null);
      return response;
    }
    
    if (['volver', 'menu', 'menú', 'cancelar'].includes(normalizedMessage)) {
      response = menus.getManageMenu();
      updateSession('calendar_manage', null);
      return response;
    }
    
    const eventIndex = parseInt(messageText, 10) - 1;

    if (Number.isNaN(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
      response = '❌ Número inválido. Por favor selecciona un número válido de la lista o escribe *"volver"* para regresar.';
      return response;
    }

    const selectedEvent = events[eventIndex];
    const deleteResult = database.deleteEvent(db, selectedEvent.id, userPhone);

    if (deleteResult.success) {
      response = `🗑️ *Evento eliminado*\n\n${selectedEvent.title}\n📅 ${utils.formatDateForDisplay(selectedEvent.event_date)}\n\n` + menus.getMainMenu();
    } else {
      response = `❌ No se pudo eliminar el evento. ${deleteResult.message || ''}\n\n` + menus.getManageMenu();
    }
    
    updateSession('calendar', null);
    return response;
  }
  
  // ============================================
  // EDITAR EVENTO - CAMPOS
  // ============================================
  
  else if (currentModule === 'calendar_edit_title') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['cancelar', 'volver'].includes(normalizedMessage)) {
      response = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    const newTitleRaw = messageText.trim();
    if (!newTitleRaw) {
      response = '❌ Necesito un título válido. Escribí el nuevo título o *"cancelar"* para volver.';
      return response;
    }

    const newTitle = cleanTitleText(newTitleRaw);
    const updateResult = database.updateEvent(db, eventId, userPhone, { title: newTitle });

    if (!updateResult.success) {
      const menuText = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      response = `⚠️ No se registraron cambios en el evento.\n\n${menuText}`;
      return response;
    }

    let warning = '';
    if (eventData.google_event_id) {
      const googleResult = await google.updateGoogleEvent(db, userPhone, eventData.google_event_id, { title: newTitle });
      if (!googleResult.success) {
        warning = `\n⚠️ No se pudo actualizar en Google Calendar: ${googleResult.error || 'error desconocido.'}`;
      }
    }

    const menuText = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
    response = `✅ *Título actualizado*\n\nNuevo título: *${newTitle}*${warning}\n\n${menuText}`;
    return response;
  }
  else if (currentModule === 'calendar_edit_datetime') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['cancelar', 'volver'].includes(normalizedMessage)) {
      response = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    const message = messageText.trim();
    if (!message) {
      response = '❌ Necesito una fecha u hora válida. Intenta nuevamente o escribe *"cancelar"* para volver.';
      return response;
    }

    const timeInfo = extractTimeFromText(message);
    const dateInfo = extractDateFromText(message);

    let parsedDate = dateInfo.date || utils.parseNaturalDate(message);
    const existingDate = eventData.event_date ? new Date(eventData.event_date) : null;
    const isExistingDateValid = existingDate && !isNaN(existingDate.getTime());

    if (!parsedDate && isExistingDateValid) {
      parsedDate = new Date(existingDate);
    }

    if (!parsedDate) {
      response = '❌ No pude interpretar la fecha. Intenta con un formato diferente (ej: "15/11", "viernes", "2025-11-15").';
      return response;
    }

    let parsedTime = timeInfo.time || utils.parseTime(message);
    if (!parsedTime && isExistingDateValid) {
      parsedTime = `${String(existingDate.getHours()).padStart(2, '0')}:${String(existingDate.getMinutes()).padStart(2, '0')}`;
    }

    if (!parsedTime) {
      response = '❌ No pude interpretar la hora. Escribí la hora en formato HH:MM (ej: 18:30) o lenguaje natural (ej: 6pm).';
      return response;
    }

    const combinedDate = utils.combineDateAndTime(parsedDate, parsedTime);
    if (!combinedDate) {
      response = '❌ No pude combinar la fecha y la hora. Intenta nuevamente.';
      return response;
    }

    const updateResult = database.updateEvent(db, eventId, userPhone, { event_date: combinedDate });
    if (!updateResult.success) {
      const menuText = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      response = `⚠️ No se registraron cambios en la fecha.\n\n${menuText}`;
      return response;
    }

    let warning = '';
    if (eventData.google_event_id) {
      const googleResult = await google.updateGoogleEvent(db, userPhone, eventData.google_event_id, { event_date: combinedDate });
      if (!googleResult.success) {
        warning = `\n⚠️ No se pudo actualizar en Google Calendar: ${googleResult.error || 'error desconocido.'}`;
      }
    }

    const menuText = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
    response = `✅ *Fecha y hora actualizadas*\n\nNueva fecha: ${utils.formatDateForDisplay(combinedDate)}${warning}\n\n${menuText}`;
    return response;
  }
  else if (currentModule === 'calendar_edit_category') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['cancelar', 'volver', '6', '6️⃣'].includes(normalizedMessage)) {
      response = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    const categoryMap = {
      '1': 'personal',
      '2': 'trabajo',
      '3': 'urgente',
      '4': 'familia'
    };

    let newCategory = categoryMap[normalizedMessage.replace(/[^0-9]/g, '')] || utils.validateCategory(messageText);
    if (!newCategory) {
      response = '❌ Categoría inválida. Elegí una opción del menú o escribe *personal, trabajo, urgente, familia*.';
      return response;
    }

    const currentCategory = eventData.category || 'personal';
    if (currentCategory === newCategory) {
      const menuText = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      response = `⚠️ La categoría ya está establecida como *${utils.formatCategoryWithEmoji(newCategory)}*.\n\n${menuText}`;
      return response;
    }

    const updateResult = database.updateEvent(db, eventId, userPhone, { category: newCategory });
    if (!updateResult.success) {
      const menuText = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      response = `❌ No se pudo actualizar la categoría.\n\n${menuText}`;
      return response;
    }

    const menuText = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
    response = `✅ *Categoría actualizada*\n\nAhora es: ${utils.formatCategoryWithEmoji(newCategory)}\n\n${menuText}`;
    return response;
  }
  else if (currentModule === 'calendar_edit_invitees') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['volver', '4', '4️⃣'].includes(normalizedMessage)) {
      response = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    const invitees = database.getEventInvitees(db, eventId) || [];
    const baseContext = { source, events: eventsList, reminders: remindersList, keyword, event: { ...eventData, invitees } };
    const numericChoice = normalizedMessage.replace(/[^0-9]/g, '');

    switch (numericChoice) {
      case '1': {
        response = '👤 *Nuevo invitado*\n\nEscribí el nombre del invitado.\n\nEscribí *"cancelar"* para volver.';
        updateSession('calendar_edit_invitees_add_name', JSON.stringify({ ...baseContext }));
        return response;
      }
      case '2': {
        response = '📇 Compartí el contacto desde WhatsApp para agregarlo como invitado.\n\nEscribí *"cancelar"* para volver.';
        updateSession('calendar_edit_invitees_waiting_contact', JSON.stringify({ ...baseContext }));
        return response;
      }
      case '3': {
        if (invitees.length === 0) {
          response = '⚠️ Este evento no tiene invitados para eliminar.\n\n' + buildInviteesMenu(eventData, { source, events: eventsList, reminders: remindersList, keyword });
          return response;
        }

        let listText = '✂️ *Eliminar invitado*\n\nSeleccioná el número del invitado que querés quitar:\n\n';
        invitees.forEach((inv, index) => {
          const phoneLabel = inv.phone ? ` (${inv.phone})` : '';
          listText += `${index + 1}. ${inv.name}${phoneLabel}\n`;
        });
        listText += '\nEscribí *"cancelar"* para volver.';

        updateSession('calendar_edit_invitees_remove', JSON.stringify({ ...baseContext }));
        response = listText;
        return response;
      }
      default: {
        response = '❌ Opción no válida. Elegí 1, 2, 3 o 4.';
        return response;
      }
    }
  }
  else if (currentModule === 'calendar_edit_invitees_add_name') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const invitees = editContext.event?.invitees || [];
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['cancelar', 'volver'].includes(normalizedMessage)) {
      response = buildInviteesMenu(eventData, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    const inviteeName = cleanTitleText(messageText);
    if (!inviteeName || inviteeName.length < 2) {
      response = '❌ Nombre inválido. Escribí el nombre del invitado o *"cancelar"* para volver.';
      return response;
    }

    response = `📱 *Agregar teléfono*\n\nEscribí el número de *${inviteeName}* (ej: 2611234567 o +542611234567).\n\nEscribí *"saltar"* si querés agregarlo sin teléfono o *"cancelar"* para volver.`;
    updateSession(
      'calendar_edit_invitees_add_phone',
      JSON.stringify({
        event: { ...eventData, invitees },
        source,
        events: eventsList,
        reminders: remindersList,
        keyword,
        pendingName: inviteeName
      })
    );
    return response;
  }
  else if (currentModule === 'calendar_edit_invitees_add_phone') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const invitees = editContext.event?.invitees || [];
    const pendingName = editContext.pendingName || 'Invitado';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['cancelar', 'volver'].includes(normalizedMessage)) {
      response = buildInviteesMenu(eventData, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    let contactPhone = null;
    if (['saltar', 'skip'].includes(normalizedMessage)) {
      contactPhone = null;
    } else {
      contactPhone = messageText.replace(/\D/g, '');
      if (!contactPhone || contactPhone.length < 8) {
        response = '❌ El número debe tener al menos 8 dígitos. Escribí nuevamente o usa *"saltar"* para omitir.';
        return response;
      }
      if (!contactPhone.startsWith('549')) {
        contactPhone = '549' + contactPhone.replace(/^0+/, '');
      }
    }

    database.addEventInvitee(db, eventId, pendingName, contactPhone);
    let updatedInvitees = database.getEventInvitees(db, eventId) || [];

    let warning = '';
    if (contactPhone) {
      const sendResult = await sendInviteeWelcomeMessage(
        client,
        db,
        eventId,
        contactPhone,
        pendingName,
        userPhone,
        userName
      );
      if (!sendResult || !sendResult.success) {
        warning = `\n⚠️ No pude enviar la notificación automática. Motivo: ${sendResult?.error || 'desconocido.'}`;
      }
    }

    const refreshedEvent = database.getEventById(db, eventId, userPhone) || eventData;
    const menuText = buildInviteesMenu(refreshedEvent, { source, events: eventsList, reminders: remindersList, keyword });
    response = `✅ *${pendingName}* agregado correctamente.${warning}\n\n${menuText}`;
    return response;
  }
  else if (currentModule === 'calendar_edit_invitees_waiting_contact') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['cancelar', 'volver'].includes(normalizedMessage)) {
      response = buildInviteesMenu(eventData, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    response = '📇 Aguardando el contacto... Compartí el contacto desde tu agenda o escribe *"cancelar"* para volver.';
    return response;
  }
  else if (currentModule === 'calendar_edit_invitees_remove') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = editContext.source || 'manage';
    const eventsList = editContext.events || [];
    const remindersList = editContext.reminders || [];
    const keyword = editContext.keyword || '';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['cancelar', 'volver'].includes(normalizedMessage)) {
      response = buildInviteesMenu(eventData, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    const invitees = database.getEventInvitees(db, eventId) || [];
    if (invitees.length === 0) {
      response = '⚠️ Ya no hay invitados para eliminar.\n\n' + buildInviteesMenu(eventData, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    const selectedIndex = parseInt(messageText, 10) - 1;
    if (Number.isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= invitees.length) {
      response = '❌ Número inválido. Escribí el número del invitado que querés quitar o *"cancelar"* para volver.';
      return response;
    }

    const invitee = invitees[selectedIndex];
    database.deleteEventInvitee(db, invitee.id);

    const refreshedEvent = database.getEventById(db, eventId, userPhone) || eventData;
    const menuText = buildInviteesMenu(refreshedEvent, { source, events: eventsList, reminders: remindersList, keyword });
    response = `🗑️ *Invitado eliminado*\n\n${invitee.name} ya no forma parte del evento.\n\n${menuText}`;
    return response;
  }
  else if (currentModule === 'calendar_edit_invitees_post_add') {
    const editContext = context || {};
    const eventData = editContext.event || {};
    const source = eventData.source || editContext.source || 'manage';
    const eventsList = eventData.events || editContext.events || [];
    const remindersList = eventData.reminders || editContext.reminders || [];
    const keyword = eventData.keyword || editContext.keyword || '';
    const eventId = eventData.id;

    if (!eventId) {
      response = goBackToSource(source, { keyword, events: eventsList, reminders: remindersList });
      return response;
    }

    if (['menu', 'menú'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (['1', '1️⃣', 'sí', 'si'].includes(normalizedMessage)) {
      const refreshedEvent = database.getEventById(db, eventId, userPhone) || eventData;
      response = buildInviteesMenu(refreshedEvent, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    if (['2', '2️⃣', 'no', 'volver', 'cancelar'].includes(normalizedMessage)) {
      response = rebuildEditMenu(eventId, { source, events: eventsList, reminders: remindersList, keyword });
      return response;
    }

    response = '❌ Opción no válida. Respondé con *1* para agregar otro invitado o *2* para volver.';
    return response;
  }
  
  // ============================================
  // COMPLETAR RECORDATORIO
  // ============================================
  
  else if (currentModule === 'calendar_complete_reminder') {
    const reminderContext = context || {};
    const source = reminderContext.source || 'calendar';
    const goBackTo = (src) => {
      if (src === 'manage') {
        updateSession('calendar_manage', null);
        return menus.getManageMenu();
      }
    updateSession('calendar', null);
      return menus.getMainMenu();
    };
    
    if (['volver', 'atrás', 'atras', 'menu'].includes(normalizedMessage)) {
      response = goBackTo(source);
      return response;
    }
    
    const reminders = database.getReminders(db, userPhone);
    const reminderIndex = parseInt(messageText) - 1;
    
    if (isNaN(reminderIndex) || reminderIndex < 0 || reminderIndex >= reminders.length) {
      response = '❌ Número inválido. Escribí el número del recordatorio o *"volver"*:';
      return response;
    }
    
    const reminder = reminders[reminderIndex];
    
    // Eliminar recordatorio
    const deleteResult = database.deleteEvent(db, reminder.id, userPhone);
    
    if (!deleteResult.success) {
      response = '❌ Error al completar el recordatorio. Intenta de nuevo.';
      return response;
    }
    
    // Si está sincronizado con Google, eliminar también de ahí
    if (reminder.google_event_id) {
      await google.deleteGoogleEvent(db, userPhone, reminder.google_event_id);
    }
    
    const remaining = database.getReminders(db, userPhone);
    let followUp = '';
    
    if (remaining.length === 0) {
      followUp = goBackTo(source);
      response = `✅ *Recordatorio completado*\n\n"${reminder.title}" ha sido eliminado.\n\n${followUp}`;
    } else {
      let listMessage = '⏰ *Tus Recordatorios*\n\n';
      remaining.forEach((item, idx) => {
        const dateLabel = item.has_due_date
          ? utils.formatDateForDisplay(item.event_date)
          : 'Sin fecha programada';
        listMessage += `${idx + 1}. ⏰ ${item.title}\n`;
        listMessage += `   📅 ${dateLabel}\n\n`;
      });
      listMessage += 'Escribí el número del recordatorio que quieras completar, o *"volver"* para regresar:';
      
      response = `✅ *Recordatorio completado*\n\n"${reminder.title}" ha sido eliminado.\n\n${listMessage}`;
      updateSession('calendar_complete_reminder', JSON.stringify({ source }));
    }
    
      return response;
  }
  
  // ============================================
  // VISTA SEMANAL - NAVEGACIÓN
  // ============================================
  
  if (currentModule === 'calendar_week_view') {
    const normalizedMessage = messageText.toLowerCase().trim();
    
    if (normalizedMessage === 'volver' || normalizedMessage === 'menu' || normalizedMessage === 'menú' || normalizedMessage === '4' || normalizedMessage === '4️⃣') {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }
    
    // Obtener fecha de inicio de la semana desde el contexto
    let currentWeekStart = new Date();
    try {
      if (context && context.weekStartDate) {
        currentWeekStart = new Date(context.weekStartDate);
      } else if (context && context.weekStart) {
        currentWeekStart = new Date(context.weekStart);
      } else {
        // Calcular lunes de esta semana si no hay contexto
        const day = currentWeekStart.getDay();
        const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
        currentWeekStart = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), diff);
      }
    } catch (error) {
      console.error('[ERROR] Error parseando fecha de semana:', error);
      // Usar semana actual como fallback
      const day = currentWeekStart.getDay();
      const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
      currentWeekStart = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), diff);
    }
    currentWeekStart.setHours(0, 0, 0, 0);
    
    let newWeekStart = new Date(currentWeekStart);
    
    if (normalizedMessage === '1' || normalizedMessage === '1️⃣' || normalizedMessage === 'anterior' || normalizedMessage === 'atrás') {
      // Semana anterior
      newWeekStart.setDate(newWeekStart.getDate() - 7);
    } else if (normalizedMessage === '2' || normalizedMessage === '2️⃣' || normalizedMessage === 'siguiente' || normalizedMessage === 'adelante') {
      // Semana siguiente
      newWeekStart.setDate(newWeekStart.getDate() + 7);
    } else if (normalizedMessage === '3' || normalizedMessage === '3️⃣' || normalizedMessage === 'actual' || normalizedMessage === 'hoy') {
      // Semana actual
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      newWeekStart = new Date(now.getFullYear(), now.getMonth(), diff);
      newWeekStart.setHours(0, 0, 0, 0);
    } else {
      response = '❌ Opción no válida.\n\n' + menus.getWeekView(currentWeekStart, database.getWeekEvents(db, userPhone, currentWeekStart), true);
      return response;
    }
    
    const weekEvents = database.getWeekEvents(db, userPhone, newWeekStart);
    response = menus.getWeekView(newWeekStart, weekEvents, true);
    updateSession('calendar_week_view', JSON.stringify({ 
      weekStart: newWeekStart.toISOString(),
      weekStartDate: newWeekStart.getTime()
    }));
    return response;
  }
  
  // ============================================
  // VISTA MENSUAL - VER EVENTOS
  // ============================================
  
  if (currentModule === 'calendar_month_view') {
    if (messageText === '1' || messageText.toLowerCase() === 'sí' || messageText.toLowerCase() === 'si') {
      const year = context.year || new Date().getFullYear();
      const month = context.month !== undefined ? context.month : new Date().getMonth();
      const events = context.events || [];
    
    if (events.length === 0) {
        response = '📅 No hay eventos en este mes.\n\n' + menus.getMainMenu();
      } else {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        response = `📅 *Eventos de ${monthNames[month]} ${year}*\n\n`;
        response += menus.formatEventsList(events) + '\n' + menus.getMainMenu();
      }
      updateSession('calendar', null);
    } else {
        response = menus.getMainMenu();
      updateSession('calendar', null);
    }
    return response;
    }
    
  else if (currentModule === 'calendar_search') {
    if (['menu', 'menú', 'volver', 'cancelar'].includes(normalizedMessage)) {
      response = menus.getMainMenu();
      updateSession('calendar', null);
      return response;
    }

    if (!messageText || messageText.trim().length < 2) {
      response = '🔍 Necesito al menos 2 caracteres para buscar. Escribe una palabra clave (ej: dentista, reunión, cumpleaños).';
      return response;
    }

    const keyword = messageText.trim();
    const results = database.searchEvents(db, userPhone, keyword);

    if (!results || results.length === 0) {
      response = `❌ No encontré eventos que coincidan con "${keyword}".

Si querés, puedo crear un evento con esta palabra clave.

1️⃣ Sí, crear evento con "${keyword}"
2️⃣ No, volver al menú`;
      updateSession('calendar_search_no_results', JSON.stringify({ keyword }));
      return response;
    }
    
    response = `📊 *Resultados para "${keyword}"*

${menus.formatEventsList(results)}
Escribe el número del evento para ver opciones o *"volver"* para regresar.`;
    updateSession('calendar_view_all', JSON.stringify({ source: 'search', keyword, events: results }));
    return response;
  }
  
  else if (currentModule === 'calendar_search_no_results') {
    const keyword = context.keyword || messageText;

    switch (normalizedMessage) {
      case '1':
      case 'sí':
      case 'si':
      case '1️⃣':
        response = `📝 *Crear Evento*

Escribí todos los detalles del evento. Podés incluir título, fecha y hora.

*Ejemplo:* ${keyword} | mañana | 18:00`;
        updateSession('calendar_add', null);
        return response;
      case '2':
      case 'no':
      case '2️⃣':
      case 'volver':
      case 'menu':
      case 'menú':
        response = menus.getMainMenu();
        updateSession('calendar', null);
        return response;
      default:
        response = '❌ Opción no válida. Responde con *1* para crear el evento o *2* para volver al menú.';
        return response;
    }
  }
  
  // Asegurar que siempre haya una respuesta
  if (!response || response.trim() === '') {
    console.error(`[ERROR] handleMessage - Respuesta vacía para módulo: ${currentModule}, mensaje: ${messageText}`);
    console.error(`[ERROR] Stack trace:`, new Error().stack);
    response = '❌ No se pudo procesar tu solicitud. Por favor intenta de nuevo o escribe *"menu"* para volver al inicio.';
  }
  
  // Verificar que la respuesta sea un string válido
  if (typeof response !== 'string') {
    console.error(`[ERROR] handleMessage - Respuesta no es string, tipo: ${typeof response}, valor:`, response);
    response = '❌ Error interno: respuesta inválida. Por favor intenta de nuevo.';
  }
  
  console.log(`[DEBUG] handleMessage - Respuesta final (${response.length} chars): ${response.substring(0, 150)}...`);
  console.log(`[DEBUG] handleMessage - Tipo de respuesta: ${typeof response}`);
  return response;
}

async function sendInviteeWelcomeMessage(client, db, eventId, inviteePhone, inviteeName, addedByPhone, addedByName) {
  if (!client || !inviteePhone) {
    console.log('[DEBUG] No se puede enviar mensaje: cliente o teléfono del invitado no disponible');
    return { success: false, error: 'Cliente o teléfono no disponible' };
  }

  try {
    console.log(`[DEBUG] Enviando bienvenida a invitado ${inviteeName} (${inviteePhone}) para evento ${eventId}`);

    const event = database.getEventById(db, eventId, addedByPhone);
    if (!event) {
      const errorMsg = `Evento ${eventId} no encontrado para usuario ${addedByPhone}`;
      console.error(`[ERROR] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    const formattedDate = utils.formatDateForDisplay(event.event_date);
    const message = `👋 ¡Hola *${inviteeName}*!\n\n` +
      `Fuiste agregado por *${addedByName}* al evento:\n\n` +
      `📅 *${event.title}*\n` +
      `🕐 ${formattedDate}\n` +
      `🏷️ ${event.category || 'personal'}\n\n` +
      `🤖 Soy *Milo*, tu asistente personal en WhatsApp.\n` +
      `Puedo ayudarte a gestionar eventos, dividir gastos y organizar tu día.\n\n` +
      `📌 Guardame como *"Milo 💬"* para poder chatear conmigo directamente.\n\n` +
      `Escribí *hola* o *menu* cuando quieras empezar.`;

    const digitsOnlyPhone = inviteePhone.replace(/\D/g, '');
    const chatId = `${digitsOnlyPhone}@c.us`;

    console.log(`[DEBUG] Verificando número de WhatsApp: ${chatId}`);
    const numberId = await client.getNumberId(chatId);

    if (!numberId) {
      const errorMsg = `El número ${digitsOnlyPhone} no está registrado en WhatsApp`;
      console.error(`[ERROR] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    const targetId = numberId._serialized || chatId;
    await client.sendMessage(targetId, message);
    console.log(`✅ Mensaje de bienvenida enviado a ${inviteeName} (${digitsOnlyPhone}) para evento "${event.title}"`);
    return { success: true };
  } catch (error) {
    console.error(`⚠️ No se pudo enviar mensaje a ${inviteeName} (${inviteePhone}):`, error.message);
    console.error('[ERROR] Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

function buildEditEventMenuResponse(eventData, invitees = []) {
  const inviteesCount = invitees.length;
  const inviteesInfo = inviteesCount > 0
    ? `\n👥 Invitados: ${inviteesCount} (${invitees.map(inv => inv.name).join(', ')})\n`
    : '\n👥 Sin invitados\n';

  return `✏️ *Editar Evento*\n\n` +
    `📅 ${eventData.title}\n` +
    `🕐 ${utils.formatDateForDisplay(eventData.event_date)}\n` +
    `🏷️ ${eventData.category || 'personal'}` +
    inviteesInfo +
    `\n*¿Qué deseas editar?*\n\n` +
    `1️⃣ Título\n` +
    `2️⃣ Fecha y hora\n` +
    `3️⃣ Categoría\n` +
    `4️⃣ 👥 Gestionar invitados\n` +
    `5️⃣ Cancelar\n\n` +
    `_Selecciona una opción:_`;
}

function detectCategoryFromText(text) {
  if (!text) {
    return 'personal';
  }
  const normalized = text.toLowerCase();
  if (normalized.includes('trabaj')) {
    return 'trabajo';
  }
  if (normalized.includes('urgente')) {
    return 'urgente';
  }
  if (normalized.includes('familia')) {
    return 'familia';
  }
  return 'personal';
}

function cleanTitleText(text) {
  if (!text) {
    return 'Evento sin título';
  }
  let cleaned = text
    .replace(/\b(hoy|mañana|manana|pasado\s+mañana|pasado\s+manana)\b/gi, ' ')
    .replace(/\b(a\s+las|a\s+la|a\s+los|a\s+las)\b/gi, ' ')
    .replace(/\b(el|la|los|las|un|una|unos|unas|de|del|al|para|por|con|buscar)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return 'Evento sin título';
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function extractTimeFromText(text) {
  if (!text) {
    return { cleanedText: text, time: null, raw: null };
  }

  let working = text;
  let timeValue = null;
  let rawTime = null;

  const timePatterns = [
    /(\d{1,2})[:\.](\d{2})/i,
    /(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|hs|h)\b/i
  ];

  for (const pattern of timePatterns) {
    const match = working.match(pattern);
    if (match) {
      rawTime = match[0];
      let normalized = rawTime.replace(/hs|h/gi, '').replace(/\./g, ':').trim();
      timeValue = utils.parseTime(normalized);
      working = working.replace(match[0], ' ');
      break;
    }
  }

  return {
    cleanedText: working,
    time: timeValue,
    raw: rawTime
  };
}

function extractDateFromText(text) {
  if (!text) {
    return { cleanedText: text, date: null, raw: null };
  }

  let working = text;
  let rawDate = null;
  let dateValue = null;

  const patterns = [
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/,
    /\b\d{1,2}\s+(?:de\s+)?[a-záéíóú]+\b/i
  ];

  for (const pattern of patterns) {
    const match = working.match(pattern);
    if (match) {
      rawDate = match[0];
      dateValue = utils.parseNaturalDate(rawDate);
      if (dateValue) {
        working = working.replace(match[0], ' ');
        break;
      }
    }
  }

  if (!dateValue) {
    const keywords = ['hoy', 'mañana', 'manana', 'pasado mañana', 'pasado manana'];
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'i');
      if (regex.test(working)) {
        rawDate = keyword;
        dateValue = utils.parseNaturalDate(keyword);
        working = working.replace(regex, ' ');
        break;
      }
    }
  }

  if (!dateValue) {
    const weekDays = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'];
    for (const day of weekDays) {
      const regex = new RegExp(`\\b${day}\\b`, 'i');
      if (regex.test(working)) {
        rawDate = day;
        dateValue = utils.parseNaturalDate(day);
        working = working.replace(regex, ' ');
        break;
      }
    }
  }

  return {
    cleanedText: working,
    date: dateValue,
    raw: rawDate
  };
}

async function parseNaturalEvent(db, userPhone, messageText, isReminder = false) {
  const notificationTimeDefault = 15;
  const rawText = (messageText || '').trim();

  if (!rawText) {
    return {
      success: false,
      error: 'Escribe el título del evento.'
    };
  }

  if (rawText.includes('|')) {
    const parts = rawText.split('|').map(p => p.trim());
    const titlePart = parts[0] || '';
    const datePart = parts[1] || '';
    const timePart = parts[2] || '';
    const categoryPart = parts[3] || '';

    const parsedDate = utils.parseNaturalDate(datePart);
    const parsedTime = utils.parseTime(timePart) || '12:00';
    const category = utils.validateCategory(categoryPart);
    const title = cleanTitleText(titlePart);

    if (!parsedDate) {
      return {
        success: false,
        needsDateConfirmation: true,
        eventData: {
          title,
          category,
          notification_time: notificationTimeDefault,
          is_reminder: isReminder ? 1 : 0,
          has_due_date: 0
        },
        pendingTime: parsedTime
      };
    }

    const eventDateTime = utils.combineDateAndTime(parsedDate, parsedTime);

    if (!eventDateTime) {
      return {
        success: false,
        error: 'No pude combinar la fecha y la hora.'
      };
    }

    const eventData = {
      title,
      event_date: eventDateTime,
      category,
      notification_time: notificationTimeDefault,
      is_recurring: 0,
      is_reminder: isReminder ? 1 : 0,
      has_due_date: 1
    };

    const insertResult = database.addEvent(db, userPhone, eventData);
    eventData.event_date = eventDateTime;

    return {
      success: true,
      eventId: insertResult.id,
      eventData,
      needsRecurrence: false
    };
  }

  let workingText = rawText;

  const timeExtraction = extractTimeFromText(workingText);
  workingText = timeExtraction.cleanedText;
  let timeValue = timeExtraction.time || '12:00';

  const dateExtraction = extractDateFromText(workingText);
  workingText = dateExtraction.cleanedText;
  const parsedDate = dateExtraction.date;

  const category = detectCategoryFromText(workingText);
  const title = cleanTitleText(workingText);

  if (!parsedDate) {
    return {
      success: false,
      needsDateConfirmation: true,
      eventData: {
        title,
        category,
        notification_time: notificationTimeDefault,
        is_reminder: isReminder ? 1 : 0,
        has_due_date: 0
      },
      pendingTime: timeValue
    };
  }

  const eventDateTime = utils.combineDateAndTime(parsedDate, timeValue || '12:00');

  if (!eventDateTime) {
    return {
      success: false,
      error: 'No pude combinar la fecha y la hora.'
    };
  }

  const eventData = {
    title,
    event_date: eventDateTime,
    category,
    notification_time: notificationTimeDefault,
    is_recurring: 0,
    is_reminder: isReminder ? 1 : 0,
    has_due_date: 1
  };

  const insertResult = database.addEvent(db, userPhone, eventData);
  eventData.event_date = eventDateTime;

  return {
    success: true,
    eventId: insertResult.id,
    eventData,
    needsRecurrence: false
  };
}

async function processAddEvent(db, userPhone, messageText) {
  return parseNaturalEvent(db, userPhone, messageText, false);
}

async function handleGoogleSync(db, userPhone, client) {
  if (typeof google.hasGoogleCredentials === 'function' && !google.hasGoogleCredentials()) {
    return `☁️ *Google Calendar*\n\n⚠️ Aún no configuraste las credenciales de Google.\n\nPor favor agrega en tu archivo *.env*:\n• GOOGLE_CLIENT_ID\n• GOOGLE_CLIENT_SECRET\n• GOOGLE_REDIRECT_URI\n\nDespués reinicia el bot y volvé a intentar.`;
  }

  const authStatus = await google.checkAuthStatus(db, userPhone);

  if (!authStatus.authenticated) {
    let authUrl = '';
    try {
      authUrl = google.getAuthUrl();
    } catch (error) {
      console.error('❌ Error generando authUrl de Google:', error);
      return `☁️ *Google Calendar*\n\n⚠️ No pude generar el enlace de autorización.\n\nVerificá que las credenciales (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) estén configuradas correctamente y que el bot se haya reiniciado.`;
    }

    return `☁️ *Google Calendar*\n\nNo detecté una conexión activa con Google.\n\n1️⃣ Abrí este enlace: ${authUrl}\n2️⃣ Inicia sesión con tu cuenta y acepta los permisos.\n3️⃣ Copiá el código que te muestra Google y pegalo acá.\n\nEscribe *"cancelar"* para volver al menú.`;
  }

  return `☁️ *Google Calendar*\n\n✅ Conectado correctamente\n\n*Opciones:*\n\n1️⃣ Sincronizar eventos locales → Google\n2️⃣ Importar eventos de Google → Local\n3️⃣ Desconectar Google Calendar\n4️⃣ Volver\n\n_¿Qué deseas hacer?_`;
}

async function handleGoogleAuthCode(db, userPhone, code) {
  const tokenResult = await google.getTokensFromCode(code);
  if (!tokenResult.success || !tokenResult.tokens) {
    return `❌ No pude validar el código proporcionado.\n\n${tokenResult.error || 'Por favor intenta nuevamente.'}`;
  }

  database.saveGoogleTokens(db, userPhone, tokenResult.tokens);

  try {
    await google.syncUserWithGoogle(db, userPhone);
  } catch (error) {
    console.warn('⚠️ Error realizando sincronización inicial tras conectar Google:', error);
  }

  return `✅ *Google Calendar conectado*\n\nTus eventos quedarán sincronizados automáticamente. Si querés importar los eventos existentes ahora mismo, escribe *1*.`;
}

module.exports = {
  handleMessage,
  sendInviteeWelcomeMessage,
  setGlobalMainMenu,
  buildEditEventMenuResponse,
  parseNaturalEvent,
  processAddEvent
};