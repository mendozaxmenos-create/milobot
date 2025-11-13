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
    
    // Lista de ciudades argentinas comunes con sus posibles abreviaciones
    const argentinaCities = [
      { name: 'mendoza', aliases: ['mend', 'men'] },
      { name: 'buenos aires', aliases: ['bue', 'bs as', 'bsas', 'caba', 'capital'] },
      { name: 'córdoba', aliases: ['cord', 'cba'] },
      { name: 'cordoba', aliases: ['cord', 'cba'] },
      { name: 'rosario', aliases: ['rosa'] },
      { name: 'la plata', aliases: ['plata', 'lp'] },
      { name: 'mar del plata', aliases: ['mdp', 'mar del'] },
      { name: 'salta', aliases: [] },
      { name: 'santa fe', aliases: ['sf', 'santa'] },
      { name: 'san juan', aliases: ['sj'] },
      { name: 'resistencias', aliases: ['resi'] },
      { name: 'neuquén', aliases: ['neu', 'neuquen'] },
      { name: 'neuquen', aliases: ['neu'] },
      { name: 'santiago del estero', aliases: ['santiago', 'sde'] },
      { name: 'corrientes', aliases: ['corr'] },
      { name: 'bahía blanca', aliases: ['bahia blanca', 'bb', 'bahia'] },
      { name: 'bahia blanca', aliases: ['bb', 'bahia'] },
      { name: 'posadas', aliases: [] },
      { name: 'paraná', aliases: ['parana'] },
      { name: 'parana', aliases: [] },
      { name: 'formosa', aliases: [] },
      { name: 'san salvador de jujuy', aliases: ['jujuy', 'san salvador'] },
      { name: 'la rioja', aliases: ['rioja', 'lr'] },
      { name: 'catamarca', aliases: ['cata'] },
      { name: 'san luis', aliases: ['sl'] },
      { name: 'río cuarto', aliases: ['rio cuarto', 'rc'] },
      { name: 'rio cuarto', aliases: ['rc'] },
      { name: 'comodoro rivadavia', aliases: ['comodoro', 'cr'] },
      { name: 'san rafael', aliases: ['sr'] },
      { name: 'tandil', aliases: [] },
      { name: 'villa maría', aliases: ['villa maria', 'vm'] },
      { name: 'villa maria', aliases: ['vm'] },
      { name: 'venado tuerto', aliases: ['venado', 'vt'] },
      { name: 'gualeguaychú', aliases: ['gualeguaychu'] },
      { name: 'gualeguaychu', aliases: [] },
      { name: 'reconquista', aliases: ['recon'] },
      { name: 'zárate', aliases: ['zarate'] },
      { name: 'zarate', aliases: [] }
    ];
    
    const cityLower = cleanCity.toLowerCase().trim();
    
    // Buscar coincidencia exacta o parcial
    let matchedCity = null;
    let isArgentinaCity = false;
    
    // Primero buscar coincidencia exacta
    matchedCity = argentinaCities.find(c => c.name === cityLower);
    if (matchedCity) {
      isArgentinaCity = true;
    } else {
      // Buscar en aliases (abreviaciones)
      matchedCity = argentinaCities.find(c => 
        c.aliases.some(alias => alias === cityLower)
      );
      if (matchedCity) {
        isArgentinaCity = true;
        console.log(`[DEBUG] Ciudad encontrada por alias: "${cityLower}" → "${matchedCity.name}"`);
      } else {
        // Buscar coincidencia parcial (que empiece con el texto ingresado)
        const partialMatches = argentinaCities.filter(c => 
          c.name.startsWith(cityLower) || 
          c.aliases.some(alias => alias.startsWith(cityLower))
        );
        if (partialMatches.length === 1) {
          matchedCity = partialMatches[0];
          isArgentinaCity = true;
          console.log(`[DEBUG] Ciudad encontrada por coincidencia parcial: "${cityLower}" → "${matchedCity.name}"`);
        } else if (partialMatches.length > 1) {
          // Múltiples coincidencias parciales - usar la primera más probable
          matchedCity = partialMatches[0];
          isArgentinaCity = true;
          console.log(`[DEBUG] Múltiples coincidencias parciales, usando: "${matchedCity.name}"`);
        }
      }
    }
    
    console.log(`[DEBUG] ¿Es ciudad argentina conocida? ${isArgentinaCity}`);
    
    // Si es una ciudad argentina conocida, buscar directamente con ", Argentina"
    if (isArgentinaCity && matchedCity) {
      // Usar el nombre completo de la ciudad encontrada, no el texto ingresado
      const cityToSearch = matchedCity.name;
      console.log(`[DEBUG] Ciudad argentina detectada, buscando con ", Argentina": "${cityToSearch}"`);
      let url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityToSearch)},Argentina&limit=5&appid=${API_KEY}`;
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
    if (isArgentinaCity && matchedCity) {
      const cityToTry = matchedCity.name;
      const cityWithoutAccents = cityToTry
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
        .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n');
      
      if (cityWithoutAccents !== cityToTry) {
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

