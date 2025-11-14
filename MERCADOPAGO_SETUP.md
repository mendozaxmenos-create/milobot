# 💳 Configuración de MercadoPago - Milo Bot

Esta guía te ayudará a configurar la integración de MercadoPago para el sistema Premium de Milo Bot.

## 📋 Requisitos Previos

1. **Cuenta de MercadoPago**: Necesitás tener una cuenta activa en MercadoPago
2. **Credenciales de acceso**: Access Token de tu aplicación en MercadoPago
3. **Ambiente de desarrollo**: Para pruebas, usaremos el sandbox de MercadoPago

## 🔧 Configuración

### 1. Obtener Access Token de MercadoPago

1. Ingresá a [MercadoPago Developers](https://www.mercadopago.com.ar/developers)
2. Creá una nueva aplicación o seleccioná una existente
3. En la sección "Credenciales", copiá tu **Access Token**
   - Para desarrollo: usa el **Access Token de prueba**
   - Para producción: usa el **Access Token de producción**

### 2. Variables de Entorno

Agregá las siguientes variables a tu archivo `.env`:

```env
# MercadoPago Configuration
MERCADOPAGO_ACCESS_TOKEN=TU_ACCESS_TOKEN_AQUI
MERCADOPAGO_WEBHOOK_SECRET=TU_WEBHOOK_SECRET_AQUI  # Opcional para desarrollo
MERCADOPAGO_PRODUCTION=false  # true para producción, false para sandbox

# Precios Premium (en pesos argentinos, sin símbolo $)
PREMIUM_PRICE_MONTHLY=9000
PREMIUM_PRICE_YEARLY=90000

# URL base para webhooks (necesario para desarrollo con ngrok)
WEBHOOK_BASE_URL=http://localhost:3000  # Cambiar por tu URL de ngrok en desarrollo
```

### 3. Instalación de Dependencias

```bash
npm install mercadopago
```

## 🧪 Configuración para Desarrollo (Sandbox)

### 1. Usar ngrok para exponer el webhook localmente

1. Instalá ngrok: https://ngrok.com/download
2. Ejecutá ngrok para exponer el puerto 3000:
   ```bash
   ngrok http 3000
   ```
3. Copiá la URL HTTPS que ngrok te proporciona (ej: `https://abc123.ngrok.io`)
4. Actualizá `WEBHOOK_BASE_URL` en tu `.env`:
   ```env
   WEBHOOK_BASE_URL=https://abc123.ngrok.io
   ```

### 2. Configurar Webhook en MercadoPago

1. En tu aplicación de MercadoPago, ve a "Webhooks"
2. Agregá la URL del webhook:
   ```
   https://abc123.ngrok.io/api/webhook/mercadopago
   ```
3. Seleccioná los eventos que querés recibir:
   - `payment`
   - `merchant_order` (opcional)

### 3. Probar con Tarjetas de Prueba

MercadoPago proporciona tarjetas de prueba para el sandbox:

**Tarjeta aprobada:**
- Número: `5031 7557 3453 0604`
- CVV: `123`
- Fecha: Cualquier fecha futura
- Nombre: Cualquier nombre

**Tarjeta rechazada:**
- Número: `5031 4332 1540 6351`
- CVV: `123`
- Fecha: Cualquier fecha futura

## 🚀 Configuración para Producción

### 1. Cambiar a Producción

1. Actualizá tu `.env`:
   ```env
   MERCADOPAGO_ACCESS_TOKEN=TU_ACCESS_TOKEN_PRODUCCION
   MERCADOPAGO_PRODUCTION=true
   WEBHOOK_BASE_URL=https://tu-dominio.com
   ```

2. Configurá el webhook en MercadoPago con tu dominio real:
   ```
   https://tu-dominio.com/api/webhook/mercadopago
   ```

### 2. Validación de Webhooks

En producción, es importante validar la firma de los webhooks. El módulo ya incluye una función básica de validación, pero podés mejorarla según tus necesidades de seguridad.

## 📊 Flujo de Pago

1. **Usuario inicia suscripción**: Escribe "quiero premium" en el bot
2. **Selección de plan**: Elige entre mensual o anual
3. **Ingreso de email**: El usuario proporciona su email
4. **Generación de link**: Se crea una preferencia de pago en MercadoPago
5. **Pago**: El usuario completa el pago en el navegador
6. **Webhook**: MercadoPago notifica al bot cuando el pago es aprobado
7. **Activación automática**: El bot activa Premium y notifica al usuario

## 🔍 Verificación

### Verificar que el webhook funciona:

1. Realizá un pago de prueba
2. Revisá los logs del bot para ver:
   ```
   [INFO] Webhook de MercadoPago recibido: ...
   ✅ Premium activado para usuario: ...
   ```

### Verificar suscripciones en la base de datos:

```sql
SELECT * FROM subscriptions WHERE status = 'active';
SELECT * FROM payment_transactions ORDER BY created_at DESC;
```

## ⚠️ Troubleshooting

### El webhook no se recibe

1. Verificá que ngrok esté corriendo y la URL sea correcta
2. Verificá que el webhook esté configurado en MercadoPago
3. Revisá los logs del servidor para ver errores

### El pago se aprueba pero Premium no se activa

1. Verificá los logs del webhook
2. Revisá que el `external_reference` tenga el formato correcto: `premium_USERPHONE_TIMESTAMP`
3. Verificá que la suscripción esté en estado `pending` antes del pago

### Error al crear preferencia de pago

1. Verificá que `MERCADOPAGO_ACCESS_TOKEN` esté configurado correctamente
2. Verificá que el token sea válido (no haya expirado)
3. Revisá los logs para ver el error específico de MercadoPago

## 📝 Notas Importantes

- **Sandbox vs Producción**: Asegurate de usar las credenciales correctas según el ambiente
- **Webhooks**: En desarrollo, necesitás usar ngrok o similar para exponer tu servidor local
- **Seguridad**: Nunca compartas tus Access Tokens públicamente
- **Renovaciones**: Las renovaciones automáticas se implementarán en una futura versión

## 🔗 Enlaces Útiles

- [Documentación de MercadoPago](https://www.mercadopago.com.ar/developers/es/docs)
- [API de Preferencias](https://www.mercadopago.com.ar/developers/es/reference/preferences/_checkout_preferences/post)
- [API de Pagos](https://www.mercadopago.com.ar/developers/es/reference/payments/_payments_id/get)
- [Webhooks](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks)

