// ============================================
// 🛠️ UTILIDADES DEL MÓDULO DE CALENDARIO
// ============================================

/**
 * Parsear fecha en lenguaje natural a formato ISO
 * @param {String} dateText - Texto con la fecha
 * @returns {Date|null} Fecha parseada o null si es inválida
 */
function parseNaturalDate(dateText) {
  const text = dateText.toLowerCase().trim();
  const now = new Date();
  
  // Hoy
  if (text === 'hoy') {
    return now;
  }
  
  // Mañana
  if (text === 'mañana' || text === 'manana') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  // Pasado mañana
  if (text === 'pasado mañana' || text === 'pasado manana') {
    const afterTomorrow = new Date(now);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);
    return afterTomorrow;
  }
  
  // Días de la semana
  const weekDays = {
    'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
    'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0
  };
  
  for (const [day, targetDay] of Object.entries(weekDays)) {
    if (text.includes(day)) {
      const result = new Date(now);
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      
      if (daysToAdd <= 0) {
        daysToAdd += 7; // Próxima semana
      }
      
      result.setDate(result.getDate() + daysToAdd);
      return result;
    }
  }
  
  // Formato ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(text);
  }
  
  // Formato DD/MM/YYYY
  const ddmmyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
  }
  
  return null;
}

/**
 * Parsear hora en formato HH:MM o lenguaje natural
 * @param {String} timeText - Texto con la hora
 * @returns {String|null} Hora en formato HH:MM o null
 */
function parseTime(timeText) {
  const text = timeText.toLowerCase().trim();
  
  // Formato HH:MM
  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const [hours, minutes] = text.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  
  // Formato HH (solo hora)
  if (/^\d{1,2}$/.test(text)) {
    return `${text.padStart(2, '0')}:00`;
  }
  
  // Lenguaje natural: "3pm", "15hs", etc.
  const pmMatch = text.match(/(\d{1,2})\s*(pm|p\.m\.|p)/);
  if (pmMatch) {
    let hour = parseInt(pmMatch[1]);
    if (hour !== 12) hour += 12;
    return `${hour.toString().padStart(2, '0')}:00`;
  }
  
  const amMatch = text.match(/(\d{1,2})\s*(am|a\.m\.|a)/);
  if (amMatch) {
    const hour = parseInt(amMatch[1]);
    return `${hour.toString().padStart(2, '0')}:00`;
  }
  
  return null;
}

/**
 * Combinar fecha y hora en formato ISO completo
 * @param {Date} date - Fecha
 * @param {String} time - Hora en formato HH:MM
 * @returns {String} Fecha y hora en formato ISO
 */
function combineDateAndTime(date, time) {
  if (!date || !time) return null;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${time}:00`;
}

/**
 * Formatear fecha para mostrar al usuario
 * @param {String} dateStr - Fecha en formato ISO
 * @returns {String} Fecha formateada
 */
function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr);
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${dayName} ${day} de ${month} ${year} - ${hours}:${minutes}`;
}

/**
 * Validar categoría
 * @param {String} category - Categoría a validar
 * @returns {String} Categoría válida o 'personal' por defecto
 */
function validateCategory(category) {
  const validCategories = ['personal', 'trabajo', 'urgente', 'familia'];
  const cat = category ? category.toLowerCase().trim() : 'personal';
  
  return validCategories.includes(cat) ? cat : 'personal';
}

/**
 * Calcular próxima ocurrencia de evento recurrente
 * @param {Date} baseDate - Fecha base del evento
 * @param {String} recurringType - Tipo de recurrencia (daily, weekly, monthly)
 * @returns {Date} Próxima ocurrencia
 */
function getNextRecurrence(baseDate, recurringType) {
  const next = new Date(baseDate);
  
  switch (recurringType) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      return null;
  }
  
  return next;
}

/**
 * Verificar si una fecha ya pasó
 * @param {String} dateStr - Fecha en formato ISO
 * @returns {Boolean} True si ya pasó
 */
function isPastDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  return date < now;
}

/**
 * Obtener diferencia en minutos entre dos fechas
 * @param {Date} date1 - Primera fecha
 * @param {Date} date2 - Segunda fecha
 * @returns {Number} Diferencia en minutos
 */
function getMinutesDifference(date1, date2) {
  return Math.floor((date1 - date2) / (1000 * 60));
}

/**
 * Formatear categoría para display con emoji
 * @param {String} category - Categoría
 * @returns {String} Categoría con emoji
 */
function formatCategoryWithEmoji(category) {
  const emojis = {
    'personal': '👤',
    'trabajo': '💼',
    'urgente': '🚨',
    'familia': '👨‍👩‍👧‍👦'
  };
  
  return `${emojis[category] || '📌'} ${category.charAt(0).toUpperCase() + category.slice(1)}`;
}

module.exports = {
  parseNaturalDate,
  parseTime,
  combineDateAndTime,
  formatDateForDisplay,
  validateCategory,
  getNextRecurrence,
  isPastDate,
  getMinutesDifference,
  formatCategoryWithEmoji
};
