// ============================================
// 🌤️ MÓDULO DE CLIMA - MILOBOT
// ============================================

const weatherAPI = require('./weather-api');
const database = require('./database');

const ENABLE_IP_AUTO_LOCATION = process.env.ENABLE_IP_AUTO_LOCATION !== 'false';

/**
 * Obtener pronóstico del tiempo para el usuario
 */
async function getWeatherForecast(db, userPhone, userName, options = {}) {
  let finalOptions = {};
  if (typeof options === 'boolean') {
    finalOptions = { autoDetect: options };
  } else if (options && typeof options === 'object') {
    finalOptions = { ...options };
  }

  const autoDetect = !!finalOptions.autoDetect;
  const forceIpSuggestion = ENABLE_IP_AUTO_LOCATION && !!finalOptions.forceIpSuggestion;

  try {
    // Obtener ubicación del usuario
    const storedLocation = database.getUserLocation(db, userPhone);
    const userLocation = storedLocation ? {
      city: storedLocation.location_city,
      lat: storedLocation.location_lat,
      lon: storedLocation.location_lon
    } : null;
    
    if (!userLocation || !userLocation.city) {
      // Si se solicita detección automática
      if (autoDetect && ENABLE_IP_AUTO_LOCATION) {
        try {
          console.log('[DEBUG] Iniciando detección automática de ubicación...');
          const weatherAPI = require('./weather-api');
          const ipLocation = await weatherAPI.getLocationByIP();
          
          console.log('[DEBUG] Resultado de detección IP:', ipLocation.success ? 'Éxito' : 'Error');
          
          if (ipLocation.success) {
            console.log(`[DEBUG] Guardando ubicación detectada en contexto: ${ipLocation.data.city}`);
            
            console.log('[DEBUG] Obteniendo pronóstico del tiempo...');
            // Obtener pronóstico
            const forecast = await weatherAPI.getCurrentWeather(
              ipLocation.data.lat,
              ipLocation.data.lon,
              ipLocation.data.city
            );
            
            if (forecast.success) {
              console.log('[DEBUG] Pronóstico obtenido exitosamente');
            const locationLabel = buildLocationLabel(ipLocation.data.city, forecast.data.country);
              const mismatchNote = locationLabel
                ? `\n\n❗ Si no estás en *${locationLabel}*, escribí tu ciudad (por ejemplo: Santiago, Chile) para actualizarla.`
                : '';
              const forecastMessage = formatWeatherMessage(forecast.data, userName, locationLabel);
              
              // Trackear consulta de clima (si el módulo de stats está disponible)
              try {
                const statsModule = require('../../modules/stats-module');
                statsModule.trackWeatherQuery(db, userPhone, {
                  city: ipLocation.data.city,
                  country: forecast.data.country || null,
                  temperature: forecast.data.temperature || null,
                  condition: forecast.data.condition || null,
                  hasLocation: true,
                  detectionMethod: 'ip'
                });
              } catch (error) {
                console.warn('[WARN] No se pudo trackear consulta de clima:', error.message);
              }
              
              return {
                message: `${forecastMessage}${mismatchNote}

💾 *¿Querés que recuerde esta ubicación para la próxima?*

1️⃣ Sí, guardala
2️⃣ No, pediré la ciudad cada vez`,
              pendingLocation: {
                city: locationLabel,
                rawCity: ipLocation.data.city,
                lat: ipLocation.data.lat,
                lon: ipLocation.data.lon,
                state: ipLocation.data.region || ipLocation.data.state || null,
                country: ipLocation.data.country || forecast.data.country,
                countryCode: ipLocation.data.countryCode || forecast.data.country
              }
              };
            } else {
              console.error('[ERROR] Error obteniendo pronóstico:', forecast.error);
              return {
                message: `❌ No pude obtener el pronóstico para ${ipLocation.data.city}.\n\n` +
                  `Error: ${forecast.error}\n\n` +
                  `¿Quieres intentar con otra ciudad? Escribe el nombre de tu ciudad.`
              };
            }
          } else {
            console.error('[ERROR] No se pudo detectar ubicación:', ipLocation.error);
            const errorMsg = ipLocation.error || 'Error desconocido';
            return {
              message: `❌ No pude detectar tu ubicación automáticamente.\n\n` +
                `Error: ${errorMsg}\n\n` +
                `Por favor escribe el nombre de tu ciudad:\n\n` +
                `_Ejemplo: Mendoza, Buenos Aires, Córdoba_`
            };
          }
        } catch (error) {
          console.error('[ERROR] Excepción en detección automática:', error);
          console.error('[ERROR] Stack:', error.stack);
          return {
            message: `❌ Ocurrió un error al detectar tu ubicación.\n\n` +
              `Por favor escribe el nombre de tu ciudad manualmente:\n\n` +
              `_Ejemplo: Mendoza, Buenos Aires, Córdoba_`
          };
        }
      }
      
      // No tiene ubicación configurada, pedirla
      return {
        message: `🌤️ *Pronóstico del Tiempo*\n\n` +
          `Para darte el pronóstico, necesito saber tu ubicación.\n\n` +
          `*Opciones:*\n\n` +
          `1️⃣ Compartir mi ubicación actual 📍\n` +
          `2️⃣ Detectar automáticamente (por IP)\n` +
          `3️⃣ Escribir ciudad manualmente\n\n` +
          `_💡 Recomendado: Compartí tu ubicación para mayor precisión_\n` +
          `_📍 Al compartir tu ubicación, el bot la detecta automáticamente y busca el nombre de tu ciudad_\n` +
          `_Ejemplo de ciudades: Mendoza, Buenos Aires, Córdoba, Rosario_`
      };
    }
    
    // Obtener pronóstico
    const forecast = await weatherAPI.getCurrentWeather(
      userLocation.lat || null,
      userLocation.lon || null,
      userLocation.city
    );
    
    if (!forecast.success) {
      return {
        message: `❌ No pude obtener el pronóstico del tiempo.\n\n` +
          `Error: ${forecast.error}\n\n` +
          `¿Quieres configurar otra ubicación? Escribe el nombre de tu ciudad.`
      };
    }
    
    // Trackear consulta de clima (si el módulo de stats está disponible)
    try {
      const statsModule = require('../../modules/stats-module');
      statsModule.trackWeatherQuery(db, userPhone, {
        city: userLocation.city,
        country: forecast.data.country || null,
        temperature: forecast.data.temperature || null,
        condition: forecast.data.condition || null,
        hasLocation: !!(userLocation.lat && userLocation.lon)
      });
    } catch (error) {
      console.warn('[WARN] No se pudo trackear consulta de clima:', error.message);
    }
    
    // Generar mensaje con recomendaciones
    const locationLabel = buildLocationLabel(userLocation.city, forecast.data.country);
    const forecastMessage = formatWeatherMessage(forecast.data, userName, locationLabel);
    
    let suggestionBlock = '';
    let pendingLocation = null;

    if (forceIpSuggestion) {
      try {
        const ipLocation = await weatherAPI.getLocationByIP();
        if (ipLocation.success && ipLocation.data) {
          const detectedCity = ipLocation.data.city || '';
          const detectedCountry = ipLocation.data.country || '';
          const detectedLabel = buildLocationLabel(detectedCity, detectedCountry);

          const storedCityNormalized = (userLocation.city || '').trim().toLowerCase();
          const detectedCityNormalized = detectedCity.trim().toLowerCase();
          const sameCity = storedCityNormalized && detectedCityNormalized
            ? storedCityNormalized === detectedCityNormalized
            : false;

          if (detectedLabel && !sameCity) {
            pendingLocation = {
              city: detectedLabel,
              rawCity: detectedCity || detectedLabel,
              lat: ipLocation.data.lat,
              lon: ipLocation.data.lon,
              state: ipLocation.data.region || ipLocation.data.state || null,
              country: detectedCountry || null,
              countryCode: ipLocation.data.countryCode || null,
              detectedAt: new Date().toISOString(),
              detectionMethod: 'ip_auto_suggest'
            };

            suggestionBlock =
              `\n\n📍 *¿Querés actualizar la ubicación a ${detectedLabel}?*\n` +
              `1️⃣ Sí, guardala\n` +
              `2️⃣ No, mantener ${userLocation.city || 'la actual'}\n\n` +
              `💡 Podés cambiarla en cualquier momento escribiendo el nombre de tu ciudad.`;
          }
        }
      } catch (error) {
        console.warn('[WARN] No se pudo obtener sugerencia de ubicación automática:', error.message);
      }
    }

    const menuBlock = pendingLocation ? '' : buildWeatherMenu(locationLabel);
    
    return {
      message: `${forecastMessage}${suggestionBlock}${menuBlock}`,
      ...(pendingLocation ? { pendingLocation } : {})
    };
    
  } catch (error) {
    console.error('[ERROR] Error obteniendo pronóstico:', error);
    return {
      message: `❌ Ocurrió un error al obtener el pronóstico.\n\nIntenta de nuevo más tarde.`
    };
  }
}

/**
 * Formatear mensaje del clima con recomendaciones
 */
function formatWeatherMessage(weather, userName, locationLabel = null) {
  const temp = Math.round(weather.temp);
  const feelsLike = Math.round(weather.feelsLike);
  const description = weather.description;
  const humidity = weather.humidity;
  const windSpeed = Number(weather.windSpeed);
  const rain = weather.rain || 0;
  const icon = getWeatherIcon(weather.condition);
  
  const headerLocation = locationLabel ? ` - ${locationLabel}` : '';
  let message = `${icon} *Pronóstico para Hoy${headerLocation}*\n\n`;
  message += `🌡️ Temperatura: *${temp}°C*\n`;
  message += `🌡️ Sensación térmica: *${feelsLike}°C*\n`;
  message += `☁️ Condición: *${description}*\n`;
  message += `💧 Humedad: *${humidity}%*\n`;
  message += `💨 Viento: *${windSpeed} km/h*\n`;
  
  if (rain > 0) {
    message += `🌧️ Lluvia: *${rain} mm*\n`;
  }
  
  message += `\n💡 *Recomendaciones:*\n\n`;
  
  // Generar recomendaciones
  const recommendations = generateRecommendations(weather);
  message += recommendations.join('\n');
  
  return message;
}

/**
 * Generar recomendaciones basadas en el clima
 */
function generateRecommendations(weather) {
  const recommendations = [];
  const temp = weather.temp;
  const feelsLike = weather.feelsLike;
  const condition = weather.condition.toLowerCase();
  const rain = weather.rain || 0;
  const windSpeed = Number(weather.windSpeed);
  const humidity = weather.humidity ?? 0;
  
  // Recomendaciones de temperatura
  if (temp >= 25 || feelsLike >= 25) {
    recommendations.push('☀️ *Hace calor* - No hace falta que lleves abrigo');
  } else if (temp >= 20 || feelsLike >= 20) {
    recommendations.push('🌤️ *Temperatura agradable* - Podés salir con ropa liviana');
  } else if (temp >= 15 || feelsLike >= 15) {
    recommendations.push('🧥 *Temperatura fresca* - Sumá una campera liviana por si baja el sol');
  } else if (temp >= 10 || feelsLike >= 10) {
    recommendations.push('🧥 *Hace frío* - Lleva abrigo, se siente fresco en la calle');
  } else {
    recommendations.push('🧥 *Hace mucho frío* - Abrigate bien con buzo y campera');
  }
  
  // Recomendaciones de lluvia
  if (rain > 0 || condition.includes('rain') || condition.includes('lluvia') || condition.includes('drizzle')) {
    recommendations.push('☔ *Va a llover* - Lleva paraguas y calzado que no se moje fácil');
  } else if (condition.includes('storm') || condition.includes('tormenta')) {
    recommendations.push('⛈️ *Tormenta prevista* - Mejor salir con paraguas y, si podés, quedarte bajo techo');
  }
  
  // Recomendaciones de viento
  if (windSpeed > 30) {
    recommendations.push('💨 *Viento fuerte* - Andá con cuidado, sobre todo si salís en bici o moto');
  } else if (windSpeed > 20) {
    recommendations.push('💨 *Viento moderado* - Puede sentirse más fresco de lo que marca el termómetro, sumá abrigo liviano');
  }
  
  // Recomendaciones de humedad
  if (humidity > 80) {
    recommendations.push('💧 *Alta humedad* - Se va a sentir más pesado de lo que marca la temperatura');
  }
  
  // Recomendaciones de sol
  if (condition.includes('clear') || condition.includes('sunny') || condition.includes('despejado')) {
    recommendations.push('☀️ *Día soleado* - Ponete protector solar si vas a estar afuera varias horas');
  }
  
  return recommendations;
}

/**
 * Obtener emoji según condición del clima
 */
function getWeatherIcon(condition) {
  const cond = condition.toLowerCase();
  if (cond.includes('clear') || cond.includes('sunny')) return '☀️';
  if (cond.includes('cloud')) return '☁️';
  if (cond.includes('rain') || cond.includes('drizzle')) return '🌧️';
  if (cond.includes('storm') || cond.includes('thunder')) return '⛈️';
  if (cond.includes('snow')) return '❄️';
  if (cond.includes('mist') || cond.includes('fog')) return '🌫️';
  return '🌤️';
}

function buildLocationLabel(city, country) {
  const cleanCity = city ? city.toString().trim() : '';
  const cleanCountry = country ? country.toString().trim() : '';
  
  if (cleanCity && cleanCountry) {
    return `${cleanCity}, ${cleanCountry}`;
  }
  
  return cleanCity || cleanCountry || null;
}

function buildWeatherMenu(currentLocation = null) {
  const locationLine = currentLocation ? `📍 Ubicación actual: *${currentLocation}*\n\n` : '';
  return `\n\n${locationLine}*Opciones:*\n1️⃣ Compartir ubicación actual 📍\n2️⃣ Cambiar de ciudad\n3️⃣ Volver al menú principal\n\n📌 *Tips:*\n• Podés compartir tu ubicación para mayor precisión\n• Al compartir tu ubicación, el bot la detecta automáticamente y busca el nombre de tu ciudad\n• También podés escribir directamente el nombre de una ciudad para consultarla\n💡 Escribí *"volver"* o *"menu"* en cualquier momento para regresar.`;
}

/**
 * Procesar ubicación compartida por el usuario (desde mensaje de WhatsApp)
 */
async function processSharedLocation(db, userPhone, userName, lat, lon) {
  try {
    console.log(`[DEBUG] Procesando ubicación compartida: ${lat}, ${lon}`);
    
    // Obtener ciudad desde coordenadas usando geocodificación inversa
    const locationData = await weatherAPI.getCityFromCoordinates(lat, lon);
    
    if (!locationData.success) {
      return {
        success: false,
        message: `❌ No pude determinar la ciudad desde la ubicación compartida.\n\n` +
          `Por favor intentá escribiendo el nombre de tu ciudad manualmente.`
      };
    }
    
    const cityData = locationData.data;
    const cityName = cityData.city;
    const country = cityData.country;
    const state = cityData.state || cityData.region || null;
    const countryCode = cityData.countryCode || null;
    
    // Guardar ubicación
    saveUserLocation(db, userPhone, cityName, lat, lon, state, country, countryCode);
    
    // Obtener pronóstico inmediatamente
    const forecast = await weatherAPI.getCurrentWeather(lat, lon, cityName);
    
    if (forecast.success) {
      const locationLabel = buildLocationLabel(cityName, country);
      const forecastMessage = formatWeatherMessage(forecast.data, userName, locationLabel);
      
      // Trackear consulta de clima
      try {
        const statsModule = require('../../modules/stats-module');
        statsModule.trackWeatherQuery(db, userPhone, {
          city: cityName,
          country: country || null,
          temperature: forecast.data.temp || null,
          condition: forecast.data.condition || null,
          hasLocation: true,
          detectionMethod: 'shared_location'
        });
      } catch (error) {
        console.warn('[WARN] No se pudo trackear consulta de clima:', error.message);
      }
      
      return {
        success: true,
        message: `✅ *Ubicación guardada: ${locationLabel}*\n\n${forecastMessage}\n\n${buildWeatherMenu(locationLabel)}`
      };
    } else {
      return {
        success: true,
        message: `✅ *Ubicación guardada: ${locationLabel}*\n\n` +
          `❌ No pude obtener el pronóstico del tiempo en este momento.\n\n` +
          `Por favor intentá más tarde o escribí el nombre de tu ciudad.`
      };
    }
  } catch (error) {
    console.error('[ERROR] Error procesando ubicación compartida:', error);
    return {
      success: false,
      message: `❌ Ocurrió un error al procesar tu ubicación.\n\n` +
        `Por favor intentá escribiendo el nombre de tu ciudad manualmente.`
    };
  }
}

/**
 * Guardar ubicación del usuario
 */
function saveUserLocation(db, userPhone, city, lat = null, lon = null, state = null, country = null, countryCode = null) {
  const stmt = db.prepare(`
    UPDATE users
    SET location_city = ?, location_lat = ?, location_lon = ?, location_state = ?, location_country = ?, location_country_code = ?
    WHERE phone = ?
  `);
  
  stmt.run(city, lat, lon, state, country, countryCode, userPhone);
  
  // Invalidar caché de ubicación
  try {
    database.invalidateUserLocationCache(userPhone);
  } catch (error) {
    // Ignorar si no está disponible
  }
  
  return { success: true };
}

module.exports = {
  getWeatherForecast,
  saveUserLocation,
  formatWeatherMessage,
  buildWeatherMenu,
  processSharedLocation
};

