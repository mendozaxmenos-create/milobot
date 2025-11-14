# 🤖 Milo Bookings - Sistema de Gestión de Reservas

**Versión:** 1.0.0  
**Tipo:** White Label - Gestión de Agendas/Reservas  
**Basado en:** Milo Bot

---

## 📋 Descripción

Milo Bookings es una versión white label de Milo Bot, diseñada específicamente para la gestión de reservas y agendas de negocios de servicios. Permite a los dueños de negocios (salones de belleza, consultorios, estudios, etc.) gestionar sus reservas de forma automatizada a través de WhatsApp, con integración de pagos y un panel de administración completo.

---

## ✨ Características Principales

### Para Clientes (vía WhatsApp)
- 📱 Consultar servicios disponibles
- 📅 Consultar disponibilidad de horarios
- 🎫 Realizar reservas
- 💳 Pagar reservas mediante MercadoPago
- ✅ Recibir confirmaciones y recordatorios

### Para Dueños de Negocios (Panel Web)
- 🛠️ Gestionar servicios y precios
- 📅 Configurar disponibilidad y bloquear horarios
- 📊 Ver todas las reservas
- 💰 Control de transacciones y pagos
- 📈 Reportes y estadísticas
- ⚙️ Personalizar mensajes del bot
- 🔐 Acceso a funcionalidades de Milo (como super usuario)

---

## 🏗️ Arquitectura

### Componentes

1. **Bot de WhatsApp** - Interfaz principal con clientes
2. **API Backend** - Lógica de negocio y endpoints REST
3. **Panel Web** - Administración para dueños de negocios
4. **Base de Datos** - Almacenamiento de datos
5. **Integración MercadoPago** - Procesamiento de pagos

### Tecnologías

- **Backend**: Node.js + Express
- **Frontend**: React/Vue.js (a definir)
- **Base de Datos**: SQLite (dev) / PostgreSQL (prod)
- **WhatsApp**: whatsapp-web.js
- **Pagos**: MercadoPago API
- **Autenticación**: JWT

---

## 🚀 Instalación

### Requisitos

- Node.js >= 18.0.0
- Cuenta de WhatsApp Business (o número de teléfono)
- Credenciales de MercadoPago
- (Opcional) PostgreSQL para producción

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/mendozaxmenos-create/milo-bookings.git
cd milo-bookings
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

4. **Inicializar base de datos**
```bash
npm run db:migrate
```

5. **Iniciar el servidor**
```bash
npm start
```

---

## 📖 Uso

### Configuración Inicial

1. Crear cuenta de negocio desde el panel web
2. Configurar número de WhatsApp
3. Agregar servicios
4. Configurar horarios de trabajo
5. Configurar credenciales de MercadoPago
6. Personalizar mensajes del bot

### Flujo de Reserva

1. Cliente envía mensaje al bot
2. Bot muestra menú de opciones
3. Cliente selecciona "Reservar"
4. Cliente elige fecha y hora
5. Cliente selecciona servicio
6. Bot muestra resumen y link de pago
7. Cliente paga mediante MercadoPago
8. Bot confirma reserva y notifica al dueño
9. Horario queda bloqueado automáticamente

---

## 🔧 Configuración

### Variables de Entorno

```env
# Servidor
PORT=3000
NODE_ENV=development

# Base de Datos
DB_PATH=./data/bookings.db
# O para PostgreSQL:
DATABASE_URL=postgresql://user:password@localhost:5432/milo_bookings

# WhatsApp
WHATSAPP_SESSION_PATH=./data/whatsapp-sessions

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=your_access_token
MERCADOPAGO_PUBLIC_KEY=your_public_key

# JWT
JWT_SECRET=your_jwt_secret

# Panel Web
ADMIN_PANEL_URL=http://localhost:3000/admin
```

---

## 📁 Estructura del Proyecto

```
milo-bookings/
├── backend/
│   ├── api/              # Endpoints REST
│   ├── bot/              # Lógica del bot WhatsApp
│   ├── database/         # Modelos y migraciones
│   ├── services/         # Lógica de negocio
│   └── utils/            # Utilidades
├── frontend/
│   ├── admin-panel/      # Panel web React/Vue
│   └── public/           # Assets estáticos
├── shared/
│   └── types/            # Tipos TypeScript compartidos
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── api.md
│   ├── setup.md
│   └── deployment.md
├── .env.example
├── package.json
└── README.md
```

---

## 🔐 Seguridad

- Contraseñas encriptadas con bcrypt
- JWT para autenticación
- Rate limiting en API
- Validación de inputs
- Protección CSRF
- Logs de auditoría

---

## 📊 Roadmap

Ver [MILO_BOOKINGS_BACKLOG.md](./MILO_BOOKINGS_BACKLOG.md) para el backlog completo.

### Fases Principales

1. ✅ **FASE 1**: Fundación y Core
2. ✅ **FASE 2**: Funcionalidades Core de Reservas
3. ✅ **FASE 3**: Panel de Administración
4. ✅ **FASE 4**: Integración con Milo
5. ⏳ **FASE 5**: Personalización Avanzada
6. ⏳ **FASE 6**: Seguridad y Producción

---

## 🤝 Contribución

Este es un proyecto privado. Para contribuciones, contactar al equipo de desarrollo.

---

## 📄 Licencia

Propietario - Mendoza x Menos Create

---

## 📞 Soporte

Para soporte técnico o consultas, contactar al equipo de desarrollo.

---

**Última actualización:** Enero 2025

