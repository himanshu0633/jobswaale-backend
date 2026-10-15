const fs = require('fs');
const Attachment = require('../models/Attachment');
const { getSettings, saveSettings, getPublicSettings, normalizeSettings } = require('../utils/settings');
const { createTransportFromSettings, formatMailError, sendMailWithRetry } = require('../utils/mail');

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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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
    const savedSettings = await getSettings();
    const settings = normalizeSettings({
      ...savedSettings,
      ...(req.body?.settings || req.body || {})
    });
    const to = req.body?.to || settings.siteEmail || settings.mailFromEmail;
    if (!to) {
      return res.status(400).json({ message: 'Please set a support email or from email first.' });
    }

    const transporter = createTransportFromSettings(settings);
    await sendMailWithRetry(transporter, {
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
    res.status(400).json({ message: formatMailError(error) });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    try {
      const fileData = fs.readFileSync(req.file.path);
      await Attachment.findOneAndUpdate(
        { filename: req.file.filename },
        {
          filename: req.file.filename,
          data: fileData,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname,
          size: req.file.size
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (attachmentErr) {
      console.warn('Could not cache site image in Attachment model:', attachmentErr);
    }

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');
    const publicOrigin = `${proto}://${host}`;
    const relativeUrl = `/uploads/site/${req.file.filename}`;
    const imageUrl = `${publicOrigin.replace(/\/+$/, '')}${relativeUrl}`;

    res.json({
      message: 'Image uploaded successfully',
      imageUrl,
      url: imageUrl,
      default: imageUrl,
      urls: { default: imageUrl },
      relativeUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Settings image upload error:', error);
    res.status(500).json({ message: error.message || 'Image upload failed' });
  }
};
