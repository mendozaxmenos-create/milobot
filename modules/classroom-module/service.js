const { google } = require('googleapis');
const googleIntegration = require('../calendar-module/google');
const calendarDatabase = require('../calendar-module/database');
const classroomDb = require('./database');

function isPermissionError(error) {
  if (!error) return false;
  const code = error.code || error.status;
  const message = error.message || '';
  return code === 403 || message.includes('insufficientPermissions') || message.includes('Request had insufficient authentication scopes.');
}

function toISODate(obj = {}) {
  const { year, month, day } = obj;
  if (!year || !month || !day) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function toISOTime(obj = {}) {
  const { hours = 0, minutes = 0, seconds = 0 } = obj;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function computeDueAt(dueDate, dueTime) {
  if (!dueDate) return null;
  const time = dueTime || '00:00:00';
  const isoString = `${dueDate}T${time}`;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return `${dueDate} ${time}`;
  }
  return date.toISOString();
}

function formatDateHuman(dateString, options = {}) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  const locale = options.locale || 'es-AR';
  const dateOpts = { weekday: 'short', day: '2-digit', month: 'short' };
  const timeOpts = { hour: '2-digit', minute: '2-digit' };

  const formattedDate = date.toLocaleDateString(locale, dateOpts);
  const formattedTime = date.toLocaleTimeString(locale, timeOpts);
  return `${formattedDate} ${formattedTime}`;
}

async function buildOAuthClientForAccount(account) {
  const client = googleIntegration.getOAuth2Client();
  client.setCredentials({
    access_token: account.access_token || null,
    refresh_token: account.refresh_token || null,
    expiry_date: account.expiry_date || null
  });
  return client;
}

async function refreshTokensIfNeeded(db, account, oauthClient) {
  let tokensUpdated = false;
  const now = Date.now();
  const expiry = account.expiry_date ? Number(account.expiry_date) : null;

  if (!expiry || expiry <= now + 60_000) {
    try {
      const response = await oauthClient.refreshAccessToken();
      const credentials = response.credentials || response;
      classroomDb.updateAccountTokens(db, account.id, {
        access_token: credentials.access_token || null,
        refresh_token: credentials.refresh_token !== undefined ? credentials.refresh_token : account.refresh_token,
        expiry_date: credentials.expiry_date || null
      });
      account.access_token = credentials.access_token || account.access_token;
      if (credentials.refresh_token) {
        account.refresh_token = credentials.refresh_token;
      }
      account.expiry_date = credentials.expiry_date || account.expiry_date;
      oauthClient.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expiry_date: account.expiry_date
      });
      tokensUpdated = true;
    } catch (error) {
      console.error('❌ Error renovando token de Classroom:', error);
      throw error;
    }
  }

  return tokensUpdated;
}

async function fetchCourseMap(db, userPhone, account, classroomApi) {
  let courses = [];
  let pageToken = undefined;
  do {
    const response = await classroomApi.courses.list({
      pageSize: 100,
      courseStates: ['ACTIVE'],
      pageToken
    });
    const batch = response.data.courses || [];
    courses = courses.concat(batch);
    pageToken = response.data.nextPageToken || null;
  } while (pageToken);

  const courseMap = classroomDb.saveCourses(db, userPhone, account.id, courses);
  return { courses, courseMap };
}

async function syncAccount(db, userPhone, account) {
  const oauthClient = await buildOAuthClientForAccount(account);
  try {
    await refreshTokensIfNeeded(db, account, oauthClient);
  } catch (error) {
    return {
      success: false,
      account,
      requiresReauth: true,
      error: 'No se pudo renovar el acceso. Vuelve a autorizar esta cuenta.'
    };
  }

  const classroomApi = google.classroom({ version: 'v1', auth: oauthClient });
  const summary = {
    success: true,
    account,
    courses: 0,
    announcements: 0,
    coursework: 0,
    requiresReauth: false,
    errors: []
  };

  let courses;
  let courseMap;
  try {
    const result = await fetchCourseMap(db, userPhone, account, classroomApi);
    courses = result.courses;
    courseMap = result.courseMap;
    summary.courses = courseMap.size;
  } catch (error) {
    if (isPermissionError(error)) {
      summary.success = false;
      summary.requiresReauth = true;
      summary.error = 'Sin permisos para leer cursos.';
    } else {
      console.error(`❌ Error listando cursos (cuenta ${account.account_email}):`, error);
      summary.success = false;
      summary.error = error.message || 'Error listando cursos.';
    }
    return summary;
  }

  for (const course of courses) {
    const localCourseId = courseMap.get(course.id);
    if (!localCourseId) continue;

    // Announcements
    try {
      const response = await classroomApi.courses.announcements.list({
        courseId: course.id,
        pageSize: 25,
        orderBy: 'updateTime desc'
      });
      const announcements = (response.data.announcements || []).map(item => ({
        id: item.id,
        text: item.text || '',
        materials: item.materials || null,
        creationTime: item.creationTime || null,
        updateTime: item.updateTime || null,
        creatorUserId: item.creatorUserId || null,
        state: item.state || null
      }));

      classroomDb.saveAnnouncements(db, userPhone, account.id, localCourseId, announcements);
      summary.announcements += announcements.length;
    } catch (error) {
      if (isPermissionError(error)) {
        summary.requiresReauth = true;
        summary.errors.push(`Sin permisos para anuncios de "${course.name}".`);
      } else {
        console.error(`❌ Error obteniendo anuncios (${course.name}):`, error);
        summary.errors.push(`No se pudieron leer anuncios de "${course.name}".`);
      }
    }

    // Coursework
    try {
      const response = await classroomApi.courses.courseWork.list({
        courseId: course.id,
        pageSize: 40,
        orderBy: 'dueDate desc'
      });
      const courseworkItems = (response.data.courseWork || []).map(item => {
        const dueDate = item.dueDate ? toISODate(item.dueDate) : null;
        const dueTime = item.dueTime ? toISOTime(item.dueTime) : null;
        const dueAt = computeDueAt(dueDate, dueTime);

        return {
          id: item.id,
          title: item.title || '',
          description: item.description || '',
          dueDate,
          dueTime,
          dueAt,
          alternateLink: item.alternateLink || null,
          maxPoints: item.maxPoints !== undefined ? item.maxPoints : null,
          workType: item.workType || null,
          state: item.state || null,
          creationTime: item.creationTime || null,
          updateTime: item.updateTime || null
        };
      });

      classroomDb.saveCoursework(db, userPhone, account.id, localCourseId, courseworkItems);
      summary.coursework += courseworkItems.length;
    } catch (error) {
      if (isPermissionError(error)) {
        summary.requiresReauth = true;
        summary.errors.push(`Sin permisos para tareas de "${course.name}".`);
      } else {
        console.error(`❌ Error obteniendo tareas (${course.name}):`, error);
        summary.errors.push(`No se pudieron leer tareas de "${course.name}".`);
      }
    }
  }

  const now = Date.now();
  classroomDb.updateAccountTokens(db, account.id, { last_sync: now });
  classroomDb.updateUserState(db, userPhone, { last_sync: now });
  calendarDatabase.updateGoogleLastSync(db, userPhone, now);
  return summary;
}

async function syncClassroomData(db, userPhone) {
  const accounts = classroomDb.getAccounts(db, userPhone);
  if (!accounts.length) {
    return {
      success: false,
      needsAuth: true,
      error: 'No hay cuentas de Classroom conectadas todavía.'
    };
  }

  const aggregate = {
    success: true,
    courses: 0,
    announcements: 0,
    coursework: 0,
    requiresReauth: false,
    errors: [],
    accountSummaries: []
  };

  for (const account of accounts) {
    try {
      const summary = await syncAccount(db, userPhone, account);
      aggregate.accountSummaries.push(summary);
      if (!summary.success) {
        aggregate.success = false;
        if (summary.requiresReauth) aggregate.requiresReauth = true;
        if (summary.error) aggregate.errors.push(`(${summary.account.account_email}) ${summary.error}`);
      }
      aggregate.courses += summary.courses || 0;
      aggregate.announcements += summary.announcements || 0;
      aggregate.coursework += summary.coursework || 0;
      if (Array.isArray(summary.errors)) {
        summary.errors.forEach(err => aggregate.errors.push(`(${summary.account.account_email}) ${err}`));
      }
      if (summary.requiresReauth) aggregate.requiresReauth = true;
    } catch (error) {
      console.error(`❌ Error sincronizando cuenta ${account.account_email}:`, error);
      aggregate.success = false;
      aggregate.requiresReauth = aggregate.requiresReauth || isPermissionError(error);
      aggregate.errors.push(`(${account.account_email}) ${error.message || 'Error durante la sincronización.'}`);
    }
  }

  return aggregate;
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const group = item[key];
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

function summarizeAnnouncementsForAccount(list = [], options = {}) {
  if (!list.length) return '🗞️ No hay anuncios nuevos.\n';

  const grouped = groupBy(list, 'course_name');
  const courseNames = Object.keys(grouped).slice(0, options.maxCourses || 4);
  let output = '🗞️ *Anuncios recientes*\n';

  courseNames.forEach(courseName => {
    const items = grouped[courseName] || [];
    output += `\n• ${courseName || 'Curso sin nombre'}:\n`;
    items.slice(0, options.maxItemsPerCourse || 3).forEach(announcement => {
      const timestamp = formatDateHuman(announcement.update_time || announcement.creation_time);
      const text = (announcement.text || '').replace(/\s+/g, ' ').trim();
      const trimmed = text.length > 160 ? `${text.slice(0, 157)}...` : text || '(sin contenido)';
      output += `   - ${trimmed}${timestamp ? ` (${timestamp})` : ''}\n`;
    });
    if (items.length > (options.maxItemsPerCourse || 3)) {
      output += '   - …\n';
    }
  });

  return `${output}\n`;
}

function summarizeCourseworkForAccount(upcoming = [], overdue = []) {
  let output = '';

  if (upcoming.length) {
    output += '🎯 *Próximas entregas*\n';
    upcoming.slice(0, 6).forEach(item => {
      const dueText = item.due_at ? formatDateHuman(item.due_at) : 'Sin fecha';
      output += `\n• ${item.course_name || 'Curso'}\n   ${item.title || '(Sin título)'}\n   ⏰ ${dueText}\n`;
    });
    if (upcoming.length > 6) output += '\n… hay más entregas próximas.\n';
    output += '\n';
  } else {
    output += '🎯 No hay entregas próximas.\n\n';
  }

  if (overdue.length) {
    output += '⚠️ *Entregas atrasadas*\n';
    overdue.slice(0, 5).forEach(item => {
      const dueText = item.due_at ? formatDateHuman(item.due_at) : 'Sin fecha';
      output += `\n• ${item.course_name || 'Curso'}\n   ${item.title || '(Sin título)'}\n   ⏰ Venció: ${dueText}\n`;
    });
    if (overdue.length > 5) output += '\n… hay más tareas atrasadas.\n';
    output += '\n';
  }

  return output;
}

function buildSummaryMessage(db, userPhone, options = {}) {
  const accounts = classroomDb.getAccounts(db, userPhone);
  if (!accounts.length) {
    return {
      message: '🏫 Aún no conectaste ninguna cuenta de Google Classroom.\n\nVe a la opción 4️⃣ del menú para agregar una cuenta.',
      data: {}
    };
  }

  const announcements = classroomDb.getRecentAnnouncements(
    db,
    userPhone,
    options.announcementLimit || 40
  );
  const upcoming = classroomDb.getUpcomingCoursework(db, userPhone, {
    limit: options.upcomingLimit || 40
  });
  const overdue = classroomDb.getOverdueCoursework(
    db,
    userPhone,
    options.overdueLimit || 20
  );
  const state = classroomDb.getUserState(db, userPhone);

  const lastSync = state?.last_sync
    ? formatDateHuman(new Date(state.last_sync).toISOString())
    : 'Sin sincronizar';

  let message = '📚 Te resumo todo lo que pasa en Classroom 😉\n';
  message += `⏱️ Última sincronización general: ${lastSync}\n`;
  message += `👥 Cuentas conectadas: ${accounts.length}\n\n`;

  const announcementsByAccount = groupBy(announcements, 'account_id');
  const upcomingByAccount = groupBy(upcoming, 'account_id');
  const overdueByAccount = groupBy(overdue, 'account_id');

  accounts.forEach(account => {
    const label = account.account_name || account.account_email;
    message += `👤 *${label}*\n`;

    const accountAnnouncements = announcementsByAccount[account.id] || [];
    const accountUpcoming = upcomingByAccount[account.id] || [];
    const accountOverdue = overdueByAccount[account.id] || [];

    message += summarizeAnnouncementsForAccount(accountAnnouncements);
    message += summarizeCourseworkForAccount(accountUpcoming, accountOverdue);

    if (!accountAnnouncements.length && !accountUpcoming.length && !accountOverdue.length) {
      message += '✅ Sin novedades para esta cuenta.\n\n';
    }
  });

  if (!announcements.length && !upcoming.length && !overdue.length) {
    message += '✅ No hay novedades en ninguna de tus cuentas por el momento.\n';
  }

  message += '\n🔄 Escribí *2* para sincronizar manualmente, *3* para gestionar cuentas o *menu* para volver.';

  return {
    message,
    data: {
      announcements,
      upcoming,
      overdue,
      accounts
    }
  };
}

module.exports = {
  syncClassroomData,
  buildSummaryMessage,
  syncAccount
};


