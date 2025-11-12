// ============================================
// 🌤️ API DE CLIMA - OpenWeatherMap
// ============================================

const https = require('https');

const API_KEY = process.env.OPENWEATHER_API_KEY || '';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

/**
 * Obtener clima actual
 */
async function getCurrentWeather(lat, lon, city) {
  if (!API_KEY) {
    return {
      success: false,
      error: 'API key de OpenWeatherMap no configurada. Por favor configura OPENWEATHER_API_KEY en las variables de entorno.'
    };
  }
  
  try {
    let url;
    
    // Si tenemos coordenadas, usarlas (más preciso)
    if (lat && lon) {
      url = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`;
    } else if (city) {
      // Usar nombre de ciudad
      url = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=es`;
    } else {
      return {
        success: false,
        error: 'Se requiere ciudad o coordenadas'
      };
    }
    
    const data = await makeRequest(url);
    
    if (data.cod && data.cod !== 200) {
      return {
        success: false,
        error: data.message || 'Error al obtener el clima'
      };
    }
    
    return {
      success: true,
      data: {
        temp: data.main.temp,
        feelsLike: data.main.feels_like,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        description: data.weather[0].description,
        condition: data.weather[0].main,
        windSpeed: data.wind ? (data.wind.speed * 3.6).toFixed(1) : 0, // Convertir m/s a km/h
        windDirection: data.wind ? data.wind.deg : null,
        rain: data.rain ? (data.rain['1h'] || data.rain['3h'] || 0) : 0,
        city: data.name,
        country: data.sys.country
      }
    };
  } catch (error) {
    console.error('[ERROR] Error en API de clima:', error);
    return {
      success: false,
      error: error.message || 'Error al conectar con el servicio de clima'
    };
  }
}

/**
 * Buscar coordenadas de una ciudad
 */
async function getCityCoordinates(city) {
  if (!API_KEY) {
    console.error('[ERROR] OPENWEATHER_API_KEY no configurada');
    return {
      success: false,
      error: 'API key no configurada'
    };
  }
  
  try {
    console.log(`[DEBUG] Buscando ciudad: "${city}"`);
    console.log(`[DEBUG] API_KEY presente: ${API_KEY ? 'Sí' : 'No'}`);
    
    // Limpiar el nombre de la ciudad (remover ", Argentina" si está presente)
    let cleanCity = city.trim();
    if (cleanCity.toLowerCase().endsWith(', argentina')) {
      cleanCity = cleanCity.substring(0, cleanCity.length - ', argentina'.length).trim();
      console.log(`[DEBUG] Ciudad limpiada: "${cleanCity}"`);
    }
    
    // Lista de ciudades argentinas comunes
    const argentinaCities = ['mendoza', 'buenos aires', 'córdoba', 'cordoba', 'rosario', 'la plata', 'mar del plata', 'salta', 'santa fe', 'san juan', 'resistencias', 'neuquén', 'neuquen', 'santiago del estero', 'corrientes', 'bahía blanca', 'bahia blanca', 'posadas', 'paraná', 'parana', 'formosa', 'san salvador de jujuy', 'la rioja', 'catamarca', 'san luis', 'río cuarto', 'rio cuarto', 'comodoro rivadavia', 'san rafael', 'tandil', 'villa maría', 'villa maria', 'venado tuerto', 'gualeguaychú', 'gualeguaychu', 'reconquista', 'zárate', 'zarate'];
    
    const cityLower = cleanCity.toLowerCase().trim();
    const isArgentinaCity = argentinaCities.some(c => c === cityLower);
    console.log(`[DEBUG] ¿Es ciudad argentina conocida? ${isArgentinaCity}`);
    
    // Si es una ciudad argentina conocida, buscar directamente con ", Argentina"
    if (isArgentinaCity) {
      console.log(`[DEBUG] Ciudad argentina detectada, buscando con ", Argentina"`);
      let url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanCity)},Argentina&limit=5&appid=${API_KEY}`;
      console.log(`[DEBUG] URL de búsqueda: ${url.replace(API_KEY, 'API_KEY_HIDDEN')}`);
      let data = await makeRequest(url);
      
      console.log(`[DEBUG] Tipo de respuesta: ${typeof data}`);
      console.log(`[DEBUG] ¿Es array? ${Array.isArray(data)}`);
      if (Array.isArray(data)) {
        console.log(`[DEBUG] Cantidad de resultados: ${data.length}`);
        if (data.length > 0) {
          console.log(`[DEBUG] Primer resultado:`, JSON.stringify(data[0]).substring(0, 300));
        }
      } else {
        console.log(`[DEBUG] Respuesta completa:`, JSON.stringify(data).substring(0, 500));
      }
      
      if (Array.isArray(data) && data.length > 0) {
        // Preferir el resultado de Argentina
        let result = data.find(r => r.country === 'AR') || data[0];
        console.log(`[DEBUG] Ciudad encontrada: ${result.name}, ${result.country} (${result.lat}, ${result.lon})`);
        return {
          success: true,
          data: {
            name: result.name,
            lat: result.lat,
            lon: result.lon,
            country: result.country,
            state: result.state || null
          }
        };
      }
    }
    
    // Si no es ciudad argentina conocida o no se encontró, buscar con el nombre tal cual
    console.log(`[DEBUG] Buscando ciudad sin especificar país`);
    let url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanCity)}&limit=5&appid=${API_KEY}`;
    console.log(`[DEBUG] URL de búsqueda: ${url.replace(API_KEY, 'API_KEY_HIDDEN')}`);
    let data = await makeRequest(url);
    
    console.log(`[DEBUG] Tipo de respuesta: ${typeof data}`);
    console.log(`[DEBUG] ¿Es array? ${Array.isArray(data)}`);
    if (Array.isArray(data)) {
      console.log(`[DEBUG] Cantidad de resultados: ${data.length}`);
      if (data.length > 0) {
        console.log(`[DEBUG] Primer resultado:`, JSON.stringify(data[0]).substring(0, 300));
      }
    } else {
      console.log(`[DEBUG] Respuesta completa:`, JSON.stringify(data).substring(0, 500));
    }
    
    if (Array.isArray(data) && data.length > 0) {
      // Si hay múltiples resultados, preferir el de Argentina si existe
      let result = data[0];
      const argentinaResult = data.find(r => r.country === 'AR');
      if (argentinaResult) {
        result = argentinaResult;
        console.log(`[DEBUG] Prefiriendo resultado de Argentina: ${result.name}`);
      }
      
      console.log(`[DEBUG] Ciudad encontrada: ${result.name}, ${result.country} (${result.lat}, ${result.lon})`);
      return {
        success: true,
        data: {
          name: result.name,
          lat: result.lat,
          lon: result.lon,
          country: result.country,
          state: result.state || null
        }
      };
    }
    
    // Si aún no se encontró y es una ciudad argentina, intentar sin acentos
    if (isArgentinaCity) {
      const cityWithoutAccents = cleanCity
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
        .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n');
      
      if (cityWithoutAccents !== cleanCity) {
        console.log(`[DEBUG] Intentando sin acentos: "${cityWithoutAccents}"`);
        url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityWithoutAccents)},Argentina&limit=5&appid=${API_KEY}`;
        console.log(`[DEBUG] URL de búsqueda sin acentos: ${url.replace(API_KEY, 'API_KEY_HIDDEN')}`);
        data = await makeRequest(url);
        
        console.log(`[DEBUG] Resultados sin acentos: ${Array.isArray(data) ? data.length : 'No es array'}`);
        if (Array.isArray(data) && data.length > 0) {
          let result = data.find(r => r.country === 'AR') || data[0];
          console.log(`[DEBUG] Ciudad encontrada sin acentos: ${result.name}`);
          return {
            success: true,
            data: {
              name: result.name,
              lat: result.lat,
              lon: result.lon,
              country: result.country,
              state: result.state || null
            }
          };
        }
      }
    }
    
    console.log(`[DEBUG] Ciudad no encontrada: "${cleanCity}"`);
    console.log(`[DEBUG] Última respuesta recibida:`, JSON.stringify(data).substring(0, 500));
    return {
      success: false,
      error: 'Ciudad no encontrada'
    };
  } catch (error) {
    console.error('[ERROR] Error buscando ciudad:', error);
    console.error('[ERROR] Stack:', error.stack);
    return {
      success: false,
      error: error.message || 'Error al buscar la ciudad'
    };
  }
}

/**
 * Obtener ubicación aproximada por IP (usando servicio gratuito)
 */
async function getLocationByIP() {
  try {
    console.log('[DEBUG] Iniciando detección de ubicación por IP...');
    
    // Intentar con geojs.io primero (gratuito, sin API key)
    let url = 'https://get.geojs.io/v1/ip/geo.json';
    let data = await makeRequest(url);
    
    console.log('[DEBUG] Respuesta de geojs.io:', JSON.stringify(data).substring(0, 200));
    
    if (data && data.city && data.latitude && data.longitude) {
      console.log(`[DEBUG] Ubicación detectada: ${data.city}, ${data.country} (${data.latitude}, ${data.longitude})`);
      return {
        success: true,
        data: {
          city: data.city,
          lat: parseFloat(data.latitude),
          lon: parseFloat(data.longitude),
          country: data.country,
          countryCode: data.country_code || null,
          region: data.region || null
        }
      };
    }
    
    // Si falla, intentar con ipwho.is como fallback
    console.log('[DEBUG] Intentando con ipwho.is como fallback...');
    url = 'https://ipwho.is/';
    data = await makeRequest(url);
    
    console.log('[DEBUG] Respuesta de ipwho.is:', JSON.stringify(data).substring(0, 200));
    
    if (data && data.success && data.city && data.latitude && data.longitude) {
      console.log(`[DEBUG] Ubicación detectada: ${data.city}, ${data.country} (${data.latitude}, ${data.longitude})`);
      return {
        success: true,
        data: {
          city: data.city,
          lat: parseFloat(data.latitude),
          lon: parseFloat(data.longitude),
          country: data.country,
          countryCode: data.country_code || null,
          region: data.region || null
        }
      };
    }
    
    // Si falla, intentar con ip-api.io como último recurso
    console.log('[DEBUG] Intentando con ip-api.io como último recurso...');
    url = 'https://ip-api.io/json/';
    data = await makeRequest(url);
    
    console.log('[DEBUG] Respuesta de ip-api.io:', JSON.stringify(data).substring(0, 200));
    
    if (data && data.city && data.latitude && data.longitude) {
      console.log(`[DEBUG] Ubicación detectada: ${data.city}, ${data.country_name} (${data.latitude}, ${data.longitude})`);
      return {
        success: true,
        data: {
          city: data.city,
          lat: parseFloat(data.latitude),
          lon: parseFloat(data.longitude),
          country: data.country_name,
          countryCode: data.country_code || null,
          region: data.region_name || null
        }
      };
    }
    
    console.log('[DEBUG] No se encontraron datos de ubicación en ninguna respuesta');
    return {
      success: false,
      error: 'No se pudo detectar la ubicación. Por favor escribe el nombre de tu ciudad manualmente.'
    };
  } catch (error) {
    console.error('[ERROR] Error obteniendo ubicación por IP:', error);
    console.error('[ERROR] Stack:', error.stack);
    return {
      success: false,
      error: 'Error al conectar con el servicio de geolocalización. Por favor escribe el nombre de tu ciudad manualmente.'
    };
  }
}

/**
 * Hacer petición HTTP/HTTPS
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const httpModule = url.startsWith('https://') ? require('https') : require('http');
    
    httpModule.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error('Error parseando respuesta JSON'));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = {
  getCurrentWeather,
  getCityCoordinates,
  getLocationByIP
};

