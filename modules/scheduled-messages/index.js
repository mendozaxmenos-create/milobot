const calendarUtils = require('../calendar-module/utils');

const DAILY_LIMIT = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_DAILY_LIMIT || '3', 10), 0);
const MAX_LIST_ITEMS = Math.max(parseInt(process.env.SCHEDULED_MESSAGES_LIST_LIMIT || '5', 10), 1);

function getServerOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

function normalizePhone(phone = '') {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 6 || digits.length > 15) return null;
  return digits;
}

function getUserTimezoneInfo(db, userPhone) {
  const row = db.prepare(`
    SELECT timezone_name, timezone_offset_minutes
    FROM users
    WHERE phone = ?
  `).get(userPhone);

  const serverOffset = getServerOffsetMinutes();
  const offsetMinutes = (row && row.timezone_offset_minutes !== null && row.timezone_offset_minutes !== undefined)
    ? Number(row.timezone_offset_minutes)
    : serverOffset;

  return {
    name: row?.timezone_name || null,
    offsetMinutes
  };
}

function normalizeName(name) {
  if (!name) {
    return 'che';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return 'che';
  }
  return trimmed.split(' ')[0];
}

function isPremiumUser(db, userPhone) {
  try {
    const premiumModule = require('../premium-module');
    return premiumModule.isPremiumUser(db, userPhone);
  } catch (error) {
    // Fallback si el módulo premium no está disponible
    const user = db.prepare('SELECT is_premium FROM users WHERE phone = ?').get(userPhone);
    return user && user.is_premium === 1;
  }
}

function getPremiumLimit() {
  try {
    const premiumModule = require('../premium-module');
    return premiumModule.PREMIUM_LIMIT;
  } catch (error) {
    // Fallback si el módulo premium no está disponible
    return Math.max(parseInt(process.env.SCHEDULED_MESSAGES_PREMIUM_LIMIT || '20', 10), DAILY_LIMIT);
  }
}

function buildLimitWarning(userName, isPremium = false) {
  const friendly = normalizeName(userName);
  
  if (isPremium) {
    return `⚠️ Alcanzaste el límite de mensajes programados para usuarios Premium.\n\nSi necesitás más, contactanos.`;
  }
  
  return `⚠️ Alcanzaste el límite de mensajes programados (${DAILY_LIMIT} por día).

💎 Para ampliar tu límite, necesitás la versión *Premium*.`;
}

function getPendingCount(db, creatorPhone) {
  const stmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_messages
    WHERE creator_phone = ?
      AND status = 'pending'
  `);
  const result = stmt.get(creatorPhone);
  return result ? Number(result.count) : 0;
}

function checkDailyLimit(db, creatorPhone) {
  const isPremium = isPremiumUser(db, creatorPhone);
  const limit = isPremium ? getPremiumLimit() : DAILY_LIMIT;
  
  if (limit === 0) {
    return { allowed: true, remaining: Infinity, limit: 0, isPremium };
  }
  
  const count = getPendingCount(db, creatorPhone);
  const remaining = Math.max(limit - count, 0);
  
  return {
    allowed: count < limit,
    remaining,
    limit,
    current: count,
    isPremium
  };
}

function startSchedulingFlow(db, creatorPhone, userName) {
  const limit = checkDailyLimit(db, creatorPhone);
  if (!limit.allowed) {
    return {
      abort: true,
      message: buildLimitWarning(userName, limit.isPremium)
    };
  }

  const context = {
    stage: 'collect_text',
    creatorPhone,
    targetChat: creatorPhone,
    targetType: 'user'
  };

  // Construir mensaje con contador
  let message = `Perfecto *${userName}*. Decime qué mensaje querés programar.\n\n`;
  
  // Mostrar contador de mensajes programados
  message += `📊 *Mensajes programados:* ${limit.current}/${limit.limit}`;
  if (limit.isPremium) {
    message += ` 💎`;
  }
  message += `\n`;
  
  if (limit.remaining > 0) {
    message += `✅ Te quedan ${limit.remaining} mensaje${limit.remaining === 1 ? '' : 's'} disponible${limit.remaining === 1 ? '' : 's'}`;
  } else {
    message += `⚠️ Límite alcanzado`;
  }
  
  message += `\n\nEscribí *cancelar* si querés salir.`;

  return {
    abort: false,
    message,
    nextModule: 'scheduled_message_collect_text',
    context: JSON.stringify(context)
  };
}

function parseDateTimeInput(inputText) {
  if (!inputText) {
    return null;
  }

  const text = inputText.trim();
  if (!text) {
    return null;
  }

  const relativeMatch = text.match(/^(?:en|dentro de)\s+(\d+)\s+(minutos|minuto|horas|hora|d[ií]as|d[ií]a)(?:\s+.*)?$/i);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    if (!Number.isNaN(amount) && amount > 0) {
      const unit = relativeMatch[2].toLowerCase();
      let minutesToAdd = amount;
      if (unit.startsWith('hora')) {
        minutesToAdd = amount * 60;
      } else if (unit.startsWith('d')) {
        minutesToAdd = amount * 1440;
      }
      return { date: new Date(Date.now() + minutesToAdd * 60000), isRelative: true };
    }
  }

  let timePart = null;
  let datePart = text;

  const timeRegex = /(\d{1,2}:\d{2}\s*(?:am|pm|a\.m\.|p\.m\.|a|p)?)/i;
  const explicitTime = text.match(timeRegex);
  if (explicitTime) {
    timePart = calendarUtils.parseTime(explicitTime[1]);
    datePart = text.replace(explicitTime[0], '').trim();
  }

  if (!timePart) {
    const altTimeRegex = /(\d{1,2})\s*(hs|h)$/i;
    const altTime = text.match(altTimeRegex);
    if (altTime) {
      timePart = calendarUtils.parseTime(altTime[1]);
      datePart = text.replace(altTime[0], '').trim();
    }
  }

  if (!timePart) {
    timePart = calendarUtils.parseTime(text);
    if (timePart) {
      datePart = 'hoy';
    }
  }

  if (!timePart) {
    return null;
  }

  if (!datePart) {
    datePart = 'hoy';
  }

  datePart = datePart.replace(/\b(a las|a la|a)\b/gi, ' ').trim();
  if (!datePart) {
    datePart = 'hoy';
  }

  const parsedDate = calendarUtils.parseNaturalDate(datePart);
  if (!parsedDate) {
    return null;
  }

  const combined = calendarUtils.combineDateAndTime(parsedDate, timePart);
  if (!combined) {
    return null;
  }

  return { date: new Date(combined.replace(' ', 'T')), isRelative: false };
}

function formatDateTimeForSQLite(date) {
  // Formatear en timezone local del servidor para que coincida con datetime('now', 'localtime') de SQLite
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function createScheduledMessage(db, { creatorPhone, targetChat, targetType, messageBody, sendAt, timezoneOffsetMinutes, recurrenceJson = null }) {
  const stmt = db.prepare(`
    INSERT INTO scheduled_messages (
      creator_phone,
      target_chat,
      target_type,
      message_body,
      send_at,
      timezone_offset,
      status,
      recurrence_json
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  const offset = timezoneOffsetMinutes ?? getServerOffsetMinutes();

  const result = stmt.run(
    creatorPhone,
    targetChat,
    targetType,
    messageBody,
    sendAt,
    offset,
    recurrenceJson
  );

  return result.lastInsertRowid;
}

function buildConfirmationMessage(messageId, context, userName, userPhone, targetChat, recurrence) {
  // Construir mensaje de confirmación con información del destinatario
  let recipientInfo = 'a vos';
  if (context.targetType === 'group') {
    recipientInfo = `a todos los integrantes del grupo *${context.targetName}*`;
  } else if (context.targetName && context.targetName !== userName) {
    recipientInfo = `a ${context.targetName}`;
  } else if (targetChat !== userPhone) {
    recipientInfo = `a ${targetChat}`;
  }

  const scheduledDate = new Date(context.scheduledDate);
  const formattedDate = calendarUtils.formatDateForDisplay(scheduledDate);

  let message = `✅ Mensaje programado (ID #${messageId}).

📅 Se enviará el ${formattedDate} ${recipientInfo}.`;

  if (recurrence) {
    const recurrenceLabels = {
      'daily': 'diariamente',
      'weekly': 'semanalmente',
      'monthly': 'mensualmente'
    };
    message += `\n🔄 Se repetirá ${recurrenceLabels[recurrence.type] || recurrence.type}`;
    if (recurrence.endDate) {
      const endDate = new Date(recurrence.endDate);
      message += ` hasta el ${calendarUtils.formatDateForDisplay(endDate)}`;
    } else {
      message += ` (sin fecha de fin)`;
    }
  }

  message += `\n📝 Contenido:
${context.messageBody}

Escribí *"mensajes programados"* para ver tus pendientes o *"cancelar mensaje ${messageId}"* si cambiás de idea.`;

  return {
    message,
    nextModule: 'main',
    context: null
  };
}

function listScheduledMessages(db, creatorPhone, limit = MAX_LIST_ITEMS) {
  const stmt = db.prepare(`
    SELECT id, message_body, send_at, status, recurrence_json
    FROM scheduled_messages
    WHERE creator_phone = ?
      AND status = 'pending'
    ORDER BY datetime(send_at) ASC
    LIMIT ?
  `);

  return stmt.all(creatorPhone, limit);
}

function cancelScheduledMessage(db, creatorPhone, messageId) {
  const stmt = db.prepare(`
    UPDATE scheduled_messages
    SET status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND creator_phone = ?
      AND status = 'pending'
  `);

  const result = stmt.run(messageId, creatorPhone);
  return result.changes > 0;
}

function cancelAllScheduledMessages(db, creatorPhone) {
  const stmt = db.prepare(`
    UPDATE scheduled_messages
    SET status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
    WHERE creator_phone = ?
      AND status = 'pending'
  `);

  const result = stmt.run(creatorPhone);
  return result.changes;
}

function cancelMultipleScheduledMessages(db, creatorPhone, messageIds) {
  if (!messageIds || messageIds.length === 0) {
    return { cancelled: 0, failed: 0 };
  }

  const placeholders = messageIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE scheduled_messages
    SET status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders})
      AND creator_phone = ?
      AND status = 'pending'
  `);

  const result = stmt.run(...messageIds, creatorPhone);
  const cancelled = result.changes;
  const failed = messageIds.length - cancelled;

  return { cancelled, failed };
}

async function handleFlowMessage({ db, userPhone, userName, messageText, session, client = null }) {
  const context = session?.context ? JSON.parse(session.context) : {};
  const stage = context.stage || 'collect_text';
  const lower = (messageText || '').trim().toLowerCase();

  console.log(`[DEBUG] handleFlowMessage: stage="${stage}", messageText="${messageText?.substring(0, 50)}...", userPhone="${userPhone}"`);

  if (lower === 'cancelar' || lower === 'salir') {
    return {
      message: '👌 Mensaje programado cancelado. Volvemos al menú principal.',
      nextModule: 'main',
      context: null
    };
  }

  if (stage === 'collect_text') {
    const messageBody = messageText && messageText.trim();
    console.log(`[DEBUG] collect_text: messageBody="${messageBody?.substring(0, 50)}...", length=${messageBody?.length || 0}`);
    
    // Si el mensaje es solo un número (1-4), probablemente el usuario está intentando seleccionar una opción
    // pero todavía está en collect_text porque el mensaje anterior no se procesó
    // En este caso, debemos verificar si hay un messageBody guardado en el contexto
    if (messageBody && /^[1-4]$/.test(messageBody)) {
      console.log(`[DEBUG] collect_text: Mensaje es solo un número (${messageBody}), verificando si hay messageBody previo en contexto`);
      
      // Si ya hay un messageBody guardado, significa que el usuario está intentando seleccionar una opción
      // pero la sesión no se actualizó correctamente. Avanzar a collect_recipient con el messageBody previo.
      if (context.messageBody && context.messageBody.trim()) {
        console.log(`[DEBUG] collect_text: Encontrado messageBody previo, avanzando a collect_recipient y procesando opción ${messageBody}`);
        const savedMessageBody = context.messageBody;
        context.stage = 'collect_recipient';
        context.messageBody = savedMessageBody;
        
        // Procesar la opción seleccionada directamente
        // Esto es un workaround para cuando la sesión no se actualizó correctamente
        return await handleRecipientSelection(messageBody, context, userPhone, userName, session, client, db);
      }
    }
    
    if (!messageBody) {
      console.log(`[DEBUG] collect_text: Mensaje vacío, pidiendo contenido`);
      return {
        message: `Necesito que me digas el contenido del mensaje. Intenta nuevamente.\n\nEscribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }

    console.log(`[DEBUG] collect_text: Mensaje recibido, avanzando a collect_recipient`);
    context.stage = 'collect_recipient';
    context.messageBody = messageBody;

    return {
      message: `Genial. ¿A quién querés enviarlo?

1️⃣ A mí mismo
2️⃣ Compartir contacto
3️⃣ Escribir número
4️⃣ Enviar a grupo de WhatsApp

Escribí *cancelar* si querés salir.`,
      nextModule: 'scheduled_message_collect_recipient',
      context: JSON.stringify(context)
    };
  }

  // Función auxiliar para manejar la selección de destinatario cuando hay un problema de sesión
  async function handleRecipientSelection(option, context, userPhone, userName, session, client, db) {
    const optionLower = option.toLowerCase();
    
    if (option === '1' || option === '1️⃣') {
      context.stage = 'collect_datetime';
      context.targetChat = userPhone;
      context.targetType = 'user';
      context.targetName = userName;

      return {
        message: `Perfecto, se enviará a vos. ¿Cuándo querés que lo envíe? Usa el formato \`AAAA-MM-DD HH:MM\` o algo como "mañana 09:00".\n\nEscribí *cancelar* si querés salir.`,
        nextModule: 'scheduled_message_collect_datetime',
        context: JSON.stringify(context)
      };
    }

    if (option === '2' || option === '2️⃣') {
      context.stage = 'waiting_contact';
      return {
        message: `📱 *Compartir Contacto*\n\nToca el ícono de 📎 (adjuntar)\nSelecciona *"Contacto"*\nElige el contacto a agregar\n\n_Escribí *"cancelar"* para volver_`,
        nextModule: 'scheduled_message_waiting_contact',
        context: JSON.stringify(context)
      };
    }

    if (option === '3' || option === '3️⃣') {
      context.stage = 'collect_phone';
      return {
        message: `📱 *Escribir Número*\n\nEscribí el número de teléfono (con código de país):\n\n_Ejemplo: +5491123456789 o 91123456789_\n\nEscribí *cancelar* si querés salir.`,
        nextModule: 'scheduled_message_collect_phone',
        context: JSON.stringify(context)
      };
    }

    if (option === '4' || option === '4️⃣') {
      // Esta es la opción que el usuario quiere: enviar a grupo
      // Llamar a la lógica de selección de grupo
      return await handleGroupSelection(context, userPhone, session, client);
    }

    return null;
  }

  // Función auxiliar para manejar la selección de grupo
  async function handleGroupSelection(context, userPhone, session, client) {
    if (!client) {
      return {
        message: `❌ No tengo acceso al cliente de WhatsApp en este momento. Por favor, intentá más tarde.\n\nEscribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }

    try {
      const chats = await client.getChats();
      const allGroups = chats.filter(chat => chat.isGroup === true);

      if (allGroups.length === 0) {
        return {
          message: `❌ No encontré grupos de WhatsApp donde esté presente.\n\nAsegurate de que esté agregado al grupo antes de intentar enviar mensajes.\n\nEscribí *cancelar* si querés salir.`,
          nextModule: session.current_module,
          context: session.context
        };
      }

      const normalizedUserPhone = normalizePhone(userPhone);
      const userGroups = [];
      const otherGroups = [];
      const preSelectedGroup = context.preSelectedGroup;
      
      for (const group of allGroups) {
        try {
          let isUserMember = false;
          const groupChat = await client.getChatById(group.id._serialized);
          if (groupChat) {
            let participants = [];
            if (groupChat.participants && Array.isArray(groupChat.participants)) {
              participants = groupChat.participants;
            } else if (typeof groupChat.getParticipants === 'function') {
              participants = await groupChat.getParticipants();
            } else if (groupChat.groupMetadata && groupChat.groupMetadata.participants) {
              participants = groupChat.groupMetadata.participants;
            }
            
            if (participants && participants.length > 0 && normalizedUserPhone) {
              isUserMember = participants.some(participant => {
                const participantId = participant.id?._serialized || participant.id?.user || participant.id;
                if (!participantId) return false;
                const participantPhone = participantId.replace('@c.us', '').replace('@g.us', '').replace('@lid', '');
                const normalizedParticipantPhone = normalizePhone(participantPhone);
                return normalizedParticipantPhone === normalizedUserPhone;
              });
            }
          }
          
          if (isUserMember) {
            userGroups.push(group);
          } else {
            otherGroups.push(group);
          }
        } catch (error) {
          console.warn(`[WARN] Error procesando grupo ${group.id?._serialized}:`, error.message);
          otherGroups.push(group);
        }
      }
      
      const groups = [...userGroups, ...otherGroups];
      
      if (groups.length === 0) {
        return {
          message: `❌ No encontré grupos de WhatsApp donde esté presente.\n\nEscribí *cancelar* si querés salir.`,
          nextModule: session.current_module,
          context: session.context
        };
      }

      let groupsList = `📱 *Seleccioná un grupo:*\n\n`;
      let preSelectedIndex = -1;
      let userGroupCount = 0;
      
      groups.forEach((group, index) => {
        const groupName = group.name || `Grupo ${index + 1}`;
        const groupId = group.id._serialized;
        const isUserGroup = index < userGroups.length;
        if (isUserGroup) {
          userGroupCount++;
        }
        const isPreSelected = preSelectedGroup && (groupId === preSelectedGroup.id || groupName === preSelectedGroup.name);
        
        if (isPreSelected) {
          preSelectedIndex = index;
          groupsList += `⭐ ${index + 1}️⃣ ${groupName} (recomendado)`;
          if (isUserGroup) {
            groupsList += ` 👤`;
          }
          groupsList += `\n`;
        } else if (isUserGroup) {
          groupsList += `👤 ${index + 1}️⃣ ${groupName} (tus grupos)\n`;
        } else {
          groupsList += `${index + 1}️⃣ ${groupName}\n`;
        }
      });
      
      if (userGroupCount > 0) {
        groupsList += `\n💡 Los grupos marcados con 👤 son grupos donde sos integrante.`;
      }
      
      if (preSelectedIndex >= 0) {
        groupsList += `\n⭐ El grupo marcado con ⭐ es el que mencionaste en el grupo.`;
      }
      
      groupsList += `\n\nEscribí el número del grupo o *cancelar* para volver.`;

      context.stage = 'select_group';
      context.availableGroups = groups.map(g => ({
        id: g.id._serialized,
        name: g.name || 'Sin nombre'
      }));

      return {
        message: groupsList,
        nextModule: 'scheduled_message_select_group',
        context: JSON.stringify(context)
      };
    } catch (error) {
      console.error('[ERROR] Error obteniendo grupos:', error);
      return {
        message: `❌ Error al obtener los grupos. Por favor, intentá más tarde.\n\nEscribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }
  }

  if (stage === 'collect_recipient') {
    // Si el usuario eligió "1" o "a mí mismo", usar su propio número
    if (messageText === '1' || messageText === '1️⃣' || lower === 'a mí mismo' || lower === 'a mi mismo' || lower === 'mí mismo' || lower === 'mi mismo') {
      context.stage = 'collect_datetime';
      context.targetChat = userPhone;
      context.targetType = 'user';
      context.targetName = userName;

      return {
        message: `Perfecto, se enviará a vos. ¿Cuándo querés que lo envíe? Usa el formato \`AAAA-MM-DD HH:MM\` o algo como "mañana 09:00".\n\nEscribí *cancelar* si querés salir.`,
        nextModule: 'scheduled_message_collect_datetime',
        context: JSON.stringify(context)
      };
    }

    // Si el usuario eligió "2" o "compartir contacto", esperar el contacto
    if (messageText === '2' || messageText === '2️⃣' || lower === 'compartir contacto' || lower === 'compartir') {
      context.stage = 'waiting_contact';
      return {
        message: `📱 *Compartir Contacto*\n\nToca el ícono de 📎 (adjuntar)\nSelecciona *"Contacto"*\nElige el contacto a agregar\n\n_Escribí *"cancelar"* para volver_`,
        nextModule: 'scheduled_message_waiting_contact',
        context: JSON.stringify(context)
      };
    }

    // Si el usuario eligió "3" o "escribir número", pedir el número
    if (messageText === '3' || messageText === '3️⃣' || lower === 'escribir número' || lower === 'escribir numero' || lower === 'número' || lower === 'numero') {
      context.stage = 'collect_phone';
      return {
        message: `📱 *Escribir Número*\n\nEscribí el número de teléfono (con código de país):\n\n_Ejemplo: +5491123456789 o 91123456789_\n\nEscribí *cancelar* si querés salir.`,
        nextModule: 'scheduled_message_collect_phone',
        context: JSON.stringify(context)
      };
    }

    // Si el usuario eligió "4" o "enviar a grupo", listar grupos
    if (messageText === '4' || messageText === '4️⃣' || lower === 'enviar a grupo' || lower === 'grupo' || lower === 'grupos') {
      if (!client) {
        return {
          message: `❌ No tengo acceso al cliente de WhatsApp en este momento. Por favor, intentá más tarde.\n\nEscribí *cancelar* si querés salir.`,
          nextModule: session.current_module,
          context: session.context
        };
      }

      try {
        // Obtener todos los chats (grupos y usuarios)
        const chats = await client.getChats();
        
        // Filtrar solo grupos donde Milo está presente
        const allGroups = chats.filter(chat => {
          return chat.isGroup === true;
        });

        if (allGroups.length === 0) {
          return {
            message: `❌ No encontré grupos de WhatsApp donde esté presente.\n\nAsegurate de que esté agregado al grupo antes de intentar enviar mensajes.\n\nEscribí *cancelar* si querés salir.`,
            nextModule: session.current_module,
            context: session.context
          };
        }

        // Normalizar teléfono del usuario para comparación
        const normalizedUserPhone = normalizePhone(userPhone);
        
        // Separar grupos donde el usuario es miembro de los demás
        const userGroups = [];
        const otherGroups = [];
        const preSelectedGroup = context.preSelectedGroup;
        
        // Verificar cada grupo para ver si el usuario es miembro
        for (const group of allGroups) {
          try {
            let isUserMember = false;
            
            // Intentar obtener participantes del grupo
            try {
              const groupChat = await client.getChatById(group.id._serialized);
              if (groupChat) {
                let participants = [];
                
                // Diferentes formas de obtener participantes según la versión de whatsapp-web.js
                if (groupChat.participants && Array.isArray(groupChat.participants)) {
                  participants = groupChat.participants;
                } else if (typeof groupChat.getParticipants === 'function') {
                  participants = await groupChat.getParticipants();
                } else if (groupChat.groupMetadata && groupChat.groupMetadata.participants) {
                  participants = groupChat.groupMetadata.participants;
                }
                
                // Verificar si el usuario está en los participantes
                if (participants && participants.length > 0 && normalizedUserPhone) {
                  isUserMember = participants.some(participant => {
                    const participantId = participant.id?._serialized || participant.id?.user || participant.id;
                    if (!participantId) return false;
                    
                    // Normalizar ID del participante para comparar
                    const participantPhone = participantId.replace('@c.us', '').replace('@g.us', '').replace('@lid', '');
                    const normalizedParticipantPhone = normalizePhone(participantPhone);
                    
                    return normalizedParticipantPhone === normalizedUserPhone;
                  });
                }
              }
            } catch (error) {
              console.warn(`[WARN] No se pudo verificar participantes del grupo ${group.id._serialized}:`, error.message);
            }
            
            // Agregar a la lista correspondiente
            if (isUserMember) {
              userGroups.push(group);
            } else {
              otherGroups.push(group);
            }
          } catch (error) {
            console.warn(`[WARN] Error procesando grupo ${group.id?._serialized}:`, error.message);
            // En caso de error, agregar a otros grupos
            otherGroups.push(group);
          }
        }
        
        // Combinar: primero grupos del usuario, luego otros
        const groups = [...userGroups, ...otherGroups];
        
        if (groups.length === 0) {
          return {
            message: `❌ No encontré grupos de WhatsApp donde esté presente.\n\nEscribí *cancelar* si querés salir.`,
            nextModule: session.current_module,
            context: session.context
          };
        }

        // Construir lista de grupos
        let groupsList = `📱 *Seleccioná un grupo:*\n\n`;
        
        let preSelectedIndex = -1;
        let userGroupCount = 0;
        
        groups.forEach((group, index) => {
          const groupName = group.name || `Grupo ${index + 1}`;
          const groupId = group.id._serialized;
          
          // Verificar si es grupo del usuario
          const isUserGroup = index < userGroups.length;
          if (isUserGroup) {
            userGroupCount++;
          }
          
          // Verificar si es el grupo pre-seleccionado
          const isPreSelected = preSelectedGroup && (groupId === preSelectedGroup.id || groupName === preSelectedGroup.name);
          
          if (isPreSelected) {
            preSelectedIndex = index;
            groupsList += `⭐ ${index + 1}️⃣ ${groupName} (recomendado)`;
            if (isUserGroup) {
              groupsList += ` 👤`;
            }
            groupsList += `\n`;
          } else if (isUserGroup) {
            groupsList += `👤 ${index + 1}️⃣ ${groupName} (tus grupos)\n`;
          } else {
            groupsList += `${index + 1}️⃣ ${groupName}\n`;
          }
        });
        
        // Agregar leyenda
        if (userGroupCount > 0) {
          groupsList += `\n💡 Los grupos marcados con 👤 son grupos donde sos integrante.`;
        }
        
        if (preSelectedIndex >= 0) {
          groupsList += `\n⭐ El grupo marcado con ⭐ es el que mencionaste en el grupo.`;
        }
        
        groupsList += `\n\nEscribí el número del grupo o *cancelar* para volver.`;

        // Guardar grupos en el contexto
        context.stage = 'select_group';
        context.availableGroups = groups.map(g => ({
          id: g.id._serialized,
          name: g.name || 'Sin nombre'
        }));

        return {
          message: groupsList,
          nextModule: 'scheduled_message_select_group',
          context: JSON.stringify(context)
        };
      } catch (error) {
        console.error('[ERROR] Error obteniendo grupos:', error);
        return {
          message: `❌ Error al obtener los grupos. Por favor, intentá más tarde.\n\nEscribí *cancelar* si querés salir.`,
          nextModule: session.current_module,
          context: session.context
        };
      }
    }

    return {
      message: `❌ Opción no válida.\n\n*1* - A mí mismo\n*2* - Compartir contacto\n*3* - Escribir número\n*4* - Enviar a grupo de WhatsApp\n\nEscribí *cancelar* si querés salir.`,
      nextModule: session.current_module,
      context: session.context
    };
  }

  if (stage === 'collect_phone') {
    const phoneInput = messageText.trim();
    if (!phoneInput) {
      return {
        message: `Necesito un número de teléfono válido. Intenta nuevamente.\n\nEscribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }

    // Normalizar el número (quitar espacios, guiones, paréntesis)
    const normalizedPhone = phoneInput.replace(/\D/g, '');
    if (normalizedPhone.length < 8) {
      return {
        message: `El número parece inválido. Asegurate de incluir el código de país.\n\n_Ejemplo: +5491123456789_\n\nEscribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }

    context.stage = 'collect_datetime';
    context.targetChat = normalizedPhone;
    context.targetType = 'user';
    context.targetName = phoneInput; // Guardar el número ingresado como nombre temporal

    return {
      message: `Perfecto, se enviará a ${phoneInput}. ¿Cuándo querés que lo envíe? Usa el formato \`AAAA-MM-DD HH:MM\` o algo como "mañana 09:00".\n\nEscribí *cancelar* si querés salir.`,
      nextModule: 'scheduled_message_collect_datetime',
      context: JSON.stringify(context)
    };
  }

  if (stage === 'collect_datetime') {
    const parsed = parseDateTimeInput(messageText);

    if (!parsed) {
      return {
        message: `No pude entender la fecha y hora. Intenta con algo como \`2025-11-20 09:00\` o "mañana 8".\n\nEscribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }

    const scheduledDate = parsed.date;
    const isRelative = parsed.isRelative || false;

    const now = new Date();
    const MIN_TIME_MS = 60000; // 1 minuto mínimo
    if (scheduledDate.getTime() <= now.getTime() + MIN_TIME_MS) {
      return {
        message: `⏱️ La fecha y hora deben ser en el futuro (mínimo 1 minuto desde ahora).\n\nIntenta nuevamente.\n\nEscribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }

    const limit = checkDailyLimit(db, userPhone);
    if (!limit.allowed) {
      return {
        message: buildLimitWarning(userName, limit.isPremium),
        nextModule: 'main',
        context: null
      };
    }

    const tzInfo = getUserTimezoneInfo(db, userPhone);
    let adjustedDate = scheduledDate;
    if (!isRelative) {
      const serverOffset = getServerOffsetMinutes();
      const diffMinutes = tzInfo.offsetMinutes - serverOffset;
      adjustedDate = new Date(scheduledDate.getTime() - diffMinutes * 60000);
    }
    
    context.stage = 'collect_recurrence';
    context.sendAt = formatDateTimeForSQLite(adjustedDate);
    context.scheduledDate = scheduledDate.toISOString();
    context.timezoneOffsetMinutes = tzInfo.offsetMinutes;

    return {
      message: `¿Querés que este mensaje se repita automáticamente?

1️⃣ No, enviar solo una vez
2️⃣ Diario (todos los días)
3️⃣ Semanal (cada semana)
4️⃣ Mensual (cada mes)

Escribí *cancelar* si querés salir.`,
      nextModule: 'scheduled_message_collect_recurrence',
      context: JSON.stringify(context)
    };
  }

  if (stage === 'collect_recurrence') {
    const lower = messageText.toLowerCase().trim();
    const targetChat = context.targetChat || userPhone;
    const targetType = context.targetType || 'user';
    
    let recurrence = null;
    let recurrenceType = null;
    
    if (messageText === '1' || messageText === '1️⃣' || lower === 'no' || lower === 'una vez' || lower === 'solo una vez') {
      // No recurrente, crear mensaje único
      recurrence = null;
    } else if (messageText === '2' || messageText === '2️⃣' || lower === 'diario' || lower === 'diariamente' || lower === 'todos los días') {
      recurrenceType = 'daily';
    } else if (messageText === '3' || messageText === '3️⃣' || lower === 'semanal' || lower === 'semanalmente' || lower === 'cada semana') {
      recurrenceType = 'weekly';
    } else if (messageText === '4' || messageText === '4️⃣' || lower === 'mensual' || lower === 'mensualmente' || lower === 'cada mes') {
      recurrenceType = 'monthly';
    } else {
      return {
        message: `❌ Opción no válida.

*1* - No, enviar solo una vez
*2* - Diario
*3* - Semanal
*4* - Mensual

Escribí *cancelar* si querés salir.`,
        nextModule: session.current_module,
        context: session.context
      };
    }

    // Si es recurrente, preguntar fecha de fin (opcional)
    if (recurrenceType) {
      context.recurrenceType = recurrenceType;
      context.stage = 'collect_recurrence_end';
      
      return {
        message: `¿Hasta cuándo querés que se repita?

1️⃣ Sin fecha de fin (se repetirá indefinidamente)
2️⃣ Hasta una fecha específica

_Ejemplo para opción 2: "2025-12-31" o "fin de año"_

Escribí *cancelar* si querés salir.`,
        nextModule: 'scheduled_message_collect_recurrence_end',
        context: JSON.stringify(context)
      };
    }

    // Si no es recurrente, crear el mensaje directamente
    const normalizedCreatorPhone = normalizePhone(userPhone);
    if (!normalizedCreatorPhone) {
      return {
        message: '❌ Error: No se pudo normalizar tu número de teléfono. Por favor, intenta nuevamente.',
        nextModule: 'main',
        context: null
      };
    }
    
    const messageId = createScheduledMessage(db, {
      creatorPhone: normalizedCreatorPhone,
      targetChat,
      targetType,
      messageBody: context.messageBody,
      sendAt: context.sendAt,
      timezoneOffsetMinutes: context.timezoneOffsetMinutes,
      recurrenceJson: null
    });

    return buildConfirmationMessage(messageId, context, userName, userPhone, targetChat, null);
  }

  if (stage === 'collect_recurrence_end') {
    const lower = messageText.toLowerCase().trim();
    let endDate = null;
    
    if (messageText === '1' || messageText === '1️⃣' || lower === 'sin fecha' || lower === 'indefinidamente' || lower === 'sin fin') {
      endDate = null; // Sin fecha de fin
    } else {
      // Intentar parsear la fecha
      const parsedDate = calendarUtils.parseNaturalDate(messageText);
      if (parsedDate) {
        const combined = calendarUtils.combineDateAndTime(parsedDate, '23:59');
        if (combined) {
          endDate = new Date(combined.replace(' ', 'T'));
          // Verificar que la fecha de fin sea después de la fecha de inicio
          const startDate = new Date(context.scheduledDate);
          if (endDate <= startDate) {
            return {
              message: `❌ La fecha de fin debe ser después de la fecha de inicio (${calendarUtils.formatDateForDisplay(startDate)}).\n\nIntenta nuevamente.\n\nEscribí *cancelar* si querés salir.`,
              nextModule: session.current_module,
              context: session.context
            };
          }
        }
      }
      
      if (!endDate) {
        return {
          message: `No pude entender la fecha. Intenta con algo como "2025-12-31" o "fin de año".\n\nO elegí *1* para que se repita indefinidamente.\n\nEscribí *cancelar* si querés salir.`,
          nextModule: session.current_module,
          context: session.context
        };
      }
    }

    // Crear mensaje recurrente
    const normalizedCreatorPhone = normalizePhone(userPhone);
    if (!normalizedCreatorPhone) {
      return {
        message: '❌ Error: No se pudo normalizar tu número de teléfono. Por favor, intenta nuevamente.',
        nextModule: 'main',
        context: null
      };
    }

    const recurrence = {
      type: context.recurrenceType,
      endDate: endDate ? endDate.toISOString() : null
    };

    const targetChat = context.targetChat || userPhone;
    const targetType = context.targetType || 'user';
    
    const messageId = createScheduledMessage(db, {
      creatorPhone: normalizedCreatorPhone,
      targetChat,
      targetType,
      messageBody: context.messageBody,
      sendAt: context.sendAt,
      timezoneOffsetMinutes: context.timezoneOffsetMinutes,
      recurrenceJson: JSON.stringify(recurrence)
    });

    return buildConfirmationMessage(messageId, context, userName, userPhone, targetChat, recurrence);
  }

  return {
    message: 'No entendí ese paso. Volvemos al menú principal.',
    nextModule: 'main',
    context: null
  };
}

function formatScheduledList(items, userOffsetMinutes) {
  if (!items || items.length === 0) {
    return 'No tenés mensajes programados por ahora.';
  }

  const serverOffset = getServerOffsetMinutes();
  const diffMinutes = (userOffsetMinutes !== undefined && userOffsetMinutes !== null)
    ? userOffsetMinutes - serverOffset
    : 0;

  const recurrenceLabels = {
    'daily': '🔄 Diario',
    'weekly': '🔄 Semanal',
    'monthly': '🔄 Mensual'
  };

  const lines = items.map(item => {
    let displayDate = item.send_at;
    if (item.send_at) {
      // send_at está en formato 'YYYY-MM-DD HH:MM:SS' en timezone local del servidor
      // Parsearlo como fecha local (no UTC)
      const [datePart, timePart] = item.send_at.split(' ');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = timePart.split(':').map(Number);
      const baseDate = new Date(year, month - 1, day, hour, minute, second || 0);
      
      // send_at ya está ajustado para la hora del servidor desde la hora del usuario
      // Para mostrarlo en la hora del usuario, necesitamos revertir el ajuste
      // Si diffMinutes > 0, el usuario está adelante del servidor, así que sumamos
      // Si diffMinutes < 0, el usuario está atrás del servidor, así que restamos
      const userDate = new Date(baseDate.getTime() + diffMinutes * 60000);
      displayDate = userDate;
    }
    
    let recurrenceInfo = '';
    if (item.recurrence_json) {
      try {
        const recurrence = JSON.parse(item.recurrence_json);
        recurrenceInfo = `\n   ${recurrenceLabels[recurrence.type] || '🔄 Recurrente'}`;
        if (recurrence.endDate) {
          const endDate = new Date(recurrence.endDate);
          recurrenceInfo += ` hasta ${calendarUtils.formatDateForDisplay(endDate)}`;
        }
      } catch (error) {
        // Ignorar error de parseo
      }
    }
    
    let targetInfo = '';
    if (item.target_type === 'group') {
      targetInfo = '\n   👥 Grupo de WhatsApp';
    }
    
    const header = `#${item.id} • ${calendarUtils.formatDateForDisplay(displayDate)}${recurrenceInfo}${targetInfo}`;
    const body = (item.message_body || '').trim().substring(0, 120);
    return `${header}
   ${body}${body.length === 120 ? '…' : ''}`;
  });

  return `📬 *Tus mensajes programados*

${lines.join('\n\n')}

Para cancelar:
• *"cancelar mensaje ID"* - Cancelar uno específico
• *"cancelar mensaje 1 2 3"* - Cancelar múltiples
• *"cancelar todos"* - Cancelar todos los pendientes`;
}

module.exports = {
  startSchedulingFlow,
  handleFlowMessage,
  listScheduledMessages,
  cancelScheduledMessage,
  cancelAllScheduledMessages,
  cancelMultipleScheduledMessages,
  formatScheduledList,
  buildLimitWarning,
  checkDailyLimit,
  getPendingCount,
  getUserTimezoneInfo,
  getServerOffsetMinutes,
  isPremiumUser,
  getPremiumLimit,
  createScheduledMessage
};
