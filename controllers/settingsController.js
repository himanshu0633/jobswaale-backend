const { getSettings, saveSettings, getPublicSettings } = require('../utils/settings');
const { createTransportFromSettings } = require('../utils/mail');

exports.getSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(getPublicSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await saveSettings(req.body || {}, req.user?._id);
    res.json({ message: 'Settings saved successfully', settings });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.sendTestEmail = async (req, res) => {
  try {
    const settings = await getSettings();
    const to = req.body?.to || settings.siteEmail || settings.mailFromEmail;
    if (!to) {
      return res.status(400).json({ message: 'Please set a support email or from email first.' });
    }

    const transporter = createTransportFromSettings(settings);
    await transporter.sendMail({
      from: `${settings.mailFromName || settings.siteName} <${settings.mailFromEmail || settings.siteEmail}>`,
      to,
      subject: `${settings.siteName} test email`,
      html: `<p>SMTP settings are working for <strong>${settings.siteName}</strong>.</p>`
    });

    res.json({ message: `Test email sent to ${to}` });
  } catch (error) {
    if (error.message === 'SMTP settings are not configured') {
      return res.status(400).json({ message: error.message });
    }
    res.status(400).json({ message: error.message });
  }
};
