const nodemailer = require('nodemailer');
const config = require('../config');
const { createServiceLogger } = require('@sift/common');

const logger = createServiceLogger(config.serviceName);
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.emailUser || !config.emailPass) {
    logger.warn('Email disabled — GMAIL_USER / GMAIL_APP_PASSWORD not set');
    return null;
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.emailUser, pass: config.emailPass },
  });
  return transporter;
}

async function sendMail(to, subject, html) {
  const t = getTransporter();
  if (!t) {
    logger.info('Email skipped (no SMTP)', { to, subject });
    return false;
  }
  await t.sendMail({ from: `"The SIFT" <${config.emailUser}>`, to, subject, html });
  return true;
}

async function sendWelcome(email, name) {
  return sendMail(email, 'Welcome to The SIFT', `<p>Hi ${name}, your account is ready.</p>`);
}

async function sendOtp(email, code, name) {
  return sendMail(
    email,
    'Your SIFT verification code',
    `<p>Hi ${name},</p><p>Your code is <strong>${code}</strong>. It expires in ${config.otpExpirySeconds / 60} minutes.</p>`
  );
}

async function sendLoginAlert(email, name, ip) {
  return sendMail(email, 'SIFT login alert', `<p>Hi ${name}, a successful login occurred from ${ip}.</p>`);
}

module.exports = { sendWelcome, sendOtp, sendLoginAlert };
