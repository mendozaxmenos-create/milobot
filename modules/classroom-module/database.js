function addColumnIfMissing(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some(col => col.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_email TEXT NOT NULL,
      account_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      last_sync INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_phone, account_email),
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS classroom_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_id INTEGER,
      google_course_id TEXT NOT NULL,
      name TEXT,
      section TEXT,
      description TEXT,
      room TEXT,
      state TEXT,
      teacher_group TEXT,
      enrollment_code TEXT,
      course_json TEXT,
      updated_at INTEGER,
      UNIQUE(account_id, google_course_id),
      FOREIGN KEY (account_id) REFERENCES classroom_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS classroom_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_id INTEGER,
      course_id INTEGER,
      google_announcement_id TEXT NOT NULL,
      text TEXT,
      materials TEXT,
      creation_time TEXT,
      update_time TEXT,
      creator_user_id TEXT,
      state TEXT,
      UNIQUE(account_id, google_announcement_id),
      FOREIGN KEY (account_id) REFERENCES classroom_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES classroom_courses(id),
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS classroom_coursework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_phone TEXT NOT NULL,
      account_id INTEGER,
      course_id INTEGER,
      google_coursework_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      due_date TEXT,
      due_time TEXT,
      due_at TEXT,
      state TEXT,
      alternate_link TEXT,
      max_points REAL,
      work_type TEXT,
      creation_time TEXT,
      update_time TEXT,
      UNIQUE(account_id, google_coursework_id),
      FOREIGN KEY (account_id) REFERENCES classroom_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES classroom_courses(id),
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS classroom_user_state (
      user_phone TEXT PRIMARY KEY,
      last_sync INTEGER,
      last_summary_at INTEGER,
      last_summary_hash TEXT,
      FOREIGN KEY (user_phone) REFERENCES users(phone)
    );
  `);

  addColumnIfMissing(db, 'classroom_courses', 'account_id', 'INTEGER');
  addColumnIfMissing(db, 'classroom_announcements', 'account_id', 'INTEGER');
  addColumnIfMissing(db, 'classroom_coursework', 'account_id', 'INTEGER');
  addColumnIfMissing(db, 'classroom_accounts', 'account_name', 'TEXT');
  addColumnIfMissing(db, 'classroom_accounts', 'last_sync', 'INTEGER');
}

function saveAccount(db, userPhone, accountData) {
  const stmt = db.prepare(`
    INSERT INTO classroom_accounts (
      user_phone,
      account_email,
      account_name,
      access_token,
      refresh_token,
      expiry_date,
      last_sync
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_phone, account_email) DO UPDATE SET
      account_name = excluded.account_name,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expiry_date = excluded.expiry_date,
      last_sync = excluded.last_sync
  `);

  stmt.run(
    userPhone,
    accountData.account_email,
    accountData.account_name || null,
    accountData.access_token || null,
    accountData.refresh_token || null,
    accountData.expiry_date || null,
    accountData.last_sync || null
  );

  return getAccountByEmail(db, userPhone, accountData.account_email);
}

function getAccounts(db, userPhone) {
  const stmt = db.prepare(`
    SELECT *
    FROM classroom_accounts
    WHERE user_phone = ?
    ORDER BY account_name COLLATE NOCASE ASC, account_email COLLATE NOCASE ASC
  `);
  return stmt.all(userPhone);
}

function getAccountById(db, accountId, userPhone) {
  const stmt = db.prepare(`
    SELECT * FROM classroom_accounts
    WHERE id = ? AND user_phone = ?
  `);
  return stmt.get(accountId, userPhone);
}

function getAccountByEmail(db, userPhone, email) {
  const stmt = db.prepare(`
    SELECT * FROM classroom_accounts
    WHERE user_phone = ? AND account_email = ?
  `);
  return stmt.get(userPhone, email);
}

function updateAccountTokens(db, accountId, tokens = {}) {
  const fields = [];
  const values = [];

  if (tokens.access_token !== undefined) {
    fields.push('access_token = ?');
    values.push(tokens.access_token);
  }
  if (tokens.refresh_token !== undefined) {
    fields.push('refresh_token = ?');
    values.push(tokens.refresh_token);
  }
  if (tokens.expiry_date !== undefined) {
    fields.push('expiry_date = ?');
    values.push(tokens.expiry_date);
  }
  if (tokens.last_sync !== undefined) {
    fields.push('last_sync = ?');
    values.push(tokens.last_sync);
  }

  if (!fields.length) return;

  values.push(accountId);
  const stmt = db.prepare(`
    UPDATE classroom_accounts
    SET ${fields.join(', ')}
    WHERE id = ?
  `);
  stmt.run(...values);
}

function deleteAccount(db, userPhone, accountId) {
  const stmt = db.prepare(`
    DELETE FROM classroom_accounts
    WHERE id = ? AND user_phone = ?
  `);
  stmt.run(accountId, userPhone);
}

function saveCourses(db, userPhone, accountId, courses = []) {
  if (!courses.length) return new Map();

  const stmt = db.prepare(`
    INSERT INTO classroom_courses (
      user_phone,
      account_id,
      google_course_id,
      name,
      section,
      description,
      room,
      state,
      teacher_group,
      enrollment_code,
      course_json,
      updated_at
    ) VALUES (
      @user_phone,
      @account_id,
      @google_course_id,
      @name,
      @section,
      @description,
      @room,
      @state,
      @teacher_group,
      @enrollment_code,
      @course_json,
      @updated_at
    )
    ON CONFLICT(account_id, google_course_id) DO UPDATE SET
      name = excluded.name,
      section = excluded.section,
      description = excluded.description,
      room = excluded.room,
      state = excluded.state,
      teacher_group = excluded.teacher_group,
      enrollment_code = excluded.enrollment_code,
      course_json = excluded.course_json,
      updated_at = excluded.updated_at
  `);

  const selectStmt = db.prepare(`
    SELECT id FROM classroom_courses
    WHERE account_id = ? AND google_course_id = ?
  `);

  const resultMap = new Map();
  const txn = db.transaction((items) => {
    items.forEach(course => {
      stmt.run({
        user_phone: userPhone,
        account_id: accountId,
        google_course_id: course.id,
        name: course.name || null,
        section: course.section || null,
        description: course.descriptionHeading || null,
        room: course.room || null,
        state: course.courseState || null,
        teacher_group: course.teacherGroupEmail || null,
        enrollment_code: course.enrollmentCode || null,
        course_json: JSON.stringify(course),
        updated_at: Date.now()
      });

      const record = selectStmt.get(accountId, course.id);
      if (record) {
        resultMap.set(course.id, record.id);
      }
    });
  });

  txn(courses);
  return resultMap;
}

function saveAnnouncements(db, userPhone, accountId, courseId, announcements = []) {
  if (!announcements.length) return;

  const stmt = db.prepare(`
    INSERT INTO classroom_announcements (
      user_phone,
      account_id,
      course_id,
      google_announcement_id,
      text,
      materials,
      creation_time,
      update_time,
      creator_user_id,
      state
    ) VALUES (
      @user_phone,
      @account_id,
      @course_id,
      @google_announcement_id,
      @text,
      @materials,
      @creation_time,
      @update_time,
      @creator_user_id,
      @state
    )
    ON CONFLICT(account_id, google_announcement_id) DO UPDATE SET
      course_id = excluded.course_id,
      text = excluded.text,
      materials = excluded.materials,
      creation_time = excluded.creation_time,
      update_time = excluded.update_time,
      creator_user_id = excluded.creator_user_id,
      state = excluded.state
  `);

  const txn = db.transaction((items) => {
    items.forEach(announcement => {
      stmt.run({
        user_phone: userPhone,
        account_id: accountId,
        course_id: courseId,
        google_announcement_id: announcement.id,
        text: announcement.text || '',
        materials: announcement.materials ? JSON.stringify(announcement.materials) : null,
        creation_time: announcement.creationTime || null,
        update_time: announcement.updateTime || null,
        creator_user_id: announcement.creatorUserId || null,
        state: announcement.state || null
      });
    });
  });

  txn(announcements);
}

function saveCoursework(db, userPhone, accountId, courseId, coursework = []) {
  if (!coursework.length) return;

  const stmt = db.prepare(`
    INSERT INTO classroom_coursework (
      user_phone,
      account_id,
      course_id,
      google_coursework_id,
      title,
      description,
      due_date,
      due_time,
      due_at,
      state,
      alternate_link,
      max_points,
      work_type,
      creation_time,
      update_time
    ) VALUES (
      @user_phone,
      @account_id,
      @course_id,
      @google_coursework_id,
      @title,
      @description,
      @due_date,
      @due_time,
      @due_at,
      @state,
      @alternate_link,
      @max_points,
      @work_type,
      @creation_time,
      @update_time
    )
    ON CONFLICT(account_id, google_coursework_id) DO UPDATE SET
      course_id = excluded.course_id,
      title = excluded.title,
      description = excluded.description,
      due_date = excluded.due_date,
      due_time = excluded.due_time,
      due_at = excluded.due_at,
      state = excluded.state,
      alternate_link = excluded.alternate_link,
      max_points = excluded.max_points,
      work_type = excluded.work_type,
      creation_time = excluded.creation_time,
      update_time = excluded.update_time
  `);

  const txn = db.transaction((items) => {
    items.forEach(work => {
      stmt.run({
        user_phone: userPhone,
        account_id: accountId,
        course_id: courseId,
        google_coursework_id: work.id,
        title: work.title || '',
        description: work.description || '',
        due_date: work.dueDate || null,
        due_time: work.dueTime || null,
        due_at: work.dueAt || null,
        state: work.state || null,
        alternate_link: work.alternateLink || null,
        max_points: typeof work.maxPoints === 'number' ? work.maxPoints : null,
        work_type: work.workType || null,
        creation_time: work.creationTime || null,
        update_time: work.updateTime || null
      });
    });
  });

  txn(coursework);
}

function getCourses(db, userPhone, accountId = null) {
  const params = [userPhone];
  let filter = '';
  if (accountId) {
    filter = 'AND c.account_id = ?';
    params.push(accountId);
  }

  const stmt = db.prepare(`
    SELECT c.*, acc.account_email, acc.account_name
    FROM classroom_courses c
    LEFT JOIN classroom_accounts acc ON acc.id = c.account_id
    WHERE c.user_phone = ?
    ${filter}
    ORDER BY acc.account_name COLLATE NOCASE ASC, c.name COLLATE NOCASE ASC
  `);
  return stmt.all(...params);
}

function getRecentAnnouncements(db, userPhone, limit = 40, accountId = null) {
  const params = [userPhone];
  let filter = '';
  if (accountId) {
    filter = 'AND a.account_id = ?';
    params.push(accountId);
  }

  params.push(limit);

  const stmt = db.prepare(`
    SELECT
      a.*,
      c.name AS course_name,
      c.section,
      acc.account_email,
      acc.account_name
    FROM classroom_announcements a
    LEFT JOIN classroom_courses c ON c.id = a.course_id
    LEFT JOIN classroom_accounts acc ON acc.id = a.account_id
    WHERE a.user_phone = ?
    ${filter}
    ORDER BY datetime(COALESCE(a.update_time, a.creation_time)) DESC
    LIMIT ?
  `);

  return stmt.all(...params);
}

function getUpcomingCoursework(db, userPhone, options = {}) {
  const { limit = 40, accountId = null } = options;
  const params = [userPhone];
  let filter = 'AND (cw.due_at IS NOT NULL AND datetime(cw.due_at) >= datetime("now"))';
  if (accountId) {
    filter += ' AND cw.account_id = ?';
    params.push(accountId);
  }
  params.push(limit);

  const stmt = db.prepare(`
    SELECT
      cw.*,
      c.name AS course_name,
      c.section,
      acc.account_email,
      acc.account_name
    FROM classroom_coursework cw
    LEFT JOIN classroom_courses c ON c.id = cw.course_id
    LEFT JOIN classroom_accounts acc ON acc.id = cw.account_id
    WHERE cw.user_phone = ?
      ${filter}
    ORDER BY datetime(cw.due_at) ASC
    LIMIT ?
  `);

  return stmt.all(...params);
}

function getOverdueCoursework(db, userPhone, limit = 20, accountId = null) {
  const params = [userPhone];
  let filter = '';
  if (accountId) {
    filter = 'AND cw.account_id = ?';
    params.push(accountId);
  }
  params.push(limit);

  const stmt = db.prepare(`
    SELECT
      cw.*,
      c.name AS course_name,
      c.section,
      acc.account_email,
      acc.account_name
    FROM classroom_coursework cw
    LEFT JOIN classroom_courses c ON c.id = cw.course_id
    LEFT JOIN classroom_accounts acc ON acc.id = cw.account_id
    WHERE cw.user_phone = ?
      AND cw.due_at IS NOT NULL
      AND datetime(cw.due_at) < datetime('now')
      AND (cw.state IS NULL OR cw.state NOT IN ('RETURNED', 'TURNED_IN'))
      ${filter}
    ORDER BY datetime(cw.due_at) DESC
    LIMIT ?
  `);

  return stmt.all(...params);
}

function getUserState(db, userPhone) {
  const stmt = db.prepare(`
    SELECT * FROM classroom_user_state
    WHERE user_phone = ?
  `);
  return stmt.get(userPhone);
}

function updateUserState(db, userPhone, updates = {}) {
  const current = getUserState(db, userPhone);

  if (!current) {
    const insertStmt = db.prepare(`
      INSERT INTO classroom_user_state (user_phone, last_sync, last_summary_at, last_summary_hash)
      VALUES (?, ?, ?, ?)
    `);
    insertStmt.run(
      userPhone,
      updates.last_sync || null,
      updates.last_summary_at || null,
      updates.last_summary_hash || null
    );
    return;
  }

  const fields = [];
  const values = [];

  if (updates.last_sync !== undefined) {
    fields.push('last_sync = ?');
    values.push(updates.last_sync);
  }
  if (updates.last_summary_at !== undefined) {
    fields.push('last_summary_at = ?');
    values.push(updates.last_summary_at);
  }
  if (updates.last_summary_hash !== undefined) {
    fields.push('last_summary_hash = ?');
    values.push(updates.last_summary_hash);
  }

  if (!fields.length) return;

  values.push(userPhone);
  const updateStmt = db.prepare(`
    UPDATE classroom_user_state
    SET ${fields.join(', ')}
    WHERE user_phone = ?
  `);
  updateStmt.run(...values);
}

function clearUserData(db, userPhone, accountId = null) {
  if (accountId) {
    const txn = db.transaction((phone, accId) => {
      db.prepare(`DELETE FROM classroom_announcements WHERE user_phone = ? AND account_id = ?`).run(phone, accId);
      db.prepare(`DELETE FROM classroom_coursework WHERE user_phone = ? AND account_id = ?`).run(phone, accId);
      db.prepare(`DELETE FROM classroom_courses WHERE user_phone = ? AND account_id = ?`).run(phone, accId);
    });
    txn(userPhone, accountId);
  } else {
    const txn = db.transaction((phone) => {
      db.prepare(`DELETE FROM classroom_announcements WHERE user_phone = ?`).run(phone);
      db.prepare(`DELETE FROM classroom_coursework WHERE user_phone = ?`).run(phone);
      db.prepare(`DELETE FROM classroom_courses WHERE user_phone = ?`).run(phone);
    });
    txn(userPhone);
  }

  db.prepare(`DELETE FROM classroom_user_state WHERE user_phone = ?`).run(userPhone);
}

module.exports = {
  ensureSchema,
  saveAccount,
  getAccounts,
  getAccountById,
  getAccountByEmail,
  updateAccountTokens,
  deleteAccount,
  saveCourses,
  saveAnnouncements,
  saveCoursework,
  getCourses,
  getRecentAnnouncements,
  getUpcomingCoursework,
  getOverdueCoursework,
  getUserState,
  updateUserState,
  clearUserData
};

