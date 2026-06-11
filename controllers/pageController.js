const Page = require('../models/Page');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');

const normalizeSlug = (value = '') => {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/');
  return slug || 'home';
};

exports.getPages = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;
    const filter = { isDeleted: { $ne: true } };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;
      const total = await Page.countDocuments(filter);
      const docs = await Page.find(filter)
        .populate('createdBy', 'email')
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum);

      return res.json({
        docs,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      });
    }

    const docs = await Page.find(filter).sort({ title: 1 });
    res.json(docs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPage = async (req, res) => {
  try {
    const page = await Page.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPublicPage = async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug || 'home');
    const page = await Page.findOne({ slug, published: true, isDeleted: { $ne: true } });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createPage = async (req, res) => {
  try {
    const { title, slug, html, css, projectData, published } = req.body;
    if (!title) return res.status(400).json({ message: 'Page title is required' });

    const cleanSlug = normalizeSlug(slug || title);
    const exists = await Page.findOne({ slug: cleanSlug, isDeleted: { $ne: true } });
    if (exists) return res.status(400).json({ message: 'Page with this slug already exists' });

    const page = new Page(addAuditOnCreate(req, {
      title: title.trim(),
      slug: cleanSlug,
      html,
      css,
      projectData: projectData || {},
      published: Boolean(published),
      createdBy: req.user ? req.user._id : null
    }));

    await page.save();
    res.status(201).json(page);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const { title, slug, html, css, projectData, published } = req.body;
    if (!title) return res.status(400).json({ message: 'Page title is required' });

    const cleanSlug = normalizeSlug(slug || title);
    const duplicate = await Page.findOne({
      slug: cleanSlug,
      isDeleted: { $ne: true },
      _id: { $ne: req.params.id }
    });
    if (duplicate) return res.status(400).json({ message: 'Page with this slug already exists' });

    const page = await Page.findByIdAndUpdate(
      req.params.id,
      addAuditOnUpdate(req, {
        title: title.trim(),
        slug: cleanSlug,
        html,
        css,
        projectData: projectData || {},
        published: Boolean(published)
      }),
      { new: true }
    );

    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deletePage = async (req, res) => {
  try {
    const page = await Page.findByIdAndUpdate(req.params.id, addAuditOnUpdate(req, { isDeleted: true }), { new: true });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
