# The Light Bible Club

The website is a static frontend with Vercel Node.js Functions for its API.
Registrations, contact messages, attendance, assignments, birthday-email
history, and admin sessions are stored in Neon PostgreSQL. The database
connection string and admin credentials must only be configured as server
environment variables; never put them in browser JavaScript or commit `.env`.

## Deploy to Vercel

1. Rotate the Neon database password before using this project. The previous
   connection string was exposed in chat.
2. Import the GitHub repository into Vercel, or use the existing Vercel project
   connected to this repository. Use the project root as the Root Directory.
   Vercel serves the website files and deploys `api/[...path].js` as the
   same-origin API function.
3. In Vercel **Project Settings → Environment Variables**, set:
   - `DATABASE_URL`: the rotated Neon pooled connection string. Keep the
     connection string out of commits and chat.
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: admin sign-in credentials. Use a new,
     unique password.
   - `SESSION_SECRET`: a random value of at least 32 characters.
   - `NOTIFICATION_EMAIL`: destination for new-registration/contact notices.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and
     `SMTP_FROM`: your SMTP settings. These are required for birthday emails
     and admin email notifications.
4. Apply the `schema.sql` contents to your Neon database, or allow the API's
   first request to create its tables. Vercel's `/api/health` endpoint checks
   database connectivity.
5. Deploy a Preview first, test the forms and admin dashboard, then promote it
   or merge/push to the Vercel-connected Production branch.

Generate a session secret locally with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
and paste the output directly into Vercel's Environment Variables.

Vercel Hobby and Neon Free plans have usage limits; confirm current quotas in
their dashboards. Serverless functions and database usage are subject to those
limits.

## Import existing Google Sheets data

Keep the original Google Sheet until the migration is checked.

1. Download each available tab as a CSV into a local `migration-data` folder:
   `Registrations.csv`, `Attendance.csv`, `Assignments.csv`,
   `ContactMessages.csv`, and `BirthdayEmailLog.csv`. The registrations export
   is required; the other exports can be absent if those tabs do not exist.
2. Format the **Date of Birth** column in the registrations tab as `yyyy-mm-dd`
   before exporting. The importer rejects ambiguous dates rather than
   importing potentially incorrect birthdays.
3. Create a local `.env` from `.env.example` and set `DATABASE_URL` to the
   rotated Neon connection string. Never commit or share `.env`.
4. With Node.js 22, run `npm ci`, then `npm run import:sheets`. To use another
   CSV folder, run `npm run import:sheets -- "C:\path\to\csv-files"`.
5. Review the import counts and compare them with the spreadsheet. The
   importer refuses to add rows if Neon already contains data, to prevent
   accidental duplicates.
6. After confirming the new Vercel site works with Neon, disable the old Google
   Apps Script web-app deployment so forms no longer write to the old store.

The importer runs locally and reads CSV files from the ignored
`migration-data/` directory. Child names, contact details, and connection
credentials are not included in the repository.
