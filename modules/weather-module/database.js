// ============================================
// 🗄️ FUNCIONES DE BASE DE DATOS - CLIMA
// ============================================

/**
 * Obtener ubicación del usuario
 */
function getUserLocation(db, userPhone) {
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
  return result || null;
}

module.exports = {
  getUserLocation
};

