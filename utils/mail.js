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

const sendUserWelcomeEmail = async ({ to, firstName, password, roleName }) => {
  if (!process.env.SMTP_HOST) {
    console.log(`Mail skipped. SMTP_HOST not configured. User: ${to}, Password: ${password}`);
    return { sent: false, reason: 'SMTP_HOST not configured' };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (error) {
    console.log(`Mail skipped. Install nodemailer to send emails. User: ${to}, Password: ${password}`);
    return { sent: false, reason: 'nodemailer not installed' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'JobsWaale <no-reply@jobswaale.com>',
    to,
    subject: 'Your JobsWaale Admin Account',
    html: buildUserWelcomeEmail({ firstName, email: to, password, roleName })
  });

  return { sent: true };
};

module.exports = { buildUserWelcomeEmail, sendUserWelcomeEmail };
