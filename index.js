// ============================================
// 🤖 BOT DE WHATSAPP - ASISTENTE PERSONAL
// Versión con whatsapp-web.js (más estable)
// ============================================

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Database = require('better-sqlite3');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const calendarModule = require('./modules/calendar-module');  
// Crear carpeta data si no existe
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data');
  console.log('📁 Carpeta data creada');
}

// ============================================
// CONFIGURACIÓN DE BASE DE DATOS
// ============================================

const db = new Database('./data/database.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_interaction DATETIME,
    is_premium INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_date DATETIME NOT NULL,
    reminder_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS expense_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    creator_phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_closed INTEGER DEFAULT 0,
    FOREIGN KEY (creator_phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS group_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES expense_groups(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    payer_phone TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES expense_groups(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    user_phone TEXT PRIMARY KEY,
    current_module TEXT,
    context TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    user_name TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (user_phone) REFERENCES users(phone)
  );
`);

console.log('✅ Base de datos inicializada');

// ============================================
// CONFIGURACIÓN DE CLAUDE AI
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// FUNCIONES DE BASE DE DATOS
// ============================================

// Objeto para almacenar los timeouts activos de cada usuario
const userTimeouts = {};

// Tiempo de inactividad en milisegundos (5 minutos)
const TIMEOUT_DURATION = 5 * 60 * 1000; // 5 minutos

function registerUser(phone, name = null) {
  // Verificar si es usuario nuevo
  const existingUser = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  const isNewUser = !existingUser;
  
  const stmt = db.prepare(`
    INSERT INTO users (phone, name, last_interaction)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(phone) DO UPDATE SET 
      name = COALESCE(?, name),
      last_interaction = CURRENT_TIMESTAMP
  `);
  stmt.run(phone, name, name);
  
  return { isNewUser };
}

function getSession(phone) {
  const stmt = db.prepare('SELECT * FROM sessions WHERE user_phone = ?');
  return stmt.get(phone);
}

function updateSession(phone, module, context = null) {
  const stmt = db.prepare(`
    INSERT INTO sessions (user_phone, current_module, context, last_updated)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_phone) DO UPDATE SET 
      current_module = ?,
      context = ?,
      last_updated = CURRENT_TIMESTAMP
  `);
  stmt.run(phone, module, context, module, context);
  
  // Reiniciar el timeout cada vez que hay actividad
  resetTimeout(phone);
}

function clearSession(phone) {
  const stmt = db.prepare('DELETE FROM sessions WHERE user_phone = ?');
  stmt.run(phone);
  console.log(`🕐 Sesión cerrada por inactividad: ${phone}`);
}

function resetTimeout(phone) {
  // Cancelar timeout anterior si existe
  if (userTimeouts[phone]) {
    clearTimeout(userTimeouts[phone]);
  }
  
  // Crear nuevo timeout
  userTimeouts[phone] = setTimeout(() => {
    clearSession(phone);
    delete userTimeouts[phone];
  }, TIMEOUT_DURATION);
}

// ============================================
// MÓDULO DE CALENDARIO
// (Manejado por modules/calendar-module/)
// ============================================

// ============================================
// MÓDULO DE GASTOS
// ============================================

function createExpenseGroup(name, creatorPhone) {
  const stmt = db.prepare(`
    INSERT INTO expense_groups (name, creator_phone)
    VALUES (?, ?)
  `);
  const result = stmt.run(name, creatorPhone);
  return { success: true, groupId: result.lastInsertRowid };
}

function addParticipant(groupId, phone, name) {
  const stmt = db.prepare(`
    INSERT INTO group_participants (group_id, phone, name)
    VALUES (?, ?, ?)
  `);
  stmt.run(groupId, phone, name);
}

function addExpense(groupId, payerPhone, amount, description) {
  const stmt = db.prepare(`
    INSERT INTO expenses (group_id, payer_phone, amount, description)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(groupId, payerPhone, amount, description);
  return { success: true };
}

function getExpenseSummary(groupId) {
  // Obtener participantes
  const participants = db.prepare(`
    SELECT COUNT(*) as count FROM group_participants WHERE group_id = ?
  `).get(groupId);

  // Obtener gastos con nombre del pagador
  const expenses = db.prepare(`
    SELECT e.amount, e.description, e.payer_phone, p.name as payer_name
    FROM expenses e
    LEFT JOIN group_participants p ON e.payer_phone = p.phone AND e.group_id = p.group_id
    WHERE e.group_id = ?
    ORDER BY e.created_at DESC
  `).all(groupId);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPerson = participants.count > 0 ? (total / participants.count).toFixed(2) : 0;

  return {
    expenses,
    total: total.toFixed(2),
    perPerson,
    participantCount: participants.count
  };
}

function calculateSplit(groupId) {
  const participants = db.prepare(`
    SELECT DISTINCT phone, name FROM group_participants WHERE group_id = ?
  `).all(groupId);

  const expenses = db.prepare(`
    SELECT payer_phone, SUM(amount) as total 
    FROM expenses 
    WHERE group_id = ? 
    GROUP BY payer_phone
  `).all(groupId);

  const totalAmount = expenses.reduce((sum, e) => sum + e.total, 0);
  const perPerson = totalAmount / participants.length;

  const balances = {};
  participants.forEach(p => {
    balances[p.phone] = -perPerson;
  });

  expenses.forEach(e => {
    balances[e.payer_phone] += e.total;
  });

  const debtors = [];
  const creditors = [];

  for (const [phone, balance] of Object.entries(balances)) {
    const name = participants.find(p => p.phone === phone).name;
    if (balance < -0.01) {
      debtors.push({ phone, name, amount: -balance });
    } else if (balance > 0.01) {
      creditors.push({ phone, name, amount: balance });
    }
  }

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount: amount.toFixed(2)
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return {
    total: totalAmount.toFixed(2),
    perPerson: perPerson.toFixed(2),
    transactions
  };
}

// ============================================
// MÓDULO DE IA (CLAUDE)
// ============================================

async function processWithAI(userMessage, userPhone) {
  try {
    const session = getSession(userPhone);
    const context = session?.context || '';
    
    // Obtener fecha y hora actual
    const ahora = new Date();
    const fechaActual = ahora.toLocaleDateString('es-AR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const horaActual = ahora.toLocaleTimeString('es-AR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Eres un asistente personal de WhatsApp. 

INFORMACIÓN ACTUAL:
- Fecha de hoy: ${fechaActual}
- Hora actual: ${horaActual}
- Zona horaria: America/Argentina/Mendoza

El usuario dice: "${userMessage}"
Contexto previo: ${context}

Analiza si quiere:
1. Crear/ver recordatorios (responde con "CALENDAR: [acción]")
2. Gestionar gastos (responde con "EXPENSES: [acción]")
3. Conversación general (responde directamente)

Si detectas una fecha/hora, extráela en formato ISO (YYYY-MM-DD HH:MM).
Sé breve y amigable.`
        }
      ],
    });

    const response = message.content[0].text;

    if (response.startsWith('CALENDAR:')) {
      return '📅 Entendido. ¿Cuándo es el recordatorio? (Ej: "Mañana a las 3pm")';
    } else if (response.startsWith('EXPENSES:')) {
      return '💰 ¿Quieres crear un nuevo grupo de gastos o agregar a uno existente?';
    } else {
      return response;
    }
  } catch (error) {
    console.error('Error con Claude:', error);
    return '❌ Error al procesar con IA. Intenta de nuevo.';
  }
}

// ============================================
// MÓDULO DE FEEDBACK
// ============================================

function saveFeedback(userPhone, userName, type, message) {
  const stmt = db.prepare(`
    INSERT INTO feedback (user_phone, user_name, type, message)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(userPhone, userName, type, message);
  return { success: true, id: result.lastInsertRowid };
}

function getAllFeedback() {
  const stmt = db.prepare(`
    SELECT * FROM feedback 
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

function getPendingFeedback() {
  const stmt = db.prepare(`
    SELECT * FROM feedback 
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

function markFeedbackAsRead(id) {
  const stmt = db.prepare(`
    UPDATE feedback 
    SET status = 'read' 
    WHERE id = ?
  `);
  stmt.run(id);
}

// ============================================
// GENERADOR DE MENÚS
// ============================================

function getMainMenu(userName = '') {
  const greeting = userName ? `Hola *${userName}*! 👋\n\n` : '';
  return `${greeting}🤖 *Soy Milo, tu asistente personal*\n\nSelecciona una opción:\n\n1️⃣ 📅 Calendario & Recordatorios\n2️⃣ 💰 Dividir Gastos\n3️⃣ 🤖 Asistente IA\n4️⃣ ⚙️ Configuración\n5️⃣ ℹ️ Ayuda\n\n_Escribe el número o habla naturalmente_`;
}


function getExpensesMenu() {
  return '💰 *Dividir Gastos*\n\n1. Crear nuevo grupo\n2. Agregar gasto\n3. Ver resumen\n4. Calcular división\n5. Volver al menú\n\n¿Qué deseas hacer?';
}

// ============================================
// MANEJADOR DE MENSAJES DE GRUPOS
// ============================================

async function handleGroupMessage(msg) {
  const messageText = msg.body.toLowerCase().trim();
  const groupId = msg.from;
  const groupChat = await msg.getChat();
  const groupName = groupChat.name || 'Grupo sin nombre';

  // Comandos disponibles en grupos
  if (messageText === '/dividir' || messageText === '/gastos' || messageText === '/split') {
    try {
      // Obtener todos los participantes del grupo
      const participants = groupChat.participants || [];
      
      if (participants.length < 2) {
        await msg.reply('❌ El grupo debe tener al menos 2 participantes para dividir gastos.');
        return;
      }

      // Crear grupo de gastos automáticamente
      const expenseGroupResult = createExpenseGroup(groupName, groupId);
      const expenseGroupId = expenseGroupResult.groupId;

      // Agregar todos los participantes automáticamente
      let addedCount = 0;
      for (const participant of participants) {
        if (!participant.id._serialized.includes('bot')) { // No agregar al bot mismo
          const phone = participant.id.user;
          const name = participant.id.name || participant.id.user || `Usuario ${phone.slice(-4)}`;
          
          try {
            addParticipant(expenseGroupId, phone, name);
            addedCount++;
          } catch (error) {
            console.log(`No se pudo agregar a ${name}:`, error.message);
          }
        }
      }

      const response = `🎉 *¡Grupo de gastos creado!*\n\n` +
        `📝 Nombre: ${groupName}\n` +
        `👥 Participantes: ${addedCount}\n\n` +
        `*Participantes agregados:*\n` +
        participants
          .filter(p => !p.id._serialized.includes('bot'))
          .map((p, i) => `${i + 1}. ${p.id.name || p.id.user}`)
          .join('\n') +
        `\n\n💰 *Para agregar gastos, usa:*\n` +
        `/gasto 5000 | Carne | Juan\n\n` +
        `📊 *Para ver el resumen:*\n` +
        `/resumen\n\n` +
        `💸 *Para calcular división:*\n` +
        `/calcular\n\n` +
        `ℹ️ *Ver ayuda:*\n` +
        `/ayuda`;

      await msg.reply(response);

      // Guardar el ID del grupo de gastos asociado al grupo de WhatsApp
      db.prepare(`
        UPDATE expense_groups 
        SET creator_phone = ? 
        WHERE id = ?
      `).run(groupId, expenseGroupId);

      console.log(`✅ Grupo de gastos creado automáticamente: ${groupName} (${addedCount} participantes)`);

    } catch (error) {
      console.error('Error creando grupo de gastos:', error);
      await msg.reply('❌ Error al crear el grupo de gastos. Intenta de nuevo.');
    }
  }
  else if (messageText.startsWith('/gasto ')) {
    // Agregar gasto: /gasto 5000 | Carne | Juan
    const gastoData = messageText.replace('/gasto ', '').trim();
    const parts = gastoData.split('|').map(p => p.trim());

    if (parts.length === 3) {
      const [amountStr, description, payerName] = parts;
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        await msg.reply('❌ Monto inválido.\n\nUsa: /gasto 5000 | Carne | Juan');
        return;
      }

      // Buscar el grupo de gastos asociado a este grupo de WhatsApp
      const expenseGroup = db.prepare(`
        SELECT id FROM expense_groups 
        WHERE creator_phone = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(groupId);

      if (!expenseGroup) {
        await msg.reply('❌ Primero debes crear un grupo de gastos con */dividir*');
        return;
      }

      // Buscar participante por nombre
      const participant = db.prepare(`
        SELECT phone, name FROM group_participants 
        WHERE group_id = ? AND LOWER(name) LIKE ?
      `).get(expenseGroup.id, `%${payerName.toLowerCase()}%`);

      if (!participant) {
        const allParticipants = db.prepare(`
          SELECT name FROM group_participants WHERE group_id = ?
        `).all(expenseGroup.id);

        await msg.reply(
          `❌ "${payerName}" no encontrado.\n\n` +
          `Participantes:\n` +
          allParticipants.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
        );
        return;
      }

      addExpense(expenseGroup.id, participant.phone, amount, description);
      
      await msg.reply(
        `✅ *Gasto agregado*\n\n` +
        `💵 Monto: ${amount}\n` +
        `📝 Concepto: ${description}\n` +
        `💳 Pagado por: ${participant.name}\n\n` +
        `Usa */resumen* para ver todos los gastos`
      );

    } else {
      await msg.reply(
        '❌ Formato incorrecto.\n\n' +
        '*Uso correcto:*\n' +
        '/gasto 5000 | Carne | Juan\n\n' +
        '_Monto | Descripción | Quién pagó_'
      );
    }
  }
  else if (messageText === '/resumen') {
    // Ver resumen de gastos
    const expenseGroup = db.prepare(`
      SELECT id FROM expense_groups 
      WHERE creator_phone = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(groupId);

    if (!expenseGroup) {
      await msg.reply('❌ Primero debes crear un grupo de gastos con */dividir*');
      return;
    }

    const summary = getExpenseSummary(expenseGroup.id);

    if (summary.expenses.length === 0) {
      await msg.reply('📋 No hay gastos registrados todavía.\n\nUsa */gasto* para agregar uno.');
      return;
    }

    const response = `📋 *Resumen de Gastos*\n\n` +
      `💰 *Total:* ${summary.total}\n` +
      `👥 *Participantes:* ${summary.participantCount}\n` +
      `📊 *Por persona:* ${summary.perPerson}\n\n` +
      `*Gastos registrados:*\n\n` +
      summary.expenses.map((e, i) =>
        `${i + 1}. ${e.amount} - ${e.description}\n   💳 ${e.payer_name}`
      ).join('\n\n') +
      `\n\n💸 Usa */calcular* para ver quién debe a quién`;

    await msg.reply(response);
  }
  else if (messageText === '/calcular') {
    // Calcular división
    const expenseGroup = db.prepare(`
      SELECT id FROM expense_groups 
      WHERE creator_phone = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(groupId);

    if (!expenseGroup) {
      await msg.reply('❌ Primero debes crear un grupo de gastos con */dividir*');
      return;
    }

    const split = calculateSplit(expenseGroup.id);

    if (split.transactions.length === 0) {
      await msg.reply('✅ *¡Todo pagado!*\n\nNo hay deudas pendientes. Todos están al día.');
      return;
    }

    const response = `💸 *División de Gastos*\n\n` +
      `💰 Total: ${split.total}\n` +
      `👥 Por persona: ${split.perPerson}\n\n` +
      `*Transferencias a realizar:*\n\n` +
      split.transactions.map((t, i) =>
        `${i + 1}. *${t.from}* → *${t.amount}* → *${t.to}*`
      ).join('\n\n') +
      `\n\n_💡 Estas transferencias minimizan la cantidad de pagos._`;

    await msg.reply(response);
  }
  else if (messageText === '/ayuda' || messageText === '/help') {
    const response = `🤖 *Comandos del Bot de Gastos*\n\n` +
      `*Configuración:*\n` +
      `• */dividir* - Crear grupo y agregar participantes\n\n` +
      `*Gestión de gastos:*\n` +
      `• */gasto 5000 | Pizza | Juan* - Agregar gasto\n` +
      `• */resumen* - Ver todos los gastos\n` +
      `• */calcular* - Ver división optimizada\n\n` +
      `*Otros:*\n` +
      `• */ayuda* - Ver esta ayuda\n\n` +
      `_💡 El bot divide automáticamente entre todos los miembros del grupo_`;

    await msg.reply(response);
  }
}

// ============================================
// MANEJADOR DE MENSAJES PRIVADOS
// ============================================

async function handleMessage(msg) {
  const messageText = msg.body;
  const userPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
  const isGroup = msg.from.includes('@g.us');
  const msgType = msg.type;
  
  // Si el mensaje está vacío (imagen, audio, etc.), ignorar - EXCEPTO vcards (contactos)
  if ((!messageText || messageText.trim() === '') && msgType !== 'vcard') {
    console.log(`📩 Mensaje de ${userPhone}: [Multimedia - ignorado]`);
    return;
  }
  
  console.log(`📩 Mensaje de ${isGroup ? 'GRUPO' : 'usuario'} ${userPhone}: ${messageText}`);

  // FUNCIONALIDAD ESPECIAL PARA GRUPOS
  if (isGroup) {
    await handleGroupMessage(msg);
    return;
  }

  // Obtener nombre del contacto
  const contact = await msg.getContact();
  const userName = contact.pushname || contact.name || contact.number || 'Usuario';
  
  console.log(`👤 Nombre del contacto: ${userName}`);

  const userInfo = registerUser(userPhone, userName);

  // Reiniciar timeout cada vez que el usuario envía un mensaje
  resetTimeout(userPhone);

  const session = getSession(userPhone);
  const currentModule = session?.current_module || 'main';

  let response = '';

  // Si es usuario nuevo, dar bienvenida personalizada
  if (userInfo.isNewUser) {
    response = `¡Hola *${userName}*! 👋 Bienvenido/a.\n\nSoy tu asistente personal de WhatsApp.\n\n` + getMainMenu();
    updateSession(userPhone, 'main');
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  // Saludos comunes que activan el menú
  const saludos = ['hola', 'hi', 'hello', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'ola'];
  const mensajeLower = messageText.toLowerCase().trim();
  
  if (saludos.includes(mensajeLower)) {
    response = getMainMenu(userName);
    updateSession(userPhone, 'main');
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  // Comandos especiales de feedback
  if (mensajeLower.startsWith('/feedback') || mensajeLower.startsWith('/bug') || mensajeLower.startsWith('/sugerencia')) {
    const feedbackText = messageText.substring(messageText.indexOf(' ') + 1).trim();
    
    if (feedbackText && feedbackText !== messageText) {
      const type = mensajeLower.startsWith('/bug') ? 'bug' : 
                   mensajeLower.startsWith('/sugerencia') ? 'sugerencia' : 'feedback';
      
      const result = saveFeedback(userPhone, userName, type, feedbackText);
      
      response = `✅ ¡Gracias *${userName}*!\n\n` +
        `Tu ${type} ha sido registrado (#${result.id})\n\n` +
        `Estamos trabajando para mejorar el bot continuamente.\n\n` +
        `🔔 Te notificaremos cuando sea revisado.`;
      
      // Notificar al admin (tú)
      const ADMIN_PHONE = '5492615176403';
      if (userPhone !== ADMIN_PHONE) {
        try {
          await client.sendMessage(
            `${ADMIN_PHONE}@c.us`,
            `🔔 *Nuevo ${type}*\n\n` +
            `👤 De: ${userName} (${userPhone})\n` +
            `📝 Mensaje:\n${feedbackText}\n\n` +
            `ID: #${result.id}`
          );
        } catch (error) {
          console.error('Error notificando admin:', error);
        }
      }
      
      console.log(`📝 Feedback recibido de ${userName}: ${feedbackText}`);
    } else {
      response = `📝 *Reportar Feedback/Bug*\n\n` +
        `Usa uno de estos comandos:\n\n` +
        `• */feedback [mensaje]*\n` +
        `  Para cualquier comentario\n\n` +
        `• */bug [descripción]*\n` +
        `  Para reportar errores\n\n` +
        `• */sugerencia [idea]*\n` +
        `  Para nuevas ideas\n\n` +
        `*Ejemplo:*\n` +
        `/bug El bot no respondió cuando intenté crear un evento`;
    }
    
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  // Comando para ver feedback (solo admin)
  if (mensajeLower === '/ver_feedback' && userPhone === '5492615176403') {
    const pending = getPendingFeedback();
    const all = getAllFeedback();
    
    if (all.length === 0) {
      response = '📝 No hay feedback registrado todavía.';
    } else {
      response = `📊 *Feedback registrado*\n\n` +
        `📥 Pendientes: ${pending.length}\n` +
        `📋 Total: ${all.length}\n\n` +
        `*Últimos 5:*\n\n` +
        all.slice(0, 5).map((f, i) =>
          `${i + 1}. [#${f.id}] ${f.type.toUpperCase()}\n` +
          `   👤 ${f.user_name || f.user_phone}\n` +
          `   📝 ${f.message.substring(0, 80)}${f.message.length > 80 ? '...' : ''}\n` +
          `   🕐 ${f.created_at}\n` +
          `   Status: ${f.status === 'pending' ? '⏳ Pendiente' : '✅ Leído'}`
        ).join('\n\n') +
        `\n\n_Usa /marcar_leido [ID] para marcar como leído_`;
    }
    
    await msg.reply(response);
    console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
    return;
  }

  if (messageText.toLowerCase() === 'menu' || messageText === '4') {
    response = getMainMenu(userName);
    updateSession(userPhone, 'main');
  }
  else if (currentModule === 'main') {
    switch(messageText) {
      case '1':
  response = await calendarModule.handleCalendarMessage(
    msg,
    userPhone,
    userName,
    '1',  // Esto simula que el usuario está entrando al menú de calendario
    'main',  // Viene del módulo main
    session,
    db,
    client
  );
  updateSession(userPhone, 'calendar');
  break;
      case '2':
        response = getExpensesMenu();
        updateSession(userPhone, 'expenses');
        break;
      case '3':
        response = `Hola *${userName}*! 🤖\n\nModo IA activado. Habla naturalmente y te ayudaré.\n\n_La sesión se cerrará automáticamente después de 5 minutos de inactividad._`;
        updateSession(userPhone, 'ai');
        break;
      case '5':
        response = 'ℹ️ *Ayuda*\n\nPuedes interactuar de dos formas:\n\n*📱 Por menús:* Navega con números\n*💬 Por voz:* Habla naturalmente\n\nEjemplos:\n- "Recuérdame mañana comprar pan"\n- "Crea un grupo para el asado"\n- "¿Cuánto debo?"\n\nEscribe *menu* para volver al inicio.\n\n*📝 Reportar problemas:*\n• */feedback* - Dejar comentario\n• */bug* - Reportar error\n• */sugerencia* - Nueva idea\n\n_⚠️ Importante: La sesión se cierra después de 5 min sin actividad._';
        break;
      default:
        response = getMainMenu(userName);
    }
  }
  else if (currentModule === 'calendar' || currentModule.startsWith('calendar_')) {
    response = await calendarModule.handleCalendarMessage(
      msg,
      userPhone,
      userName,
      messageText,
      currentModule,
      session,
      db,
      client
    );
  }
  else if (currentModule === 'expenses') {
    switch(messageText) {
      case '1':
        response = '💰 Escribe el nombre del grupo (ej: "Asado del sábado")';
        updateSession(userPhone, 'expenses_create');
        break;
      case '5':
        response = getMainMenu();
        updateSession(userPhone, 'main');
        break;
      default:
        response = getExpensesMenu();
    }
  }
  else if (currentModule === 'expenses_create') {
    const result = createExpenseGroup(messageText, userPhone);
    response = `✅ Grupo "${messageText}" creado (ID: ${result.groupId}).\n\n👥 *Agregar participantes:*\n\n¿Cómo quieres agregarlos?\n\n*1* - Uno por uno (te pregunto nombre y teléfono)\n*2* - Compartir contacto 📱\n*3* - Agregar yo mismo (formato: Nombre,Teléfono)\n*4* - Listo, no agregar más`;
    updateSession(userPhone, 'expenses_add_method', JSON.stringify({ groupId: result.groupId, participants: [] }));
  }
  else if (currentModule === 'expenses_add_method') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const participants = context.participants || [];
    
    if (messageText === '1') {
      response = '👤 Perfecto!\n\nEscribe el *nombre* del primer participante:\n\n_Ejemplo: Juan_';
      updateSession(userPhone, 'expenses_add_name', JSON.stringify({ groupId, participants }));
    } else if (messageText === '2') {
      response = '📱 *Compartir contacto*\n\nToca el ícono de 📎 (adjuntar)\nSelecciona *"Contacto"*\nElige el contacto a agregar\n\n_También puedes escribir *"3"* para usar el formato manual_';
      updateSession(userPhone, 'expenses_waiting_contact', JSON.stringify({ groupId, participants }));
    } else if (messageText === '3') {
      response = '📝 *Agregar participantes*\n\nEnvía en formato: *Nombre,Teléfono*\n\n*Ejemplos:*\n• Juan,5492614567890\n• María,5492615123456\n\nCuando termines, escribe *"listo"*';
      updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, participants }));
    } else if (messageText === '4') {
      if (participants.length === 0) {
        response = '❌ Debes agregar al menos un participante.\n\n*1* - Agregar uno por uno\n*2* - Compartir contacto\n*3* - Agregar con formato\n*4* - Listo';
      } else {
        response = `✅ Perfecto *${userName}*!\n\nGrupo configurado con ${participants.length} participante(s):\n\n` +
          participants.map((p, i) => `${i+1}. ${p.name}`).join('\n') +
          '\n\n💰 *Ahora puedes:*\n\n1. Agregar gastos\n2. Ver resumen\n3. Calcular división\n4. Volver al menú\n\n¿Qué deseas hacer?';
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId }));
      }
    } else {
      response = '❌ Opción no válida.\n\n*1* - Uno por uno\n*2* - Compartir contacto\n*3* - Formato Nombre,Teléfono\n*4* - Listo';
    }
  }
  else if (currentModule === 'expenses_waiting_contact') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const participants = context.participants || [];
    
    // Verificar si es un contacto compartido
    if (msgType === 'vcard') {
      try {
        // Obtener la información del vcard
        const vcardData = msg.vCards && msg.vCards.length > 0 ? msg.vCards[0] : null;
        
        if (vcardData) {
          // Parsear el vcard para extraer nombre y teléfono
          const nameMatch = vcardData.match(/FN:(.*)/);
          const telMatch = vcardData.match(/TEL[^:]*:([+\d]+)/);
          
          const contactName = nameMatch ? nameMatch[1].trim() : 'Sin nombre';
          let contactPhone = telMatch ? telMatch[1].replace(/\D/g, '') : null;
          
          if (!contactPhone) {
            response = '❌ No se pudo extraer el teléfono del contacto.\n\nIntenta compartir el contacto nuevamente o usa la opción *3* para agregar manualmente.';
          } else {
            // Limpiar y formatear teléfono
            if (!contactPhone.startsWith('549')) {
              contactPhone = '549' + contactPhone.replace(/^0+/, '');
            }
            
            // Agregar participante
            addParticipant(groupId, contactPhone, contactName);
            participants.push({ name: contactName, phone: contactPhone });
            
            response = `✅ *${contactName}* agregado correctamente!\n\n` +
              `📊 Total de participantes: ${participants.length}\n\n` +
              `¿Qué deseas hacer?\n\n` +
              `*1* - Compartir otro contacto 📱\n` +
              `*2* - Agregar manualmente\n` +
              `*3* - Terminar y continuar`;
            
            updateSession(userPhone, 'expenses_after_contact', JSON.stringify({ groupId, participants }));
          }
        } else {
          response = '❌ No se pudo leer el contacto compartido.\n\nIntenta de nuevo o usa la opción *3* para agregar manualmente.';
        }
      } catch (error) {
        console.error('Error procesando vcard:', error);
        response = '❌ Error al procesar el contacto.\n\n¿Qué deseas hacer?\n\n*1* - Intentar otro contacto\n*2* - Agregar manualmente\n*3* - Volver al menú';
      }
    } else {
      // Si escribió texto en lugar de compartir contacto
      if (messageText === '3') {
        response = '📝 *Agregar participantes manualmente*\n\nEnvía en formato: *Nombre,Teléfono*\n\n*Ejemplos:*\n• Juan,5492614567890\n• María,2615123456\n\nCuando termines, escribe *"listo"*';
        updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, participants }));
      } else {
        response = '❌ Por favor, comparte un contacto usando el ícono 📎\n\nO escribe *"3"* para usar el formato manual (Nombre,Teléfono)';
      }
    }
  }
  else if (currentModule === 'expenses_after_contact') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const participants = context.participants || [];
    
    if (messageText === '1') {
      response = '📱 *Compartir otro contacto*\n\nToca el ícono de 📎 (adjuntar)\nSelecciona *"Contacto"*\nElige el contacto a agregar';
      updateSession(userPhone, 'expenses_waiting_contact', JSON.stringify({ groupId, participants }));
    } else if (messageText === '2') {
      response = '📝 *Agregar manualmente*\n\nEnvía en formato: *Nombre,Teléfono*\n\n*Ejemplo:*\nJuan,5492614567890';
      updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, participants }));
    } else if (messageText === '3') {
      response = `✅ Perfecto!\n\nGrupo configurado con ${participants.length} participante(s):\n\n` +
        participants.map((p, i) => `${i+1}. ${p.name}`).join('\n') +
        '\n\n💰 *Ahora puedes:*\n\n1. Agregar gastos\n2. Ver resumen\n3. Calcular división\n4. Volver al menú\n\n¿Qué deseas hacer?';
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId }));
    } else {
      response = '❌ Opción no válida.\n\n*1* - Compartir otro contacto\n*2* - Agregar manualmente\n*3* - Terminar';
    }
  }
  else if (currentModule === 'expenses_add_name') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const participants = context.participants || [];
    
    // Guardar el nombre temporalmente
    response = `👤 *${messageText}*\n\nAhora escribe el *número de teléfono*:\n\n_Ejemplo: 2615176403_\n\n_Sin espacios, sin guiones, solo números_`;
    updateSession(userPhone, 'expenses_add_phone', JSON.stringify({ groupId, participants, tempName: messageText }));
  }
  else if (currentModule === 'expenses_add_phone') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const participants = context.participants || [];
    const name = context.tempName;
    
    // Validar teléfono
    const phone = messageText.replace(/\D/g, ''); // Eliminar todo lo que no sea número
    
    if (phone.length < 10 || phone.length > 15) {
      response = '❌ Teléfono inválido. Debe tener entre 10 y 15 dígitos.\n\nIntenta de nuevo:\n_Ejemplo: 2615176403_';
    } else {
      // Agregar código de país si no lo tiene
      const fullPhone = phone.startsWith('549') ? phone : `549${phone}`;
      
      addParticipant(groupId, fullPhone, name);
      participants.push({ name, phone: fullPhone });
      
      response = `✅ *${name}* agregado correctamente!\n\n` +
        `📊 Total de participantes: ${participants.length}\n\n` +
        `¿Qué deseas hacer?\n\n` +
        `*1* - Agregar otro participante\n` +
        `*2* - Terminar y continuar`;
      updateSession(userPhone, 'expenses_after_add', JSON.stringify({ groupId, participants }));
    }
  }
  else if (currentModule === 'expenses_after_add') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const participants = context.participants || [];
    
    if (messageText === '1') {
      response = '👤 Escribe el *nombre* del siguiente participante:';
      updateSession(userPhone, 'expenses_add_name', JSON.stringify({ groupId, participants }));
    } else if (messageText === '2') {
      response = `✅ Perfecto!\n\nGrupo configurado con ${participants.length} participante(s):\n\n` +
        participants.map((p, i) => `${i+1}. ${p.name}`).join('\n') +
        '\n\n💰 *Ahora puedes:*\n\n1. Agregar gastos\n2. Ver resumen\n3. Calcular división\n4. Volver al menú\n\n¿Qué deseas hacer?';
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId }));
    } else {
      response = '❌ Opción no válida.\n\n*1* - Agregar otro\n*2* - Terminar';
    }
  }
  else if (currentModule === 'expenses_add_participants') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    const participants = context.participants || [];
    
    if (messageText.toLowerCase() === 'listo') {
      if (participants.length === 0) {
        response = '❌ Debes agregar al menos un participante.\n\nEnvía: Nombre,Teléfono';
      } else {
        response = `✅ Perfecto *${userName}*!\n\nGrupo configurado con ${participants.length} participante(s):\n\n` +
          participants.map((p, i) => `${i+1}. ${p.name}`).join('\n') +
          '\n\n💰 *Ahora puedes:*\n\n1. Agregar gastos\n2. Ver resumen\n3. Calcular división\n4. Volver al menú\n\n¿Qué deseas hacer?';
        updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId }));
      }
    } else {
      // Parsear participante: Nombre,Teléfono
      const parts = messageText.split(',').map(p => p.trim());
      if (parts.length === 2) {
        const [name, phone] = parts;
        const cleanPhone = phone.replace(/\D/g, '');
        // Validar formato de teléfono básico
        if (cleanPhone.match(/^\d{10,15}$/)) {
          const fullPhone = cleanPhone.startsWith('549') ? cleanPhone : `549${cleanPhone}`;
          addParticipant(groupId, fullPhone, name);
          participants.push({ name, phone: fullPhone });
          response = `✅ *${name}* agregado (${participants.length} participante(s))\n\nAgrega otro o escribe *"listo"* para continuar.`;
          updateSession(userPhone, 'expenses_add_participants', JSON.stringify({ groupId, participants }));
        } else {
          response = '❌ Teléfono inválido. Debe tener 10-15 dígitos.\n\nEjemplo: María,5492615123456';
        }
      } else {
        response = '❌ Formato incorrecto.\n\nUsa: *Nombre,Teléfono*\nEjemplo: Juan,5492614567890\n\nO escribe *"listo"* para continuar.';
      }
    }
  }
  else if (currentModule === 'expenses_manage') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    
    switch(messageText) {
      case '1':
        response = '💵 *Agregar gasto*\n\nEnvía en este formato:\nMonto | Descripción | Quién pagó\n\n*Ejemplo:*\n5000 | Carne | Juan\n\n_El monto debe ser solo números (sin $ ni puntos)_';
        updateSession(userPhone, 'expenses_add_expense', JSON.stringify({ groupId }));
        break;
      case '2':
        const summary = getExpenseSummary(groupId);
        if (summary.expenses.length === 0) {
          response = '📋 No hay gastos registrados todavía.\n\nSelecciona *1* para agregar el primer gasto.';
        } else {
          response = `📋 *Resumen del grupo*\n\n` +
            `💰 *Total gastado:* ${summary.total}\n` +
            `👥 *Participantes:* ${summary.participantCount}\n` +
            `📊 *Por persona:* ${summary.perPerson}\n\n` +
            `*Gastos registrados:*\n\n` +
            summary.expenses.map((e, i) => 
              `${i+1}. ${e.amount} - ${e.description}\n   💳 Pagó: ${e.payer_name || 'N/A'}`
            ).join('\n\n') +
            '\n\n¿Qué deseas hacer?\n1. Agregar gasto\n2. Ver resumen\n3. Calcular división\n4. Volver al menú';
        }
        break;
      case '3':
        const split = calculateSplit(groupId);
        if (split.transactions.length === 0) {
          response = '✅ *¡Todo pagado!*\n\nNo hay deudas pendientes. Todos están al día.';
        } else {
          response = `💸 *División de gastos*\n\n` +
            `💰 Total: ${split.total}\n` +
            `👥 Por persona: ${split.perPerson}\n\n` +
            `*Transferencias a realizar:*\n\n` +
            split.transactions.map((t, i) => 
              `${i+1}. *${t.from}* paga *${t.amount}* a *${t.to}*`
            ).join('\n\n') +
            '\n\n_Estas transferencias minimizan la cantidad de pagos necesarios._';
        }
        break;
      case '4':
        response = getMainMenu(userName);
        updateSession(userPhone, 'main');
        break;
      default:
        response = '❌ Opción inválida.\n\n1. Agregar gasto\n2. Ver resumen\n3. Calcular división\n4. Volver al menú';
    }
  }
  else if (currentModule === 'expenses_add_expense') {
    const context = JSON.parse(session.context);
    const groupId = context.groupId;
    
    // Parsear: Monto | Descripción | Quién pagó
    const parts = messageText.split('|').map(p => p.trim());
    if (parts.length === 3) {
      const [amountStr, description, payerName] = parts;
      const amount = parseFloat(amountStr);
      
      if (isNaN(amount) || amount <= 0) {
        response = '❌ Monto inválido. Debe ser un número mayor a 0.\n\nEjemplo: 5000 | Carne | Juan';
      } else {
        // Buscar teléfono del pagador por nombre
        const participant = db.prepare(`
          SELECT phone FROM group_participants 
          WHERE group_id = ? AND LOWER(name) = LOWER(?)
        `).get(groupId, payerName);
        
        if (!participant) {
          response = `❌ "${payerName}" no está en el grupo.\n\nParticipantes actuales:\n` +
            db.prepare('SELECT name FROM group_participants WHERE group_id = ?')
              .all(groupId)
              .map((p, i) => `${i+1}. ${p.name}`)
              .join('\n');
        } else {
          addExpense(groupId, participant.phone, amount, description);
          response = `✅ Gasto agregado:\n\n💵 ${amount}\n📝 ${description}\n💳 Pagado por: ${payerName}\n\n¿Agregar otro gasto?\n\nEnvía: Monto | Descripción | Quién pagó\nO escribe *"ver"* para ver el resumen`;
        }
      }
    } else if (messageText.toLowerCase() === 'ver') {
      response = '📋 Volviendo al resumen...\n\n1. Agregar gasto\n2. Ver resumen\n3. Calcular división\n4. Volver al menú';
      updateSession(userPhone, 'expenses_manage', JSON.stringify({ groupId }));
    } else {
      response = '❌ Formato incorrecto.\n\nUsa: *Monto | Descripción | Quién pagó*\n\nEjemplo:\n3500 | Bebidas | María';
    }
  }
  else if (currentModule === 'ai') {
    response = await processWithAI(messageText, userPhone);
  }

  await msg.reply(response);
  console.log(`✅ Respuesta enviada: ${response.substring(0, 50)}...`);
}

// ============================================
// INICIALIZAR CLIENTE DE WHATSAPP
// ============================================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'bot-asistente'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// Evento: QR Code
client.on('qr', (qr) => {
  console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n👆 Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo\n');
});

// Evento: Conectado
client.on('ready', () => {
  console.log('\n✅ ¡BOT CONECTADO A WHATSAPP!\n');
  console.log('💬 El bot está listo para recibir mensajes\n');
  console.log('📋 Para probar, envía "hola" desde otro teléfono\n');
  console.log('👥 También puedes agregar el bot a un grupo para dividir gastos\n');
});

// Evento: Bot agregado a un grupo
client.on('group_join', async (notification) => {
  try {
    console.log('👥 Bot agregado a un grupo:', notification);
  } catch (error) {
    console.error('Error en group_join:', error);
  }
});

// Evento: Mensaje recibido
client.on('message', async (msg) => {
  try {
    // Ignorar estados de WhatsApp
    if (msg.from === 'status@broadcast') {
      return;
    }
    
    // Ignorar mensajes propios
    if (msg.fromMe) {
      return;
    }
    
    await handleMessage(msg);
  } catch (error) {
    console.error('Error manejando mensaje:', error);
    try {
      await msg.reply('❌ Ocurrió un error. Por favor intenta de nuevo.');
    } catch (replyError) {
      console.error('Error enviando mensaje de error:', replyError);
    }
  }
});

// Evento: Desconectado
client.on('disconnected', (reason) => {
  console.log('❌ Bot desconectado:', reason);
});

// ============================================
// FUNCIÓN DE BIENVENIDA
// ============================================

async function sendWelcomeMessage(client, phone, name, groupName, creatorName) {
  const formattedNumber = `${phone}@c.us`;
  const message = `👋 ¡Hola *${name}*!\n\nFuiste agregado por *${creatorName}* al grupo de gastos *\"${groupName}\"*.\n\n🤖 Soy *Milo*, tu asistente personal en WhatsApp.\nPuedo ayudarte a dividir gastos, crear recordatorios y organizar eventos.\n\n📌 Guardame como *\"Milo 💬\"* para poder chatear conmigo directamente.\n\nEscribí *hola* o *menu* cuando quieras empezar.`;
  try {
    await client.sendMessage(formattedNumber, message);
    console.log(`✅ Bienvenida enviada a ${name} (${phone})`);
  } catch (error) {
    console.error(`⚠️ No se pudo enviar la bienvenida a ${name} (${phone}):`, error.message);
  }
}

// ============================================
// INICIALIZACIÓN DEL BOT
// ============================================

// Iniciar servicio de notificaciones de calendario
calendarModule.startNotificationService(client, db);
console.log('🔔 Servicio de notificaciones de calendario iniciado');

// Iniciar el cliente de WhatsApp
console.log('🚀 Iniciando bot...');
client.initialize();

