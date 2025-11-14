# 🌐 Guía de Configuración de ngrok para Desarrollo

## 📋 ¿Qué es ngrok?

ngrok es una herramienta que crea un túnel seguro desde internet hacia tu computadora local, permitiendo que MercadoPago pueda enviar webhooks a tu servidor local durante el desarrollo.

## 🔧 Instalación en Windows

### Opción 1: Descarga Directa

1. **Descargá ngrok:**
   - Ve a: https://ngrok.com/download
   - Seleccioná "Windows"
   - Descargá el archivo ZIP

2. **Extraé el archivo:**
   - Descomprimí `ngrok.exe` en una carpeta (ej: `C:\ngrok\`)

3. **Agregar al PATH (Opcional pero recomendado):**
   - Presioná `Win + R`, escribí `sysdm.cpl` y presioná Enter
   - Ve a la pestaña "Opciones avanzadas"
   - Clic en "Variables de entorno"
   - En "Variables del sistema", buscá "Path" y hacé clic en "Editar"
   - Clic en "Nuevo" y agregá la ruta donde está ngrok (ej: `C:\ngrok`)
   - Clic en "Aceptar" en todas las ventanas

### Opción 2: Usar Chocolatey (si lo tenés instalado)

```powershell
choco install ngrok
```

## 🚀 Uso de ngrok

### Paso 1: Iniciar tu bot

En una terminal, ejecutá tu bot:

```bash
npm start
```

O si usás el dashboard también:

```bash
npm run start:all
```

Asegurate de que el bot esté corriendo en el puerto 3000 (o el que configuraste en `ADMIN_PORT`).

### Paso 2: Iniciar ngrok

**En una NUEVA terminal** (dejá la del bot corriendo), ejecutá:

```bash
ngrok http 3000
```

**Si no agregaste ngrok al PATH**, tenés que navegar a la carpeta donde está:

```bash
cd C:\ngrok
.\ngrok.exe http 3000
```

### Paso 3: Copiar la URL

ngrok mostrará algo así:

```
ngrok                                                                            

Session Status                online
Account                       Tu Email (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok.io -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Copiá la URL HTTPS** (en este ejemplo: `https://abc123.ngrok.io`)

### Paso 4: Actualizar .env

Actualizá tu archivo `.env`:

```env
WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

**⚠️ IMPORTANTE:** Cada vez que reiniciás ngrok, la URL cambia. Tenés que:
1. Copiar la nueva URL
2. Actualizar `WEBHOOK_BASE_URL` en tu `.env`
3. Reiniciar el bot

### Paso 5: Configurar Webhook en MercadoPago

1. Ve a tu aplicación en MercadoPago Developers
2. Sección "Webhooks"
3. Agregá la URL:
   ```
   https://abc123.ngrok.io/api/webhook/mercadopago
   ```
4. Guardá los cambios

## 📊 Interfaz Web de ngrok

ngrok también proporciona una interfaz web para ver las peticiones:

- Abrí en tu navegador: http://127.0.0.1:4040
- Ahí podés ver todas las peticiones que llegan a través del túnel
- Útil para debuggear webhooks

## ⚠️ Notas Importantes

1. **Mantener ngrok corriendo:** ngrok debe estar corriendo mientras desarrollás. Si lo cerrás, la URL deja de funcionar.

2. **URL temporal:** En el plan gratuito de ngrok, la URL cambia cada vez que reiniciás. Para una URL fija, necesitás el plan de pago.

3. **Dos terminales:** Necesitás dos terminales:
   - Una para el bot (`npm start`)
   - Otra para ngrok (`ngrok http 3000`)

4. **Puerto correcto:** Asegurate de que ngrok apunte al mismo puerto donde corre tu bot (por defecto 3000).

## 🔄 Flujo Completo de Desarrollo

1. **Terminal 1:** Iniciar el bot
   ```bash
   npm start
   ```

2. **Terminal 2:** Iniciar ngrok
   ```bash
   ngrok http 3000
   ```

3. **Copiar URL de ngrok** y actualizar `.env`

4. **Configurar webhook en MercadoPago** con la URL de ngrok

5. **Probar el flujo de pago**

## 🐛 Troubleshooting

### Error: "ngrok no se reconoce como comando"

- No agregaste ngrok al PATH, o
- No estás en la carpeta correcta

**Solución:** Ejecutá ngrok desde su carpeta:
```bash
cd C:\ngrok
.\ngrok.exe http 3000
```

### Error: "puerto 3000 ya en uso"

- Ya hay algo corriendo en el puerto 3000

**Solución:** 
- Cerralo o
- Usá otro puerto y actualizá `ADMIN_PORT` en `.env`

### La URL de ngrok no funciona

- Verificá que ngrok esté corriendo
- Verificá que el bot esté corriendo en el puerto correcto
- Verificá que la URL en `.env` sea la correcta (con `https://`)

## 📝 Alternativas a ngrok

Si no querés usar ngrok, podés usar:

- **localtunnel:** `npx localtunnel --port 3000`
- **serveo:** `ssh -R 80:localhost:3000 serveo.net`
- **cloudflared:** `cloudflared tunnel --url http://localhost:3000`

Pero ngrok es la opción más popular y fácil de usar.

