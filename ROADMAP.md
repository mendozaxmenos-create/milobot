# 🗺️ Hoja de Ruta - Milo Bot

**Versión Actual:** v1.2.0  
**Última Actualización:** 13 de noviembre de 2025 (actualizado con requisitos ARCA)

---

## 📊 Estado Actual del Proyecto

### ✅ Funcionalidades Implementadas

#### 📅 Módulo de Calendario (Completo)
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

#### 💰 Módulo de Gastos (Completo)
- ✅ Crear grupos de gastos
- ✅ Agregar gastos compartidos
- ✅ Cálculo automático de deudas
- ✅ División optimizada de pagos
- ✅ Funciona en grupos de WhatsApp
- ✅ Resumen de gastos
- ✅ Agregar participantes (manual y por contacto)
- ✅ Cuentas bancarias y alias
- ✅ Registro de pagos realizados
- ✅ Mostrar alias bancarios en transferencias

#### 🤖 Asistente IA (Básico)
- ✅ Integración con Claude (Anthropic)
- ✅ Procesamiento de lenguaje natural
- ✅ Conversación contextual
- ✅ Detección de intenciones (calendario/gastos)

#### 💱 Conversor de Monedas (Nuevo)
- ✅ Conversión directa con comandos naturales (`convertir 150 usd a ars`)
- ✅ Sugerencias inteligentes según ubicación y moneda base
- ✅ Conversión simultánea a múltiples monedas objetivo
- ✅ Configuración de moneda base por usuario (`base ARS`)
- ✅ Detección automática de moneda local desde el módulo de clima

#### 📝 Sistema de Feedback
- ✅ Reportar bugs
- ✅ Enviar sugerencias
- ✅ Panel de administración básico

#### 🔧 Infraestructura
- ✅ Base de datos SQLite
- ✅ Sistema de sesiones
- ✅ Timeout de inactividad (5 min)
- ✅ Manejo de grupos de WhatsApp
- ✅ Sistema de usuarios
- ✅ Estadísticas de uso del bot (bot_usage_stats)
- ✅ Sistema de invitaciones (user_invites)

#### 🏫 Google Classroom (Nuevo)
- ✅ Integración con OAuth
- ✅ Sincronización de cursos
- ✅ Ver tareas pendientes
- ✅ Ver anuncios
- ✅ Resumen de actividad por cuenta
- ✅ Soporte multi-cuentas

#### 🔔 Recordatorios Automáticos (Nuevo)
- ✅ Notificaciones automáticas 24h y 1h antes de eventos
- ✅ Notificaciones a dueños e invitados
- ✅ Preferencias por usuario (habilitar/deshabilitar)
- ✅ Logging completo de recordatorios enviados
- ✅ Servicio automático que verifica eventos cada 15 minutos

#### 🗓️ Mensajes Programados (Nuevo)
- ✅ Programar mensajes para enviar en fecha/hora específica
- ✅ Lenguaje natural: "en 2 minutos", "mañana 10:00", "hoy 11:45 am"
- ✅ Límites diarios anti-spam con advertencias personalizadas
- ✅ Listar y cancelar mensajes programados
- ✅ Sincronización automática con timezone del usuario
- ✅ Scheduler automático que envía mensajes en tiempo real

#### ⌨️ Palabras Clave Globales (Nuevo)
- ✅ Acceso rápido a módulos desde cualquier menú
- ✅ Keywords: "pronostico", "gastos", "calendario", "programar mensaje", etc.
- ✅ Guía amigable de keywords en mensaje de bienvenida

#### 📍 Detección Inteligente de Ubicación (Nuevo)
- ✅ Detección automática por IP con sugerencia al usuario
- ✅ Confirmación antes de guardar ubicación (previene errores)
- ✅ Sincronización de timezone desde ubicación detectada
- ✅ Sugerencia de ubicación cada vez que se accede al módulo de clima

---

## 🎯 Roadmap por Fases

### 🚀 FASE 1: Mejoras y Optimizaciones (Q1 2025)
**Prioridad: Alta | Estimación: 4-6 semanas**

#### 💰 Gastos & Finanzas
- [x] **Completar módulo de gastos** (EPIC 1)
  - ✅ Agregar/editar participantes con validaciones
  - ✅ Registro de gastos, resúmenes y división optimizada
  - ✅ Funciona en grupos de WhatsApp
  - ⏳ Cierre de grupos + sharing en WhatsApp - Pendiente
- [x] **Pagos registrados y datos bancarios**
  - ✅ Capturar cuentas bancarias de cada usuario (alias)
  - ✅ Marcar pagos como realizados y reflejarlos en los cálculos
  - ✅ Mostrar alias bancarios en todas las transferencias

#### 📅 Calendario & Recordatorios
- [ ] **Gestión completa de agenda**
  - Editar/eliminar eventos, vistas semanal/mensual y búsqueda avanzada
  - Enviar invitaciones individuales y agenda "Hoy" desde comando
- [x] **Recordatorios automáticos** ✅
  - ✅ Jobs cada 15 minutos, avisos 24h y 1h antes del evento
  - ✅ Notificaciones a dueños e invitados
  - ✅ Preferencias por usuario (habilitar/deshabilitar)
  - ✅ Logging completo de recordatorios enviados
  - ⏳ Recordatorios recurrentes y personalización por tipo - Pendiente
- [x] **Envíos programados de WhatsApp** ✅
  - ✅ Programación única con lenguaje natural
  - ✅ Listados y cancelación de mensajes programados
  - ✅ Límites diarios anti-spam con advertencias personalizadas
  - ✅ Sincronización de timezone del usuario
  - ✅ Scheduler automático que envía mensajes en tiempo real
  - ⏳ Mensajes recurrentes - Pendiente
- [ ] **Interpretación de imágenes para eventos** *(Nuevo)*
  - Subir imagen en el módulo de eventos y que el bot la interprete
  - Extraer fecha, hora y descripción de la imagen usando IA (Claude Vision)
  - Mostrar datos extraídos para confirmación previa
  - Permitir modificación de fecha, hora y descripción antes de confirmar
  - Agregar evento al calendario después de confirmación

#### 🌤️ Clima & Monedas
- [x] **Clima diario con ubicación inteligente** ✅
  - ✅ Detección automática por IP con sugerencia al usuario
  - ✅ Confirmación antes de guardar ubicación (previene errores)
  - ✅ Sincronización de timezone desde ubicación detectada
  - ✅ Sugerencia de ubicación cada vez que se accede al módulo
  - ⏳ Pronóstico extendido (7 días) - Pendiente
  - ⏳ Alertas si llueve o si cambia drásticamente la temperatura - Pendiente
- [ ] **Conversor de monedas avanzado**
  - Historial de tasas, configuración de moneda base y destinos preferidos

#### 🤖 IA y Automatización
- [x] **Palabras clave globales (shortcuts)** ✅
  - ✅ Acceso rápido a módulos desde cualquier menú
  - ✅ Keywords: "pronostico", "gastos", "calendario", "programar mensaje", etc.
  - ✅ Guía amigable de keywords en mensaje de bienvenida
- [ ] **Integración profunda con módulos existentes**
  - Crear eventos y gastos vía IA, comandos de voz frecuentes
- [x] **Recap semanal automático**
  - ✅ Enviar listado de novedades solo si hubo cambios
  - ✅ Resumen de actividad semanal (eventos, gastos, grupos)
  - ✅ Mensajes motivadores con tips aleatorios
  - ✅ Detección de cambios mediante hash de actividad
  - ⏳ Configuración por usuario (habilitar/deshabilitar recaps) - Pendiente

#### 🔧 Infraestructura
- [x] **Sistema de timezone** ✅
  - ✅ Detección y almacenamiento de timezone por usuario
  - ✅ Conversión automática de fechas/horas según ubicación
  - ✅ Sincronización en mensajes programados y recordatorios
- [ ] **Logs y manejo de errores**
  - Logs estructurados, rotación y alertas para fallas críticas
- [ ] **Optimización de base de datos**
  - Índices claves, consultas optimizadas y backups diarios
- [x] **Panel de administración (versión inicial)** ✅
  - ✅ Dashboard web accesible con métricas clave (MAU, retención, funciones usadas)
  - ✅ Estadísticas de uso del bot (bot_usage_stats)
  - ✅ Usuarios activos y eventos por tipo
  - ⏳ Exportación básica (CSV/Excel) de métricas visibles - Pendiente
  - ⏳ Acceso remoto al dashboard (no solo localhost) - Pendiente
  - ⏳ Autenticación y seguridad para acceso remoto - Pendiente
  - ⏳ Gestión de usuarios: cambiar nivel (Free/Premium) desde el dashboard - Pendiente
- [ ] **Hosting y despliegue en la nube**
  - Configuración para servicios como Railway, Render, Fly.io, DigitalOcean
  - Variables de entorno y configuración de producción
  - Monitoreo y logs en la nube
  - Backup automático de base de datos
  - Escalabilidad horizontal (múltiples instancias)

---

### 🌟 FASE 2: Nuevas Funcionalidades (Q2 2025)
**Prioridad: Media-Alta | Estimación: 6-8 semanas**

#### 📚 Integraciones educativas & productividad
- [x] **Google Classroom + multi-hijos**
  - ✅ OAuth implementado
  - ✅ Caché de cursos y comandos (`/hoy`, `/semana`, pendientes por hijo)
  - ✅ Sincronización de cursos, anuncios y tareas
  - ⏳ Notificaciones automáticas cuando llega contenido nuevo - Pendiente
  - ⏳ Soporte multi-hijos completo - Pendiente
- [ ] **Google Calendar bidireccional**
  - Conectar cuentas, sincronizar bot→Google y Google→bot
  - Comando rápido “Agenda para hoy” y gestión de conflictos
- [ ] **Notas rápidas y To-Do list**
  - Crear/listar/eliminar notas por texto
  - Tareas con prioridad, estados, recurrencias y recordatorios inteligentes

#### 🗺️ Contexto & desplazamientos
- [ ] **Localización y tiempos de viaje**
  - Capturar ubicación GPS, calcular tiempos y alertas de salida
  - Integrar con eventos del calendario y clima
- [ ] **Comparador de precios con referidos**
  - Búsqueda multi-sitio, favoritos, tracking diario y alertas de baja
  - Generar links/códigos de referencia para monetizar compras

#### 🎭 Entretenimiento y cultura
- [ ] **Cartelera de películas y espectáculos**
  - Definir complejos, ciudades y categorías favoritas
  - Consultar grillas de cine/teatro/conciertos y enviar recordatorios
  - Integrar con calendario para agendar funciones seleccionadas
  - Buscar películas en cartelera por nombre, género o fecha
  - Mostrar horarios, salas y disponibilidad de entradas
  - Recordatorios de estrenos y funciones próximas
  - Recomendaciones personalizadas basadas en preferencias del usuario

#### 💰 Finanzas personales
- [ ] **Presupuestos y categorías de gastos**
  - Límites por grupo, reportes por categoría y gráficos
- [ ] **Historial y reapertura de grupos**
  - Reabrir grupos cerrados, duplicar configuración y auditoría
- [ ] **Portfolio financiero básico**
  - Registrar activos con fecha/cotización y balance con iconografía (↑/↓)
- [ ] **Conversión desde precio detectado**
  - Tomar una foto del precio (cartel/factura) y reconocer el importe
  - Ofrecer conversiones instantáneas dentro del menú de monedas
  - Reutilizar OCR/visión para leer el valor y sugerir divisas objetivo

#### ❤️ Salud y bienestar
- [ ] **Recordatorio inteligente de medicación**
  - Escanear código de barras para identificar medicamento y posología
  - Configurar cantidad de comprimidos, frecuencia y duración del tratamiento
  - Alertas de toma, reposición de stock y seguimiento de adherencia

#### 📣 Crecimiento & comunidad
- [ ] **Invitar amigos al bot**
  - Enviar invitaciones personalizadas con enlaces o códigos QR
  - Seguimiento de invitaciones aceptadas y beneficios por referidos
  - Recompensa: acceso “all access” cuando supere X amigos activos (definir umbral)
  - Requiere catálogo claro de funcionalidades premium vs. libre

#### 🤖 Automatización & comunicación
- [ ] **Resúmenes automáticos y proactivos**
  - Resumen semanal/mensual de actividades y gastos
  - Sugerencias predictivas basadas en hábitos
- [ ] **Motor de respuestas rápidas**
  - Configurar, listar y editar respuestas por keyword

#### 🛍️ Operaciones comerciales
- [ ] **Suite comercial (presupuestos & turnos)**
  - Circuito completo estilo MonPatisserie: cotizaciones, aprobaciones y recordatorios
  - Gestión de turnos/agenda por rubro con confirmaciones automáticas
  - Historial por cliente, observaciones y seguimiento de estados

---

### 💎 FASE 3: Sistema Premium (Q3 2025)
**Prioridad: Media | Estimación: 4-6 semanas**

#### ⭐ Monetización y servicios premium
- [ ] **Sistema de suscripciones**
  - Planes (Básico / Premium / Pro) con Stripe o MercadoPago
  - Controles de acceso (`is_premium`) y checkout in-app
  - ⏳ Links de pago para plan mensual y anual - Pendiente
  - ⏳ Integración con pasarelas de pago (MercadoPago/Stripe) - Pendiente
  - ⏳ Webhook para confirmar pagos y activar Premium automáticamente - Pendiente
- [ ] **Catálogo de beneficios premium vs all-access**
  - Definir features exclusivas y cuáles pasan a “all access” por referidos
- [ ] **Portfolio financiero avanzado**
  - Evolución histórica, alertas de stop-loss/gain y KPIs visuales
- [ ] **Gamificación**
  - Sistema de puntos, logros/medallas y rachas de uso

#### 🎥 Experiencias enriquecidas
- [ ] **Soporte multimedia completo**
  - Enviar imágenes/archivos, procesar fotos (OCR/facturas) y transcribir audios
  - Generar códigos QR y crear recordatorios desde voice notes
- [ ] **Facturación automatizada (ARCA)** ⏳
  - **Requisitos técnicos:**
    - Integración con servicios web SOAP de ARCA (Web Service de Facturación Electrónica)
    - Certificados digitales ARCA (certificado.pem y clave privada.key)
    - CUIT del emisor registrado en ARCA
    - Configuración de punto de venta (PtoVta)
    - Entorno de prueba (homologación) y producción
  - **Funcionalidades del menú:**
    - Acceso desde menú principal: "Facturación" o "ARCA"
    - Flujo conversacional para crear factura:
      1. Seleccionar tipo de comprobante (Factura A, B, C, etc.)
      2. Ingresar datos del cliente (CUIT/DNI, razón social, dirección)
      3. Agregar conceptos/productos (descripción, cantidad, precio unitario, IVA)
      4. Revisar resumen de la factura
      5. Confirmar y generar comprobante
    - Generación de CAE (Código de Autorización Electrónico) vía API ARCA
    - Generación de PDF del comprobante
    - Envío automático del PDF al usuario/cliente por WhatsApp
    - Almacenamiento de facturas generadas en base de datos
    - Historial de facturas emitidas con búsqueda y filtros
  - **Datos requeridos para facturación:**
    - **Emisor (configuración única por usuario):**
      - CUIT
      - Razón social
      - Domicilio fiscal
      - Condición frente a IVA
      - Punto de venta (PtoVta)
      - Certificados ARCA (almacenados de forma segura)
    - **Por cada factura:**
      - Tipo de comprobante (Factura A, B, C, Nota de Crédito, etc.)
      - Tipo y número de documento del cliente (CUIT, DNI, etc.)
      - Razón social del cliente
      - Domicilio del cliente
      - Concepto (productos/servicios)
      - Cantidad, precio unitario, IVA
      - Fecha de emisión
  - **Consideraciones técnicas:**
    - Implementar cliente SOAP en Node.js (usar `soap` o `axios` con SOAP)
    - Manejo de tokens de autenticación ARCA (renovación automática)
    - Validación de datos antes de enviar a ARCA
    - Manejo de errores y códigos de respuesta de ARCA
    - Almacenamiento seguro de certificados (encriptados)
    - Logging de todas las operaciones de facturación
    - Soporte para ambiente de prueba (homologación) y producción
  - **Base de datos:**
    - Tabla `arca_config` (configuración por usuario: CUIT, certificados, PtoVta)
    - Tabla `invoices` (facturas generadas: CAE, número, fecha, cliente, monto, PDF path)
    - Tabla `invoice_items` (detalle de conceptos por factura)
  - **Seguridad:**
    - Encriptación de certificados y claves privadas
    - Validación de permisos (solo usuarios autorizados pueden facturar)
    - Auditoría de operaciones de facturación
    - Cumplimiento con normativas AFIP

#### 🛠️ Plataforma & WhatsApp Business
- [ ] **Migración a WhatsApp Business API**
  - Mensajes de bienvenida/ausencia, plantillas oficiales y dominios verificados
- [ ] **Panel web para administradores (versión 1)**
  - Dashboard en navegador con métricas y gestión (usuarios/eventos/recordatorios)
  - Exportaciones avanzadas (CSV, PDF) y filtros por fecha/módulo
- [ ] **Configuración avanzada desde web**
  - Cambiar menús, textos y API keys sin tocar código

#### 📊 Analytics e insights
- [ ] **Panel de estadísticas premium**
  - Uso por módulo, mapas de calor de horarios y descargas PDF/Excel
- [ ] **Insights inteligentes**
  - Patrones de gastos, recomendaciones personalizadas y predicciones

---

### 🔮 FASE 4: Expansión y Escalabilidad (Q4 2025)
**Prioridad: Baja-Media | Estimación: 8-10 semanas**

#### 🌐 Internacionalización & multi-región
- [ ] **Multi-idioma y multi-moneda**
  - Español/Inglés/Portugués + formatos regionales y cambio dinámico
- [ ] **Adaptación regional**
  - Funciones, contenido y notificaciones según país/regulación

#### 🔌 Integraciones avanzadas
- [ ] **API REST + webhooks públicos**
  - Autenticación con tokens, documentación y sandbox
- [ ] **Integraciones estratégicas**
  - Gmail, Spotify, Trello/Notion, MercadoPago/Stripe/PayPal
- [ ] **Reservas y citas**
  - Booking de servicios, sincronización con calendarios de negocios y recordatorios

#### 🖥️ Plataforma y omnicanalidad
- [ ] **Versión multi-tenant (SaaS)**
  - Instancias aisladas por cliente, suscripciones y white label completo
- [ ] **Panel web completo y widgets**
  - Dashboard para usuarios finales, link-in-bio y widgets embebibles
- [ ] **Bots complementarios**
  - Extensiones para Telegram/Discord (opcional)

#### 🏗️ Arquitectura y seguridad
- [ ] **Migración a base de datos robusta**
  - PostgreSQL/MySQL, réplicas y políticas de backup/restauración
- [ ] **Microservicios + caché**
  - Redis, colas y CDN para archivos estáticos
- [ ] **Seguridad avanzada**
  - Encriptación, 2FA, cumplimiento GDPR y monitoreo continuo

---

## 📋 Backlog de Ideas Futuras

### 💡 Ideas de Alto Valor
- [ ] **Asistente de viajes avanzado**
  - Planificación integral de itinerarios
  - División de gastos de viaje
  - Recordatorios de vuelos/hoteles
- [ ] **Marketplace / Buscador de precios** *(Programado Fase 2)*
  - Comparador con enlaces de afiliados
  - Alertas de bajada de precio por producto
  - Métricas de monetización por referencia

- [ ] **Gestión de tareas (To-Do)** *(Programado Fase 2)*
  - Listas de tareas
  - Recordatorios de tareas
  - Integración con calendario
- [ ] **Portfolio de inversiones** *(Programado Fase 3)*
  - Registro de operaciones bursátiles/cripto
  - Cálculo de rentabilidad acumulada y por activo
  - Dashboards con gráficos y alertas

- [ ] **Contador de calorías por IA**
  - Analizar fotos de alimentos
  - Estimar calorías y macronutrientes
  - Historial nutricional diario/semanal

- [ ] **Recordatorios de cumpleaños**
  - Base de datos de contactos
  - Recordatorios automáticos
  - Mensajes personalizados

- [ ] **Gestión de deudas personales**
  - Tracking de préstamos
  - Recordatorios de pagos
  - Historial de transacciones

- [ ] **Marketplace de módulos opcionales**
  - Activar/desactivar módulos según necesidad
  - Instalación guiada dentro del bot
  - Gestión de dependencias entre features

- [ ] **Bóveda de información personal**
  - Guardar datos críticos (polizas, DNI, etc.)
  - Adjuntar documentos PDF/imagenes
  - Acceso rápido y seguro desde el bot

- [ ] **Disponibilidad 24/7 del bot**
  - Despliegue en servidor siempre encendido
  - Monitoreo de sesión de WhatsApp
  - Mecanismos anti-desconexión por reposo

### 🎨 Mejoras de Diseño
- [ ] **Temas personalizables**
  - Modo claro/oscuro
  - Personalización de colores
  - Emojis personalizados

- [ ] **Respuestas más visuales**
  - Gráficos en mensajes
  - Imágenes generadas
  - Formato rico mejorado

### 🔒 Seguridad y Privacidad
- [ ] **Encriptación de datos sensibles**
  - Encriptación de información personal
  - Tokens seguros
  - Cumplimiento GDPR

- [ ] **Autenticación de dos factores**
  - 2FA para usuarios premium
  - Verificación de identidad

---

## 📈 Métricas de Éxito

### KPIs a Medir
- **Usuarios activos mensuales (MAU)**
- **Eventos creados por usuario**
- **Grupos de gastos activos**
- **Tasa de retención**
- **Tiempo promedio de sesión**
- **Satisfacción del usuario (NPS)**

### Objetivos por Fase
- **Fase 1:** Mejorar retención en 30%
- **Fase 2:** Aumentar MAU en 50%
- **Fase 3:** 10% de usuarios premium
- **Fase 4:** Escalar a 10,000+ usuarios

---

## 🛠️ Stack Tecnológico Actual y Futuro

### Actual
- **Runtime:** Node.js 18+
- **Base de datos:** SQLite (better-sqlite3)
- **WhatsApp:** whatsapp-web.js
- **IA:** Anthropic Claude
- **Calendario:** Google Calendar API
- **Notificaciones:** node-cron

### Consideraciones Futuras
- **Base de datos:** PostgreSQL/MySQL para producción
- **Caché:** Redis
- **Mensajería:** RabbitMQ o Kafka
- **Monitoreo:** Prometheus + Grafana
- **Logs:** ELK Stack o Loki
- **Testing:** Jest + Supertest

---

## 📝 Notas de Implementación

### Priorización
1. **Alta:** Features que mejoran la experiencia actual
2. **Media:** Features que agregan valor significativo
3. **Baja:** Nice-to-have y experimentales

### Criterios de Aceptación
- ✅ Funcionalidad probada y estable
- ✅ Documentación actualizada
- ✅ Sin errores críticos
- ✅ Performance aceptable
- ✅ Feedback de usuarios positivo

---

## 🔄 Proceso de Desarrollo

### Flujo de Trabajo
1. **Planificación:** Revisar backlog y priorizar
2. **Desarrollo:** Implementar feature
3. **Testing:** Pruebas unitarias e integración
4. **Review:** Code review y QA
5. **Deploy:** Despliegue gradual
6. **Monitoreo:** Seguimiento de métricas

### Releases
- **Patch:** Correcciones y hotfixes (semanal)
- **Minor:** Nuevas features (mensual)
- **Major:** Cambios importantes (trimestral)

---

**Última revisión:** 13 de noviembre de 2025 (requisitos ARCA agregados)  
**Próxima revisión:** Diciembre 2025

---

*Este roadmap es un documento vivo y se actualizará según el feedback de usuarios y prioridades del negocio.*

