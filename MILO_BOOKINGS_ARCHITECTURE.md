# 🏗️ Arquitectura Técnica - Milo Bookings

## 📐 Diseño del Sistema

### Arquitectura General

```
┌─────────────────┐
│   Cliente       │
│   (WhatsApp)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Bot WhatsApp   │◄──┐
│  (whatsapp.js)  │   │
└────────┬────────┘   │
         │            │
         ▼            │
┌─────────────────┐   │
│   API Backend   │   │
│   (Express)     │   │
└────────┬────────┘   │
         │            │
    ┌────┴────┐       │
    ▼         ▼       │
┌────────┐ ┌────────┐│
│   DB   │ │MercadoPago│
│(SQLite)│ │  API   ││
└────────┘ └────────┘│
                     │
         ┌───────────┘
         │
         ▼
┌─────────────────┐
│  Panel Web      │
│  (React/Vue)    │
└─────────────────┘
```

---

## 🗄️ Modelo de Datos Detallado

### Entidades Principales

#### 1. Business (Negocio)
```typescript
interface Business {
  id: string;
  name: string;
  phone: string;
  email: string;
  whatsapp_number: string;  // Número asignado al bot
  owner_phone: string;       // Teléfono del dueño
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
```

#### 2. BusinessUser (Usuario del Negocio)
```typescript
interface BusinessUser {
  id: string;
  business_id: string;
  phone: string;
  password_hash: string;
  role: 'owner' | 'admin' | 'staff';
  is_super_user: boolean;    // Acceso a funcionalidades Milo
  created_at: Date;
}
```

#### 3. Service (Servicio)
```typescript
interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}
```

#### 4. Booking (Reserva)
```typescript
interface Booking {
  id: string;
  business_id: string;
  customer_phone: string;
  customer_name: string;
  service_id: string;
  booking_date: Date;
  booking_time: string;      // HH:MM
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  payment_id: string;        // ID de MercadoPago
  payment_status: string;
  total_amount: number;
  notes: string;
  created_at: Date;
  updated_at: Date;
}
```

#### 5. AvailabilityBlock (Bloqueo de Disponibilidad)
```typescript
interface AvailabilityBlock {
  id: string;
  business_id: string;
  date: Date;
  start_time: string;
  end_time: string;
  reason: string;
  created_at: Date;
}
```

---

## 🔄 Flujos Principales

### Flujo 1: Reserva del Cliente

```
1. Cliente → Bot: "Hola"
2. Bot → Cliente: Mensaje de bienvenida + Menú
3. Cliente → Bot: "Reservar"
4. Bot → Cliente: "¿Qué fecha? (mostrar próximos 30 días disponibles)"
5. Cliente → Bot: "15 de enero"
6. Bot → Cliente: "¿Qué hora? (mostrar horarios disponibles)"
7. Cliente → Bot: "10:00"
8. Bot → Cliente: "¿Qué servicio? (listar servicios)"
9. Cliente → Bot: "Corte de pelo"
10. Bot → Cliente: Resumen + Link de pago MercadoPago
11. Cliente → MercadoPago: Paga
12. MercadoPago → Webhook: Notifica pago exitoso
13. Bot → Cliente: Confirmación de reserva
14. Bot → Dueño: Notificación de nueva reserva
15. Sistema: Bloquea horario automáticamente
```

### Flujo 2: Reenvío de Mensajes

```
1. Cliente → Dueño: Mensaje directo
2. Dueño → Bot: Reenvía mensaje del cliente
3. Bot → Cliente: Procesa como si fuera mensaje directo
4. Bot → Cliente: Responde según flujo normal
```

### Flujo 3: Gestión desde Panel

```
1. Dueño → Panel: Login
2. Panel → API: Autenticación JWT
3. Dueño → Panel: Gestiona servicios/disponibilidad
4. Panel → API: Actualiza datos
5. API → DB: Persiste cambios
6. Bot: Lee cambios en tiempo real
```

---

## 🔌 Integraciones

### MercadoPago

**Endpoints utilizados:**
- `POST /checkout/preferences` - Crear preferencia de pago
- `GET /v1/payments/{id}` - Consultar estado de pago
- Webhook para notificaciones de pago

**Flujo:**
1. Cliente confirma reserva
2. Sistema crea preferencia en MercadoPago
3. Sistema genera link único
4. Bot envía link al cliente
5. Cliente paga en MercadoPago
6. Webhook notifica pago exitoso
7. Sistema actualiza estado de reserva

### WhatsApp

**Configuración:**
- Una instancia de whatsapp-web.js por negocio (o compartida con detección)
- Sesiones persistentes por negocio
- Sistema de reenvío de mensajes

**Manejo de múltiples negocios:**
- Opción 1: Una instancia, detectar negocio por número de teléfono del cliente
- Opción 2: Múltiples instancias (una por negocio)
- Opción 3: Número compartido, reenvío desde dueño

---

## 🎯 Decisiones de Diseño

### 1. Multi-Tenancy

**Estrategia:** Database per tenant (futuro) o Shared Database con `business_id`

**Implementación inicial:** Shared Database
- Todas las tablas tienen `business_id`
- Filtros automáticos por `business_id` en queries
- Aislamiento de datos por negocio

### 2. Autenticación

**Método:** JWT tokens
- Login con usuario/contraseña
- Token válido por 24 horas
- Refresh tokens (opcional)

### 3. Base de Datos

**Desarrollo:** SQLite
- Fácil setup
- Sin dependencias externas
- Migraciones con mejor-sqlite3

**Producción:** PostgreSQL
- Mejor performance
- Escalabilidad
- Migraciones con Knex.js

### 4. Panel Web

**Framework:** React o Vue.js (a decidir)
- Componentes reutilizables
- Estado global (Redux/Vuex)
- Routing (React Router/Vue Router)

### 5. API REST

**Estructura:**
```
GET    /api/bookings           - Listar reservas
POST   /api/bookings           - Crear reserva
GET    /api/bookings/:id       - Ver reserva
PUT    /api/bookings/:id       - Actualizar reserva
DELETE /api/bookings/:id       - Cancelar reserva

GET    /api/services           - Listar servicios
POST   /api/services           - Crear servicio
PUT    /api/services/:id       - Actualizar servicio
DELETE /api/services/:id       - Eliminar servicio

GET    /api/availability       - Consultar disponibilidad
POST   /api/availability/blocks - Bloquear horario
DELETE /api/availability/blocks/:id - Desbloquear horario

POST   /api/payments/create    - Crear link de pago
POST   /api/payments/webhook   - Webhook MercadoPago
```

---

## 🔐 Seguridad

### Medidas Implementadas

1. **Autenticación**
   - Contraseñas hasheadas con bcrypt (salt rounds: 10)
   - JWT con expiración
   - Middleware de autenticación en todas las rutas protegidas

2. **Autorización**
   - Roles: owner, admin, staff
   - Permisos por rol
   - Validación de ownership (solo puede modificar su negocio)

3. **Validación**
   - Validación de inputs (Joi/Yup)
   - Sanitización de datos
   - Protección SQL injection (prepared statements)

4. **Rate Limiting**
   - Límite de requests por IP
   - Límite de mensajes por cliente en bot

5. **Logs**
   - Logs de auditoría
   - Tracking de acciones críticas
   - Errores con stack traces

---

## 📦 Módulos del Sistema

### Módulo 1: Bot WhatsApp
- Manejo de mensajes
- Flujo de conversación
- Integración con API
- Notificaciones

### Módulo 2: API Backend
- Endpoints REST
- Lógica de negocio
- Validaciones
- Integración con DB

### Módulo 3: Panel Web
- Autenticación
- Dashboard
- CRUD de servicios
- Gestión de reservas
- Reportes

### Módulo 4: Integración MercadoPago
- Creación de pagos
- Webhooks
- Verificación de pagos
- Manejo de estados

### Módulo 5: Sistema de Notificaciones
- Recordatorios automáticos
- Notificaciones al dueño
- Confirmaciones al cliente

### Módulo 6: Integración Milo (Opcional)
- Acceso a funcionalidades de Milo
- Menú combinado
- Super usuario

---

## 🚀 Deployment

### Opciones

1. **Railway**
   - Deploy automático desde Git
   - PostgreSQL incluido
   - Variables de entorno

2. **Render**
   - Similar a Railway
   - Free tier disponible

3. **DigitalOcean**
   - Droplet con Docker
   - Más control
   - Requiere más configuración

4. **Docker Compose**
   - Desarrollo local
   - Producción en servidor propio

### Estructura de Deployment

```
┌─────────────────┐
│   Load Balancer │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│  API   │ │  Panel │
│ Server │ │  Web   │
└────┬───┘ └────────┘
     │
     ▼
┌────────┐
│   DB   │
│(Postgres)│
└────────┘
```

---

## 📊 Monitoreo y Logs

### Métricas a Monitorear

- Número de reservas por día
- Tasa de conversión (reservas iniciadas vs completadas)
- Tiempo de respuesta del bot
- Errores de pago
- Uptime del sistema

### Logs

- Logs de aplicación (Winston)
- Logs de acceso (morgan)
- Logs de errores (Sentry opcional)
- Logs de auditoría (acciones críticas)

---

## 🔄 Migraciones y Versionado

### Migraciones de BD

- Usar Knex.js para migraciones
- Versionado de esquema
- Rollback de migraciones
- Migraciones automáticas en deploy

### Versionado de API

- Versionado en URL: `/api/v1/...`
- Documentación con Swagger/OpenAPI
- Changelog de versiones

---

**Última actualización:** Enero 2025

