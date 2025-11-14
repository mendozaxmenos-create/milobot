# 📋 Backlog - Milo Bookings (White Label)

**Versión:** 1.0.0  
**Tipo:** Sistema de Gestión de Reservas/Agendas  
**Fecha de Creación:** Enero 2025

---

## 🎯 Visión del Producto

Milo Bookings es una versión white label de Milo Bot, enfocada en la gestión de reservas y agendas para negocios de servicios (salones de belleza, consultorios, estudios, etc.). Permite a los dueños de negocios gestionar sus reservas a través de WhatsApp de forma automatizada, con integración de pagos y panel de administración.

---

## 🏗️ Arquitectura del Sistema

### Componentes Principales

1. **Bot de WhatsApp** - Interfaz principal con clientes
2. **Sistema Multi-Tenant** - Múltiples negocios en una instancia
3. **Panel de Administración Web** - Gestión de servicios, disponibilidad y reservas
4. **Sistema de Pagos** - Integración con MercadoPago
5. **API Backend** - Lógica de negocio y comunicación entre componentes
6. **Base de Datos** - Almacenamiento de negocios, servicios, reservas, etc.

---

## 📊 FASE 1: Fundación y Core (Sprint 1-2)

### 🔧 Infraestructura Base

#### EPIC 1: Setup del Proyecto
- [ ] **1.1** Crear estructura del repositorio
  - [ ] Estructura de carpetas modular
  - [ ] Configuración de package.json
  - [ ] Setup de base de datos (SQLite inicial, migrable a PostgreSQL)
  - [ ] Variables de entorno y configuración
  - [ ] README.md con instrucciones de instalación
  - [ ] .gitignore apropiado

- [ ] **1.2** Sistema de autenticación multi-tenant
  - [ ] Tabla `businesses` (id, name, phone, email, whatsapp_number, owner_phone, created_at, is_active)
  - [ ] Tabla `business_users` (id, business_id, phone, password_hash, role, created_at)
  - [ ] Sistema de login con usuario/contraseña
  - [ ] JWT tokens para sesiones
  - [ ] Middleware de autenticación
  - [ ] Roles: `owner`, `admin`, `staff`

- [ ] **1.3** Integración con WhatsApp
  - [ ] Configuración de whatsapp-web.js
  - [ ] Asignación de número de WhatsApp por negocio
  - [ ] Sistema de reenvío de mensajes (si el dueño reenvía al bot)
  - [ ] Detección de negocio por número de teléfono
  - [ ] Manejo de múltiples instancias de WhatsApp (si es necesario)

#### EPIC 2: Sistema de Configuración

- [ ] **2.1** Configuración de mensajes personalizables
  - [ ] Tabla `business_settings` (business_id, welcome_message, booking_confirmation_message, etc.)
  - [ ] API para actualizar mensajes desde panel
  - [ ] Variables dinámicas en mensajes (nombre del negocio, servicios, etc.)
  - [ ] Editor de mensajes en panel web

- [ ] **2.2** Gestión de servicios
  - [ ] Tabla `services` (id, business_id, name, description, duration_minutes, price, is_active, created_at)
  - [ ] CRUD de servicios desde panel
  - [ ] Orden de visualización de servicios
  - [ ] Categorías de servicios (opcional)
  - [ ] Imágenes de servicios (opcional)

---

## 📅 FASE 2: Funcionalidades Core de Reservas (Sprint 3-4)

### 🎫 Sistema de Reservas

#### EPIC 3: Flujo de Reserva del Cliente

- [ ] **3.1** Menú principal del bot
  - [ ] Mensaje de bienvenida personalizable
  - [ ] Opciones: Consultar servicios, Consultar disponibilidad, Reservar
  - [ ] Navegación entre opciones
  - [ ] Comandos rápidos (ej: "servicios", "disponibilidad", "reservar")

- [ ] **3.2** Consultar servicios
  - [ ] Listar servicios activos del negocio
  - [ ] Mostrar nombre, descripción, duración y precio
  - [ ] Formato amigable con emojis
  - [ ] Opción de volver al menú principal

- [ ] **3.3** Consultar disponibilidad
  - [ ] Tabla `availability_slots` (id, business_id, date, start_time, end_time, is_available, is_blocked, service_id)
  - [ ] Mostrar calendario de disponibilidad (próximos 30 días)
  - [ ] Mostrar días y horarios disponibles
  - [ ] Indicar servicios disponibles en cada horario
  - [ ] Respetar bloqueos y reservas existentes

- [ ] **3.4** Proceso de reserva
  - [ ] Selección de fecha
  - [ ] Selección de hora (solo horarios disponibles)
  - [ ] Selección de servicio(s)
  - [ ] Resumen de reserva (fecha, hora, servicio, precio total)
  - [ ] Confirmación antes de proceder al pago
  - [ ] Tabla `bookings` (id, business_id, customer_phone, customer_name, service_id, booking_date, booking_time, status, payment_id, total_amount, created_at)

#### EPIC 4: Integración de Pagos

- [ ] **4.1** Integración con MercadoPago
  - [ ] Configuración de credenciales por negocio
  - [ ] Tabla `business_payment_config` (business_id, mercado_pago_access_token, mercado_pago_public_key)
  - [ ] Crear preferencia de pago
  - [ ] Generar link de pago único
  - [ ] Webhook para recibir notificaciones de pago
  - [ ] Validación de pagos exitosos

- [ ] **4.2** Flujo de pago
  - [ ] Enviar link de pago al cliente
  - [ ] Esperar confirmación de pago
  - [ ] Actualizar estado de reserva a "confirmed" o "pending_payment"
  - [ ] Notificar al dueño del negocio cuando se confirma pago
  - [ ] Bloquear horario automáticamente al confirmar reserva

- [ ] **4.3** Gestión de estados de reserva
  - [ ] Estados: `pending_payment`, `confirmed`, `cancelled`, `completed`, `no_show`
  - [ ] Transiciones de estado
  - [ ] Notificaciones según estado

---

## 🛠️ FASE 3: Panel de Administración (Sprint 5-6)

### 👨‍💼 Panel Web para Dueños

#### EPIC 5: Dashboard y Autenticación

- [ ] **5.1** Sistema de login
  - [ ] Página de login (usuario/contraseña)
  - [ ] Validación de credenciales
  - [ ] Sesiones persistentes
  - [ ] Recuperación de contraseña (opcional)

- [ ] **5.2** Dashboard principal
  - [ ] Resumen de reservas del día
  - [ ] Reservas pendientes
  - [ ] Estadísticas básicas (reservas del mes, ingresos, etc.)
  - [ ] Próximas reservas
  - [ ] Notificaciones de nuevas reservas

#### EPIC 6: Gestión de Servicios

- [ ] **6.1** CRUD de servicios
  - [ ] Listar servicios
  - [ ] Crear nuevo servicio
  - [ ] Editar servicio (nombre, descripción, duración, precio)
  - [ ] Activar/desactivar servicios
  - [ ] Eliminar servicios (soft delete)
  - [ ] Validaciones (precio > 0, duración > 0)

- [ ] **6.2** Gestión de precios
  - [ ] Actualizar precio de servicio
  - [ ] Historial de cambios de precio (opcional)
  - [ ] Precios especiales por fecha (opcional)

#### EPIC 7: Gestión de Disponibilidad

- [ ] **7.1** Calendario de disponibilidad
  - [ ] Vista de calendario mensual
  - [ ] Ver horarios disponibles/bloqueados
  - [ ] Ver reservas confirmadas

- [ ] **7.2** Bloqueo de horarios
  - [ ] Bloquear día completo
  - [ ] Bloquear rango de horas
  - [ ] Bloquear horario específico
  - [ ] Desbloquear horarios
  - [ ] Motivo de bloqueo (opcional)

- [ ] **7.3** Configuración de horarios de trabajo
  - [ ] Tabla `business_hours` (business_id, day_of_week, open_time, close_time, is_open)
  - [ ] Configurar horarios por día de la semana
  - [ ] Días cerrados
  - [ ] Horarios especiales por fecha (feriados, etc.)

#### EPIC 8: Gestión de Reservas

- [ ] **8.1** Listado de reservas
  - [ ] Ver todas las reservas
  - [ ] Filtrar por fecha, estado, servicio
  - [ ] Búsqueda por nombre de cliente o teléfono
  - [ ] Ordenar por fecha/hora

- [ ] **8.2** Detalles de reserva
  - [ ] Ver información completa de reserva
  - [ ] Datos del cliente
  - [ ] Servicio reservado
  - [ ] Estado de pago
  - [ ] Historial de cambios

- [ ] **8.3** Acciones sobre reservas
  - [ ] Confirmar reserva manualmente
  - [ ] Cancelar reserva
  - [ ] Marcar como completada
  - [ ] Marcar como no-show
  - [ ] Reagendar reserva
  - [ ] Enviar recordatorio al cliente (opcional)

#### EPIC 9: Reportes y Transacciones

- [ ] **9.1** Panel de transacciones
  - [ ] Listado de todas las transacciones
  - [ ] Filtros por fecha, servicio, estado
  - [ ] Exportar a CSV/Excel
  - [ ] Información: fecha reserva, cliente, servicio, monto, estado pago

- [ ] **9.2** Estadísticas y reportes
  - [ ] Ingresos por período
  - [ ] Cantidad de reservas por período
  - [ ] Servicios más solicitados
  - [ ] Horarios más populares
  - [ ] Tasa de cancelación
  - [ ] Gráficos básicos (opcional)

---

## 🔄 FASE 4: Integración con Milo (Sprint 7)

### 🤖 Acceso a Funcionalidades de Milo

#### EPIC 10: Super Usuario

- [ ] **10.1** Sistema de super usuarios
  - [ ] Marcar dueños como super usuarios
  - [ ] Tabla `super_users` (business_id, phone, has_milo_access)
  - [ ] Acceso a todas las funcionalidades de Milo
  - [ ] Menú combinado (reservas + Milo)

- [ ] **10.2** Integración con módulos de Milo
  - [ ] Calendario personal
  - [ ] Gestión de gastos
  - [ ] Pronóstico del tiempo
  - [ ] Conversor de monedas
  - [ ] Asistente IA
  - [ ] Mensajes programados

---

## 🎨 FASE 5: Personalización y Mejoras (Sprint 8-9)

### 🎯 Personalización Avanzada

#### EPIC 11: Personalización de Mensajes

- [ ] **11.1** Editor de mensajes avanzado
  - [ ] Variables dinámicas en mensajes
  - [ ] Plantillas predefinidas
  - [ ] Preview de mensajes
  - [ ] Mensajes por tipo (bienvenida, confirmación, recordatorio, etc.)

- [ ] **11.2** Notificaciones automáticas
  - [ ] Recordatorio 24h antes de la reserva
  - [ ] Recordatorio 1h antes de la reserva
  - [ ] Confirmación de reserva
  - [ ] Notificación de cancelación
  - [ ] Configuración de notificaciones por negocio

#### EPIC 12: Mejoras de UX

- [ ] **12.1** Mejoras en el bot
  - [ ] Confirmaciones más claras
  - [ ] Manejo de errores mejorado
  - [ ] Ayuda contextual
  - [ ] Comandos rápidos adicionales

- [ ] **12.2** Mejoras en el panel
  - [ ] Diseño responsive
  - [ ] Búsqueda avanzada
  - [ ] Atajos de teclado
  - [ ] Exportación de datos mejorada

---

## 🔐 FASE 6: Seguridad y Producción (Sprint 10)

### 🛡️ Seguridad y Optimización

#### EPIC 13: Seguridad

- [ ] **13.1** Medidas de seguridad
  - [ ] Encriptación de contraseñas
  - [ ] Rate limiting en API
  - [ ] Validación de inputs
  - [ ] Protección CSRF
  - [ ] Logs de auditoría

- [ ] **13.2** Backup y recuperación
  - [ ] Backups automáticos de BD
  - [ ] Sistema de restauración
  - [ ] Exportación de datos

#### EPIC 14: Optimización y Escalabilidad

- [ ] **14.1** Optimización de performance
  - [ ] Índices en BD
  - [ ] Caché de consultas frecuentes
  - [ ] Optimización de queries
  - [ ] Lazy loading en panel

- [ ] **14.2** Preparación para producción
  - [ ] Variables de entorno para producción
  - [ ] Logging estructurado
  - [ ] Monitoreo de errores
  - [ ] Documentación de deployment

---

## 📦 Estructura del Proyecto

```
milo-bookings/
├── backend/
│   ├── api/              # API REST
│   ├── bot/              # Lógica del bot de WhatsApp
│   ├── database/         # Modelos y migraciones
│   ├── services/         # Lógica de negocio
│   └── utils/            # Utilidades
├── frontend/
│   ├── admin-panel/      # Panel de administración web
│   └── public/           # Assets estáticos
├── shared/
│   └── types/            # Tipos compartidos
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── api.md
│   ├── setup.md
│   └── deployment.md
├── .env.example
├── package.json
├── README.md
└── docker-compose.yml    # Para desarrollo local
```

---

## 🗄️ Esquema de Base de Datos (Inicial)

### Tablas Principales

```sql
-- Negocios
businesses
  - id (PK)
  - name
  - phone
  - email
  - whatsapp_number
  - owner_phone
  - is_active
  - created_at
  - updated_at

-- Usuarios del negocio
business_users
  - id (PK)
  - business_id (FK)
  - phone
  - password_hash
  - role (owner/admin/staff)
  - is_super_user (acceso a Milo)
  - created_at

-- Configuración del negocio
business_settings
  - business_id (FK, PK)
  - welcome_message
  - booking_confirmation_message
  - reminder_message_24h
  - reminder_message_1h
  - timezone

-- Servicios
services
  - id (PK)
  - business_id (FK)
  - name
  - description
  - duration_minutes
  - price
  - is_active
  - display_order
  - created_at
  - updated_at

-- Horarios de trabajo
business_hours
  - id (PK)
  - business_id (FK)
  - day_of_week (0-6)
  - open_time
  - close_time
  - is_open

-- Bloques de disponibilidad
availability_blocks
  - id (PK)
  - business_id (FK)
  - date
  - start_time
  - end_time
  - reason (opcional)
  - created_at

-- Reservas
bookings
  - id (PK)
  - business_id (FK)
  - customer_phone
  - customer_name
  - service_id (FK)
  - booking_date
  - booking_time
  - status (pending_payment/confirmed/cancelled/completed/no_show)
  - payment_id (MercadoPago)
  - payment_status
  - total_amount
  - notes
  - created_at
  - updated_at

-- Configuración de pagos
business_payment_config
  - business_id (FK, PK)
  - mercado_pago_access_token
  - mercado_pago_public_key
  - mercado_pago_user_id
  - is_active
```

---

## 🚀 Priorización

### Must Have (MVP)
- FASE 1: Fundación y Core
- FASE 2: Funcionalidades Core de Reservas
- FASE 3: Panel de Administración (básico)
- FASE 4: Integración con Milo (básica)

### Should Have
- FASE 5: Personalización Avanzada
- Mejoras de UX

### Nice to Have
- FASE 6: Seguridad y Optimización avanzada
- Reportes avanzados
- App móvil (futuro)

---

## 📝 Notas Técnicas

- **Base de datos**: SQLite para desarrollo, PostgreSQL para producción
- **Backend**: Node.js + Express
- **Frontend**: React o Vue.js (a decidir)
- **WhatsApp**: whatsapp-web.js
- **Pagos**: MercadoPago API
- **Autenticación**: JWT
- **Deployment**: Docker + Railway/Render/DigitalOcean

---

## 🔄 Próximos Pasos

1. Crear repositorio en GitHub
2. Setup inicial del proyecto
3. Implementar FASE 1
4. Testing y refinamiento
5. Deploy de MVP

---

**Última actualización:** Enero 2025

