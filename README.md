# 🤖 Milo - Bot Asistente Personal para WhatsApp

Bot inteligente de WhatsApp con funcionalidades de calendario, pronóstico del tiempo, gestión de gastos e IA integrada.

## ✨ Características

### 🌤️ Módulo de Pronóstico del Tiempo
- ✅ Pronóstico del tiempo para hoy
- ✅ Detección automática de ubicación por IP
- ✅ Configuración manual de ciudad
- ✅ Recomendaciones de vestimenta según el clima
- ✅ Alertas de lluvia y condiciones climáticas
- ✅ Guardado de ubicación preferida

### 📅 Módulo de Calendario
- ✅ Ver agenda de hoy (eventos y recordatorios)
- ✅ Agregar eventos con lenguaje natural
- ✅ **Recordatorios** con o sin fecha programada
- ✅ Completar/marcar recordatorios como realizados
- ✅ Próximos eventos (7, 15, 30 días)
- ✅ Editar y eliminar eventos
- ✅ Eventos recurrentes (diario, semanal, mensual)
- ✅ Notificaciones automáticas por WhatsApp
- ✅ Vista mensual
- ✅ Búsqueda de eventos
- ✅ Categorías (Personal, Trabajo, Urgente, Familia)
- ✅ Invitar contactos a eventos
- ✅ Sincronización con Google Calendar
- ✅ Parsing avanzado de fechas naturales (ej: "domingo 30 de noviembre")

### 💰 Módulo de Gastos
- ✅ Crear grupos de gastos
- ✅ Agregar gastos compartidos
- ✅ Cálculo automático de deudas
- ✅ División optimizada de pagos
- ✅ Funciona en grupos de WhatsApp
- ✅ Resumen de gastos

### 🏫 Módulo Google Classroom
- ✅ Conectar tu cuenta de Google (Calendar + Classroom) con OAuth
- ✅ Sincronizar cursos activos y guardar anuncios/tareas recientes
- ✅ Resumen automático agrupado por curso/personal docente
- ✅ Identificar próximas entregas y tareas atrasadas
- ✅ Sincronización manual bajo demanda desde el bot
- ✅ Soporta múltiples cuentas (perfecto para hij@s en distintas aulas)

### 💱 Conversor de Monedas
- ✅ Consultar tasas de cambio al instante (usa `exchangerate.host`)
- ✅ Conversaciones naturales: `convertir 100 usd a ars`
- ✅ Disponible como opción de menú y comando rápido
- ✅ Ideal para viajes con varias monedas

### 🤖 Asistente IA
- ✅ Integración con Claude (Anthropic)
- ✅ Procesamiento de lenguaje natural
- ✅ Conversación contextual

### 📝 Sistema de Feedback
- ✅ Reportar bugs
- ✅ Enviar sugerencias
- ✅ Panel de administración básico

### 🗓️ Mensajes Programados (Nuevo)
- ✅ Programar mensajes para enviar en fecha/hora específica
- ✅ Lenguaje natural: "en 2 minutos", "mañana 10:00", "hoy 11:45 am"
- ✅ Límites diarios anti-spam con advertencias personalizadas
- ✅ Listar y cancelar mensajes programados
- ✅ Sincronización automática con timezone del usuario

### 🔔 Recordatorios Automáticos (Nuevo)
- ✅ Notificaciones automáticas 24h y 1h antes de eventos
- ✅ Notificaciones a dueños e invitados
- ✅ Preferencias por usuario (habilitar/deshabilitar)
- ✅ Logging completo de recordatorios enviados

### ⌨️ Palabras Clave Globales (Nuevo)
- ✅ Acceso rápido a módulos desde cualquier menú
- ✅ Keywords: "pronostico", "gastos", "calendario", "programar mensaje", etc.
- ✅ Guía amigable de keywords en mensaje de bienvenida

### 📍 Detección Inteligente de Ubicación (Nuevo)
- ✅ Detección automática por IP con sugerencia al usuario
- ✅ Confirmación antes de guardar ubicación (previene errores)
- ✅ Sincronización de timezone desde ubicación detectada
- ✅ Sugerencia de ubicación cada vez que se accede al módulo de clima

## 🚧 Próximas Funcionalidades

### 🧾 Facturación Automatizada (ARCA)
- Generación de comprobantes electrónicos desde WhatsApp
- Flujo conversacional para crear facturas (Factura A, B, C)
- Envío automático de PDF al cliente
- Historial de facturas emitidas
- Integración con servicios web SOAP de ARCA
- Ver detalles completos en [ROADMAP.md](./ROADMAP.md)

## 🚧 Otras Funcionalidades Planificadas

Consulta el [ROADMAP.md](ROADMAP.md) para ver el plan completo. Algunas funcionalidades en desarrollo:

- 🍎 **Contador de calorías por IA** - Analizar fotos de comida para contar calorías
- 🏪 **Marketplace de módulos** - Instalar módulos opcionales según necesidades
- 🔐 **Bóveda de información personal** - Almacenar documentos, pólizas, información sensible
- 📊 **Exportación de métricas** - Descargar estadísticas en CSV/Excel

## 🚀 Instalación

### Requisitos
- Node.js >= 18.0.0
- Cuenta de WhatsApp
- (Opcional) API Key de Anthropic para IA
- (Opcional) API Key de OpenWeatherMap para pronóstico del tiempo
- (Opcional) Credenciales de Google Calendar / Classroom

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/mendozaxmenos-create/milobot.git
cd milobot
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
Crea un archivo `.env` en la raíz del proyecto:
```env
# IA (Opcional)
ANTHROPIC_API_KEY=tu_api_key_aqui

# Pronóstico del Tiempo (Opcional pero recomendado)
OPENWEATHER_API_KEY=tu_api_key_openweather

# Google Calendar & Classroom (Opcional pero recomendado)
GOOGLE_CLIENT_ID=tu_client_id
GOOGLE_CLIENT_SECRET=tu_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
```

4. **Iniciar el bot**
```bash
npm start
```

5. **Escanear el código QR**
- Se mostrará un código QR en la terminal
- Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
- Escanea el código QR

## 📖 Uso

### Comandos Principales

**En chat privado:**
- `hola` o `menu` - Mostrar menú principal
- `1` - 🌤️ Pronóstico para hoy
- `2` - 📅 Calendario & Recordatorios
- `3` - 💰 Dividir Gastos
- `4` - 🏫 Google Classroom (resúmenes)
- `5` - 🤖 Asistente IA
- `6` - 💱 Conversor de Monedas
- `7` - 🤝 Invitar a un amigo
- `8` - ⚙️ Configuración general (en desarrollo)
- `9` - ℹ️ Ayuda
- `recordatorios` - Ver y completar recordatorios (comando rápido)
- `classroom` o `resumen classroom` - Abrir el módulo de Classroom desde cualquier parte
- `convertir 100 usd a ars` (o `50 eur a usd`, etc.) - Conversión directa
- `programar mensaje` - Programar un mensaje para enviar más tarde
- `mensajes programados` - Ver tus mensajes programados
- `cancelar mensaje [ID]` - Cancelar un mensaje programado
- `pronostico` - Ver pronóstico del tiempo (keyword global)
- `gastos` - Acceder a módulo de gastos (keyword global)
- `/feedback [mensaje]` - Enviar feedback
- `/bug [descripción]` - Reportar error

**En grupos de WhatsApp:**
- `/dividir` - Crear grupo de gastos
- `/gasto 5000 | Pizza | Juan` - Agregar gasto
- `/resumen` - Ver resumen de gastos
- `/calcular` - Calcular división de gastos
- `/ayuda` - Ver ayuda

### Ejemplos de Uso

**Pronóstico del tiempo:**
**Conversor de monedas:**
```
Usuario: convertir 150 usd a eur
Bot: 💱 Conversión de Moneda
     🔢 150,00 USD
     ➡️ 137,85 EUR
     💹 1 USD = 0,9190 EUR
```

```
Usuario: 1 (Pronóstico)
Bot: [Detectando ubicación automáticamente...]
Bot: ☀️ Pronóstico para Hoy - Mendoza, AR
     🌡️ Temperatura: 23°C
     💡 Recomendaciones:
     ☀️ Hace calor - No hace falta que lleves abrigo
```

**Crear evento:**
```
Usuario: 2 (Calendario)
Bot: [Menú de calendario]
Usuario: 2 (Agregar evento)
Usuario: Reunión cliente | mañana | 10:00 | trabajo
Bot: ✅ Evento agregado
```

**Crear recordatorio:**
```
Usuario: 2 (Calendario)
Usuario: 3 (Agregar recordatorio)
Usuario: Llamar a mamá
Bot: ⏰ Sin fecha detectada
     ¿Querés programar este recordatorio para un día específico?
Usuario: 2 (No, dejarlo sin fecha)
Bot: ✅ Recordatorio guardado
```

**Ver y completar recordatorios:**
```
Usuario: recordatorios
Bot: ⏰ Tus Recordatorios
     1. ⏰ Llamar a mamá
        📅 Sin fecha programada
     2. ⏰ Comprar leche
        📅 Lunes 15 de Noviembre 2025 - 10:00
Usuario: 2
Bot: ✅ Recordatorio completado
```

**Dividir gastos:**
```
Usuario: /dividir (en grupo)
Bot: [Grupo creado]
Usuario: /gasto 5000 | Carne | Juan
Usuario: /resumen
Bot: [Resumen de gastos]
```

**Programar mensaje:**
```
Usuario: programar mensaje
Bot: Perfecto Gustavo. Decime qué mensaje querés programar.
Usuario: Recordar llamar a Juan
Bot: Genial. ¿Cuándo querés que lo envíe?
Usuario: en 2 minutos
Bot: ✅ Mensaje programado (ID #1).
     📅 Se enviará el Jueves 13 de Noviembre 2025 - 11:55.
```

**Usar palabras clave globales:**
```
Usuario: pronostico
Bot: [Muestra pronóstico del tiempo directamente]
Usuario: gastos
Bot: [Abre módulo de gastos directamente]
```

**Ver mensajes programados:**
```
Usuario: mensajes programados
Bot: 📬 Tus mensajes programados
     #1 • Jueves 13 de Noviembre 2025 - 11:55
        Recordar llamar a Juan
     #2 • Viernes 14 de Noviembre 2025 - 09:00
        Reunión importante
```

## 📱 Desarrollo desde Móvil

¿Querés trabajar en el proyecto desde tu celular? Consultá [MOBILE_DEVELOPMENT.md](MOBILE_DEVELOPMENT.md) para ver todas las opciones disponibles.

**Recomendación rápida:** Usá [GitHub Codespaces](https://github.com/codespaces) para tener VS Code completo en el navegador desde cualquier dispositivo.

## 📁 Estructura del Proyecto

```
milobot/
├── index.js                 # Archivo principal
├── modules/
│   ├── calendar-module/      # Módulo de calendario completo
│   │   ├── index.js
│   │   ├── handlers.js
│   │   ├── database.js
│   │   ├── google.js
│   │   ├── notifications.js
│   │   ├── menus.js
│   │   ├── utils.js
│   │   └── README.md
│   ├── classroom-module/     # Módulo de resúmenes de Google Classroom
│   │   ├── index.js
│   │   ├── handlers.js
│   │   ├── service.js
│   │   ├── database.js
│   │   └── menus.js
│   └── weather-module/       # Módulo de pronóstico del tiempo
│       ├── index.js
│       ├── weather-api.js
│       └── database.js
├── data/
│   └── database.db          # Base de datos SQLite
├── run-migrations.js        # Script de migraciones de BD
├── package.json
├── README.md
└── ROADMAP.md               # Hoja de ruta del proyecto
```

## 🔧 Configuración Avanzada

### OpenWeatherMap (Pronóstico del Tiempo)
1. Ve a [OpenWeatherMap](https://openweathermap.org/api)
2. Crea una cuenta gratuita
3. Obtén tu API Key
4. Agrega `OPENWEATHER_API_KEY=tu_api_key` al archivo `.env`

**Nota:** Sin API Key, el bot puede detectar tu ubicación pero no mostrará el pronóstico completo.

### Google Calendar y Google Classroom
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto
3. Habilita **Google Calendar API** y **Google Classroom API**
4. Crea credenciales OAuth 2.0 (tipo aplicación web) y agrega las URLs de redirección necesarias
5. Agrega las credenciales al `.env`
6. Desde el bot, ve a *Calendario → Sync Google Calendar* o *Google Classroom → Conectar* para autorizar la cuenta

### Notificaciones
Las notificaciones se envían automáticamente X minutos antes de cada evento. Puedes configurar el tiempo en el menú de configuración del calendario.

## 🛠️ Tecnologías Utilizadas

- **whatsapp-web.js** - Cliente de WhatsApp
- **better-sqlite3** - Base de datos SQLite
- **@anthropic-ai/sdk** - IA con Claude
- **googleapis** - Integración con Google Calendar
- **OpenWeatherMap API** - Pronóstico del tiempo
- **node-cron** - Notificaciones programadas
- **dotenv** - Gestión de variables de entorno

## 📝 Licencia

MIT

## 👤 Autor

mendozaxmenos-create

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

Para reportar problemas o sugerencias, usa:
- `/bug [descripción]` en el bot
- `/sugerencia [idea]` en el bot
- O abre un issue en GitHub

---

**¡Disfruta usando Milo! 🤖**

