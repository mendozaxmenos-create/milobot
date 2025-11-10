// ============================================
// 🎮 MANEJADORES DE MENSAJES - CALENDARIO
// ============================================

const database = require('./database');
const menus = require('./menus');
const utils = require('./utils');
const google = require('./google');

/**
 * Función principal para manejar mensajes del módulo calendario
 */
async function handleMessage(msg, userPhone, userName, messageText, currentModule, session, db, client) {
  let response = '';
  
  // Obtener o crear sesión del módulo
  const context = session?.context ? JSON.parse(session.context) : {};
  
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
  
  // Función helper para volver al menú principal del bot
  const getMainMenu = (name) => {
    return `Hola *${name}*! 👋\n\n🤖 *Soy Milo, tu asistente personal*\n\nSelecciona una opción:\n\n1️⃣ 📅 Calendario & Recordatorios\n2️⃣ 💰 Dividir Gastos\n3️⃣ 🤖 Asistente IA\n4️⃣ ⚙️ Configuración\n5️⃣ ℹ️ Ayuda\n\n_Escribe el número o habla naturalmente_`;
  };
  
  // ============================================
  // MENÚ PRINCIPAL DEL CALENDARIO
  // ============================================
  
  if (currentModule === 'calendar') {
    switch (messageText) {
      case '1': // Ver hoy
        const todayEvents = database.getTodayEvents(db, userPhone);
        if (todayEvents.length === 0) {
          response = '📅 No tienes eventos para hoy.\n\n¿Qué deseas hacer?\n\n' + menus.getMainMenu();
        } else {
          response = '📅 *Agenda de Hoy*\n\n' + menus.formatEventsList(todayEvents) + '\n' + menus.getMainMenu();
        }
        break;
        
      case '2': // Agregar evento
        response = menus.getAddEventInstructions();
        updateSession('calendar_add', null);
        break;
        
      case '3': // Próximos eventos
        response = menus.getUpcomingMenu();
        updateSession('calendar_upcoming', null);
        break;
        
      case '4': // Gestionar eventos
        response = menus.getManageMenu();
        updateSession('calendar_manage', null);
        break;
        
      case '5': // Búsqueda
        response = '🔍 *Buscar Eventos*\n\nEscribe una palabra clave para buscar en tus eventos:\n\n_Ejemplo: reunión, cumpleaños, dentista_';
        updateSession('calendar_search', null);
        break;
        
      case '6': // Vista mensual
        const now = new Date();
        const monthEvents = database.getMonthEvents(db, userPhone, now.getFullYear(), now.getMonth() + 1);
        response = menus.getMonthView(now.getFullYear(), now.getMonth(), monthEvents) + '\n\n' + menus.getMainMenu();
        break;
        
      case '7': // Configuración
        response = menus.getConfigMenu();
        updateSession('calendar_config', null);
        break;
        
      case '8': // Sync Google Calendar
        response = await handleGoogleSync(db, userPhone, client);
        break;
        
      case '9': // Volver al menú principal
        response = getMainMenu(userName);
        updateSession('main', null);
        break;
        
      default:
        response = '❌ Opción no válida.\n\n' + menus.getMainMenu();
    }
  }
  
  // ============================================
  // AGREGAR EVENTO
  // ============================================
  
  else if (currentModule === 'calendar_add') {
    const result = await processAddEvent(db, userPhone, messageText);
    
    if (result.needsRecurrence) {
      response = menus.getRecurringMenu();
      updateSession('calendar_add_recurring', JSON.stringify(result.eventData));
    } else if (result.success) {
      // Sincronizar con Google si está configurado
      const settings = database.getUserSettings(db, userPhone);
      let googleSynced = false;
      
      if (settings.sync_google_auto) {
        const googleResult = await google.createGoogleEvent(db, userPhone, result.eventData);
        if (googleResult.success) {
          database.updateGoogleEventId(db, result.eventId, googleResult.eventId);
          googleSynced = true;
        }
      }
      
      response = menus.getEventAddedMessage(result.eventData, googleSynced);
      updateSession('calendar_add_another', null);
    } else {
      response = '❌ ' + result.error + '\n\n' + menus.getAddEventInstructions();
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
        break;
        
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
        break;
        
      case '3': // Ver todos
        const allUserEvents = database.getAllUserEvents(db, userPhone);
        response = menus.formatEventsList(allUserEvents) + '\n' + menus.getMainMenu();
        updateSession('calendar', null);
        break;
        
      case '4': // Volver
        response = menus.getMainMenu();
        updateSession('calendar', null);
        break;
        
      default:
        response = '❌ Opción no válida.\n\n' + menus.getManageMenu();
    }
  }
  
  return response;
}

// Continúa en la siguiente parte...

// Este archivo contiene las funciones auxiliares y los manejadores restantes
// Debe concatenarse con handlers-part1.js para crear handlers.js completo

/**
 * Procesar agregar evento
 */
async function processAddEvent(db, userPhone, messageText) {
  // Formato: Título | Fecha | Hora | Categoría
  const parts = messageText.split('|').map(p => p.trim());
  
  if (parts.length < 3) {
    return {
      success: false,
      error: 'Formato incorrecto. Usa: Título | Fecha | Hora | Categoría'
    };
  }
  
  const title = parts[0];
  const dateText = parts[1];
  const timeText = parts[2];
  const category = parts[3] || 'personal';
  
  // Parsear fecha
  const date = utils.parseNaturalDate(dateText);
  if (!date) {
    return {
      success: false,
      error: 'Fecha no válida. Ejemplos: 2025-11-15, mañana, lunes próximo'
    };
  }
  
  // Parsear hora
  const time = utils.parseTime(timeText);
  if (!time) {
    return {
      success: false,
      error: 'Hora no válida. Ejemplos: 10:00, 3pm, 15:30'
    };
  }
  
  // Combinar fecha y hora
  const eventDateTime = utils.combineDateAndTime(date, time);
  
  const eventData = {
    title,
    event_date: eventDateTime,
    category: utils.validateCategory(category),
    notification_time: 15
  };
  
  const result = database.addEvent(db, userPhone, eventData);
  
  return {
    success: true,
    eventId: result.id,
    eventData,
    needsRecurrence: false
  };
}

/**
 * Manejar sincronización con Google Calendar
 */
async function handleGoogleSync(db, userPhone, client) {
  const authStatus = await google.checkAuthStatus(db, userPhone);
  
  if (!authStatus.authenticated) {
    // Usuario no autenticado - generar URL
    const authUrl = google.getAuthUrl();
    
    return `🔗 *Conectar Google Calendar*\n\n` +
      `Para sincronizar tus eventos con Google Calendar:\n\n` +
      `1️⃣ Visita este enlace:\n${authUrl}\n\n` +
      `2️⃣ Autoriza la aplicación\n\n` +
      `3️⃣ Copia el código que te dan\n\n` +
      `4️⃣ Envíamelo aquí\n\n` +
      `_El enlace es muy largo, cópialo completo desde tu navegador_`;
  } else {
    // Usuario ya autenticado - opciones de sincronización
    return `☁️ *Google Calendar*\n\n` +
      `✅ Conectado correctamente\n\n` +
      `*Opciones:*\n\n` +
      `1️⃣ Sincronizar eventos locales → Google\n` +
      `2️⃣ Importar eventos de Google → Local\n` +
      `3️⃣ Desconectar Google Calendar\n` +
      `4️⃣ Volver\n\n` +
      `_¿Qué deseas hacer?_`;
  }
}

/**
 * Manejar código de autenticación de Google
 */
async function handleGoogleAuthCode(db, userPhone, code) {
  const result = await google.getTokensFromCode(code);
  
  if (!result.success) {
    return '❌ Código inválido o expirado. Por favor intenta de nuevo.';
  }
  
  database.saveGoogleTokens(db, userPhone, result.tokens);
  
  return `✅ *¡Conectado exitosamente!*\n\n` +
    `Tu calendario está ahora sincronizado con Google Calendar.\n\n` +
    `*Configuración:*\n` +
    `• Sincronización automática: Activada\n` +
    `• Tus nuevos eventos se subirán automáticamente\n\n` +
    `¿Deseas importar tus eventos existentes de Google?\n\n` +
    `1. Sí, importar ahora\n` +
    `2. No, continuar`;
}

/**
 * Manejadores adicionales para los estados restantes
 */
async function handleAdditionalStates(msg, userPhone, userName, messageText, currentModule, session, db, client) {
  const context = session?.context ? JSON.parse(session.context) : {};
  let response = '';
  
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
  
  // ============================================
  // BÚSQUEDA DE EVENTOS
  // ============================================
  
  if (currentModule === 'calendar_search') {
    const events = database.searchEvents(db, userPhone, messageText);
    
    if (events.length === 0) {
      response = `🔍 No se encontraron eventos con "${messageText}".\n\nIntenta con otra palabra clave o vuelve al menú.\n\n` + menus.getMainMenu();
      updateSession('calendar', null);
    } else {
      response = `🔍 *Resultados de búsqueda: "${messageText}"*\n\n` + 
        menus.formatEventsList(events) + '\n' + menus.getMainMenu();
      updateSession('calendar', null);
    }
  }
  
  // ============================================
  // SELECCIONAR EVENTO PARA EDITAR
  // ============================================
  
  else if (currentModule === 'calendar_edit_select') {
    const eventIndex = parseInt(messageText) - 1;
    const events = context.events || [];
    
    if (isNaN(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
      response = '❌ Número inválido. Por favor selecciona un número válido de la lista.';
      return response;
    }
    
    const selectedEvent = events[eventIndex];
    
    response = `✏️ *Editar Evento*\n\n` +
      `📅 ${selectedEvent.title}\n` +
      `🕐 ${selectedEvent.event_date}\n` +
      `🏷️ ${selectedEvent.category}\n\n` +
      `*¿Qué deseas editar?*\n\n` +
      `1️⃣ Título\n` +
      `2️⃣ Fecha y hora\n` +
      `3️⃣ Categoría\n` +
      `4️⃣ Cancelar\n\n` +
      `_Selecciona una opción:_`;
    
    updateSession('calendar_edit_field', JSON.stringify({ event: selectedEvent }));
  }
  
  // ============================================
  // SELECCIONAR CAMPO A EDITAR
  // ============================================
  
  else if (currentModule === 'calendar_edit_field') {
    const event = context.event;
    
    switch (messageText) {
      case '1': // Editar título
        response = '✏️ *Editar Título*\n\nEscribe el nuevo título del evento:';
        updateSession('calendar_edit_title', JSON.stringify(context));
        break;
        
      case '2': // Editar fecha y hora
        response = '✏️ *Editar Fecha y Hora*\n\nEnvía en formato:\n*Fecha | Hora*\n\n*Ejemplos:*\n• 2025-11-20 | 15:00\n• mañana | 3pm\n• lunes | 10:00';
        updateSession('calendar_edit_datetime', JSON.stringify(context));
        break;
        
      case '3': // Editar categoría
        response = menus.getCategoriesMenu();
        updateSession('calendar_edit_category', JSON.stringify(context));
        break;
        
      case '4': // Cancelar
        response = menus.getMainMenu();
        updateSession('calendar', null);
        break;
        
      default:
        response = '❌ Opción no válida. Selecciona 1, 2, 3 o 4.';
    }
  }
  
  // ============================================
  // EDITAR TÍTULO
  // ============================================
  
  else if (currentModule === 'calendar_edit_title') {
    const event = context.event;
    const updates = { title: messageText };
    
    const result = database.updateEvent(db, event.id, userPhone, updates);
    
    if (result.success) {
      // Actualizar en Google si está sincronizado
      if (event.google_event_id) {
        await google.updateGoogleEvent(db, userPhone, event.google_event_id, updates);
      }
      
      response = `✅ *Título actualizado*\n\nNuevo título: ${messageText}\n\n` + menus.getMainMenu();
    } else {
      response = '❌ Error actualizando el evento. ' + result.message;
    }
    
    updateSession('calendar', null);
  }
  
  // ============================================
  // EDITAR FECHA Y HORA
  // ============================================
  
  else if (currentModule === 'calendar_edit_datetime') {
    const event = context.event;
    const parts = messageText.split('|').map(p => p.trim());
    
    if (parts.length < 2) {
      response = '❌ Formato incorrecto. Usa: Fecha | Hora\nEjemplo: mañana | 15:00';
      return response;
    }
    
    const date = utils.parseNaturalDate(parts[0]);
    const time = utils.parseTime(parts[1]);
    
    if (!date || !time) {
      response = '❌ Fecha u hora inválida. Intenta de nuevo.';
      return response;
    }
    
    const newDateTime = utils.combineDateAndTime(date, time);
    const updates = { event_date: newDateTime };
    
    const result = database.updateEvent(db, event.id, userPhone, updates);
    
    if (result.success) {
      // Actualizar en Google si está sincronizado
      if (event.google_event_id) {
        await google.updateGoogleEvent(db, userPhone, event.google_event_id, updates);
      }
      
      response = `✅ *Fecha y hora actualizadas*\n\nNueva fecha: ${utils.formatDateForDisplay(newDateTime)}\n\n` + menus.getMainMenu();
    } else {
      response = '❌ Error actualizando el evento. ' + result.message;
    }
    
    updateSession('calendar', null);
  }
  
  // ============================================
  // EDITAR CATEGORÍA
  // ============================================
  
  else if (currentModule === 'calendar_edit_category') {
    const event = context.event;
    const categories = ['personal', 'trabajo', 'urgente', 'familia', 'otro'];
    const categoryIndex = parseInt(messageText) - 1;
    
    if (isNaN(categoryIndex) || categoryIndex < 0 || categoryIndex >= categories.length) {
      response = '❌ Opción inválida. Selecciona un número del 1 al 5.';
      return response;
    }
    
    const newCategory = categories[categoryIndex];
    const updates = { category: newCategory };
    
    const result = database.updateEvent(db, event.id, userPhone, updates);
    
    if (result.success) {
      response = `✅ *Categoría actualizada*\n\nNueva categoría: ${utils.formatCategoryWithEmoji(newCategory)}\n\n` + menus.getMainMenu();
    } else {
      response = '❌ Error actualizando el evento. ' + result.message;
    }
    
    updateSession('calendar', null);
  }
  
  // ============================================
  // SELECCIONAR EVENTO PARA ELIMINAR
  // ============================================
  
  else if (currentModule === 'calendar_delete_select') {
    const eventIndex = parseInt(messageText) - 1;
    const events = context.events || [];
    
    if (isNaN(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
      response = '❌ Número inválido. Por favor selecciona un número válido de la lista.';
      return response;
    }
    
    const selectedEvent = events[eventIndex];
    
    response = `🗑️ *¿Eliminar este evento?*\n\n` +
      `📅 ${selectedEvent.title}\n` +
      `🕐 ${selectedEvent.event_date}\n\n` +
      `*Esta acción no se puede deshacer.*\n\n` +
      `1️⃣ Sí, eliminar\n` +
      `2️⃣ No, cancelar`;
    
    updateSession('calendar_delete_confirm', JSON.stringify({ event: selectedEvent }));
  }
  
  // ============================================
  // CONFIRMAR ELIMINACIÓN
  // ============================================
  
  else if (currentModule === 'calendar_delete_confirm') {
    const event = context.event;
    
    if (messageText === '1') {
      const result = database.deleteEvent(db, event.id, userPhone);
      
      if (result.success) {
        // Eliminar de Google si está sincronizado
        if (event.google_event_id) {
          await google.deleteGoogleEvent(db, userPhone, event.google_event_id);
        }
        
        response = `✅ *Evento eliminado*\n\n${event.title} ha sido eliminado de tu calendario.\n\n` + menus.getMainMenu();
      } else {
        response = '❌ Error eliminando el evento. ' + result.message;
      }
    } else {
      response = '❌ Eliminación cancelada.\n\n' + menus.getMainMenu();
    }
    
    updateSession('calendar', null);
  }
  
  // ============================================
  // CONFIGURACIÓN
  // ============================================
  
  else if (currentModule === 'calendar_config') {
    switch (messageText) {
      case '1': // Notificaciones ON/OFF
        const settings = database.getUserSettings(db, userPhone);
        const newStatus = !settings.notifications_enabled;
        database.updateUserSettings(db, userPhone, { notifications_enabled: newStatus ? 1 : 0 });
        
        response = `🔔 *Notificaciones ${newStatus ? 'Activadas' : 'Desactivadas'}*\n\n` +
          `${newStatus ? '✅ Recibirás recordatorios de tus eventos' : '❌ No recibirás recordatorios'}\n\n` +
          menus.getConfigMenu();
        break;
        
      case '2': // Tiempo de aviso
        response = menus.getNotificationTimeMenu();
        updateSession('calendar_config_time', null);
        break;
        
      case '3': // Categorías
        response = '🏷️ *Categorías*\n\nLas categorías disponibles son:\n\n' +
          '• Personal 👤\n• Trabajo 💼\n• Urgente 🚨\n• Familia 👨‍👩‍👧‍👦\n\n' +
          'Puedes usar estas categorías al agregar eventos.\n\n' +
          menus.getConfigMenu();
        break;
        
      case '4': // Conectar Google
        response = await handleGoogleSync(db, userPhone, client);
        updateSession('calendar_google_auth', null);
        break;
        
      case '5': // Volver
        response = menus.getMainMenu();
        updateSession('calendar', null);
        break;
        
      default:
        response = '❌ Opción no válida.\n\n' + menus.getConfigMenu();
    }
  }
  
  // ============================================
  // CONFIGURAR TIEMPO DE NOTIFICACIÓN
  // ============================================
  
  else if (currentModule === 'calendar_config_time') {
    let notificationTime = 15;
    
    switch (messageText) {
      case '1':
        notificationTime = 15;
        break;
      case '2':
        notificationTime = 60;
        break;
      case '3':
        notificationTime = 1440;
        break;
      case '4':
        response = '⏰ *Tiempo Personalizado*\n\nEscribe cuántos minutos antes quieres ser notificado:\n\n_Ejemplo: 30, 120, 2880 (2 días)_';
        updateSession('calendar_config_time_custom', null);
        return response;
      case '5':
        response = menus.getConfigMenu();
        updateSession('calendar_config', null);
        return response;
      default:
        response = '❌ Opción no válida.\n\n' + menus.getNotificationTimeMenu();
        return response;
    }
    
    database.updateUserSettings(db, userPhone, { notification_time: notificationTime });
    
    const timeText = notificationTime < 60 ? `${notificationTime} minutos` :
                     notificationTime < 1440 ? `${notificationTime/60} hora(s)` :
                     `${notificationTime/1440} día(s)`;
    
    response = `✅ *Tiempo de notificación actualizado*\n\nSerás notificado ${timeText} antes de tus eventos.\n\n` + menus.getConfigMenu();
    updateSession('calendar_config', null);
  }
  
  // ============================================
  // TIEMPO PERSONALIZADO
  // ============================================
  
  else if (currentModule === 'calendar_config_time_custom') {
    const minutes = parseInt(messageText);
    
    if (isNaN(minutes) || minutes < 1) {
      response = '❌ Valor inválido. Debe ser un número mayor a 0.';
      return response;
    }
    
    database.updateUserSettings(db, userPhone, { notification_time: minutes });
    
    response = `✅ *Tiempo de notificación actualizado*\n\nSerás notificado ${minutes} minutos antes de tus eventos.\n\n` + menus.getConfigMenu();
    updateSession('calendar_config', null);
  }
  
  return response;
}

// Exportar funciones
module.exports = {
  handleMessage,
  handleAdditionalStates
};
