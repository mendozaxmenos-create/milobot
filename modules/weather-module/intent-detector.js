// ============================================
// 🌤️ DETECTOR DE INTENCIONES DE CLIMA
// Detecta preguntas sobre clima en lenguaje natural
// ============================================

/**
 * Detecta si un mensaje contiene una pregunta sobre clima
 * @param {string} message - Mensaje del usuario
 * @returns {Object|null} - Objeto con intención detectada o null
 */
function detectWeatherIntent(message) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const lowerMessage = message.toLowerCase().trim();
  
  // Patrones de preguntas sobre clima
  const weatherPatterns = [
    // Preguntas sobre lluvia
    /(va\s+a\s+)?llover/i,
    /(va\s+a\s+)?llueve/i,
    /(va\s+a\s+)?llov/i,
    /(habrá\s+)?lluvia/i,
    /(va\s+a\s+)?lloverá/i,
    /(está\s+)?lloviendo/i,
    /(está\s+)?llueve/i,
    
    // Preguntas sobre pronóstico
    /(qué\s+)?pronóstico/i,
    /(qué\s+)?pronostico/i,
    /(cómo\s+)?(está\s+)?(el\s+)?clima/i,
    /(cómo\s+)?(está\s+)?(el\s+)?tiempo/i,
    /(qué\s+)?(va\s+a\s+)?(hacer\s+)?(el\s+)?clima/i,
    /(qué\s+)?(va\s+a\s+)?(hacer\s+)?(el\s+)?tiempo/i,
    /(cómo\s+)?(va\s+a\s+)?(estar\s+)?(el\s+)?clima/i,
    /(cómo\s+)?(va\s+a\s+)?(estar\s+)?(el\s+)?tiempo/i,
    
    // Preguntas sobre temperatura
    /(qué\s+)?(temperatura|temp)/i,
    /(cuántos\s+)?grados/i,
    /(hace\s+)?(calor|frío|fresco)/i,
    /(está\s+)?(caliente|frío|fresco)/i,
    
    // Preguntas sobre condiciones
    /(está\s+)?(soleado|nublado|despejado)/i,
    /(hay\s+)?(sol|nubes|viento)/i,
    /(va\s+a\s+)?(hacer\s+)?sol/i,
    /(va\s+a\s+)?(estar\s+)?nublado/i,
    
    // Preguntas generales
    /(cómo\s+)?(está\s+)?(el\s+)?día/i,
    /(qué\s+)?(tal\s+)?(el\s+)?clima/i,
    /(qué\s+)?(tal\s+)?(el\s+)?tiempo/i,
    
    // Preguntas con "hoy"
    /(va\s+a\s+)?llover\s+hoy/i,
    /(qué\s+)?(pronóstico|pronostico)\s+(va\s+a\s+)?(hacer\s+)?hoy/i,
    /(cómo\s+)?(está\s+)?(el\s+)?clima\s+hoy/i,
    /(cómo\s+)?(está\s+)?(el\s+)?tiempo\s+hoy/i,
    /(qué\s+)?(temperatura|temp)\s+hoy/i,
    
    // Preguntas con "mañana"
    /(va\s+a\s+)?llover\s+mañana/i,
    /(qué\s+)?(pronóstico|pronostico)\s+(va\s+a\s+)?(hacer\s+)?mañana/i,
    /(cómo\s+)?(está\s+)?(el\s+)?clima\s+mañana/i,
    
    // Preguntas con ciudad específica
    /(qué\s+)?(pronóstico|pronostico|clima|tiempo)\s+(en|de)\s+[\w\s]+/i,
    /(va\s+a\s+)?llover\s+(en|en\s+el)\s+[\w\s]+/i,
  ];

  // Verificar si el mensaje contiene algún patrón de clima
  for (const pattern of weatherPatterns) {
    if (pattern.test(lowerMessage)) {
      // Extraer información adicional si es posible
      const intent = {
        type: 'weather',
        confidence: 0.9,
        originalMessage: message,
        detectedPattern: pattern.toString()
      };

      // Detectar si pregunta por "hoy"
      if (/hoy/i.test(lowerMessage)) {
        intent.timeframe = 'today';
      } else if (/mañana/i.test(lowerMessage)) {
        intent.timeframe = 'tomorrow';
      }

      // Detectar si pregunta específicamente por lluvia
      if (/llov/i.test(lowerMessage)) {
        intent.focus = 'rain';
      } else if (/(temp|grados|calor|frío)/i.test(lowerMessage)) {
        intent.focus = 'temperature';
      } else if (/(sol|soleado|nublado)/i.test(lowerMessage)) {
        intent.focus = 'conditions';
      }

      // Intentar extraer nombre de ciudad si está presente
      const cityMatch = lowerMessage.match(/(?:en|de|el)\s+([a-záéíóúñ\s]+?)(?:\s|$|,|\.|hoy|mañana)/i);
      if (cityMatch && cityMatch[1]) {
        const potentialCity = cityMatch[1].trim();
        // Filtrar palabras comunes que no son ciudades
        const commonWords = ['el', 'la', 'los', 'las', 'un', 'una', 'del', 'de', 'en', 'hoy', 'mañana', 'clima', 'tiempo', 'pronóstico', 'pronostico'];
        if (!commonWords.includes(potentialCity.toLowerCase()) && potentialCity.length > 2) {
          intent.city = potentialCity.trim();
        }
      }

      return intent;
    }
  }

  return null;
}

/**
 * Verifica si un mensaje es una pregunta directa sobre clima
 * (no solo contiene palabras clave, sino que es una pregunta real)
 */
function isWeatherQuestion(message) {
  if (!message) return false;
  
  const lowerMessage = message.toLowerCase().trim();
  
  // Palabras que indican que es una pregunta
  const questionWords = ['qué', 'cómo', 'cuándo', 'dónde', 'va a', 'está', 'estará', 'habrá', 'hace', 'hay'];
  
  // Verificar que contenga palabras de pregunta Y palabras de clima
  const hasQuestionWord = questionWords.some(word => lowerMessage.includes(word));
  const hasWeatherKeyword = /(clima|tiempo|pronóstico|pronostico|llover|lluvia|temp|grados|sol|nubes)/i.test(lowerMessage);
  
  // También considerar si termina con signo de interrogación
  const endsWithQuestion = /[?¿]$/.test(message.trim());
  
  return (hasQuestionWord || endsWithQuestion) && hasWeatherKeyword;
}

module.exports = {
  detectWeatherIntent,
  isWeatherQuestion
};

