// ============================================
// 📅 MENÚS DEL MÓDULO DE CALENDARIO
// ============================================

const utils = require('./utils');

/**
 * Menú principal del calendario
 */
function getMainMenu() {
  return `📅 *CALENDARIO*

1️⃣ Ver hoy
2️⃣ Agregar evento
3️⃣ ⏰ Agregar recordatorio
4️⃣ 📋 Mis recordatorios
5️⃣ Próximos eventos
6️⃣ Gestionar eventos
7️⃣ Búsqueda
8️⃣ Vista mensual
9️⃣ ⚙️ Configuración
🔟 🔄 Sync Google Calendar
1️⃣1️⃣ Volver al menú

_¿Qué deseas hacer?_

💡 Tip: Escribí *"recordatorios"* en cualquier momento para verlos y completarlos rápido.
💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
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

_Selecciona un período:_

💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
}

/**
 * Menú de gestión de eventos
 */
function getManageMenu() {
  return `⚙️ *Gestionar Eventos*

1️⃣ Editar evento
2️⃣ Eliminar evento
3️⃣ Ver todos mis eventos
4️⃣ ⏰ Ver/Completar recordatorios
5️⃣ Volver

_¿Qué deseas hacer?_

💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
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

_¿Qué deseas configurar?_

💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
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

_¿Cuándo quieres ser notificado?_

💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
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
6️⃣ Volver

_Selecciona una categoría:_

💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
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
5️⃣ Volver

_¿Este evento se repite?_

💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
}

/**
 * Instrucciones para agregar evento
 */
function getAddEventInstructions() {
  return `📝 *Agregar Evento*

Escribe tu evento de forma natural, por ejemplo:

*Ejemplos simples:*
• "mañana dentista 18:30"
• "reunión el lunes a las 3pm"
• "cumpleaños maría el 15 de noviembre a las 20:00"
• "dentista mañana a las 6"
• "reunión trabajo el viernes 14:00"

*También puedes usar el formato:*
Título | Fecha | Hora | Categoría

*Categorías disponibles:*
personal, trabajo, urgente, familia

_El bot entenderá lenguaje natural para fechas y horas_

💡 Escribe *"volver"* o *"menu"* para regresar al menú anterior.`;
}

/**
 * Instrucciones para agregar recordatorio
 */
function getAddReminderInstructions() {
  return `⏰ *Agregar Recordatorio*

Escribe tu recordatorio de forma natural, por ejemplo:

*Ejemplos simples:*
• "mañana llamar a mamá a las 10"
• "recordar comprar leche el viernes"
• "tomar medicamento a las 8am"
• "revisar correo mañana 9:00"
• "llamar al dentista el lunes"

*También puedes usar el formato:*
Título | Fecha | Hora

_El bot entenderá lenguaje natural para fechas y horas._
_Los recordatorios son más simples que los eventos y se enfocan en tareas rápidas._

💡 Escribe *"volver"* o *"menu"* para regresar al menú anterior.`;
}

/**
 * Mensaje de evento agregado
 */
function getEventAddedMessage(event, withGoogle = false) {
  const googleMsg = withGoogle ? '\n✅ Sincronizado con Google Calendar' : '';
  
  // Formatear fecha de manera legible
  const formattedDate = utils.formatDateForDisplay(event.event_date);
  
  return `✅ *Evento Agregado*

📅 ${event.title}
🕐 ${formattedDate}
🏷️ ${event.category || 'personal'}
🔔 Notificación: ${event.notification_time || 15} min antes${googleMsg}`;
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
    
    // Formatear fecha de manera legible
    const formattedDate = utils.formatDateForDisplay(event.event_date);
    
    response += `${index + 1}. ${event.title}${recurring}${google}\n`;
    response += `   📅 ${formattedDate}\n`;
    response += `   🏷️ ${event.category || 'personal'}\n`;
    if (event.description) {
      response += `   📝 ${event.description}\n`;
    }
    // Mostrar invitados si existen
    if (event.invitees && event.invitees.length > 0) {
      response += `   👥 Invitados: ${event.invitees.map(inv => inv.name).join(', ')}\n`;
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
  getAddReminderInstructions,
  getEventAddedMessage,
  formatEventsList,
  getMonthView
};
