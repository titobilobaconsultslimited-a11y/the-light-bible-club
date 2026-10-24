require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const connectPgSimple = require('connect-pg-simple');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const session = require('express-session');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 10000
});
const app = express();
const PgSessionStore = connectPgSimple(session);
let schemaReady;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'))
      .catch(error => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(async (req, res, next) => {
  try {
    await ensureSchema();
    return next();
  } catch (error) {
    return next(error);
  }
});
app.use(session({
  store: new PgSessionStore({
    pool,
    tableName: 'site_sessions',
    createTableIfMissing: false
  }),
  name: 'lightclub.sid',
  secret: process.env.SESSION_SECRET || '',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait and try again.' }
});
const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please wait and try again.' }
});

function cleanText(value, maxLength = 500) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function compareSecrets(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate));
  const expectedBuffer = Buffer.from(String(expected));
  return candidateBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminEmail) {
    return res.status(401).json({ error: 'Your admin session expired. Please sign in again.' });
  }
  return next();
}

function createMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 3,
    host,
    port,
    secure,
    auth: { user, pass: password }
  });
}

function getMailFrom() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

async function notifyAdmin(subject, text) {
  if (!process.env.NOTIFICATION_EMAIL) return;
  const mailer = createMailer();
  if (!mailer) {
    console.warn('Notification email was not sent: SMTP environment variables are not configured.');
    return;
  }
  try {
    await mailer.sendMail({ from: getMailFrom(), to: process.env.NOTIFICATION_EMAIL, subject, text });
  } catch (error) {
    console.error('Admin notification email failed:', error.message);
  }
}

function registrationValues(data) {
  data = data || {};
  const firstName = cleanText(data.childFirstName, 100);
  const lastName = cleanText(data.childLastName, 100);
  const parentEmail = cleanText(data.parentEmail, 254).toLowerCase();
  const dob = cleanText(data.childDOB, 10);
  const ageValue = cleanText(data.childAge, 3);
  const age = Number(data.childAge);
  const requiredFields = [
    data.childGender, data.schoolGrade, data.parentName, data.parentRelation,
    data.parentMobile, data.parentWhatsApp, data.mentorship, data.country
  ];
  const parsedDob = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T00:00:00.000Z`) : null;
  const validDob = parsedDob && !Number.isNaN(parsedDob.getTime()) &&
    parsedDob.toISOString().slice(0, 10) === dob;

  if (!firstName || !lastName || !parentEmail || !validEmail(parentEmail) ||
      !validDob ||
      !ageValue || !Number.isInteger(age) || age < 0 || age > 30 ||
      requiredFields.some(value => !cleanText(value))) {
    const error = new Error('Please provide valid child, date of birth, age, and parent email details.');
    error.status = 400;
    throw error;
  }

  return [
    firstName,
    lastName,
    age,
    cleanText(data.childGender, 40),
    dob,
    cleanText(data.schoolGrade, 100),
    cleanText(data.parentName, 200),
    cleanText(data.parentRelation, 80),
    parentEmail,
    cleanText(data.parentMobile, 40),
    cleanText(data.parentWhatsApp, 40),
    cleanText(data.mentorship, 20),
    cleanText(data.country, 100),
    cleanText(data.howHeard, 200),
    cleanText(data.medicalNotes, 2000)
  ];
}

function requireFields(fields, names) {
  const missing = names.some(name => !fields[name]);
  if (missing) {
    const error = new Error('Please complete all required fields.');
    error.status = 400;
    throw error;
  }
}

async function getAdminData() {
  const [children, attendance, assignments, birthdayEmails, announcements] = await Promise.all([
    pool.query(`
      SELECT id, created_at AS timestamp,
        first_name AS "childFirstName", last_name AS "childLastName",
        age, gender, date_of_birth AS "dateOfBirth", school_grade AS "schoolGrade",
        parent_name AS "parentName", parent_relation AS relationship,
        parent_email AS "parentEmail", parent_mobile AS "parentMobileLine",
        parent_whatsapp AS "parentWhatsAppLine", mentorship AS "personalPaidMentorship",
        country, how_heard AS "howHeard", medical_notes AS "medicalNotes"
      FROM children WHERE deleted_at IS NULL ORDER BY id
    `),
    pool.query(`
      SELECT child_id AS "childId", child_name AS "childName",
        meeting_date AS date, status
      FROM attendance ORDER BY id
    `),
    pool.query(`
      SELECT child_id AS "childId", child_name AS "childName", week, status
      FROM assignments ORDER BY id
    `),
    pool.query(`
      SELECT child_id AS "childId", birthday_year AS year FROM birthday_email_log
    `),
    pool.query(`
      SELECT id, subject, message, recipient_group AS "recipientGroup",
        recipient_count AS "recipientCount", sent_at AS "sentAt"
      FROM parent_announcements ORDER BY sent_at DESC LIMIT 50
    `)
  ]);

  return {
    registrations: children.rows,
    attendance: attendance.rows,
    assignments: assignments.rows,
    birthdayEmails: birthdayEmails.rows,
    announcements: announcements.rows
  };
}

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const email = cleanText(body.email, 254).toLowerCase();
    const password = String(body.password || '');

    if (!adminEmail || !adminPassword || !process.env.SESSION_SECRET) {
      return res.status(503).json({ error: 'Admin sign-in is not configured on the server.' });
    }
    if (email !== adminEmail.toLowerCase() || !compareSecrets(password, adminPassword)) {
      return res.status(401).json({ error: 'Invalid admin email or password.' });
    }

    await promisify(req.session.regenerate).call(req.session);
    req.session.adminEmail = adminEmail;
    await promisify(req.session.save).call(req.session);
    return res.json({ result: 'success' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', requireAdmin, async (req, res, next) => {
  try {
    await promisify(req.session.destroy).call(req.session);
    res.clearCookie('lightclub.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    return res.json({ result: 'success' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/registrations', publicFormLimiter, async (req, res, next) => {
  try {
    const values = registrationValues(req.body);
    await pool.query(`
      INSERT INTO children (
        first_name, last_name, age, gender, date_of_birth, school_grade,
        parent_name, parent_relation, parent_email, parent_mobile, parent_whatsapp,
        mentorship, country, how_heard, medical_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, values);

    await notifyAdmin(
      `New Bible Club Registration: ${values[0]} ${values[1]}`,
      `A new child registration was submitted for ${values[0]} ${values[1]}.\nParent/guardian: ${values[6]}\nEmail: ${values[8]}`
    );
    return res.status(201).json({ result: 'success' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/contact', publicFormLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const fields = {
      name: cleanText(body.contactName, 200),
      email: cleanText(body.contactEmail, 254).toLowerCase(),
      subject: cleanText(body.contactSubject, 200),
      message: cleanText(body.contactMessage, 5000)
    };
    requireFields(fields, ['name', 'email', 'subject', 'message']);
    if (!validEmail(fields.email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    await pool.query(
      'INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)',
      [fields.name, fields.email, fields.subject, fields.message]
    );
    await notifyAdmin(
      `New Contact Message: ${fields.subject}`,
      `From: ${fields.name}\nEmail: ${fields.email}\n\n${fields.message}`
    );
    return res.status(201).json({ result: 'success' });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/today-birthdays', async (req, res, next) => {
  try {
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lagos',
      month: 'numeric',
      day: 'numeric'
    }).formatToParts(new Date());
    const month = Number(dateParts.find(part => part.type === 'month').value);
    const day = Number(dateParts.find(part => part.type === 'day').value);
    const result = await pool.query(`
      SELECT first_name FROM children
      WHERE deleted_at IS NULL
        AND EXTRACT(MONTH FROM date_of_birth) = $1
        AND EXTRACT(DAY FROM date_of_birth) = $2
      ORDER BY first_name
    `, [month, day]);
    return res.json(result.rows.map(row => row.first_name));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/data', requireAdmin, async (req, res, next) => {
  try {
    return res.json(await getAdminData());
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/actions', requireAdmin, async (req, res, next) => {
  try {
    const data = req.body || {};
    const action = data.action;

    if (action === 'addRegistration') {
      const values = registrationValues(data);
      const result = await pool.query(`
        INSERT INTO children (
          first_name, last_name, age, gender, date_of_birth, school_grade,
          parent_name, parent_relation, parent_email, parent_mobile, parent_whatsapp,
          mentorship, country, how_heard, medical_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `, values);
      return res.status(201).json({ result: 'success', id: result.rows[0].id });
    }

    if (action === 'editRegistration') {
      const id = Number(data.id);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid registration ID.' });
      }
      const values = registrationValues(data);
      const result = await pool.query(`
        UPDATE children SET
          first_name = $2, last_name = $3, age = $4, gender = $5,
          date_of_birth = $6, school_grade = $7, parent_name = $8,
          parent_relation = $9, parent_email = $10, parent_mobile = $11,
          parent_whatsapp = $12, mentorship = $13, country = $14,
          how_heard = $15, medical_notes = $16
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `, [id, ...values]);
      if (!result.rowCount) return res.status(404).json({ error: 'Registration not found.' });
      return res.json({ result: 'success' });
    }

    if (action === 'deleteRegistration') {
      const id = Number(data.id);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid registration ID.' });
      }
      const result = await pool.query(
        'UPDATE children SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Registration not found.' });
      return res.json({ result: 'success' });
    }

    if (action === 'markAttendance') {
      const childId = Number(data.childId);
      const status = cleanText(data.status, 20);
      const date = cleanText(data.date, 100);
      if (!Number.isInteger(childId) || childId < 1 || !date || !['Present', 'Absent'].includes(status)) {
        return res.status(400).json({ error: 'Invalid attendance update.' });
      }
      const result = await pool.query(`
        INSERT INTO attendance (child_id, child_name, meeting_date, status)
        SELECT id, CONCAT_WS(' ', first_name, last_name), $2, $3
        FROM children WHERE id = $1 AND deleted_at IS NULL
        ON CONFLICT (child_id, meeting_date)
        DO UPDATE SET child_name = EXCLUDED.child_name, status = EXCLUDED.status
        RETURNING id
      `, [childId, date, status]);
      if (!result.rowCount) return res.status(404).json({ error: 'Registration not found.' });
      return res.json({ result: 'success' });
    }

    if (action === 'markAssignment') {
      const childId = Number(data.childId);
      const status = cleanText(data.status, 20);
      const week = cleanText(data.week, 100);
      if (!Number.isInteger(childId) || childId < 1 || !week || !['Done', 'Not Done'].includes(status)) {
        return res.status(400).json({ error: 'Invalid assignment update.' });
      }
      const result = await pool.query(`
        INSERT INTO assignments (child_id, child_name, week, status)
        SELECT id, CONCAT_WS(' ', first_name, last_name), $2, $3
        FROM children WHERE id = $1 AND deleted_at IS NULL
        ON CONFLICT (child_id, week)
        DO UPDATE SET child_name = EXCLUDED.child_name, status = EXCLUDED.status
        RETURNING id
      `, [childId, week, status]);
      if (!result.rowCount) return res.status(404).json({ error: 'Registration not found.' });
      return res.json({ result: 'success' });
    }

    if (action === 'sendBirthdayEmail') {
      const childId = Number(data.childId);
      if (!Number.isInteger(childId) || childId < 1) {
        return res.status(400).json({ error: 'Invalid registration ID.' });
      }
      const mailer = createMailer();
      if (!mailer || !getMailFrom()) {
        return res.status(503).json({ error: 'Birthday email is not configured. Set the SMTP environment variables on the server.' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const childResult = await client.query(`
          SELECT id, first_name, last_name, parent_name, parent_email
          FROM children WHERE id = $1 AND deleted_at IS NULL FOR UPDATE
        `, [childId]);
        if (!childResult.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Registration not found.' });
        }

        const child = childResult.rows[0];
        if (!validEmail(child.parent_email || '')) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'A valid parent/guardian email address is not on file.' });
        }

        const birthdayYear = Number(new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Lagos',
          year: 'numeric'
        }).format(new Date()));
        const sentResult = await client.query(
          'SELECT id FROM birthday_email_log WHERE child_id = $1 AND birthday_year = $2',
          [childId, birthdayYear]
        );
        if (sentResult.rowCount) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'A birthday email has already been sent for this child this year.' });
        }

        const childName = `${child.first_name} ${child.last_name}`.trim();
        const firstName = child.first_name || 'your child';
        await mailer.sendMail({
          from: getMailFrom(),
          to: child.parent_email,
          subject: `Happy Birthday to ${firstName}!`,
          text: `Dear ${child.parent_name || 'Parent/Guardian'},\n\nWishing ${firstName} a very happy birthday from everyone at The Light Bible Club! May their special day be filled with joy, love, and many blessings. We are grateful to have them as part of our club family.\n\nWith warm wishes,\nThe Light Bible Club`
        });
        await client.query(`
          INSERT INTO birthday_email_log (child_id, child_name, birthday_year, parent_email)
          VALUES ($1, $2, $3, $4)
        `, [childId, childName, birthdayYear, child.parent_email]);
        await client.query('COMMIT');
        return res.json({ result: 'success' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (action === 'sendBroadcastEmail') {
      const subject = cleanText(data.subject, 300);
      const rawMessage = String(data.message || '').trim().slice(0, 10000);
      const recipientGroup = cleanText(data.recipientGroup, 50) || 'all';
      const singleChildId = Number(data.childId);

      if (!subject || !rawMessage) {
        return res.status(400).json({ error: 'Please provide both an email subject and message body.' });
      }

      const mailer = createMailer();
      if (!mailer || !getMailFrom()) {
        return res.status(503).json({ error: 'Email sending is not configured. Set the SMTP environment variables on the server.' });
      }

      let recipients = [];
      if (recipientGroup === 'single') {
        if (!Number.isInteger(singleChildId) || singleChildId < 1) {
          return res.status(400).json({ error: 'Invalid child selection.' });
        }
        const resKids = await pool.query(`
          SELECT id, first_name AS "childFirstName", last_name AS "childLastName",
            parent_name AS "parentName", parent_email AS "parentEmail"
          FROM children
          WHERE id = $1 AND deleted_at IS NULL
        `, [singleChildId]);
        if (!resKids.rowCount) return res.status(404).json({ error: 'Child record not found.' });
        const k = resKids.rows[0];
        if (!validEmail(k.parentEmail || '')) {
          return res.status(400).json({ error: 'No valid parent email on file for this child.' });
        }
        recipients = [{ email: k.parentEmail.toLowerCase(), parentName: k.parentName || 'Parent/Guardian', childName: k.childFirstName }];
      } else if (recipientGroup === 'mentorship') {
        const resKids = await pool.query(`
          SELECT DISTINCT ON (LOWER(parent_email))
            parent_email AS "parentEmail", parent_name AS "parentName", first_name AS "childFirstName"
          FROM children
          WHERE deleted_at IS NULL AND parent_email IS NOT NULL AND parent_email != ''
            AND LOWER(mentorship) LIKE 'y%'
          ORDER BY LOWER(parent_email), id
        `);
        recipients = resKids.rows.filter(r => validEmail(r.parentEmail)).map(r => ({
          email: r.parentEmail.toLowerCase(),
          parentName: r.parentName || 'Parent/Guardian',
          childName: r.childFirstName
        }));
      } else {
        const resKids = await pool.query(`
          SELECT DISTINCT ON (LOWER(parent_email))
            parent_email AS "parentEmail", parent_name AS "parentName", first_name AS "childFirstName"
          FROM children
          WHERE deleted_at IS NULL AND parent_email IS NOT NULL AND parent_email != ''
          ORDER BY LOWER(parent_email), id
        `);
        recipients = resKids.rows.filter(r => validEmail(r.parentEmail)).map(r => ({
          email: r.parentEmail.toLowerCase(),
          parentName: r.parentName || 'Parent/Guardian',
          childName: r.childFirstName
        }));
      }

      if (recipients.length === 0) {
        return res.status(400).json({ error: 'No valid recipient email addresses found for this group.' });
      }

      const totalAvailable = recipients.length;
      let batchOffset = 0;
      let batchLimit = totalAvailable;

      if (recipientGroup !== 'single' && data.batchMode !== 'all') {
        batchOffset = Math.max(0, parseInt(data.batchOffset, 10) || 0);
        batchLimit = Math.min(30, Math.max(1, parseInt(data.batchLimit, 10) || 25));
        recipients = recipients.slice(batchOffset, batchOffset + batchLimit);
      }

      let sentCount = 0;
      const sendErrors = [];

      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        try {
          const personalizedBody = rawMessage
            .replace(/\{\{\s*parentName\s*\}\}/gi, r.parentName)
            .replace(/\{\{\s*childName\s*\}\}/gi, r.childName || 'your child');

          const htmlBody = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2D3748; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #ffffff;">
              <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #FFF5EB;">
                <span style="font-size: 40px; display: inline-block; margin-bottom: 8px;">☀️</span>
                <h2 style="color: #FF8C00; margin: 0; font-size: 24px; font-weight: 700;">The Light Bible Club</h2>
                <p style="color: #718096; font-size: 14px; margin: 4px 0 0;">Raising Children in God's Light & Truth</p>
              </div>
              <div style="white-space: pre-wrap; font-size: 15px; margin-bottom: 28px; color: #2D3748;">${personalizedBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #EDF2F7; font-size: 13px; color: #718096; text-align: center;">
                <p style="margin: 0 0 6px; font-weight: 600; color: #4A5568;">The Light Bible Club • Every Saturday</p>
                <p style="margin: 0;">Have a prayer request or question? Simply reply to this email or reach us at <a href="mailto:${getMailFrom()}" style="color: #FF8C00; text-decoration: none; font-weight: 600;">${getMailFrom()}</a></p>
              </div>
            </div>
          `;

          await mailer.sendMail({
            from: getMailFrom(),
            to: r.email,
            subject: subject,
            text: personalizedBody,
            html: htmlBody
          });
          sentCount++;

          if (i < recipients.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        } catch (err) {
          console.error(`Failed to send email to ${r.email}:`, err.message);
          sendErrors.push({ email: r.email, error: err.message });
        }
      }

      let groupLabel = recipientGroup;
      if (recipientGroup === 'single') {
        groupLabel = `Individual (${recipients[0].parentName})`;
      } else if (data.batchMode !== 'all') {
        groupLabel = `${recipientGroup === 'mentorship' ? 'Mentorship' : 'All Parents'} (Batch: #${batchOffset + 1} to #${batchOffset + recipients.length} of ${totalAvailable})`;
      }

      await pool.query(`
        INSERT INTO parent_announcements (subject, message, recipient_group, recipient_count)
        VALUES ($1, $2, $3, $4)
      `, [subject, rawMessage, groupLabel, sentCount]);

      const nextBatchOffset = (batchOffset + recipients.length < totalAvailable) ? (batchOffset + recipients.length) : null;

      return res.json({
        result: 'success',
        sentCount,
        batchSize: recipients.length,
        batchOffset,
        totalAvailable,
        nextBatchOffset,
        deliveredEmails: recipients.slice(0, sentCount).map(r => r.email),
        errors: sendErrors.length ? sendErrors.slice(0, 5) : undefined
      });
    }

    return res.status(400).json({ error: 'Unknown admin action.' });
  } catch (error) {
    return next(error);
  }
});

const publicDirectories = ['css', 'js', 'images', 'Documents'];
for (const directory of publicDirectories) {
  app.use(`/${directory}`, express.static(path.join(ROOT, directory), { fallthrough: true }));
}

const pages = [
  'index.html',
  'about.html',
  'activities.html',
  'admin.html',
  'contact.html',
  'register.html',
  'stories.html'
];
app.get(['/', ...pages.map(page => `/${page}`)], (req, res, next) => {
  const requestedPage = req.path === '/' ? 'index.html' : path.basename(req.path);
  if (!pages.includes(requestedPage)) return next();
  return res.sendFile(path.join(ROOT, requestedPage));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
  return res.status(404).send('Page not found.');
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return next(error);
  const status = Number(error.status) || 500;
  return res.status(status).json({
    error: status === 500 ? 'An unexpected server error occurred.' : error.message
  });
});

async function start() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL environment variable is required.');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }
  await ensureSchema();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Light Bible Club server is listening on port ${PORT}.`);
  });
}

if (require.main === module) {
  start().catch(error => {
    console.error('Server startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, pool };

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
