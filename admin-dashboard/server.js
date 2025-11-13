// ============================================
// 📊 PANEL DE ADMINISTRACIÓN - DASHBOARD
// ============================================

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno
require('dotenv').config();

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'milo123';

// Cargar módulo de estadísticas
let statsModule;
try {
  statsModule = require('../modules/stats-module');
} catch (error) {
  console.error('[ERROR] No se pudo cargar el módulo de estadísticas:', error);
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conectar a la base de datos
const dbPath = path.join(__dirname, '..', 'data', 'database.db');
const db = new Database(dbPath);

// ============================================
// RUTAS
// ============================================

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Obtener estadísticas globales
app.get('/api/stats/global', (req, res) => {
  try {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const stats = statsModule.getGlobalStats(db, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas globales:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas por módulo
app.get('/api/stats/modules', (req, res) => {
  try {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const stats = statsModule.getModuleStats(db, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas por módulo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener usuarios activos
app.get('/api/stats/active-users', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const users = statsModule.getActiveUsers(db, days);
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('[ERROR] Error obteniendo usuarios activos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener eventos más frecuentes
app.get('/api/stats/top-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const events = statsModule.getTopEvents(db, limit, startDate, endDate);
    res.json({ success: true, data: events });
  } catch (error) {
    console.error('[ERROR] Error obteniendo eventos más frecuentes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas diarias
app.get('/api/stats/daily', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = statsModule.getDailyStats(db, days);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas diarias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas de conversión de monedas
app.get('/api/stats/currency', (req, res) => {
  try {
    const userPhone = req.query.userPhone || null;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const stats = statsModule.getCurrencyConversionStats(db, userPhone, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas de conversión:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas de retención
app.get('/api/stats/retention', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = statsModule.getRetentionStats(db, days);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas de retención:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas por país
app.get('/api/stats/by-country', (req, res) => {
  try {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const stats = statsModule.getStatsByCountry(db, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas por país:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas por ciudad
app.get('/api/stats/by-city', (req, res) => {
  try {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const limit = parseInt(req.query.limit) || 20;
    const stats = statsModule.getStatsByCity(db, startDate, endDate, limit);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas por ciudad:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas por región
app.get('/api/stats/by-region', (req, res) => {
  try {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const stats = statsModule.getStatsByRegion(db, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas por región:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener distribución de usuarios por país
app.get('/api/stats/user-distribution', (req, res) => {
  try {
    const stats = statsModule.getUserDistributionByCountry(db);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo distribución de usuarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas geográficas generales
app.get('/api/stats/geographic', (req, res) => {
  try {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const stats = statsModule.getGeographicStats(db, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas geográficas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener estadísticas de un usuario
app.get('/api/stats/user/:phone', (req, res) => {
  try {
    const userPhone = req.params.phone;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const stats = statsModule.getUserStats(db, userPhone, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[ERROR] Error obteniendo estadísticas de usuario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener total de usuarios
app.get('/api/users/total', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM users').get();
    res.json({ success: true, data: { total: total.count } });
  } catch (error) {
    console.error('[ERROR] Error obteniendo total de usuarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Obtener resumen general
app.get('/api/summary', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM calendar_events').get();
    const totalExpenses = db.prepare('SELECT COUNT(*) as count FROM expenses').get();
    const totalGroups = db.prepare('SELECT COUNT(*) as count FROM expense_groups').get();
    const totalStats = db.prepare('SELECT COUNT(*) as count FROM bot_usage_stats').get();
    
    // Últimos 7 días
    const activeUsersLast7Days = db.prepare(`
      SELECT COUNT(DISTINCT user_phone) as count
      FROM bot_usage_stats
      WHERE datetime(created_at) >= datetime('now', '-7 days')
    `).get();

    res.json({
      success: true,
      data: {
        totalUsers: totalUsers.count,
        totalEvents: totalEvents.count,
        totalExpenses: totalExpenses.count,
        totalGroups: totalGroups.count,
        totalStats: totalStats.count,
        activeUsersLast7Days: activeUsersLast7Days.count
      }
    });
  } catch (error) {
    console.error('[ERROR] Error obteniendo resumen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Función para iniciar el servidor
function startDashboard() {
  return app.listen(PORT, () => {
    console.log(`📊 Panel de administración disponible en http://localhost:${PORT}`);
    console.log(`🔐 Acceso: http://localhost:${PORT}`);
  });
}

// Si se ejecuta directamente (npm run dashboard), iniciar el servidor
if (require.main === module) {
  startDashboard();
}

// Exportar app y función de inicio para uso en index.js
module.exports = { app, startDashboard };
