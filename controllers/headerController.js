const Header = require('../models/Header');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');

const sortMenus = (menus = []) => (
  [...menus]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((menu, index) => ({
      label: String(menu.label || '').trim(),
      path: String(menu.path || '').trim(),
      order: Number(menu.order) || index + 1,
      visible: menu.visible !== false,
      children: sortMenus(menu.children || [])
    }))
    .filter(menu => menu.label)
);

const getOrCreateHeader = async (req) => {
  let header = await Header.findOne();
  if (!header) {
    header = await Header.create(addAuditOnCreate(req, { logo: '', menus: [] }));
  }
  return header;
};

exports.getHeader = async (req, res) => {
  try {
    const header = await getOrCreateHeader(req);
    res.json(header);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPublicHeader = async (req, res) => {
  try {
    const header = await Header.findOne();
    res.json(header || { logo: '', menus: [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.saveHeader = async (req, res) => {
  try {
    const { logo, menus } = req.body;
    const header = await getOrCreateHeader(req);
    header.set(addAuditOnUpdate(req, {
      logo: logo || '',
      menus: sortMenus(menus || [])
    }));
    await header.save();
    res.json(header);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
