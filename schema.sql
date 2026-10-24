CREATE TABLE IF NOT EXISTS children (
  id SERIAL PRIMARY KEY,
  source_row INTEGER UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  date_of_birth DATE,
  school_grade TEXT,
  parent_name TEXT,
  parent_relation TEXT,
  parent_email TEXT,
  parent_mobile TEXT,
  parent_whatsapp TEXT,
  mentorship TEXT,
  country TEXT,
  how_heard TEXT,
  medical_notes TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  child_id INTEGER REFERENCES children(id),
  child_name TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, meeting_date)
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  child_id INTEGER REFERENCES children(id),
  child_name TEXT NOT NULL,
  week TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, week)
);

CREATE TABLE IF NOT EXISTS birthday_email_log (
  id SERIAL PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id),
  child_name TEXT NOT NULL,
  birthday_year INTEGER NOT NULL,
  parent_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, birthday_year)
);

CREATE INDEX IF NOT EXISTS children_birthdays_idx
  ON children (EXTRACT(MONTH FROM date_of_birth), EXTRACT(DAY FROM date_of_birth))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS site_sessions (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT site_sessions_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS IDX_site_sessions_expire ON site_sessions (expire);

CREATE TABLE IF NOT EXISTS parent_announcements (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_group TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
