require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSmtp() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  console.log('Testing SMTP connection with:');
  console.log('  Host:', host);
  console.log('  Port:', port);
  console.log('  Secure:', secure);
  console.log('  User:', user);
  console.log('  Password:', pass ? '****** (configured)' : '(NOT SET)');

  if (!user || !pass) {
    console.error('Error: SMTP_USER and SMTP_PASSWORD must be configured in .env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  try {
    console.log('Verifying connection with Gmail SMTP server...');
    await transporter.verify();
    console.log('SUCCESS! SMTP connection verified successfully.');
  } catch (error) {
    console.error('SMTP verification failed:', error.message);
    process.exit(1);
  }
}

testSmtp();
