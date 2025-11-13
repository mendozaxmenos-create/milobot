# 📊 Dashboard de Estadísticas - Guía de Acceso

## Cómo Acceder al Dashboard

### 1. Instalar Express (si no está instalado)

```bash
npm install express
```

### 2. Iniciar el Dashboard

#### Opción A: Solo el Dashboard
```bash
npm run dashboard
```

#### Opción B: Bot y Dashboard juntos
```bash
npm run start:all
```

### 3. Acceder al Dashboard

Abre tu navegador web y ve a:
```
http://localhost:3000
```

## Comandos de WhatsApp (Solo Admin)

### `/stats`
Muestra un resumen rápido de las estadísticas del bot directamente en WhatsApp.

**Ejemplo de respuesta:**
```
📊 Estadísticas del Bot

👥 Usuarios:
   Total: 25
   Activos (7 días): 15

📅 Eventos: 120
💰 Gastos: 45
👥 Grupos: 8
📊 Eventos trackeados: 350

📈 Top 5 Eventos:
   1. calendar_access: 45 (12 usuarios)
   2. currency_conversion: 38 (8 usuarios)
   3. weather_query: 32 (10 usuarios)
   4. expense_added: 28 (6 usuarios)
   5. ai_message: 25 (5 usuarios)

📊 Dashboard Web:
   http://localhost:3000

💡 Usa /stats_modulos para ver estadísticas por módulo
```

### `/stats_modulos`
Muestra estadísticas desglosadas por módulo.

**Ejemplo de respuesta:**
```
📊 Estadísticas por Módulo

   calendar: 45
   currency: 38
   weather: 32
   expenses: 28
   ai: 25
   classroom: 15
   invite: 8
   settings: 5
   help: 3

💡 Usa /stats para ver resumen general
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

## Funcionalidades del Dashboard Web

### 1. Resumen General
- Total de usuarios
- Usuarios activos (últimos 7 días)
- Total de eventos creados
- Total de gastos registrados
- Total de grupos de gastos
- Total de eventos trackeados

### 2. Estadísticas por Módulo
- Accesos a cada módulo
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

## Tracking Automático

Todos los módulos del bot tienen tracking automático. Los eventos se registran automáticamente cuando:

1. **Usuario accede a un módulo**: Se registra `{module}_access`
   - Ejemplo: `weather_access`, `calendar_access`, `expenses_access`

2. **Usuario crea un evento**: Se registra `calendar_event_created`

3. **Usuario agrega un gasto**: Se registra `expense_added`

4. **Usuario crea un grupo de gastos**: Se registra `expense_group_created`

5. **Usuario convierte moneda**: Se registra `currency_conversion`

6. **Usuario consulta clima**: Se registra `weather_query`

7. **Usuario usa IA**: Se registra `ai_message`

8. **Usuario envía invitación**: Se registra `invite_sent`

9. **Usuario envía feedback**: Se registra `feedback_sent`

10. **Usuario se registra**: Se registra `user_registered`

## Verificación de Tracking

Para verificar que el tracking esté funcionando:

1. Abre el dashboard web
2. Usa el comando `/stats` en WhatsApp
3. Revisa las estadísticas en el dashboard

## Troubleshooting

### El dashboard no se inicia
- Verifica que Express esté instalado: `npm install express`
- Verifica que el puerto 3000 no esté en uso
- Verifica que la base de datos exista en `data/database.db`

### No se muestran estadísticas
- Verifica que el bot esté trackeando eventos
- Verifica que la tabla `bot_usage_stats` exista
- Ejecuta las migraciones: `node run-migrations.js`

### Error de conexión a la base de datos
- Verifica que la ruta de la base de datos sea correcta
- Verifica que la base de datos tenga permisos de lectura
- Verifica que el archivo `data/database.db` exista

## Próximas Mejoras

- [ ] Autenticación y autorización
- [ ] Gráficos interactivos
- [ ] Exportación de datos (CSV, PDF)
- [ ] Filtros avanzados
- [ ] Comparativas temporales
- [ ] Alertas y notificaciones
- [ ] Dashboard móvil responsive
- [ ] Real-time updates

## Soporte

Para reportar problemas o sugerir mejoras, contacta al administrador del bot.

