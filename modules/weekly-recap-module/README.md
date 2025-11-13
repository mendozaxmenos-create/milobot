# 📊 Módulo de Recap Semanal

Módulo para enviar recaps semanales automáticos a los usuarios activos de Milo.

## 🎯 Funcionalidades

- **Recaps semanales automáticos**: Envío automático cada lunes a las 9:00 AM (zona horaria configurable)
- **Detección de cambios**: Solo envía recaps si hubo actividad o cambios desde el último envío
- **Resumen de actividad**: Incluye eventos creados, gastos agregados, grupos creados y próximos eventos
- **Mensajes motivadores**: Tips aleatorios sobre cómo usar Milo
- **Configuración por usuario**: Los usuarios pueden habilitar/deshabilitar recaps

## 📋 Estructura

```
weekly-recap-module/
├── database.js    # Funciones de base de datos
├── service.js     # Servicio de cron y lógica de recaps
├── index.js       # Exportaciones del módulo
└── README.md      # Este archivo
```

## 🗄️ Base de Datos

### Tabla: `weekly_recaps`

```sql
CREATE TABLE IF NOT EXISTS weekly_recaps (
  user_phone TEXT PRIMARY KEY,
  last_sent_at DATETIME,
  last_activity_hash TEXT,
  enabled INTEGER DEFAULT 1,
  FOREIGN KEY (user_phone) REFERENCES users(phone)
);
```

## 📊 Actividad Rastreada

El módulo rastrea:
- **Eventos creados**: Eventos del calendario creados en la última semana
- **Gastos agregados**: Gastos registrados en grupos de gastos
- **Grupos creados**: Grupos de gastos creados
- **Próximos eventos**: Eventos programados para los próximos 7 días

## 🔧 Configuración

### Iniciar servicio

```javascript
const weeklyRecapModule = require('./modules/weekly-recap-module');

// Iniciar servicio (se ejecuta automáticamente cada lunes a las 9:00 AM)
weeklyRecapModule.startService(client, db);
```

### Configurar zona horaria

En `service.js`, línea 45:
```javascript
timezone: 'America/Argentina/Buenos_Aires'
```

### Cambiar frecuencia

En `service.js`, línea 43:
```javascript
// Ejecutar cada lunes a las 9:00 AM
// Formato cron: minuto hora día-mes mes día-semana
// 0 9 * * 1 = Lunes 9:00 AM
recapJob = cron.schedule('0 9 * * 1', async () => {
  // ...
});
```

## 📝 Lógica de Envío

El módulo envía recaps cuando:

1. **Hay actividad nueva**: Eventos, gastos o grupos creados en la última semana
2. **Hubo cambios**: El hash de actividad es diferente al último envío
3. **Es necesario mantener engagement**: Si pasaron más de 14 días sin actividad, se envía un recap de todos modos

El módulo **NO** envía recaps cuando:

1. El usuario tiene recaps deshabilitados
2. No hay actividad y ya se envió un recap hace menos de 14 días
3. No hay actividad y es la primera vez (espera a que haya actividad)

## 🧪 Testing

### Enviar recap manual

```javascript
const weeklyRecapModule = require('./modules/weekly-recap-module');

// Enviar recap a un usuario específico
const result = await weeklyRecapModule.sendManualRecap('5492615176403');
if (result.success) {
  console.log('Recap enviado correctamente');
} else {
  console.error('Error:', result.error);
}
```

## 📊 Ejemplo de Mensaje

```
📊 Resumen Semanal de Milo

¡Hola Gustavo! 👋

Te resumo tu actividad de esta semana:

📅 3 eventos creados
💰 5 gastos registrados (Total: $12,500.00)
👥 2 grupos de gastos creados
⏰ 4 eventos próximos esta semana

💡 ¿Sabías que...?

Podés crear eventos directamente desde WhatsApp usando lenguaje natural 🗓️

💬 Escribí hola o menu para seguir usando Milo.
```

## 🔄 Próximas Mejoras

- [ ] Agregar opción en menú de configuración para habilitar/deshabilitar recaps
- [ ] Incluir actividad de Classroom en el recap
- [ ] Agregar estadísticas de uso del bot
- [ ] Personalizar frecuencia de recaps por usuario
- [ ] Agregar gráficos o visualizaciones en el recap

