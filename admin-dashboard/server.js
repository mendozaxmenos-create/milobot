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

// ============================================
// WEBHOOK DE MERCADOPAGO
// ============================================

// Endpoint para recibir notificaciones de MercadoPago
app.post('/api/webhook/mercadopago', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const mercadoPagoIntegration = require('../modules/mercadopago-integration');
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    
    // Parsear el body
    let data;
    try {
      data = JSON.parse(req.body.toString());
    } catch (e) {
      data = req.body;
    }
    
    const dataId = data?.data?.id || data?.id;
    
    // Verificar firma del webhook (en desarrollo, se omite)
    if (!mercadoPagoIntegration.verifyWebhookSignature(xSignature, xRequestId, dataId)) {
      console.warn('[WARN] Webhook de MercadoPago con firma inválida');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    console.log('[INFO] Webhook de MercadoPago recibido:', JSON.stringify(data, null, 2));
    
    // Obtener información del pago
    if (data.type === 'payment' && data.data?.id) {
      const paymentId = data.data.id;
      const paymentInfo = await mercadoPagoIntegration.getPaymentInfo(paymentId);
      
      if (paymentInfo.success && paymentInfo.payment) {
        const payment = paymentInfo.payment;
        const externalRef = payment.externalReference || '';
        
        // Extraer user_phone del external_reference (formato: premium_USERPHONE_TIMESTAMP)
        const match = externalRef.match(/^premium_(.+?)_(\d+)$/);
        if (!match) {
          console.warn('[WARN] External reference no válido:', externalRef);
          return res.status(400).json({ error: 'Invalid external reference' });
        }
        
        const userPhone = match[1];
        
        // Buscar suscripción pendiente
        const subscription = db.prepare(`
          SELECT id, user_phone, plan_type, status, amount
          FROM subscriptions
          WHERE user_phone = ? AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
        `).get(userPhone);
        
        if (!subscription) {
          console.warn('[WARN] No se encontró suscripción pendiente para:', userPhone);
          return res.status(404).json({ error: 'Subscription not found' });
        }
        
        // Registrar transacción
        db.prepare(`
          INSERT INTO payment_transactions (
            user_phone, subscription_id, payment_provider, payment_id,
            amount, currency, status, payment_method
          ) VALUES (?, ?, 'mercadopago', ?, ?, 'ARS', ?, ?)
        `).run(
          userPhone,
          subscription.id,
          payment.id.toString(),
          payment.transactionAmount,
          payment.status,
          payment.paymentMethodId || 'unknown'
        );
        
        // Actualizar suscripción según el estado del pago
        if (payment.status === 'approved') {
          // Activar Premium
          const now = new Date();
          const startDate = new Date(now);
          let endDate = new Date(now);
          
          if (subscription.plan_type === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
          } else if (subscription.plan_type === 'yearly') {
            endDate.setFullYear(endDate.getFullYear() + 1);
          }
          
          // Actualizar suscripción
          db.prepare(`
            UPDATE subscriptions
            SET status = 'active',
                start_date = ?,
                end_date = ?,
                renewal_date = ?,
                payment_id = ?,
                payment_status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            startDate.toISOString(),
            endDate.toISOString(),
            endDate.toISOString(),
            payment.id.toString(),
            payment.status,
            subscription.id
          );
          
          // Activar Premium en el usuario
          db.prepare(`
            UPDATE users
            SET is_premium = 1
            WHERE phone = ?
          `).run(userPhone);
          
          console.log(`✅ Premium activado para usuario: ${userPhone}`);
          
          // Notificar al usuario por WhatsApp
          // Necesitamos el cliente de WhatsApp desde index.js
          // Por ahora, guardamos en una tabla para que index.js lo procese
          db.prepare(`
            INSERT OR IGNORE INTO premium_notifications_queue (
              user_phone, notification_type, created_at
            ) VALUES (?, 'payment_approved', CURRENT_TIMESTAMP)
          `).run(userPhone);
          
          console.log(`📱 Notificación de Premium activado encolada para: ${userPhone}`);
          
        } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
          // Marcar suscripción como fallida
          db.prepare(`
            UPDATE subscriptions
            SET status = 'failed',
                payment_id = ?,
                payment_status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            payment.id.toString(),
            payment.status,
            subscription.id
          );
          
          console.log(`❌ Pago rechazado para usuario: ${userPhone}`);
          
          // Encolar notificación de pago rechazado
          db.prepare(`
            INSERT OR IGNORE INTO premium_notifications_queue (
              user_phone, notification_type, created_at
            ) VALUES (?, 'payment_rejected', CURRENT_TIMESTAMP)
          `).run(userPhone);
        }
      }
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[ERROR] Error procesando webhook de MercadoPago:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Exportar app y función de inicio para uso en index.js
module.exports = { app, startDashboard };
