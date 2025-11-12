# 🌤️ Módulo de Clima

Este módulo proporciona pronósticos del tiempo con recomendaciones inteligentes.

## Configuración

Para usar este módulo, necesitas una API key de OpenWeatherMap:

1. Regístrate en [OpenWeatherMap](https://openweathermap.org/api)
2. Obtén tu API key gratuita
3. Configura la variable de entorno:

```bash
export OPENWEATHER_API_KEY=tu_api_key_aqui
```

O en Windows:
```cmd
set OPENWEATHER_API_KEY=tu_api_key_aqui
```

## Funcionalidades

- Pronóstico del tiempo para hoy
- Detección automática de ubicación (se guarda la primera vez)
- Recomendaciones inteligentes basadas en:
  - Temperatura (calor, frío, etc.)
  - Lluvia (recordatorio de paraguas)
  - Viento (advertencias de viento fuerte)
  - Humedad
  - Condiciones soleadas (protección solar)

## Uso

1. Selecciona la opción **1️⃣ 🌤️ Pronóstico para hoy** del menú principal
2. Si es la primera vez, escribe el nombre de tu ciudad
3. El bot guardará tu ubicación y te mostrará el pronóstico con recomendaciones

