// ============================================
// 🗄️ FUNCIONES DE BASE DE DATOS - CLIMA
// ============================================

// Caché para ubicaciones de usuarios (optimización)
const userLocationCache = new Map();
const USER_LOCATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Obtener ubicación del usuario (con caché)
 */
function getUserLocation(db, userPhone) {
  // Verificar caché
  const cached = userLocationCache.get(userPhone);
  if (cached && (Date.now() - cached.timestamp) < USER_LOCATION_CACHE_TTL_MS) {
    return cached.data;
  }
  
  const stmt = db.prepare(`
    SELECT 
      location_city, 
      location_lat, 
      location_lon,
      location_state,
      location_country,
      location_country_code,
      home_currency,
      home_country_code
    FROM users
    WHERE phone = ?
  `);

  const result = stmt.get(userPhone);
  const locationData = result || null;
  
  // Guardar en caché
  userLocationCache.set(userPhone, { data: locationData, timestamp: Date.now() });
  
  // Limpiar caché antiguo periódicamente
  if (userLocationCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of userLocationCache.entries()) {
      if (now - v.timestamp > USER_LOCATION_CACHE_TTL_MS) {
        userLocationCache.delete(k);
      }
    }
  }
  
  return locationData;
}

/**
 * Invalidar caché de ubicación para un usuario (cuando se actualiza)
 */
function invalidateUserLocationCache(userPhone) {
  userLocationCache.delete(userPhone);
}

module.exports = {
  getUserLocation,
  invalidateUserLocationCache
};

