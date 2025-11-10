// ============================================
// 📅 MENÚS DEL MÓDULO DE CALENDARIO
// ============================================

/**
 * Menú principal del calendario
 */
function getMainMenu() {
  return `📅 *CALENDARIO*

1️⃣ Ver hoy
2️⃣ Agregar evento
3️⃣ Próximos eventos
4️⃣ Gestionar eventos
5️⃣ Búsqueda
6️⃣ Vista mensual
7️⃣ ⚙️ Configuración
8️⃣ 🔄 Sync Google Calendar
9️⃣ Volver al menú

_¿Qué deseas hacer?_`;
}

/**
 * Menú de próximos eventos
 */
function getUpcomingMenu() {
  return `📅 *Próximos Eventos*

1️⃣ Próximos 7 días
2️⃣ Próximos 15 días
3️⃣ Próximos 30 días
4️⃣ Volver

_Selecciona un período:_`;
}

/**
 * Menú de gestión de eventos
 */
function getManageMenu() {
  return `⚙️ *Gestionar Eventos*

1️⃣ Editar evento
2️⃣ Eliminar evento
3️⃣ Ver todos mis eventos
4️⃣ Volver

_¿Qué deseas hacer?_`;
}

/**
 * Menú de configuración
 */
function getConfigMenu() {
  return `⚙️ *CONFIGURACIÓN*

1️⃣ Notificaciones (ON/OFF)
2️⃣ Tiempo de aviso
3️⃣ Categorías
4️⃣ Conectar Google Calendar
5️⃣ Volver

_¿Qué deseas configurar?_`;
}

/**
 * Menú de tiempo de notificación
 */
function getNotificationTimeMenu() {
  return `⏰ *Tiempo de Aviso*

1️⃣ 15 minutos antes
2️⃣ 1 hora antes
3️⃣ 1 día antes
4️⃣ Personalizado
5️⃣ Volver

_¿Cuándo quieres ser notificado?_`;
}

/**
 * Menú de categorías
 */
function getCategoriesMenu() {
  return `🏷️ *Categorías*

1️⃣ Personal
2️⃣ Trabajo
3️⃣ Urgente
4️⃣ Familia
5️⃣ Otro

_Selecciona una categoría:_`;
}

/**
 * Menú de tipo de recurrencia
 */
function getRecurringMenu() {
  return `🔄 *Tipo de Recurrencia*

1️⃣ No (una sola vez)
2️⃣ Diario
3️⃣ Semanal
4️⃣ Mensual

_¿Este evento se repite?_`;
}

/**
 * Instrucciones para agregar evento
 */
function getAddEventInstructions() {
  return `📝 *Agregar Evento*

Envía tu evento en este formato:

*Título | Fecha | Hora | Categoría*

*Ejemplos:*
• Reunión cliente | 2025-11-15 | 10:00 | trabajo
• Cumpleaños María | 2025-12-20 | 18:00 | familia
• Dentista | mañana | 15:30 | personal

*Categorías disponibles:*
personal, trabajo, urgente, familia

_También puedes usar lenguaje natural para la fecha:_
• mañana
• pasado mañana
• lunes próximo
• 15 de noviembre`;
}

/**
 * Mensaje de evento agregado
 */
function getEventAddedMessage(event, withGoogle = false) {
  const googleMsg = withGoogle ? '\n✅ Sincronizado con Google Calendar' : '';
  
  return `✅ *Evento Agregado*

📅 ${event.title}
🕐 ${event.event_date}
🏷️ ${event.category || 'personal'}
🔔 Notificación: ${event.notification_time || 15} min antes${googleMsg}

¿Deseas agregar otro evento?
1. Sí
2. No, volver al menú`;
}

/**
 * Formatear lista de eventos
 */
function formatEventsList(events) {
  if (events.length === 0) {
    return '📅 No hay eventos en este período.';
  }

  let response = `📅 *Eventos Encontrados (${events.length})*\n\n`;
  
  events.forEach((event, index) => {
    const recurring = event.is_recurring ? ' 🔄' : '';
    const google = event.google_event_id ? ' ☁️' : '';
    
    response += `${index + 1}. ${event.title}${recurring}${google}\n`;
    response += `   📅 ${event.event_date}\n`;
    response += `   🏷️ ${event.category || 'personal'}\n`;
    if (event.description) {
      response += `   📝 ${event.description}\n`;
    }
    response += '\n';
  });

  return response;
}

/**
 * Vista mensual - Calendario
 */
function getMonthView(year, month, events) {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  let calendar = `📅 *${monthNames[month]} ${year}*\n\n`;
  calendar += 'Lu Ma Mi Ju Vi Sá Do\n';
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Ajustar primer día (0 = Domingo, queremos que 0 = Lunes)
  const startDay = firstDay === 0 ? 6 : firstDay - 1;
  
  // Espacios antes del primer día
  calendar += '   '.repeat(startDay);
  
  // Días del mes
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasEvent = events.some(e => e.event_date.startsWith(dateStr));
    
    calendar += hasEvent ? `*${String(day).padStart(2, ' ')}*` : String(day).padStart(2, ' ');
    calendar += ' ';
    
    if ((startDay + day) % 7 === 0) {
      calendar += '\n';
    }
  }
  
  calendar += '\n\n_Los días en negrita tienen eventos_';
  return calendar;
}

module.exports = {
  getMainMenu,
  getUpcomingMenu,
  getManageMenu,
  getConfigMenu,
  getNotificationTimeMenu,
  getCategoriesMenu,
  getRecurringMenu,
  getAddEventInstructions,
  getEventAddedMessage,
  formatEventsList,
  getMonthView
};
