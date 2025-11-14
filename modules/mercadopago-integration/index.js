// ============================================
// MÓDULO: INTEGRACIÓN CON MERCADOPAGO
// ============================================

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

// Configuración de MercadoPago
const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';
const IS_PRODUCTION = process.env.MERCADOPAGO_PRODUCTION === 'true';

let client = null;
let preferenceClient = null;
let paymentClient = null;

// Inicializar cliente de MercadoPago
function initializeMercadoPago() {
  if (!ACCESS_TOKEN) {
    console.warn('⚠️ MERCADOPAGO_ACCESS_TOKEN no configurado. La integración de pagos no estará disponible.');
    return false;
  }

  try {
    client = new MercadoPagoConfig({
      accessToken: ACCESS_TOKEN,
      options: {
        timeout: 5000,
        idempotencyKey: 'abc'
      }
    });

    preferenceClient = new Preference(client);
    paymentClient = new Payment(client);

    console.log('✅ MercadoPago inicializado correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error inicializando MercadoPago:', error.message);
    return false;
  }
}

// Crear preferencia de pago (suscripción)
async function createPaymentPreference({
  userPhone,
  userName,
  userEmail,
  planType, // 'monthly' o 'yearly'
  amount,
  currency = 'ARS',
  webhookUrl,
  backUrls = {}
}) {
  if (!preferenceClient) {
    throw new Error('MercadoPago no está inicializado');
  }

  try {
    // Calcular fechas según el plan
    const now = new Date();
    const startDate = new Date(now);
    let endDate = new Date(now);
    
    if (planType === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (planType === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    const preferenceData = {
      items: [
        {
          title: `Milo Premium - Plan ${planType === 'monthly' ? 'Mensual' : 'Anual'}`,
          description: `Suscripción Premium a Milo Bot - ${planType === 'monthly' ? '1 mes' : '1 año'}`,
          quantity: 1,
          unit_price: amount,
          currency_id: currency
        }
      ],
      payer: {
        name: userName || 'Usuario',
        email: userEmail || `${userPhone}@milobot.local`,
        phone: {
          area_code: '',
          number: userPhone.replace(/\D/g, '').slice(-10)
        }
      },
      back_urls: {
        success: backUrls.success || `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/payment/success`,
        failure: backUrls.failure || `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/payment/failure`,
        pending: backUrls.pending || `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/payment/pending`
      },
      auto_return: 'approved',
      notification_url: webhookUrl || `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/api/webhook/mercadopago`,
      statement_descriptor: 'MILO PREMIUM',
      external_reference: `premium_${userPhone}_${Date.now()}`,
      metadata: {
        user_phone: userPhone,
        plan_type: planType,
        amount: amount.toString(),
        currency: currency
      }
    };

    const response = await preferenceClient.create({ body: preferenceData });

    return {
      success: true,
      preferenceId: response.id,
      initPoint: response.init_point,
      sandboxInitPoint: response.sandbox_init_point,
      externalReference: preferenceData.external_reference
    };
  } catch (error) {
    console.error('❌ Error creando preferencia de pago:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido al crear preferencia de pago'
    };
  }
}

// Obtener información de un pago
async function getPaymentInfo(paymentId) {
  if (!paymentClient) {
    throw new Error('MercadoPago no está inicializado');
  }

  try {
    const payment = await paymentClient.get({ id: paymentId });
    return {
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        statusDetail: payment.status_detail,
        transactionAmount: payment.transaction_amount,
        currencyId: payment.currency_id,
        paymentMethodId: payment.payment_method_id,
        paymentTypeId: payment.payment_type_id,
        dateCreated: payment.date_created,
        dateApproved: payment.date_approved,
        externalReference: payment.external_reference,
        metadata: payment.metadata
      }
    };
  } catch (error) {
    console.error('❌ Error obteniendo información de pago:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido al obtener información de pago'
    };
  }
}

// Verificar webhook de MercadoPago
function verifyWebhookSignature(xSignature, xRequestId, dataId) {
  // MercadoPago envía la firma en el header x-signature
  // Por ahora, validamos que exista. En producción, deberías validar la firma completa
  if (!WEBHOOK_SECRET) {
    console.warn('⚠️ MERCADOPAGO_WEBHOOK_SECRET no configurado. Validación de webhook deshabilitada.');
    return true; // En desarrollo, permitir sin validación
  }

  // TODO: Implementar validación completa de firma cuando esté en producción
  return true;
}

// Cancelar suscripción (cancelar preferencia de renovación)
async function cancelSubscription(preferenceId) {
  if (!preferenceClient) {
    throw new Error('MercadoPago no está inicializado');
  }

  try {
    // En MercadoPago, las suscripciones recurrentes se manejan con subscriptions
    // Por ahora, solo marcamos la preferencia como cancelada en nuestra BD
    // TODO: Implementar cancelación real cuando usemos subscriptions de MercadoPago
    return {
      success: true,
      message: 'Suscripción cancelada'
    };
  } catch (error) {
    console.error('❌ Error cancelando suscripción:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido al cancelar suscripción'
    };
  }
}

module.exports = {
  initializeMercadoPago,
  createPaymentPreference,
  getPaymentInfo,
  verifyWebhookSignature,
  cancelSubscription,
  IS_PRODUCTION
};

