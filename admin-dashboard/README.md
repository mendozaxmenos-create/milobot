# 📊 Dashboard de Administración - Milo Bot

## Descripción

Panel web para visualizar estadísticas de uso del bot Milo. Incluye métricas de usuarios, eventos, gastos, conversiones de moneda, uso de IA, y más.

## Acceso al Dashboard

### Opción 1: Iniciar solo el dashboard
```bash
npm run dashboard
```

El dashboard estará disponible en: `http://localhost:3000`

### Opción 2: Iniciar bot y dashboard juntos
```bash
npm run start:all
```

Esto iniciará tanto el bot de WhatsApp como el dashboard web.

### Opción 3: Iniciar manualmente
```bash
# Terminal 1: Bot de WhatsApp
npm start

# Terminal 2: Dashboard
npm run dashboard
```

## Configuración

### Variables de Entorno

Agrega estas variables a tu archivo `.env`:

```env
# Puerto del dashboard (por defecto: 3000)
ADMIN_PORT=3000

# Contraseña para acceso al dashboard (opcional, para futuras implementaciones)
ADMIN_PASSWORD=milo123
```

## Funcionalidades

### 1. Resumen General
- Total de usuarios
- Usuarios activos (últimos 7 días)
- Total de eventos creados
- Total de gastos registrados
- Total de grupos de gastos
- Total de eventos trackeados

### 2. Estadísticas por Módulo
- Accesos a cada módulo (weather, calendar, expenses, classroom, ai, currency, invite, settings, help)
- Contador de eventos por módulo

### 3. Eventos Más Frecuentes
- Top 10 eventos más comunes
- Cantidad de usuarios únicos por evento

### 4. Usuarios Activos
- Lista de usuarios activos en los últimos 7 días
- Cantidad de eventos por usuario
- Última actividad

### 5. Estadísticas Diarias
- Eventos por día
- Usuarios únicos por día
- Eventos únicos por día

### 6. Filtros por Fecha
- Filtrar estadísticas por rango de fechas
- Aplicar filtros a todas las métricas

## Comandos de WhatsApp (Solo Admin)

### `/stats`
Muestra un resumen rápido de las estadísticas del bot.

### `/stats_modulos`
Muestra estadísticas desglosadas por módulo.

## API Endpoints

El dashboard expone las siguientes APIs:

- `GET /api/summary` - Resumen general
- `GET /api/stats/global` - Estadísticas globales
- `GET /api/stats/modules` - Estadísticas por módulo
- `GET /api/stats/active-users` - Usuarios activos
- `GET /api/stats/top-events` - Eventos más frecuentes
- `GET /api/stats/daily` - Estadísticas diarias
- `GET /api/stats/currency` - Estadísticas de conversión de moneda
- `GET /api/stats/retention` - Estadísticas de retención
- `GET /api/stats/user/:phone` - Estadísticas de un usuario específico

### Parámetros de Query

- `startDate` - Fecha de inicio (formato: YYYY-MM-DD)
- `endDate` - Fecha de fin (formato: YYYY-MM-DD)
- `days` - Número de días (para usuarios activos y estadísticas diarias)
- `limit` - Límite de resultados (para top eventos)

### Ejemplo de Uso

```bash
# Obtener estadísticas globales
curl http://localhost:3000/api/stats/global

# Obtener estadísticas de los últimos 30 días
curl http://localhost:3000/api/stats/global?startDate=2025-11-01&endDate=2025-11-30

# Obtener usuarios activos de los últimos 7 días
curl http://localhost:3000/api/stats/active-users?days=7

# Obtener top 10 eventos
curl http://localhost:3000/api/stats/top-events?limit=10
```

## Tracking de Eventos

Todos los módulos del bot tienen tracking automático. Los eventos se registran en la tabla `bot_usage_stats` con la siguiente estructura:

- `user_phone` - Teléfono del usuario
- `event_type` - Tipo de evento (ej: `weather_access`, `currency_conversion`, `calendar_event_created`)
- `event_data` - Datos adicionales del evento (JSON)
- `created_at` - Fecha y hora del evento

### Tipos de Eventos Trackeados

1. **Acceso a módulos**: `{module}_access` (ej: `weather_access`, `calendar_access`)
2. **Eventos creados**: `calendar_event_created`
3. **Gastos agregados**: `expense_added`
4. **Grupos creados**: `expense_group_created`
5. **Conversiones de moneda**: `currency_conversion`
6. **Consultas de clima**: `weather_query`
7. **Mensajes de IA**: `ai_message`
8. **Invitaciones enviadas**: `invite_sent`
9. **Feedback enviado**: `feedback_sent`
10. **Registro de usuarios**: `user_registered`

## Desarrollo

### Estructura de Archivos

```
admin-dashboard/
├── server.js          # Servidor Express
├── public/
│   └── index.html     # Interfaz web
└── README.md          # Esta documentación
```

### Agregar Nuevas Métricas

Para agregar nuevas métricas al dashboard:

1. Agregar función en `modules/stats-module/index.js`
2. Agregar endpoint en `admin-dashboard/server.js`
3. Agregar visualización en `admin-dashboard/public/index.html`

### Ejemplo: Agregar nueva métrica

```javascript
// En modules/stats-module/index.js
function getNewMetric(db, startDate, endDate) {
  // Tu lógica aquí
}

// En admin-dashboard/server.js
app.get('/api/stats/new-metric', (req, res) => {
  try {
    const stats = statsModule.getNewMetric(db, req.query.startDate, req.query.endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## Troubleshooting

### El dashboard no se inicia
- Verifica que el puerto 3000 no esté en uso
- Verifica que Express esté instalado: `npm install express`
- Verifica que la base de datos exista en `data/database.db`

### No se muestran estadísticas
- Verifica que el bot esté trackeando eventos
- Verifica que la tabla `bot_usage_stats` exista
- Verifica los logs del servidor para errores

### Error de conexión a la base de datos
- Verifica que la ruta de la base de datos sea correcta
- Verifica que la base de datos tenga permisos de lectura
- Verifica que el archivo `data/database.db` exista

## Seguridad

⚠️ **Importante**: Este dashboard no tiene autenticación implementada. Si planeas exponerlo públicamente, agrega autenticación y autorización.

### Recomendaciones de Seguridad

1. No exponer el dashboard públicamente sin autenticación
2. Usar HTTPS en producción
3. Implementar rate limiting
4. Validar todas las entradas del usuario
5. Usar variables de entorno para credenciales sensibles

## Próximas Mejoras

- [ ] Autenticación y autorización
- [ ] Gráficos interactivos (Chart.js)
- [ ] Exportación de datos (CSV, PDF)
- [ ] Filtros avanzados
- [ ] Comparativas temporales
- [ ] Alertas y notificaciones
- [ ] Dashboard móvil responsive
- [ ] Real-time updates (WebSockets)

## Soporte

Para reportar problemas o sugerir mejoras, contacta al administrador del bot.

