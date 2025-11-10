# 🤖 Milo - Bot Asistente Personal para WhatsApp

Bot inteligente de WhatsApp con funcionalidades de calendario, gestión de gastos e IA integrada.

## ✨ Características

### 📅 Módulo de Calendario
- ✅ Ver agenda de hoy
- ✅ Agregar eventos con lenguaje natural
- ✅ Próximos eventos (7, 15, 30 días)
- ✅ Editar y eliminar eventos
- ✅ Eventos recurrentes (diario, semanal, mensual)
- ✅ Notificaciones automáticas por WhatsApp
- ✅ Vista mensual
- ✅ Búsqueda de eventos
- ✅ Categorías (Personal, Trabajo, Urgente, Familia)
- ✅ Sincronización con Google Calendar

### 💰 Módulo de Gastos
- ✅ Crear grupos de gastos
- ✅ Agregar gastos compartidos
- ✅ Cálculo automático de deudas
- ✅ División optimizada de pagos
- ✅ Funciona en grupos de WhatsApp
- ✅ Resumen de gastos

### 🤖 Asistente IA
- ✅ Integración con Claude (Anthropic)
- ✅ Procesamiento de lenguaje natural
- ✅ Conversación contextual

### 📝 Sistema de Feedback
- ✅ Reportar bugs
- ✅ Enviar sugerencias
- ✅ Panel de administración

## 🚀 Instalación

### Requisitos
- Node.js >= 18.0.0
- Cuenta de WhatsApp
- (Opcional) API Key de Anthropic para IA
- (Opcional) Credenciales de Google Calendar

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
ANTHROPIC_API_KEY=tu_api_key_aqui
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
- `1` - Calendario & Recordatorios
- `2` - Dividir Gastos
- `3` - Asistente IA
- `/feedback [mensaje]` - Enviar feedback
- `/bug [descripción]` - Reportar error

**En grupos de WhatsApp:**
- `/dividir` - Crear grupo de gastos
- `/gasto 5000 | Pizza | Juan` - Agregar gasto
- `/resumen` - Ver resumen de gastos
- `/calcular` - Calcular división de gastos
- `/ayuda` - Ver ayuda

### Ejemplos de Uso

**Crear evento:**
```
Usuario: 1 (Calendario)
Bot: [Menú de calendario]
Usuario: 2 (Agregar evento)
Usuario: Reunión cliente | mañana | 10:00 | trabajo
Bot: ✅ Evento agregado
```

**Dividir gastos:**
```
Usuario: /dividir (en grupo)
Bot: [Grupo creado]
Usuario: /gasto 5000 | Carne | Juan
Usuario: /resumen
Bot: [Resumen de gastos]
```

## 📁 Estructura del Proyecto

```
milobot/
├── index.js                 # Archivo principal
├── modules/
│   └── calendar-module/     # Módulo de calendario completo
│       ├── index.js
│       ├── handlers.js
│       ├── database.js
│       ├── google.js
│       ├── notifications.js
│       ├── menus.js
│       ├── utils.js
│       └── README.md
├── data/
│   └── database.db         # Base de datos SQLite
├── package.json
└── README.md
```

## 🔧 Configuración Avanzada

### Google Calendar
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto
3. Habilita Google Calendar API
4. Crea credenciales OAuth 2.0
5. Agrega las credenciales al `.env`

### Notificaciones
Las notificaciones se envían automáticamente X minutos antes de cada evento. Puedes configurar el tiempo en el menú de configuración del calendario.

## 🛠️ Tecnologías Utilizadas

- **whatsapp-web.js** - Cliente de WhatsApp
- **better-sqlite3** - Base de datos
- **@anthropic-ai/sdk** - IA con Claude
- **googleapis** - Integración con Google Calendar
- **node-cron** - Notificaciones programadas

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

