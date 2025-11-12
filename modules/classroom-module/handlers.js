const menus = require('./menus');
const service = require('./service');
const classroomDb = require('./database');
const calendarDatabase = require('../calendar-module/database');
const googleIntegration = require('../calendar-module/google');
const { google } = require('googleapis');

let getGlobalMainMenu = null;

function setMainMenuProvider(fn) {
  if (typeof fn === 'function') {
    getGlobalMainMenu = fn;
  }
}

function getRootMenu(userName) {
  if (getGlobalMainMenu) {
    return getGlobalMainMenu(userName);
  }
  return `Hola *${userName}*! 👋\n\n🤖 *Soy Milo, tu asistente personal*\n\nSelecciona una opción:\n\n1️⃣ 🌤️ Pronóstico para hoy\n2️⃣ 📅 Calendario & Recordatorios\n3️⃣ 💰 Dividir Gastos\n4️⃣ 🏫 Google Classroom\n5️⃣ 🤖 Asistente IA\n6️⃣ 💱 Conversor de Monedas\n7️⃣ 🤝 Invitar a un amigo\n8️⃣ ⚙️ Configuración\n9️⃣ ℹ️ Ayuda`;
}

function getAccountLabel(account) {
  return account.account_name || account.account_email;
}

function buildMainMenu(db, userPhone) {
  const state = classroomDb.getUserState(db, userPhone);
  const accounts = classroomDb.getAccounts(db, userPhone);
  const lastSyncLabel = state?.last_sync
    ? new Date(state.last_sync).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  let menu = menus.getMainMenu({ lastSyncLabel });
  menu += accounts.length
    ? `\n👥 Cuentas conectadas: ${accounts.length}\n`
    : `\n🔌 No hay cuentas conectadas todavía.\n`;
  return menu;
}

function buildAccountsList(accounts) {
  if (!accounts.length) {
    return '🔌 Aún no conectaste ninguna cuenta.';
  }

  return accounts
    .map((account, index) => {
      const label = getAccountLabel(account);
      const lastSync = account.last_sync
        ? new Date(account.last_sync).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'Sin sincronizar';
      return `${index + 1}. ${label}\n   📧 ${account.account_email}\n   ⏱️ Último sync: ${lastSync}`;
    })
    .join('\n\n');
}

async function buildAuthInstructions(db, userPhone, context) {
  if (!googleIntegration.hasGoogleCredentials()) {
    return {
      available: false,
      message: '⚠️ Faltan las credenciales de Google en el servidor. Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI.'
    };
  }

  const authUrl = googleIntegration.getAuthUrl();
  return {
    available: true,
    authUrl,
    message: menus.getAuthInstructions(authUrl),
    context
  };
}

async function handleAuthCode(db, userPhone, code, context = {}) {
  try {
    const tokenResult = await googleIntegration.getTokensFromCode(code);
    if (!tokenResult.success || !tokenResult.tokens) {
      return { success: false, message: `❌ No pude validar el código. ${tokenResult.error || 'Intenta nuevamente.'}` };
    }

    const tokens = tokenResult.tokens;
    const expiry =
      tokens.expiry_date ||
      (tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null);

    const oauthClient = googleIntegration.getOAuth2Client();
    oauthClient.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: expiry
    });

    const classroomApi = google.classroom({ version: 'v1', auth: oauthClient });
    let profileData = {};
    try {
      const profile = await classroomApi.userProfiles.get({ userId: 'me' });
      profileData = profile.data || {};
    } catch (error) {
      console.error('❌ Error obteniendo perfil de Classroom:', error);
      return {
        success: false,
        message: '❌ No pude identificar la cuenta de Google Classroom. Intenta nuevamente.'
      };
    }

    const email =
      profileData.emailAddress ||
      (profileData.emailAddresses && profileData.emailAddresses[0] && profileData.emailAddresses[0].emailAddress);

    if (!email) {
      return {
        success: false,
        message: '❌ No pude obtener el correo de la cuenta. Intenta nuevamente.'
      };
    }

    const name =
      (profileData.name && profileData.name.fullName) ||
      (profileData.name && profileData.name.givenName) ||
      email;

    const accountRecord = classroomDb.saveAccount(db, userPhone, {
      account_email: email,
      account_name: name,
      access_token: tokens.access_token || null,
      refresh_token: tokens.refresh_token || null,
      expiry_date: expiry || null,
      last_sync: null
    });

    const existingCalendarTokens = calendarDatabase.getGoogleTokens(db, userPhone);
    if (!existingCalendarTokens || context?.setAsPrimary) {
      calendarDatabase.saveGoogleTokens(db, userPhone, {
        access_token: tokens.access_token || null,
        refresh_token: tokens.refresh_token || null,
        expiry_date: expiry || null
      });
    }

    return {
      success: true,
      account: accountRecord,
      profile: { email, name }
    };
  } catch (error) {
    console.error('❌ Error procesando código de Classroom:', error);
    return {
      success: false,
      message: `❌ Hubo un problema procesando el código: ${error.message}`
    };
  }
}

async function handleMessage(msg, userPhone, userName, messageText, currentModule, session, db, client) {
  const normalizedMessage = (messageText || '').trim().toLowerCase();
  const context = session?.context ? JSON.parse(session.context) : {};
  let response = '';

  const updateSession = (module, newContext = null) => {
    const stmt = db.prepare(`
      INSERT INTO sessions (user_phone, current_module, context, last_updated)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_phone) DO UPDATE SET
        current_module = ?,
        context = ?,
        last_updated = CURRENT_TIMESTAMP
    `);
    stmt.run(userPhone, module, newContext, module, newContext);
  };

  const accounts = classroomDb.getAccounts(db, userPhone);

  if (['resumen classroom', 'resumen classroom!', 'classroom', 'resumen colegio'].includes(normalizedMessage)) {
    if (!accounts.length) {
      const auth = await buildAuthInstructions(db, userPhone, { intent: 'add_account' });
      updateSession('classroom_auth', JSON.stringify(auth.context || {}));
      return `🏫 *Google Classroom*\n\nNo tenés cuentas conectadas.\n\n${auth.message}`;
    }
    updateSession('classroom');
    return buildMainMenu(db, userPhone);
  }

  if (currentModule === 'classroom_auth') {
    if (['cancelar', 'volver', 'menu', 'menú'].includes(normalizedMessage)) {
      updateSession('classroom');
      return buildMainMenu(db, userPhone);
    }

    const code = messageText.trim();
    const authResult = await handleAuthCode(db, userPhone, code, context);
    if (!authResult.success) {
      const auth = await buildAuthInstructions(db, userPhone, context);
      updateSession('classroom_auth', JSON.stringify(auth.context || {}));
      return `${authResult.message}\n\n${auth.message}`;
    }

    let syncMsg = '';
    try {
      const summary = await service.syncAccount(db, userPhone, authResult.account);
      if (!summary.success) {
        syncMsg = summary.requiresReauth
          ? '\n⚠️ Se conectó la cuenta, pero debemos reautorizar para leer los datos.'
          : summary.error
            ? `\n⚠️ Error sincronizando la cuenta: ${summary.error}`
            : '';
      }
    } catch (error) {
      console.error('❌ Error sincronizando la nueva cuenta:', error);
      syncMsg = '\n⚠️ Hubo un problema al sincronizar la cuenta.';
    }

    const globalSummary = service.buildSummaryMessage(db, userPhone);
    updateSession('classroom');
    return `✅ Cuenta conectada: *${authResult.profile.name}*\n📧 ${authResult.profile.email}${syncMsg}\n\n${globalSummary.message}`;
  }

  if (currentModule === 'classroom_accounts_remove') {
    const accountsContext = context.accounts || [];
    if (!accountsContext.length) {
      updateSession('classroom_config');
      return '❌ No hay cuentas para eliminar.\n\n' + menus.getConfigMenu();
    }

    if (['cancelar', 'volver', 'menu', 'menú'].includes(normalizedMessage)) {
      updateSession('classroom_config');
      return menus.getConfigMenu();
    }

    const index = parseInt(normalizedMessage, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= accountsContext.length) {
      return '❌ Número inválido. Escribe el número de la cuenta o *cancelar*.';
    }

    const account = accountsContext[index];
    classroomDb.clearUserData(db, userPhone, account.id);
    classroomDb.deleteAccount(db, userPhone, account.id);

    updateSession('classroom_config');
    return `🗑️ Cuenta eliminada: ${getAccountLabel(account)}\n\n${menus.getConfigMenu()}`;
  }

  if (currentModule === 'classroom_config_clear_confirm') {
    if (['cancelar', 'volver', 'menu', 'menú'].includes(normalizedMessage)) {
      updateSession('classroom_config');
      return menus.getConfigMenu();
    }

    const accountsContext = context.accounts || [];
    if (!accountsContext.length) {
      classroomDb.clearUserData(db, userPhone);
      updateSession('classroom_config');
      return '🧹 Se eliminaron los datos locales de Classroom.\n\n' + menus.getConfigMenu();
    }

    const selection = parseInt(normalizedMessage, 10);
    if (Number.isNaN(selection) || selection < 0 || selection > accountsContext.length) {
      return '❌ Opción inválida. Usa el número de la cuenta, 0 para todas o *cancelar*.';
    }

    if (selection === 0) {
      classroomDb.clearUserData(db, userPhone);
      updateSession('classroom_config');
      return '🧹 Se limpiaron los datos de todas las cuentas (las cuentas siguen conectadas).\n\n' + menus.getConfigMenu();
    }

    const account = accountsContext[selection - 1];
    classroomDb.clearUserData(db, userPhone, account.id);
    updateSession('classroom_config');
    return `🧹 Datos de ${getAccountLabel(account)} eliminados (la cuenta sigue conectada).\n\n${menus.getConfigMenu()}`;
  }

  if (currentModule === 'classroom_config') {
    switch (normalizedMessage) {
      case '1':
      case '1️⃣': {
        const list = buildAccountsList(accounts);
        return `👥 *Cuentas conectadas*\n\n${list}\n\n${menus.getConfigMenu()}`;
      }
      case '2':
      case '2️⃣': {
        const auth = await buildAuthInstructions(db, userPhone, { intent: 'add_account' });
        updateSession('classroom_auth', JSON.stringify(auth.context || {}));
        return auth.message;
      }
      case '3':
      case '3️⃣': {
        if (!accounts.length) {
          return '❌ No hay cuentas para eliminar.\n\n' + menus.getConfigMenu();
        }
        const list = accounts
          .map((account, index) => `${index + 1}. ${getAccountLabel(account)} (${account.account_email})`)
          .join('\n');
        updateSession('classroom_accounts_remove', JSON.stringify({ accounts }));
        return `🗑️ *Eliminar cuenta*\n\n${list}\n\nEscribe el número de la cuenta que querés quitar o *cancelar*.`;
      }
      case '4':
      case '4️⃣': {
        const courses = classroomDb.getCourses(db, userPhone);
        if (!courses.length) {
          return '📚 No hay cursos sincronizados aún.\n\n' + menus.getConfigMenu();
        }
        const text = courses
          .map(course => {
            const account = accounts.find(acc => acc.id === course.account_id);
            const label = account ? getAccountLabel(account) : 'Cuenta desconocida';
            const section = course.section ? ` (${course.section})` : '';
            return `• ${course.name || 'Curso sin nombre'}${section}\n   👤 ${label}`;
          })
          .join('\n\n');
        return `📚 *Cursos sincronizados*\n\n${text}\n\n${menus.getConfigMenu()}`;
      }
      case '5':
      case '5️⃣': {
        if (!accounts.length) {
          classroomDb.clearUserData(db, userPhone);
          return '🧹 Se limpiaron los datos locales de Classroom.\n\n' + menus.getConfigMenu();
        }
        const list = accounts
          .map((account, index) => `${index + 1}. ${getAccountLabel(account)} (${account.account_email})`)
          .join('\n');
        updateSession(
          'classroom_config_clear_confirm',
          JSON.stringify({ accounts })
        );
        return `🧹 *Limpiar datos locales*\n\n0. Todos\n${list}\n\nEscribe qué deseas limpiar o *cancelar*.`;
      }
      case '6':
      case '6️⃣':
      case 'menu':
      case 'menú':
      case 'volver':
        updateSession('classroom');
        return buildMainMenu(db, userPhone);
      default:
        return '❌ Opción no válida.\n\n' + menus.getConfigMenu();
    }
  }

  if (currentModule === 'classroom') {
    switch (normalizedMessage) {
      case '1':
      case '1️⃣':
      case 'resumen': {
        if (!accounts.length) {
          const auth = await buildAuthInstructions(db, userPhone, { intent: 'add_account' });
          updateSession('classroom_auth', JSON.stringify(auth.context || {}));
          return `🏫 *Google Classroom*\n\nNo tenés cuentas conectadas.\n\n${auth.message}`;
        }

        const syncResult = await service.syncClassroomData(db, userPhone);
        if (!syncResult.success) {
          if (syncResult.needsAuth || syncResult.requiresReauth) {
            const auth = await buildAuthInstructions(db, userPhone, { intent: 'reauthorize' });
            updateSession('classroom_auth', JSON.stringify(auth.context || {}));
            return `⚠️ Necesitamos que vuelvas a autorizar Classroom.\n\n${auth.message}`;
          }
          return `❌ No pude sincronizar Classroom: ${syncResult.error || 'Error desconocido.'}`;
        }

        const summary = service.buildSummaryMessage(db, userPhone);
        classroomDb.updateUserState(db, userPhone, { last_summary_at: Date.now() });
        let output = summary.message;
        if (Array.isArray(syncResult.errors) && syncResult.errors.length) {
          output += `\n\n⚠️ Incidencias:\n${syncResult.errors.map(err => `• ${err}`).join('\n')}`;
        }
        updateSession('classroom');
        return output;
      }
      case '2':
      case '2️⃣':
      case 'sync': {
        if (!accounts.length) {
          const auth = await buildAuthInstructions(db, userPhone, { intent: 'add_account' });
          updateSession('classroom_auth', JSON.stringify(auth.context || {}));
          return `🏫 *Google Classroom*\n\nNo tenés cuentas conectadas.\n\n${auth.message}`;
        }

        const syncResult = await service.syncClassroomData(db, userPhone);
        if (!syncResult.success) {
          if (syncResult.needsAuth || syncResult.requiresReauth) {
            const auth = await buildAuthInstructions(db, userPhone, { intent: 'reauthorize' });
            updateSession('classroom_auth', JSON.stringify(auth.context || {}));
            return `⚠️ Necesitamos que vuelvas a autorizar Classroom.\n\n${auth.message}`;
          }
          return `❌ Error al sincronizar: ${syncResult.error || 'Error desconocido.'}`;
        }

        let output = '✅ *Sincronización completada*\n\n' +
          `• Cursos revisados: ${syncResult.courses}\n` +
          `• Anuncios revisados: ${syncResult.announcements}\n` +
          `• Tareas revisadas: ${syncResult.coursework}\n`;

        if (Array.isArray(syncResult.accountSummaries)) {
          output += '\n👥 *Detalle por cuenta:*\n';
          syncResult.accountSummaries.forEach(summary => {
            const label = getAccountLabel(summary.account);
            output += `\n- ${label}\n   Cursos: ${summary.courses}\n   Anuncios: ${summary.announcements}\n   Tareas: ${summary.coursework}`;
            if (Array.isArray(summary.errors) && summary.errors.length) {
              output += `\n   ⚠️ ${summary.errors.join(' | ')}`;
            }
            if (summary.requiresReauth) {
              output += '\n   ⚠️ Esta cuenta necesita reautorización.';
            }
          });
        }

        if (syncResult.requiresReauth) {
          output += '\n\n⚠️ Algunas cuentas necesitan que vuelvas a otorgar permisos.';
        }
        if (Array.isArray(syncResult.errors) && syncResult.errors.length) {
          output += '\n\n⚠️ Incidencias globales:\n' + syncResult.errors.map(err => `• ${err}`).join('\n');
        }
        output += `\n\n${buildMainMenu(db, userPhone)}`;
        updateSession('classroom');
        return output;
      }
      case '3':
      case '3️⃣':
      case 'config':
        updateSession('classroom_config');
        return menus.getConfigMenu();
      case '4':
      case '4️⃣':
      case 'menu':
      case 'menú':
      case 'volver':
        updateSession('main');
        return getRootMenu(userName);
      default:
        return `❌ Opción no válida.\n\n${buildMainMenu(db, userPhone)}`;
    }
  }

  if (currentModule === 'main') {
    if (!accounts.length) {
      const auth = await buildAuthInstructions(db, userPhone, { intent: 'add_account' });
      updateSession('classroom_auth', JSON.stringify(auth.context || {}));
      return `🏫 *Google Classroom*\n\nNo tenés cuentas conectadas.\n\n${auth.message}`;
    }
    updateSession('classroom');
    return buildMainMenu(db, userPhone);
  }

  updateSession('main');
  return getRootMenu(userName);
}

module.exports = {
  handleMessage,
  setMainMenuProvider
};

