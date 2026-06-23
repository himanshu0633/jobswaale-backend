const buildUserWelcomeEmail = ({ firstName, email, password, roleName }) => {
  const displayName = firstName || 'User';
  return `
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>JobsWaale Account Created</title></head>
      <body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#313a46;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:28px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:94%;background:#ffffff;border:1px solid #e7e9eb;border-radius:10px;overflow:hidden;">
                <tr>
                  <td style="background:#111827;padding:22px 28px;color:#ffffff;">
                    <h1 style="margin:0;font-size:22px;line-height:1.3;">Welcome to JobsWaale Admin</h1>
                    <p style="margin:8px 0 0;color:#cbd5e1;font-size:14px;">Your account has been created successfully.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <p style="margin:0 0 16px;font-size:15px;">Hi ${displayName},</p>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">You can now sign in to the JobsWaale admin portal with the details below.</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;border:1px solid #e7e9eb;border-radius:8px;margin:18px 0;">
                      <tr><td style="padding:14px 16px;font-size:14px;"><strong>Email:</strong> ${email}</td></tr>
                      <tr><td style="padding:0 16px 14px;font-size:14px;"><strong>Password:</strong> ${password}</td></tr>
                      <tr><td style="padding:0 16px 14px;font-size:14px;"><strong>Role:</strong> ${roleName}</td></tr>
                    </table>
                    <p style="margin:0 0 18px;font-size:14px;color:#64748b;line-height:1.6;">Please change your password after first login and keep these credentials private.</p>
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:5173/login'}" style="display:inline-block;background:#6658dd;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:6px;font-weight:700;font-size:14px;">Open Admin Portal</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center;">JobsWaale by Duke Infosys</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

const { getSettings } = require('./settings');

const createTransportFromSettings = (settings = {}) => {
  const host = settings.mailHost || process.env.SMTP_HOST;
  if (!host) {
    throw new Error('SMTP settings are not configured');
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (error) {
    throw new Error('nodemailer not installed');
  }

  const user = settings.mailUsername || process.env.SMTP_USER;
  const pass = settings.mailPassword || process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port: Number(settings.mailPort || process.env.SMTP_PORT || 587),
    secure: settings.mailEncryption === 'ssl' || process.env.SMTP_SECURE === 'true',
    auth: user ? {
      user,
      pass
    } : undefined
  });
};

const getMailFrom = (settings = {}) => {
  const fromEmail = settings.mailFromEmail || settings.siteEmail || 'no-reply@jobswaale.com';
  const fromName = settings.mailFromName || settings.siteName || 'JobsWaale';
  return `${fromName} <${fromEmail}>`;
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const sendUserWelcomeEmail = async ({ to, firstName, password, roleName }) => {
  let settings;
  try {
    settings = await getSettings();
    const transporter = createTransportFromSettings(settings);

    await transporter.sendMail({
      from: getMailFrom(settings),
      to,
      subject: 'Your JobsWaale Admin Account',
      html: buildUserWelcomeEmail({ firstName, email: to, password, roleName })
    });

    return { sent: true };
  } catch (error) {
    console.log(`Mail skipped. ${error.message}. User: ${to}, Password: ${password}`);
    return { sent: false, reason: error.message };
  }
};

const sendAdminNotification = async ({ enabled, subject, title, rows = [] }) => {
  if (!enabled) return { sent: false, reason: 'Notification disabled' };

  try {
    const settings = await getSettings();
    const to = settings.siteEmail || settings.mailFromEmail;
    if (!to) return { sent: false, reason: 'Admin email not configured' };

    const transporter = createTransportFromSettings(settings);
    const htmlRows = rows
      .filter(row => row?.label)
      .map(row => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(row.label)}</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.value || '-')}</td></tr>`)
      .join('');

    await transporter.sendMail({
      from: getMailFrom(settings),
      to,
      subject,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <h2 style="margin:0 0 12px;">${escapeHtml(title)}</h2>
          <table cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;min-width:360px;">${htmlRows}</table>
        </div>
      `
    });

    return { sent: true };
  } catch (error) {
    console.log(`Admin notification skipped. ${error.message}`);
    return { sent: false, reason: error.message };
  }
};

module.exports = {
  buildUserWelcomeEmail,
  createTransportFromSettings,
  sendUserWelcomeEmail,
  sendAdminNotification
};
