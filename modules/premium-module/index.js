const DAILY_LIMIT_FREE = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_DAILY_LIMIT || '3', 10), 0);
const PREMIUM_LIMIT = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_PREMIUM_LIMIT || '20', 10), DAILY_LIMIT_FREE);
const PREMIUM_PRICE_MONTHLY = process.env.PREMIUM_PRICE_MONTHLY || '$9000';
const PREMIUM_PRICE_YEARLY = process.env.PREMIUM_PRICE_YEARLY || '$90000';

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
• Mensual: ${PREMIUM_PRICE_MONTHLY}
• Anual: ${PREMIUM_PRICE_YEARLY} (te ahorrás 2 meses!)

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

1️⃣ *Mensual* - ${PREMIUM_PRICE_MONTHLY}
   Renovación automática cada mes

2️⃣ *Anual* - ${PREMIUM_PRICE_YEARLY}
   Ahorrá hasta 20% (mejor precio)

3️⃣ *Cancelar*

Escribí el número de la opción que prefieras.`,
    nextModule: 'premium_subscription',
    context: JSON.stringify(context)
  };
}

function handleSubscriptionFlow({ db, userPhone, userName, messageText, session }) {
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
    if (messageText === '1' || messageText === '1️⃣' || lower === 'mensual' || lower === 'mensual') {
      context.stage = 'confirm_payment';
      context.planType = 'monthly';
      context.planPrice = PREMIUM_PRICE_MONTHLY;
      
      return {
        message: `💳 *Plan Mensual - ${PREMIUM_PRICE_MONTHLY}*

*Resumen:*
• Plan: Mensual
• Precio: ${PREMIUM_PRICE_MONTHLY}
• Renovación: Automática cada mes
• Beneficios: ${PREMIUM_LIMIT} mensajes programados/día + todas las funciones Premium

*Métodos de pago disponibles:*
• MercadoPago
• Stripe (tarjeta de crédito/débito)

⚠️ *Nota:* El sistema de pagos está en desarrollo.
Por ahora, contactanos para activar tu suscripción Premium.

Escribí *"confirmar"* si querés continuar o *"cancelar"* para volver.`,
        nextModule: 'premium_subscription',
        context: JSON.stringify(context)
      };
    }
    
    if (messageText === '2' || messageText === '2️⃣' || lower === 'anual' || lower === 'anual') {
      context.stage = 'confirm_payment';
      context.planType = 'yearly';
      context.planPrice = PREMIUM_PRICE_YEARLY;
      
      return {
        message: `💳 *Plan Anual - ${PREMIUM_PRICE_YEARLY}*

*Resumen:*
• Plan: Anual
• Precio: ${PREMIUM_PRICE_YEARLY}
• Renovación: Automática cada año
• Beneficios: ${PREMIUM_LIMIT} mensajes programados/día + todas las funciones Premium
• 💰 Ahorro: Te ahorrás 2 meses vs plan mensual

*Métodos de pago disponibles:*
• MercadoPago
• Stripe (tarjeta de crédito/débito)

⚠️ *Nota:* El sistema de pagos está en desarrollo.
Por ahora, contactanos para activar tu suscripción Premium.

Escribí *"confirmar"* si querés continuar o *"cancelar"* para volver.`,
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
  
  if (stage === 'confirm_payment') {
    if (lower === 'confirmar' || lower === 'si' || lower === 'sí' || messageText === '1') {
      // Por ahora, solo informamos que está en desarrollo
      // Aquí iría la integración con la pasarela de pagos
      return {
        message: `⏳ *Sistema de pagos en desarrollo*

Por ahora, para activar tu suscripción Premium, contactanos directamente.

Te enviaremos las instrucciones de pago y activaremos tu cuenta Premium una vez confirmado el pago.

¿Querés que te contactemos?
Escribí *"si"* para que te enviemos un mensaje con los pasos a seguir.`,
        nextModule: 'premium_subscription',
        context: JSON.stringify({ ...context, stage: 'waiting_contact' })
      };
    }
    
    if (lower === 'cancelar' || lower === 'no') {
      return {
        message: '👌 Suscripción cancelada. Volvemos al menú principal.',
        nextModule: 'main',
        context: null
      };
    }
    
    return {
      message: 'Escribí *"confirmar"* para continuar o *"cancelar"* para volver.',
      nextModule: session.current_module,
      context: session.context
    };
  }
  
  if (stage === 'waiting_contact') {
    if (lower === 'si' || lower === 'sí' || messageText === '1') {
      // Aquí se podría enviar un mensaje al administrador o crear un ticket
      return {
        message: `✅ *Solicitud recibida*

Hemos registrado tu interés en Premium. Te contactaremos pronto con las instrucciones de pago.

Mientras tanto, podés seguir usando Milo con el plan gratuito (${DAILY_LIMIT_FREE} mensajes programados por día).

¡Gracias por tu interés! 🎉`,
        nextModule: 'main',
        context: null
      };
    }
    
    return {
      message: '👌 Volvemos al menú principal.',
      nextModule: 'main',
      context: null
    };
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
  DAILY_LIMIT_FREE
};

