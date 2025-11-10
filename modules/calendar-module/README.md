# 📅 Módulo de Calendario - Milobot

## 🎯 Características

✅ Ver agenda de hoy
✅ Agregar eventos con lenguaje natural
✅ Próximos eventos (7, 15, 30 días)
✅ **Editar eventos**
✅ **Eliminar eventos**
✅ **Eventos recurrentes** (diario, semanal, mensual)
✅ **Notificaciones automáticas por WhatsApp**
✅ **Vista mensual**
✅ **Búsqueda de eventos**
✅ **Categorías** (Personal, Trabajo, Urgente, Familia)
✅ **Sincronización con Google Calendar**
✅ **Sistema híbrido de notificaciones** (WhatsApp + Google)

---

## 📦 Archivos del Módulo

```
modules/calendar/
├── index.js              # Punto de entrada
├── handlers.js           # Manejadores de mensajes (761 líneas)
├── database.js           # Funciones de BD (357 líneas)
├── menus.js              # Menús del módulo (230 líneas)
├── google.js             # Google Calendar API (362 líneas)
├── notifications.js      # Sistema de notificaciones (201 líneas)
├── utils.js              # Utilidades (228 líneas)
└── README.md             # Este archivo

Total: ~2,300 líneas de código
```

---

## 🚀 Instalación

### 1. Copiar Archivos

Copia todos los archivos a la carpeta `modules/calendar/` de tu bot:

```bash
# Windows
xcopy calendar-module\* C:\ruta\a\tu\bot\modules\calendar\ /E /I

# Linux/Mac
cp -r calendar-module/* /ruta/a/tu/bot/modules/calendar/
```

### 2. Modificar index.js Principal

Abre tu `index.js` principal y haz estos cambios:

#### A) Importar el módulo (línea ~12)

```javascript
const calendarModule = require('./modules/calendar');
```

#### B) Reemplazar manejador de calendario (línea ~827)

**ANTES:**
```javascript
else if (currentModule === 'calendar') {
  // ~50 líneas de código...
}
else if (currentModule === 'calendar_add') {
  // más código...
}
```

**DESPUÉS:**
```javascript
else if (currentModule === 'calendar' || currentModule.startsWith('calendar_')) {
  response = await calendarModule.handleCalendarMessage(
    msg,
    userPhone,
    userName,
    messageText,
    currentModule,
    session,
    db,
    client
  );
}
```

#### C) Eliminar funciones antiguas

**Elimina estas funciones:**
- `addEvent()` (línea ~173)
- `getTodayEvents()` (línea ~182)
- `getUpcomingEvents()` (línea ~193)
- `getCalendarMenu()` (línea ~437)

#### D) Iniciar servicio de notificaciones

**Al final del archivo, ANTES de `client.initialize()`:**

```javascript
// Iniciar servicio de notificaciones
calendarModule.startNotificationService(client, db);
console.log('🔔 Servicio de notificaciones iniciado');
```

### 3. Reiniciar el Bot

```bash
# Con PM2
pm2 restart milobot

# Sin PM2
node index.js
```

---

## 🧪 Probar el Módulo

### Test 1: Evento Simple

```
Usuario: hola
Bot: [Menú principal]

Usuario: 1
Bot: [Menú calendario]

Usuario: 2
Bot: [Instrucciones para agregar]

Usuario: Reunión cliente | mañana | 10:00 | trabajo
Bot: ✅ Evento agregado
```

### Test 2: Evento Recurrente

```
Usuario: 2
Bot: [Instrucciones]

Usuario: Gimnasio | lunes | 18:00 | personal
Bot: ¿Es recurrente?

Usuario: 3
Bot: ¿Hasta cuándo?

Usuario: 2025-12-31
Bot: ✅ Evento recurrente creado
```

### Test 3: Sincronización con Google

```
Usuario: 8
Bot: [URL de autenticación]

Usuario: [pega código de Google]
Bot: ✅ Conectado exitosamente
```

---

## 🔔 Sistema de Notificaciones

El módulo incluye un sistema automático de notificaciones que:

- Se ejecuta cada minuto
- Revisa eventos próximos
- Envía mensajes de WhatsApp X minutos antes
- Respeta las preferencias del usuario

### Configurar Notificaciones

```
Usuario: 1 → Calendario
Usuario: 7 → Configuración
Usuario: 1 → Notificaciones ON/OFF
Usuario: 2 → Tiempo de aviso
```

---

## ☁️ Google Calendar

### Características

- Sincronización automática de eventos nuevos
- Importar eventos existentes de Google
- Actualización bidireccional (local ↔ Google)
- Soporte para eventos recurrentes

### Autenticación

1. Usuario selecciona "Sync Google Calendar"
2. Bot genera URL de autenticación
3. Usuario autoriza en Google
4. Usuario envía código al bot
5. ✅ Conectado

### Sincronización Automática

Una vez conectado, todos los eventos nuevos se sincronizan automáticamente con Google Calendar.

---

## 📊 Funciones Principales

### database.js

- `addEvent()` - Agregar evento
- `getTodayEvents()` - Eventos de hoy
- `getUpcomingEvents()` - Próximos eventos
- `searchEvents()` - Buscar eventos
- `updateEvent()` - Editar evento
- `deleteEvent()` - Eliminar evento
- `getUserSettings()` - Configuración del usuario

### google.js

- `getAuthUrl()` - Generar URL de autenticación
- `createGoogleEvent()` - Crear evento en Google
- `updateGoogleEvent()` - Actualizar en Google
- `deleteGoogleEvent()` - Eliminar de Google
- `syncLocalToGoogle()` - Sincronizar locales → Google
- `importFromGoogle()` - Importar de Google → Local

### notifications.js

- `startService()` - Iniciar servicio
- `sendTestNotification()` - Enviar notificación de prueba
- `getNotificationStats()` - Estadísticas

### utils.js

- `parseNaturalDate()` - Parsear fechas naturales
- `parseTime()` - Parsear horas
- `formatDateForDisplay()` - Formatear fechas
- `validateCategory()` - Validar categorías

---

## 🎨 Categorías

- **Personal** 👤 - Eventos personales
- **Trabajo** 💼 - Reuniones, tareas laborales
- **Urgente** 🚨 - Eventos importantes
- **Familia** 👨‍👩‍👧‍👦 - Eventos familiares

---

## 🔧 Configuración Avanzada

### Cambiar Zona Horaria

En `google.js`, líneas 107 y 113:

```javascript
timeZone: 'America/Argentina/Mendoza'
```

### Cambiar Frecuencia de Notificaciones

En `notifications.js`, línea 17:

```javascript
cron.schedule('* * * * *', () => {  // Cada minuto
  checkAndSendNotifications();
});
```

### Personalizar Tiempo de Notificación por Defecto

En `database.js`, línea 10:

```javascript
notification_time: 15  // 15 minutos antes
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module './modules/calendar'"

```bash
# Verificar estructura
ls modules/calendar/

# Debe mostrar todos los archivos .js
```

### Error: "Google API not enabled"

1. Ve a Google Cloud Console
2. APIs y servicios → Biblioteca
3. Busca "Google Calendar API"
4. Clic en "Habilitar"

### Notificaciones no llegan

```bash
# Verificar que el servicio esté corriendo
pm2 logs milobot | grep "Servicio de notificaciones"

# Debe mostrar: ✅ Servicio de notificaciones iniciado
```

### Eventos no se sincronizan con Google

1. Verificar autenticación: Menú → 8
2. Verificar tokens en BD:
   ```sql
   SELECT * FROM google_auth_tokens WHERE user_phone = 'TU_TELEFONO';
   ```
3. Re-autenticar si es necesario

---

## 📈 Estadísticas

Ver estadísticas del módulo:

```javascript
const stats = calendarModule.notifications.getNotificationStats(db);
console.log(stats);
// { total_events: 25, sent: 10, pending: 15 }
```

---

## 🔄 Actualizaciones Futuras

Posibles mejoras:

- [ ] Adjuntar archivos a eventos
- [ ] Compartir eventos con otros usuarios
- [ ] Múltiples calendarios por usuario
- [ ] Integración con Outlook Calendar
- [ ] Recordatorios por email
- [ ] Vista semanal
- [ ] Exportar calendario a PDF

---

## 📞 Soporte

Para problemas o dudas:

1. Revisa los logs: `pm2 logs milobot`
2. Verifica la base de datos
3. Revisa este README

---

## 📝 Changelog

### v1.0.0 (09/11/2025)
- ✅ Implementación inicial completa
- ✅ Todas las funcionalidades básicas
- ✅ Sincronización con Google Calendar
- ✅ Sistema de notificaciones automáticas
- ✅ Eventos recurrentes
- ✅ Búsqueda y gestión de eventos

---

**¡Disfruta tu nuevo módulo de calendario! 📅**
