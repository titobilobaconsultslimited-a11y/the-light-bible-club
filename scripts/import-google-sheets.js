require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');

const dataDirectory = path.resolve(process.argv[2] || path.join(__dirname, '..', 'migration-data'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

function readSheet(filename, required = false) {
  const filepath = path.join(dataDirectory, filename);
  if (!fs.existsSync(filepath)) {
    if (required) throw new Error(`Required export not found: ${filepath}`);
    return [];
  }
  return parse(fs.readFileSync(filepath), {
    bom: true,
    columns: true,
    skip_empty_lines: false,
    relax_column_count: true,
    trim: true
  });
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getValue(row, header) {
  const wanted = normalizeHeader(header);
  const key = Object.keys(row).find(name => normalizeHeader(name) === wanted);
  return key && row[key] != null ? String(row[key]).trim() : '';
}

function getFirstValue(row, headers) {
  for (const header of headers) {
    const value = getValue(row, header);
    if (value) return value;
  }
  return '';
}

function parseSheetDate(value, filename, rowNumber) {
  if (!value) return null;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoDate) return value;

  const error = new Error(
    `${filename} row ${rowNumber}: date "${value}" is not ISO format. ` +
    'Format the Date of Birth column as yyyy-mm-dd in Google Sheets, export again, and retry.'
  );
  error.code = 'AMBIGUOUS_DATE';
  throw error;
}

function parseTimestamp(value, filename, rowNumber) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    console.warn(`${filename} row ${rowNumber}: unrecognized timestamp; database import time will be used.`);
    return null;
  }
  return parsed.toISOString();
}

function isDeleted(row) {
  return getValue(row, 'Timestamp').toUpperCase() === 'DELETED';
}

async function runImport() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set in the local environment.');
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));

  const registrations = readSheet('Registrations.csv', true);
  const attendance = readSheet('Attendance.csv');
  const assignments = readSheet('Assignments.csv');
  const contacts = readSheet('ContactMessages.csv');
  const birthdayEmails = readSheet('BirthdayEmailLog.csv');
  const client = await pool.connect();
  let imported = { registrations: 0, attendance: 0, assignments: 0, contacts: 0, birthdayEmails: 0 };

  try {
    await client.query('BEGIN');
    const existing = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM children) AS children,
        (SELECT COUNT(*) FROM attendance) AS attendance,
        (SELECT COUNT(*) FROM assignments) AS assignments,
        (SELECT COUNT(*) FROM contact_messages) AS contacts,
        (SELECT COUNT(*) FROM birthday_email_log) AS birthday_emails
    `);
    if (Object.values(existing.rows[0]).some(count => Number(count) > 0)) {
      throw new Error('Neon already contains records. Import stopped to avoid creating duplicates.');
    }

    const childIdsBySourceRow = new Map();
    for (let index = 0; index < registrations.length; index++) {
      const row = registrations[index];
      const sourceRow = index + 1;
      if (isDeleted(row) || !getValue(row, 'Child First Name')) continue;

      const dob = parseSheetDate(getValue(row, 'Date of Birth'), 'Registrations.csv', sourceRow + 1);
      const ageValue = getValue(row, 'Age');
      const age = ageValue && /^\d+$/.test(ageValue) ? Number(ageValue) : null;
      const createdAt = parseTimestamp(getValue(row, 'Timestamp'), 'Registrations.csv', sourceRow + 1);
      const result = await client.query(`
        INSERT INTO children (
          source_row, created_at, first_name, last_name, age, gender, date_of_birth,
          school_grade, parent_name, parent_relation, parent_email, parent_mobile,
          parent_whatsapp, mentorship, country, how_heard, medical_notes
        ) VALUES (
          $1, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17
        ) RETURNING id
      `, [
        sourceRow,
        createdAt,
        getValue(row, 'Child First Name'),
        getValue(row, 'Child Last Name'),
        age,
        getValue(row, 'Gender'),
        dob,
        getValue(row, 'School Grade'),
        getValue(row, 'Parent Name'),
        getFirstValue(row, ['Relationship', 'Parent Relation']),
        getValue(row, 'Parent Email'),
        getFirstValue(row, ['Parent Mobile Line', 'Parent Mobile']),
        getFirstValue(row, ['Parent WhatsApp Line', 'Parent WhatsApp']),
        getFirstValue(row, ['Personal Paid Mentorship', 'Mentorship']),
        getValue(row, 'Country'),
        getValue(row, 'How Heard'),
        getValue(row, 'Medical Notes')
      ]);
      childIdsBySourceRow.set(sourceRow, result.rows[0].id);
      imported.registrations++;
    }

    for (let index = 0; index < attendance.length; index++) {
      const row = attendance[index];
      const childId = childIdsBySourceRow.get(Number(getValue(row, 'Child ID')));
      const status = getValue(row, 'Status');
      if (!childId || !status) continue;
      await client.query(`
        INSERT INTO attendance (child_id, child_name, meeting_date, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (child_id, meeting_date)
        DO UPDATE SET child_name = EXCLUDED.child_name, status = EXCLUDED.status
      `, [
        childId,
        getValue(row, 'Child Name'),
        getValue(row, 'Date'),
        status
      ]);
      imported.attendance++;
    }

    for (let index = 0; index < assignments.length; index++) {
      const row = assignments[index];
      const childId = childIdsBySourceRow.get(Number(getValue(row, 'Child ID')));
      const status = getValue(row, 'Status');
      if (!childId || !status) continue;
      await client.query(`
        INSERT INTO assignments (child_id, child_name, week, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (child_id, week)
        DO UPDATE SET child_name = EXCLUDED.child_name, status = EXCLUDED.status
      `, [
        childId,
        getValue(row, 'Child Name'),
        getValue(row, 'Week'),
        status
      ]);
      imported.assignments++;
    }

    for (let index = 0; index < contacts.length; index++) {
      const row = contacts[index];
      const name = getValue(row, 'Name');
      const message = getValue(row, 'Message');
      if (!name || !message) continue;
      await client.query(`
        INSERT INTO contact_messages (created_at, name, email, subject, message)
        VALUES (COALESCE($1::timestamptz, NOW()), $2, $3, $4, $5)
      `, [
        parseTimestamp(getValue(row, 'Timestamp'), 'ContactMessages.csv', index + 2),
        name,
        getValue(row, 'Email'),
        getValue(row, 'Subject'),
        message
      ]);
      imported.contacts++;
    }

    for (let index = 0; index < birthdayEmails.length; index++) {
      const row = birthdayEmails[index];
      const childId = childIdsBySourceRow.get(Number(getValue(row, 'Child ID')));
      const yearValue = getValue(row, 'Birthday Year');
      const year = Number(yearValue);
      if (!childId || !Number.isInteger(year) || year < 1900 || year > 9999) continue;
      const sentAt = parseTimestamp(getValue(row, 'Timestamp'), 'BirthdayEmailLog.csv', index + 2);
      await client.query(`
        INSERT INTO birthday_email_log (child_id, child_name, birthday_year, parent_email, sent_at)
        VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
        ON CONFLICT (child_id, birthday_year) DO NOTHING
      `, [
        childId,
        getValue(row, 'Child Name'),
        year,
        getValue(row, 'Parent Email'),
        sentAt
      ]);
      imported.birthdayEmails++;
    }

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('children', 'id'),
        COALESCE((SELECT MAX(id) FROM children), 1),
        EXISTS(SELECT 1 FROM children)
      )
    `);
    await client.query('COMMIT');
    console.log('Google Sheets import completed:', imported);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

runImport()
  .catch(error => {
    console.error('Google Sheets import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
