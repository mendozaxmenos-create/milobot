# 📊 Dashboard de Estadísticas - Configuración

## ¿Puedo correr el bot y el dashboard al mismo tiempo?

**Sí, puedes correr ambos al mismo tiempo.** De hecho, el dashboard está diseñado para ejecutarse en el mismo proceso que el bot, así que puedes acceder a las estadísticas mientras el bot está corriendo.

## Configuración

### Opción 1: Dashboard integrado (Recomendado)

El dashboard se inicia automáticamente cuando el bot se ejecuta, si tienes la variable `ADMIN_PORT` o `ENABLE_DASHBOARD` configurada.

1. **Agregar variable de entorno al archivo `.env`:**
```env
# Puerto del dashboard (por defecto: 3000)
ADMIN_PORT=3000

# O alternativamente, habilitar el dashboard
ENABLE_DASHBOARD=true
```

2. **Iniciar el bot:**
```bash
npm start
```

3. **Acceder al dashboard:**
```
http://localhost:3000
```

El dashboard se ejecutará en el mismo proceso que el bot, por lo que puedes acceder a las estadísticas mientras el bot está corriendo.

### Opción 2: Dashboard separado

Si prefieres ejecutar el dashboard en un proceso separado:

1. **Terminal 1: Bot de WhatsApp**
```bash
npm start
```

2. **Terminal 2: Dashboard**
```bash
npm run dashboard
```

3. **Acceder al dashboard:**
```
http://localhost:3000
```

### Opción 3: Ambos juntos (con concurrently)

Si tienes `concurrently` instalado, puedes ejecutar ambos con un solo comando:

```bash
npm run start:all
```

## Estadísticas Geográficas

El dashboard ahora incluye estadísticas por ubicación geográfica:

- **Estadísticas por País**: Distribución de usuarios y eventos por país
- **Estadísticas por Ciudad**: Top ciudades con más usuarios y eventos
- **Estadísticas por Región**: Distribución por país/estado
- **Distribución de Usuarios**: Cantidad de usuarios por país

### Datos Geográficos

Los datos geográficos se obtienen de:
- Ubicación guardada por el usuario (cuando usa el módulo de clima)
- País detectado automáticamente (para la moneda base)
- Ciudad detectada por IP (cuando el usuario consulta el clima)

### Visualización

El dashboard muestra:
- Resumen geográfico (usuarios con/sin ubicación, países únicos, ciudades únicas)
- Top 5 países con más usuarios
- Top 5 ciudades con más usuarios
- Tabla completa de países
- Tabla completa de ciudades (top 20)

## Funcionalidades del Dashboard

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

### 6. Estadísticas Geográficas
- Usuarios con/sin ubicación
- Países únicos
- Ciudades únicas
- Top 5 países
- Top 5 ciudades
- Tabla completa de países
- Tabla completa de ciudades

### 7. Filtros por Fecha
- Filtrar estadísticas por rango de fechas
- Aplicar filtros a todas las métricas

## Comandos de WhatsApp (Solo Admin)

### `/stats`
Muestra un resumen rápido de las estadísticas del bot directamente en WhatsApp.

### `/stats_modulos`
Muestra estadísticas desglosadas por módulo.

## Troubleshooting

### El dashboard no se inicia
- Verifica que Express esté instalado: `npm install express`
- Verifica que el puerto 3000 no esté en uso
- Verifica que la variable `ADMIN_PORT` esté configurada en `.env`

### No se muestran estadísticas geográficas
- Verifica que los usuarios tengan ubicación guardada
- Verifica que la tabla `users` tenga las columnas de ubicación
- Ejecuta las migraciones: `node run-migrations.js`

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
- [ ] Mapa interactivo de usuarios

