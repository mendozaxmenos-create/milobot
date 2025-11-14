// ============================================
// MÓDULO: NOTIFICACIONES DE PREMIUM
// ============================================

/**
 * Notificar al usuario que su pago fue aprobado y Premium activado
 */
async function notifyPaymentApproved(client, db, userPhone) {
  try {
    const user = db.prepare('SELECT name FROM users WHERE phone = ?').get(userPhone);
    const userName = user?.name || 'Usuario';
    
    const subscription = db.prepare(`
      SELECT plan_type, end_date, amount
      FROM subscriptions
      WHERE user_phone = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userPhone);
    
    if (!subscription) {
      console.warn(`[WARN] No se encontró suscripción activa para notificar: ${userPhone}`);
      return;
    }
    
    const planName = subscription.plan_type === 'monthly' ? 'Mensual' : 'Anual';
    const endDate = new Date(subscription.end_date);
    const formattedDate = endDate.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    const message = `💎 *¡Felicitaciones, ${userName}!*

✅ Tu pago fue aprobado y tu cuenta Premium ha sido activada.

*Detalles de tu suscripción:*
• Plan: ${planName}
• Válido hasta: ${formattedDate}
• Monto pagado: $${subscription.amount.toLocaleString('es-AR')}

🚀 *Beneficios Premium activos:*
• ✅ 20 mensajes programados por día
• ✅ Todas las funciones a tu disposición
• ✅ Acceso prioritario a nuevas utilidades
• ✅ Estadísticas avanzadas
• ✅ Soporte prioritario

¡Gracias por tu apoyo! 🎉

Escribí *"premium"* para ver tu estado o *"menu"* para volver al menú principal.`;
    
    const chatId = `${userPhone}@c.us`;
    await client.sendMessage(chatId, message);
    console.log(`✅ Notificación de Premium activado enviada a: ${userPhone}`);
  } catch (error) {
    console.error(`[ERROR] Error enviando notificación de pago aprobado a ${userPhone}:`, error);
  }
}

/**
 * Notificar al usuario que su pago fue rechazado
 */
async function notifyPaymentRejected(client, db, userPhone) {
  try {
    const user = db.prepare('SELECT name FROM users WHERE phone = ?').get(userPhone);
    const userName = user?.name || 'Usuario';
    
    const message = `❌ *Pago rechazado*

Hola ${userName}, tu pago fue rechazado o cancelado.

*¿Qué hacer?*
• Verificá que tu método de pago tenga fondos suficientes
• Intentá nuevamente escribiendo *"quiero premium"*
• Si el problema persiste, contactanos

Mientras tanto, podés seguir usando Milo con el plan gratuito.

Escribí *"menu"* para volver al menú principal.`;
    
    const chatId = `${userPhone}@c.us`;
    await client.sendMessage(chatId, message);
    console.log(`✅ Notificación de pago rechazado enviada a: ${userPhone}`);
  } catch (error) {
    console.error(`[ERROR] Error enviando notificación de pago rechazado a ${userPhone}:`, error);
  }
}

/**
 * Obtener información de suscripción del usuario
 */
function getSubscriptionInfo(db, userPhone) {
  const subscription = db.prepare(`
    SELECT id, plan_type, status, start_date, end_date, renewal_date,
           amount, currency, created_at, cancelled_at
    FROM subscriptions
    WHERE user_phone = ? AND status IN ('active', 'pending')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userPhone);
  
  return subscription || null;
}

/**
 * Cancelar suscripción del usuario
 */
function cancelSubscription(db, userPhone) {
  try {
    const subscription = getSubscriptionInfo(db, userPhone);
    
    if (!subscription) {
      return {
        success: false,
        message: 'No tenés una suscripción activa para cancelar.'
      };
    }
    
    if (subscription.status === 'cancelled') {
      return {
        success: false,
        message: 'Tu suscripción ya está cancelada.'
      };
    }
    
    // Marcar suscripción como cancelada
    const now = new Date();
    db.prepare(`
      UPDATE subscriptions
      SET status = 'cancelled',
          cancelled_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(now.toISOString(), subscription.id);
    
    // Desactivar Premium (pero mantener hasta el final del período pagado)
    // No desactivamos is_premium inmediatamente, solo marcamos la suscripción como cancelada
    // El Premium seguirá activo hasta end_date
    
    return {
      success: true,
      message: `Tu suscripción ha sido cancelada. Tu cuenta Premium seguirá activa hasta ${new Date(subscription.end_date).toLocaleDateString('es-AR')}.`
    };
  } catch (error) {
    console.error('[ERROR] Error cancelando suscripción:', error);
    return {
      success: false,
      message: 'Hubo un error al cancelar tu suscripción. Por favor, intentá nuevamente.'
    };
  }
}

/**
 * Formatear información de suscripción para mostrar al usuario
 */
function formatSubscriptionInfo(subscription) {
  if (!subscription) {
    return 'No tenés una suscripción activa.';
  }
  
  const planName = subscription.plan_type === 'monthly' ? 'Mensual' : 'Anual';
  const statusEmoji = subscription.status === 'active' ? '✅' : 
                      subscription.status === 'pending' ? '⏳' : 
                      subscription.status === 'cancelled' ? '❌' : '⚠️';
  const statusText = subscription.status === 'active' ? 'Activa' :
                     subscription.status === 'pending' ? 'Pendiente de pago' :
                     subscription.status === 'cancelled' ? 'Cancelada' :
                     subscription.status;
  
  const startDate = subscription.start_date ? new Date(subscription.start_date).toLocaleDateString('es-AR') : 'N/A';
  const endDate = subscription.end_date ? new Date(subscription.end_date).toLocaleDateString('es-AR') : 'N/A';
  
  let message = `💎 *Tu Suscripción Premium*\n\n`;
  message += `${statusEmoji} *Estado:* ${statusText}\n`;
  message += `📅 *Plan:* ${planName}\n`;
  message += `💰 *Monto:* $${subscription.amount.toLocaleString('es-AR')}\n`;
  message += `📆 *Inicio:* ${startDate}\n`;
  message += `📆 *Válido hasta:* ${endDate}\n`;
  
  if (subscription.cancelled_at) {
    message += `\n⚠️ *Cancelada el:* ${new Date(subscription.cancelled_at).toLocaleDateString('es-AR')}\n`;
    message += `Tu Premium seguirá activo hasta ${endDate}.`;
  }
  
  return message;
}

module.exports = {
  notifyPaymentApproved,
  notifyPaymentRejected,
  getSubscriptionInfo,
  cancelSubscription,
  formatSubscriptionInfo
};

