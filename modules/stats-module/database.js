// ============================================
// 📊 BASE DE DATOS - ESTADÍSTICAS DE USO
// ============================================

/**
 * Registrar evento de uso del bot
 */
function trackEvent(db, userPhone, eventType, eventData = {}) {
  try {
    db.prepare(`
      INSERT INTO bot_usage_stats (user_phone, event_type, event_data, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      userPhone,
      eventType,
      JSON.stringify(eventData)
    );
    return { success: true };
  } catch (error) {
    console.error(`[ERROR] Error registrando evento ${eventType} para ${userPhone}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener estadísticas agregadas de un usuario
 */
function getUserStats(db, userPhone, startDate = null, endDate = null) {
  let query = `
    SELECT 
      event_type,
      COUNT(*) as count,
      MIN(created_at) as first_occurrence,
      MAX(created_at) as last_occurrence
    FROM bot_usage_stats
    WHERE user_phone = ?
  `;
  
  const params = [userPhone];
  
  if (startDate) {
    query += ` AND datetime(created_at) >= datetime(?)`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND datetime(created_at) <= datetime(?)`;
    params.push(endDate);
  }
  
  query += ` GROUP BY event_type ORDER BY count DESC`;
  
  return db.prepare(query).all(...params);
}

/**
 * Obtener estadísticas globales del bot
 */
function getGlobalStats(db, startDate = null, endDate = null) {
  let query = `
    SELECT 
      event_type,
      COUNT(*) as count,
      COUNT(DISTINCT user_phone) as unique_users,
      MIN(created_at) as first_occurrence,
      MAX(created_at) as last_occurrence
    FROM bot_usage_stats
    WHERE 1=1
  `;
  
  const params = [];
  
  if (startDate) {
    query += ` AND datetime(created_at) >= datetime(?)`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND datetime(created_at) <= datetime(?)`;
    params.push(endDate);
  }
  
  query += ` GROUP BY event_type ORDER BY count DESC`;
  
  return db.prepare(query).all(...params);
}

/**
 * Obtener usuarios activos en un período
 */
function getActiveUsers(db, days = 7) {
  return db.prepare(`
    SELECT 
      s.user_phone,
      u.name as user_name,
      u.phone as formatted_phone,
      COUNT(*) as event_count,
      COUNT(DISTINCT event_type) as unique_events,
      MIN(s.created_at) as first_activity,
      MAX(s.created_at) as last_activity
    FROM bot_usage_stats s
    LEFT JOIN users u ON s.user_phone = u.phone
    WHERE datetime(s.created_at) >= datetime('now', '-' || ? || ' days')
    GROUP BY s.user_phone
    ORDER BY event_count DESC
  `).all(days);
}

/**
 * Obtener estadísticas por módulo
 */
function getModuleStats(db, startDate = null, endDate = null) {
  const modules = [
    'calendar',
    'expenses',
    'currency',
    'weather',
    'classroom',
    'ai',
    'invite'
  ];
  
  const stats = {};
  
  modules.forEach(module => {
    let query = `
      SELECT COUNT(*) as count
      FROM bot_usage_stats
      WHERE event_type LIKE ?
    `;
    
    const params = [`${module}_%`];
    
    if (startDate) {
      query += ` AND datetime(created_at) >= datetime(?)`;
      params.push(startDate);
    }
    
    if (endDate) {
      query += ` AND datetime(created_at) <= datetime(?)`;
      params.push(endDate);
    }
    
    const result = db.prepare(query).get(...params);
    stats[module] = result?.count || 0;
  });
  
  return stats;
}

/**
 * Obtener eventos más frecuentes
 */
function getTopEvents(db, limit = 10, startDate = null, endDate = null) {
  let query = `
    SELECT 
      event_type,
      COUNT(*) as count,
      COUNT(DISTINCT user_phone) as unique_users
    FROM bot_usage_stats
    WHERE 1=1
  `;
  
  const params = [];
  
  if (startDate) {
    query += ` AND datetime(created_at) >= datetime(?)`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND datetime(created_at) <= datetime(?)`;
    params.push(endDate);
  }
  
  query += ` GROUP BY event_type ORDER BY count DESC LIMIT ?`;
  params.push(limit);
  
  return db.prepare(query).all(...params);
}

/**
 * Obtener estadísticas de uso diario
 */
function getDailyStats(db, days = 7) {
  return db.prepare(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as event_count,
      COUNT(DISTINCT user_phone) as unique_users,
      COUNT(DISTINCT event_type) as unique_events
    FROM bot_usage_stats
    WHERE datetime(created_at) >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `).all(days);
}

/**
 * Obtener estadísticas de conversión de monedas
 */
function getCurrencyConversionStats(db, userPhone = null, startDate = null, endDate = null) {
  let query = `
    SELECT 
      json_extract(event_data, '$.from') as from_currency,
      json_extract(event_data, '$.to') as to_currency,
      COUNT(*) as count,
      SUM(CAST(json_extract(event_data, '$.amount') AS REAL)) as total_amount
    FROM bot_usage_stats
    WHERE event_type = 'currency_conversion'
  `;
  
  const params = [];
  
  if (userPhone) {
    query += ` AND user_phone = ?`;
    params.push(userPhone);
  }
  
  if (startDate) {
    query += ` AND datetime(created_at) >= datetime(?)`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND datetime(created_at) <= datetime(?)`;
    params.push(endDate);
  }
  
  query += ` GROUP BY from_currency, to_currency ORDER BY count DESC`;
  
  return db.prepare(query).all(...params);
}

/**
 * Obtener estadísticas de retención de usuarios
 */
function getRetentionStats(db, days = 30) {
  return db.prepare(`
    SELECT 
      CASE 
        WHEN last_activity_date = date('now') THEN 'Active Today'
        WHEN last_activity_date >= date('now', '-1 day') THEN 'Active Yesterday'
        WHEN last_activity_date >= date('now', '-7 days') THEN 'Active This Week'
        WHEN last_activity_date >= date('now', '-30 days') THEN 'Active This Month'
        ELSE 'Inactive'
      END as retention_category,
      COUNT(*) as user_count
    FROM (
      SELECT 
        user_phone,
        MAX(DATE(created_at)) as last_activity_date
      FROM bot_usage_stats
      GROUP BY user_phone
    )
    GROUP BY retention_category
  `).all();
}

/**
 * Obtener estadísticas por país
 */
function getStatsByCountry(db, startDate = null, endDate = null) {
  let joinCondition = 'ON u.phone = s.user_phone';
  const params = [];
  
  if (startDate && endDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)`;
    params.push(startDate, endDate);
  } else if (startDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) >= datetime(?)`;
    params.push(startDate);
  } else if (endDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) <= datetime(?)`;
    params.push(endDate);
  }
  
  const query = `
    SELECT 
      u.location_country as country,
      u.location_country_code as country_code,
      COUNT(DISTINCT u.phone) as user_count,
      COUNT(s.id) as event_count
    FROM users u
    LEFT JOIN bot_usage_stats s ${joinCondition}
    WHERE u.location_country IS NOT NULL
    GROUP BY u.location_country, u.location_country_code
    ORDER BY user_count DESC, event_count DESC
  `;
  
  return db.prepare(query).all(...params);
}

/**
 * Obtener estadísticas por ciudad
 */
function getStatsByCity(db, startDate = null, endDate = null, limit = 20) {
  let joinCondition = 'ON u.phone = s.user_phone';
  const params = [];
  
  if (startDate && endDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)`;
    params.push(startDate, endDate);
  } else if (startDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) >= datetime(?)`;
    params.push(startDate);
  } else if (endDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) <= datetime(?)`;
    params.push(endDate);
  }
  
  const query = `
    SELECT 
      u.location_city as city,
      u.location_state as state,
      u.location_country as country,
      u.location_country_code as country_code,
      COUNT(DISTINCT u.phone) as user_count,
      COUNT(s.id) as event_count
    FROM users u
    LEFT JOIN bot_usage_stats s ${joinCondition}
    WHERE u.location_city IS NOT NULL
    GROUP BY u.location_city, u.location_state, u.location_country, u.location_country_code
    ORDER BY user_count DESC, event_count DESC
    LIMIT ?
  `;
  
  params.push(limit);
  
  return db.prepare(query).all(...params);
}

/**
 * Obtener estadísticas por región (país/estado)
 */
function getStatsByRegion(db, startDate = null, endDate = null) {
  let joinCondition = 'ON u.phone = s.user_phone';
  const params = [];
  
  if (startDate && endDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)`;
    params.push(startDate, endDate);
  } else if (startDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) >= datetime(?)`;
    params.push(startDate);
  } else if (endDate) {
    joinCondition = `ON u.phone = s.user_phone AND datetime(s.created_at) <= datetime(?)`;
    params.push(endDate);
  }
  
  const query = `
    SELECT 
      COALESCE(u.location_country, 'Unknown') as country,
      COALESCE(u.location_state, 'Unknown') as state,
      u.location_country_code as country_code,
      COUNT(DISTINCT u.phone) as user_count,
      COUNT(s.id) as event_count
    FROM users u
    LEFT JOIN bot_usage_stats s ${joinCondition}
    GROUP BY u.location_country, u.location_state, u.location_country_code
    ORDER BY user_count DESC, event_count DESC
  `;
  
  return db.prepare(query).all(...params);
}

/**
 * Obtener distribución de usuarios por país
 */
function getUserDistributionByCountry(db) {
  return db.prepare(`
    SELECT 
      location_country as country,
      location_country_code as country_code,
      COUNT(*) as user_count
    FROM users
    WHERE location_country IS NOT NULL
    GROUP BY location_country, location_country_code
    ORDER BY user_count DESC
  `).all();
}

/**
 * Obtener estadísticas geográficas generales
 */
function getGeographicStats(db, startDate = null, endDate = null) {
  // Total de usuarios con ubicación
  const usersWithLocation = db.prepare(`
    SELECT COUNT(*) as count
    FROM users
    WHERE location_country IS NOT NULL
  `).get();
  
  // Total de usuarios sin ubicación
  const usersWithoutLocation = db.prepare(`
    SELECT COUNT(*) as count
    FROM users
    WHERE location_country IS NULL
  `).get();
  
  // Países únicos
  const uniqueCountries = db.prepare(`
    SELECT COUNT(DISTINCT location_country_code) as count
    FROM users
    WHERE location_country_code IS NOT NULL
  `).get();
  
  // Ciudades únicas
  const uniqueCities = db.prepare(`
    SELECT COUNT(DISTINCT location_city) as count
    FROM users
    WHERE location_city IS NOT NULL
  `).get();
  
  // Top 5 países
  const topCountries = getStatsByCountry(db, startDate, endDate).slice(0, 5);
  
  // Top 5 ciudades
  const topCities = getStatsByCity(db, startDate, endDate, 5);
  
  return {
    usersWithLocation: usersWithLocation?.count || 0,
    usersWithoutLocation: usersWithoutLocation?.count || 0,
    uniqueCountries: uniqueCountries?.count || 0,
    uniqueCities: uniqueCities?.count || 0,
    topCountries,
    topCities
  };
}

module.exports = {
  trackEvent,
  getUserStats,
  getGlobalStats,
  getActiveUsers,
  getModuleStats,
  getTopEvents,
  getDailyStats,
  getCurrencyConversionStats,
  getRetentionStats,
  getStatsByCountry,
  getStatsByCity,
  getStatsByRegion,
  getUserDistributionByCountry,
  getGeographicStats
};

