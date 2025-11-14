# 🚀 Guía de Setup - Milo Bookings

## 📋 Checklist Pre-Desarrollo

### 1. Repositorio Git

- [ ] Crear repositorio en GitHub: `milo-bookings`
- [ ] Configurar descripción: "Sistema de gestión de reservas white label basado en Milo Bot"
- [ ] Agregar topics: `whatsapp-bot`, `booking-system`, `white-label`, `nodejs`
- [ ] Configurar branch protection (main)
- [ ] Crear branch `develop` para desarrollo

### 2. Estructura Inicial

```bash
# Crear estructura de carpetas
mkdir -p milo-bookings/{backend/{api,bot,database,services,utils},frontend/{admin-panel,public},shared/types,tests/{unit,integration},docs}

# Inicializar proyecto
cd milo-bookings
npm init -y
```

### 3. Dependencias Principales

**Backend:**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "whatsapp-web.js": "^1.23.0",
    "better-sqlite3": "^9.1.1",
    "knex": "^2.5.1",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "mercadopago": "^2.0.0",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "joi": "^17.11.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "@types/node": "^20.10.6",
    "typescript": "^5.3.3"
  }
}
```

**Frontend (React):**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-router-dom": "^6.21.1",
    "axios": "^1.6.2",
    "react-query": "^3.39.3",
    "zustand": "^4.4.7",
    "date-fns": "^3.0.6",
    "react-calendar": "^4.7.0"
  }
}
```

### 4. Archivos de Configuración

**.env.example:**
```env
# Servidor
PORT=3000
NODE_ENV=development

# Base de Datos
DB_PATH=./data/bookings.db
# DATABASE_URL=postgresql://user:password@localhost:5432/milo_bookings

# WhatsApp
WHATSAPP_SESSION_PATH=./data/whatsapp-sessions

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_in_production

# Panel Web
ADMIN_PANEL_URL=http://localhost:3000/admin
FRONTEND_URL=http://localhost:3001

# CORS
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3000
```

**.gitignore:**
```
node_modules/
.env
data/
*.log
.DS_Store
dist/
build/
coverage/
.whatsapp/
```

### 5. Scripts de package.json

```json
{
  "scripts": {
    "start": "node backend/index.js",
    "dev": "nodemon backend/index.js",
    "dev:bot": "nodemon backend/bot/index.js",
    "dev:api": "nodemon backend/api/server.js",
    "db:migrate": "knex migrate:latest",
    "db:rollback": "knex migrate:rollback",
    "db:seed": "knex seed:run",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint .",
    "build": "npm run build:frontend",
    "build:frontend": "cd frontend/admin-panel && npm run build"
  }
}
```

---

## 🗄️ Setup de Base de Datos

### Migración Inicial

**backend/database/migrations/001_create_businesses.js:**
```javascript
exports.up = function(knex) {
  return knex.schema.createTable('businesses', function(table) {
    table.string('id').primary();
    table.string('name').notNullable();
    table.string('phone').notNullable();
    table.string('email');
    table.string('whatsapp_number').notNullable();
    table.string('owner_phone').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('businesses');
};
```

### Seed Inicial (Opcional)

**backend/database/seeds/001_businesses.js:**
```javascript
exports.seed = async function(knex) {
  // Insertar datos de ejemplo
  await knex('businesses').insert([
    {
      id: 'demo-001',
      name: 'Salón de Belleza Demo',
      phone: '+5491123456789',
      email: 'demo@example.com',
      whatsapp_number: '+5491123456789',
      owner_phone: '+5491123456789',
      is_active: true
    }
  ]);
};
```

---

## 🔧 Configuración Inicial del Bot

### Estructura del Bot

**backend/bot/index.js:**
```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class BookingBot {
  constructor(businessId, whatsappNumber) {
    this.businessId = businessId;
    this.whatsappNumber = whatsappNumber;
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: `business-${businessId}`
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
  }

  async initialize() {
    // Setup de eventos
    this.client.on('qr', (qr) => {
      console.log('QR Code:', qr);
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log(`Bot ready for business ${this.businessId}`);
    });

    this.client.on('message', async (msg) => {
      await this.handleMessage(msg);
    });

    await this.client.initialize();
  }

  async handleMessage(msg) {
    // Lógica de manejo de mensajes
  }
}

module.exports = BookingBot;
```

---

## 🌐 Setup del API

### Estructura del API

**backend/api/server.js:**
```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de 100 requests por ventana
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/services', require('./routes/services'));
// ... más rutas

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
```

---

## 📱 Setup del Panel Web

### React Setup

```bash
cd frontend/admin-panel
npx create-react-app . --template typescript
npm install react-router-dom axios react-query zustand date-fns
```

### Estructura de Componentes

```
frontend/admin-panel/src/
├── components/
│   ├── Layout/
│   ├── Dashboard/
│   ├── Services/
│   ├── Bookings/
│   └── Availability/
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Services.tsx
│   └── Bookings.tsx
├── services/
│   └── api.ts
├── store/
│   └── authStore.ts
└── App.tsx
```

---

## ✅ Checklist de Verificación

### Backend
- [ ] API corriendo en puerto 3000
- [ ] Base de datos inicializada
- [ ] Migraciones ejecutadas
- [ ] Endpoints básicos funcionando
- [ ] Autenticación JWT funcionando

### Bot
- [ ] Bot se conecta a WhatsApp
- [ ] QR code se genera correctamente
- [ ] Mensajes se reciben
- [ ] Respuestas básicas funcionan

### Frontend
- [ ] Panel web corriendo
- [ ] Login funciona
- [ ] Dashboard carga
- [ ] CRUD de servicios funciona

### Integraciones
- [ ] MercadoPago configurado
- [ ] Webhooks funcionando
- [ ] Pagos se procesan correctamente

---

## 🐛 Troubleshooting

### Problemas Comunes

1. **Bot no se conecta**
   - Verificar que la sesión de WhatsApp no esté bloqueada
   - Limpiar carpeta de sesiones y volver a escanear QR

2. **Base de datos no se crea**
   - Verificar permisos de escritura en carpeta `data/`
   - Verificar que SQLite esté instalado

3. **CORS errors en frontend**
   - Verificar `ALLOWED_ORIGINS` en `.env`
   - Verificar que el frontend esté en el origen permitido

4. **MercadoPago no funciona**
   - Verificar credenciales en `.env`
   - Verificar que el webhook esté configurado correctamente

---

## 📚 Próximos Pasos

1. Implementar FASE 1 del backlog
2. Crear primeros tests
3. Setup de CI/CD
4. Deploy a ambiente de staging

---

**Última actualización:** Enero 2025

