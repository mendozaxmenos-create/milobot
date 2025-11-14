const DAILY_LIMIT_FREE = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_DAILY_LIMIT || '3', 10), 0);
const PREMIUM_LIMIT = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_PREMIUM_LIMIT || '20', 10), DAILY_LIMIT_FREE);
const PREMIUM_PRICE_MONTHLY = parseFloat(process.env.PREMIUM_PRICE_MONTHLY || '9000');
const PREMIUM_PRICE_YEARLY = parseFloat(process.env.PREMIUM_PRICE_YEARLY || '90000');
const PREMIUM_PRICE_MONTHLY_DISPLAY = `$${PREMIUM_PRICE_MONTHLY.toLocaleString('es-AR')}`;
const PREMIUM_PRICE_YEARLY_DISPLAY = `$${PREMIUM_PRICE_YEARLY.toLocaleString('es-AR')}`;

function isPremiumUser(db, userPhone) {
  const user = db.prepare('SELECT is_premium FROM users WHERE phone = ?').get(userPhone);
  return user && user.is_premium === 1;
}

function getPremiumInfo(db, userPhone) {
  const isPremium = isPremiumUser(db, userPhone);
  const user = db.prepare('SELECT name, created_at FROM users WHERE phone = ?').get(userPhone);
  
  // Obtener estadísticas del usuario
  const scheduledMessagesCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM scheduled_messages
    WHERE creator_phone = ?
      AND status = 'pending'
  `).get(userPhone);
  
  const totalScheduled = db.prepare(`
    SELECT COUNT(*) as count
    FROM scheduled_messages
    WHERE creator_phone = ?
  `).get(userPhone);
  
  return {
    isPremium,
    userName: user?.name || 'Usuario',
    currentLimit: isPremium ? PREMIUM_LIMIT : DAILY_LIMIT_FREE,
    pendingMessages: scheduledMessagesCount?.count || 0,
    totalMessages: totalScheduled?.count || 0,
    freeLimit: DAILY_LIMIT_FREE,
    premiumLimit: PREMIUM_LIMIT
  };
}

function buildPremiumStatusMessage(info) {
  if (info.isPremium) {
    return `💎 *Ya sos usuario Premium!*

📊 *Tu estado actual:*
• Mensajes programados pendientes: ${info.pendingMessages}
• Total de mensajes programados: ${info.totalMessages}
• Límite diario: ${info.currentLimit} mensajes 💎

🚀 *Beneficios activos:*
• ✅ ${info.premiumLimit} mensajes programados por día
• ✅ Todas las funciones a tu disposición
• ✅ Acceso prioritario a nuevas utilidades
• ✅ Estadísticas avanzadas
• ✅ Soporte prioritario

¡Gracias por tu apoyo! 🎉`;
  }
  
  return `💎 *Milo Premium*

*Beneficios Premium:*
• 📊 ${info.premiumLimit} mensajes programados por día (vs ${info.freeLimit} en versión gratuita)
• 🚀 Todas las funciones a tu disposición
• 🚀 Acceso prioritario a nuevas utilidades
• 📈 Estadísticas avanzadas
• 🎯 Soporte prioritario

*Tu estado actual:*
📊 Mensajes programados: ${info.pendingMessages}/${info.freeLimit} por día
📈 Total programados: ${info.totalMessages}

*Precios:*
• Mensual: ${PREMIUM_PRICE_MONTHLY_DISPLAY}
• Anual: ${PREMIUM_PRICE_YEARLY_DISPLAY} (te ahorrás 2 meses!)

¿Querés suscribirte a Premium?
Escribí *"quiero premium"* para continuar.`;
}

function startSubscriptionFlow(db, userPhone, userName) {
  const isPremium = isPremiumUser(db, userPhone);
  
  if (isPremium) {
    return {
      abort: true,
      message: `💎 Ya sos usuario Premium, ${userName}!\n\n¿Necesitás ayuda con algo más?`
    };
  }
  
  const context = {
    stage: 'select_plan',
    userPhone,
    userName
  };
  
  return {
    abort: false,
    message: `💎 *Suscripción a Milo Premium*

Elegí tu plan:

1️⃣ *Mensual* - ${PREMIUM_PRICE_MONTHLY_DISPLAY}
   Renovación automática cada mes

2️⃣ *Anual* - ${PREMIUM_PRICE_YEARLY_DISPLAY}
   Ahorrá hasta 20% (mejor precio)

3️⃣ *Cancelar*

Escribí el número de la opción que prefieras.`,
    nextModule: 'premium_subscription',
    context: JSON.stringify(context)
  };
}

async function handleSubscriptionFlow({ db, userPhone, userName, messageText, session, client }) {
  const context = session?.context ? JSON.parse(session.context) : {};
  const stage = context.stage || 'select_plan';
  const lower = (messageText || '').trim().toLowerCase();
  
  if (lower === 'cancelar' || lower === 'salir' || lower === '3') {
    return {
      message: '👌 Suscripción cancelada. Volvemos al menú principal.',
      nextModule: 'main',
      context: null
    };
  }
  
  if (stage === 'select_plan') {
    if (messageText === '1' || messageText === '1️⃣' || lower === 'mensual') {
      context.stage = 'collect_email';
      context.planType = 'monthly';
      context.planPrice = PREMIUM_PRICE_MONTHLY;
      
      return {
        message: `💳 *Plan Mensual - ${PREMIUM_PRICE_MONTHLY_DISPLAY}*

*Resumen:*
• Plan: Mensual
• Precio: ${PREMIUM_PRICE_MONTHLY_DISPLAY}
• Renovación: Automática cada mes
• Beneficios: ${PREMIUM_LIMIT} mensajes programados/día + todas las funciones Premium

Para continuar, necesito tu email para procesar el pago.

Escribí tu email o *"cancelar"* para volver.`,
        nextModule: 'premium_subscription',
        context: JSON.stringify(context)
      };
    }
    
    if (messageText === '2' || messageText === '2️⃣' || lower === 'anual') {
      context.stage = 'collect_email';
      context.planType = 'yearly';
      context.planPrice = PREMIUM_PRICE_YEARLY;
      
      return {
        message: `💳 *Plan Anual - ${PREMIUM_PRICE_YEARLY_DISPLAY}*

*Resumen:*
• Plan: Anual
• Precio: ${PREMIUM_PRICE_YEARLY_DISPLAY}
• Renovación: Automática cada año
• Beneficios: ${PREMIUM_LIMIT} mensajes programados/día + todas las funciones Premium
• 💰 Ahorro: Te ahorrás 2 meses vs plan mensual

Para continuar, necesito tu email para procesar el pago.

Escribí tu email o *"cancelar"* para volver.`,
        nextModule: 'premium_subscription',
        context: JSON.stringify(context)
      };
    }
    
    return {
      message: '❌ Opción no válida.\n\n*1* - Plan Mensual\n*2* - Plan Anual\n*3* - Cancelar\n\nEscribí *cancelar* si querés salir.',
      nextModule: session.current_module,
      context: session.context
    };
  }
  
  if (stage === 'collect_email') {
    if (lower === 'cancelar' || lower === 'salir') {
      return {
        message: '👌 Suscripción cancelada. Volvemos al menú principal.',
        nextModule: 'main',
        context: null
      };
    }
    
    // Validar email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(messageText.trim())) {
      return {
        message: '❌ Email inválido. Por favor, escribí un email válido.\n\nEjemplo: usuario@ejemplo.com\n\nO escribí *"cancelar"* para volver.',
        nextModule: session.current_module,
        context: session.context
      };
    }
    
    context.userEmail = messageText.trim();
    context.stage = 'creating_payment';
    
    // Crear preferencia de pago con MercadoPago
    const mercadoPagoIntegration = require('../mercadopago-integration');
    
    try {
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
      const webhookUrl = `${webhookBaseUrl}/api/webhook/mercadopago`;
      
      const preferenceResult = await mercadoPagoIntegration.createPaymentPreference({
        userPhone,
        userName,
        userEmail: context.userEmail,
        planType: context.planType,
        amount: context.planPrice,
        currency: 'ARS',
        webhookUrl
      });
      
      if (!preferenceResult.success) {
        throw new Error(preferenceResult.error || 'Error al crear preferencia de pago');
      }
      
      // Guardar suscripción en BD
      const now = new Date();
      const startDate = new Date(now);
      let endDate = new Date(now);
      
      if (context.planType === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (context.planType === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }
      
      const subscriptionId = db.prepare(`
        INSERT INTO subscriptions (
          user_phone, plan_type, status, start_date, end_date, renewal_date,
          payment_provider, preference_id, amount, currency
        ) VALUES (?, ?, 'pending', ?, ?, ?, 'mercadopago', ?, ?, 'ARS')
      `).run(
        userPhone,
        context.planType,
        startDate.toISOString(),
        endDate.toISOString(),
        endDate.toISOString(),
        preferenceResult.preferenceId,
        context.planPrice
      ).lastInsertRowid;
      
      context.subscriptionId = subscriptionId;
      context.preferenceId = preferenceResult.preferenceId;
      
      // Obtener el link de pago (sandbox o producción)
      const paymentLink = mercadoPagoIntegration.IS_PRODUCTION 
        ? preferenceResult.initPoint 
        : preferenceResult.sandboxInitPoint || preferenceResult.initPoint;
      
      return {
        message: `✅ *Link de pago generado*

*Plan seleccionado:* ${context.planType === 'monthly' ? 'Mensual' : 'Anual'}
*Precio:* ${context.planType === 'monthly' ? PREMIUM_PRICE_MONTHLY_DISPLAY : PREMIUM_PRICE_YEARLY_DISPLAY}

🔗 *Hacé clic en el siguiente link para completar el pago:*
${paymentLink}

*Métodos de pago aceptados:*
• Tarjetas de crédito/débito
• Transferencia bancaria

⚠️ *Importante:*
• Una vez completado el pago, tu cuenta Premium se activará automáticamente.
• Te notificaremos por WhatsApp cuando el pago sea confirmado.

Escribí *"menu"* para volver al menú principal.`,
        nextModule: 'main',
        context: null
      };
    } catch (error) {
      console.error('❌ Error creando preferencia de pago:', error);
      return {
        message: `❌ *Error al generar el link de pago*

Hubo un problema al crear tu solicitud de pago. Por favor, intentá nuevamente más tarde.

Si el problema persiste, contactanos directamente.

Escribí *"menu"* para volver al menú principal.`,
        nextModule: 'main',
        context: null
      };
    }
  }
  
  return {
    message: 'No entendí ese paso. Volvemos al menú principal.',
    nextModule: 'main',
    context: null
  };
}

module.exports = {
  isPremiumUser,
  getPremiumInfo,
  buildPremiumStatusMessage,
  startSubscriptionFlow,
  handleSubscriptionFlow,
  PREMIUM_LIMIT,
  DAILY_LIMIT_FREE,
  PREMIUM_PRICE_MONTHLY,
  PREMIUM_PRICE_YEARLY,
  PREMIUM_PRICE_MONTHLY_DISPLAY,
  PREMIUM_PRICE_YEARLY_DISPLAY
};

