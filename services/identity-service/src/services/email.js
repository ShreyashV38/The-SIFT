// ---------------------------------------------------------------------------
// The-SIFT — Email Notification Service (identity-service)
// ---------------------------------------------------------------------------
// Sends professional HTML email notifications for:
//   - Welcome / Registration
//   - Login OTP (2FA)
//   - Login success alert (security)
//   - Member added to household
//   - Member removed from household
//   - Household created confirmation
//   - Ownership transferred
//   - Invite to register (when adding unregistered email)
//   - Role change notification
// ---------------------------------------------------------------------------

const nodemailer = require('nodemailer');
const config = require('../config');
const { createServiceLogger } = require('@sift/common');

const logger = createServiceLogger(config.serviceName);

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!config.emailUser || !config.emailPass) {
    logger.warn('Email service disabled — GMAIL_USER or GMAIL_APP_PASSWORD not set');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.emailUser,
      pass: config.emailPass,
    },
  });

  logger.info('Email transporter created', { user: config.emailUser });
  return transporter;
}

function wrapHtml(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background: #0f1117; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #0f1117; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background: #1a1d27; border-radius: 12px; border: 1px solid rgba(13,148,136,0.2); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #065f53 100%); padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                🏠 The SIFT
              </h1>
              <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">
                Smart IoT Framework for Things
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                This is an automated email from The SIFT Platform.<br>
                Do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendMail(to, subject, htmlBody) {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('Email not sent — transporter unavailable', { to, subject });
    return false;
  }

  try {
    const info = await transport.sendMail({
      from: `"The SIFT Platform" <${config.emailUser}>`,
      to,
      subject,
      html: htmlBody,
    });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return true;
  } catch (err) {
    logger.error('Failed to send email', { to, subject, error: err.message });
    return false;
  }
}

async function sendOtp(to, code, displayName) {
  const subject = `🔐 ${code} — Your SIFT Login Code`;
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      Verify Your Identity
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi <strong style="color: #f3f4f6;">${displayName}</strong>, use this one-time code to complete your login:
    </p>
    <div style="background: #111318; border: 2px solid #0d9488; border-radius: 10px; padding: 24px; text-align: center; margin: 0 0 20px;">
      <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0d9488;">
        ${code}
      </span>
    </div>
    <p style="color: #9ca3af; font-size: 13px; margin: 0 0 8px;">
      ⏱ This code expires in <strong style="color: #d1d5db;">5 minutes</strong>.
    </p>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      If you did not attempt to log in, someone may be trying to access your account. Please change your password immediately.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Login Verification', body));
}

async function sendWelcome(to, displayName) {
  const subject = '🎉 Welcome to The SIFT Platform!';
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      Welcome aboard, ${displayName}!
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Your SIFT account has been created successfully. You're now part of the Smart IoT Framework for Things ecosystem.
    </p>
    <div style="background: #111318; border-radius: 8px; padding: 20px; margin: 0 0 20px;">
      <h3 style="margin: 0 0 12px; color: #0d9488; font-size: 15px;">What's next?</h3>
      <ul style="margin: 0; padding: 0 0 0 20px; color: #d1d5db; font-size: 14px; line-height: 2;">
        <li>Create your first household</li>
        <li>Add your IoT devices</li>
        <li>Invite family members to your household</li>
        <li>Monitor device telemetry in real-time</li>
      </ul>
    </div>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      Your account is protected with email-based two-factor authentication for every login.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Welcome', body));
}

async function sendLoginAlert(to, displayName, ip) {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const subject = '🔑 New Login to Your SIFT Account';
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      Successful Login Detected
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi <strong style="color: #f3f4f6;">${displayName}</strong>, a new login was made to your SIFT account.
    </p>
    <div style="background: #111318; border-radius: 8px; padding: 20px; margin: 0 0 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">Time:</td>
          <td style="color: #f3f4f6; font-size: 13px; padding: 4px 0; text-align: right;">${now}</td>
        </tr>
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">IP Address:</td>
          <td style="color: #f3f4f6; font-size: 13px; padding: 4px 0; text-align: right;">${ip || 'Unknown'}</td>
        </tr>
      </table>
    </div>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      If this wasn't you, please change your password immediately and contact support.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Login Alert', body));
}

async function sendMemberAdded(to, displayName, householdName, role, addedByName) {
  const subject = `👥 You've been added to "${householdName}"`;
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      You've been added to a household!
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi <strong style="color: #f3f4f6;">${displayName}</strong>, you have been added as a
      <strong style="color: #0d9488;">${role}</strong> to the household
      <strong style="color: #f3f4f6;">"${householdName}"</strong>
      by <strong style="color: #f3f4f6;">${addedByName}</strong>.
    </p>
    <div style="background: #111318; border-radius: 8px; padding: 20px; margin: 0 0 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">Household:</td>
          <td style="color: #f3f4f6; font-size: 13px; padding: 4px 0; text-align: right;">${householdName}</td>
        </tr>
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">Your Role:</td>
          <td style="color: #0d9488; font-size: 13px; padding: 4px 0; text-align: right; font-weight: 600;">${role}</td>
        </tr>
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">Added By:</td>
          <td style="color: #f3f4f6; font-size: 13px; padding: 4px 0; text-align: right;">${addedByName}</td>
        </tr>
      </table>
    </div>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      Log in to your SIFT account to access the household's devices and settings.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Household Invitation', body));
}

async function sendMemberRemoved(to, displayName, householdName) {
  const subject = `🚪 You've been removed from "${householdName}"`;
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      Household Access Revoked
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi <strong style="color: #f3f4f6;">${displayName}</strong>, your access to the household
      <strong style="color: #f3f4f6;">"${householdName}"</strong> has been removed.
    </p>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      You will no longer be able to view or manage devices in this household. If you believe this was a mistake, contact the household owner.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Access Revoked', body));
}

async function sendHouseholdCreated(to, displayName, householdName, plan) {
  const subject = `🏠 Household "${householdName}" Created!`;
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      Household Created Successfully!
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi <strong style="color: #f3f4f6;">${displayName}</strong>, your new household has been provisioned and is ready to use.
    </p>
    <div style="background: #111318; border-radius: 8px; padding: 20px; margin: 0 0 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">Household:</td>
          <td style="color: #f3f4f6; font-size: 13px; padding: 4px 0; text-align: right;">${householdName}</td>
        </tr>
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">Plan:</td>
          <td style="color: #0d9488; font-size: 13px; padding: 4px 0; text-align: right; font-weight: 600; text-transform: capitalize;">${plan}</td>
        </tr>
        <tr>
          <td style="color: #9ca3af; font-size: 13px; padding: 4px 0;">Your Role:</td>
          <td style="color: #f3f4f6; font-size: 13px; padding: 4px 0; text-align: right;">Owner</td>
        </tr>
      </table>
    </div>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      Start by adding your IoT devices, then invite family members to share control.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Household Created', body));
}

async function sendOwnershipTransferred(to, displayName, householdName, direction) {
  const isNew = direction === 'received';
  const subject = isNew
    ? `👑 You are now the owner of "${householdName}"`
    : `🔄 Ownership of "${householdName}" transferred`;
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      Ownership ${isNew ? 'Received' : 'Transferred'}
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi <strong style="color: #f3f4f6;">${displayName}</strong>,
      ${isNew
        ? `you have been made the <strong style="color: #0d9488;">Owner</strong> of the household <strong style="color: #f3f4f6;">"${householdName}"</strong>.`
        : `you have transferred ownership of <strong style="color: #f3f4f6;">"${householdName}"</strong>. Your role has been changed to <strong style="color: #0d9488;">Admin</strong>.`
      }
    </p>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      ${isNew
        ? 'As the owner, you have full control over the household including managing members, devices, and the plan.'
        : 'As an admin, you can still manage members and devices, but plan changes and ownership transfers are reserved for the owner.'
      }
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Ownership Transfer', body));
}

async function sendInviteToRegister(to, householdName, invitedByName, portalUrl) {
  const subject = `📧 You've been invited to join "${householdName}" on SIFT`;
  const registerUrl = portalUrl ? `${portalUrl}#/register` : '#/register';
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      You're Invited!
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      <strong style="color: #f3f4f6;">${invitedByName}</strong> has invited you to join the smart home household
      <strong style="color: #f3f4f6;">"${householdName}"</strong> on The SIFT Platform.
    </p>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      To join, create a free account on SIFT using this email address (<strong style="color: #0d9488;">${to}</strong>),
      and then ask <strong>${invitedByName}</strong> to re-add you.
    </p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${registerUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488, #065f53); color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
        Create Your Account
      </a>
    </div>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      If you don't know <strong>${invitedByName}</strong> or weren't expecting this invitation, you can safely ignore this email.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Invitation to SIFT', body));
}

async function sendRoleChanged(to, displayName, householdName, newRole) {
  const subject = `🔄 Your role in "${householdName}" has changed`;
  const body = `
    <h2 style="margin: 0 0 16px; color: #f3f4f6; font-size: 20px;">
      Role Updated
    </h2>
    <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi <strong style="color: #f3f4f6;">${displayName}</strong>, your role in the household
      <strong style="color: #f3f4f6;">"${householdName}"</strong> has been updated to
      <strong style="color: #0d9488;">${newRole}</strong>.
    </p>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">
      This change may affect which actions you can perform in the household. Log in to SIFT for more details.
    </p>
  `;
  return sendMail(to, subject, wrapHtml('Role Change', body));
}

module.exports = {
  sendOtp,
  sendWelcome,
  sendLoginAlert,
  sendMemberAdded,
  sendMemberRemoved,
  sendHouseholdCreated,
  sendOwnershipTransferred,
  sendInviteToRegister,
  sendRoleChanged,
};
