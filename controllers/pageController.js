const fs = require('fs');
const path = require('path');
const Page = require('../models/Page');
const Attachment = require('../models/Attachment');
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

const slugAliases = {
  'about-us': 'about',
  'about': 'about',
  'terms': 'terms-conditions',
  'terms-and-conditions': 'terms-conditions',
  'terms-conditions': 'terms-conditions',
  'privacy': 'privacy-policy',
  'privacy-policy': 'privacy-policy'
};

const VALID_BANNER_POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
];

const sanitizeBanners = (banners) => {
  if (!Array.isArray(banners)) return undefined;
  return banners
    .filter(b => b && (b.url || typeof b === 'string'))
    .map(b => {
      if (typeof b === 'string') {
        return {
          url: b.trim(),
          position: 'top-center',
          title: '',
          alt: ''
        };
      }
      return {
        url: String(b.url || '').trim(),
        position: VALID_BANNER_POSITIONS.includes(b.position) ? b.position : 'top-center',
        title: String(b.title || '').trim(),
        alt: String(b.alt || '').trim()
      };
    })
    .filter(b => b.url.length > 0);
};

const formatPageResponse = (pageDoc) => {
  if (!pageDoc) return pageDoc;
  const pageObj = pageDoc.toObject ? pageDoc.toObject() : { ...pageDoc };
  if ((!pageObj.banners || pageObj.banners.length === 0) && (pageObj.bannerImage || pageObj.featuredImage)) {
    pageObj.banners = [{
      url: pageObj.bannerImage || pageObj.featuredImage,
      position: 'top-center',
      title: '',
      alt: ''
    }];
  }
  return pageObj;
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
        .populate('parentPage', 'title slug')
        .populate('createdBy', 'email')
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingOrder: 1, updatedAt: -1 })
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

    const docs = await Page.find(filter).populate('parentPage', 'title slug').sort({ sortingOrder: 1, title: 1 });
    res.json(docs.map(formatPageResponse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPage = async (req, res) => {
  try {
    const page = await Page.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate('parentPage', 'title slug');
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(formatPageResponse(page));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPageBySlug = async (req, res) => {
  try {
    const rawSlug = normalizeSlug(req.params.slug);
    const primarySlug = slugAliases[rawSlug] || rawSlug;
    const slugsToTry = Array.from(new Set([rawSlug, primarySlug]));

    const page = await Page.findOne({
      slug: { $in: slugsToTry },
      isDeleted: { $ne: true }
    }).populate('parentPage', 'title slug');
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(formatPageResponse(page));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPublicPage = async (req, res) => {
  try {
    const rawSlug = normalizeSlug(req.params.slug || 'home');
    const primarySlug = slugAliases[rawSlug] || rawSlug;
    const slugsToTry = Array.from(new Set([rawSlug, primarySlug]));

    const page = await Page.findOne({
      slug: { $in: slugsToTry },
      published: true,
      isDeleted: { $ne: true }
    });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(formatPageResponse(page));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.upsertPageBySlug = async (req, res) => {
  try {
    const rawSlug = normalizeSlug(req.params.slug);
    const targetSlug = slugAliases[rawSlug] || rawSlug;
    const slugsToTry = Array.from(new Set([rawSlug, targetSlug]));

    const {
      title,
      html,
      css,
      projectData,
      published = true,
      parentPage,
      featuredImage,
      bannerImage,
      banners,
      sections,
      sortingOrder = 10,
      seoTitle = '',
      seoDescription = '',
      seoKeywords = ''
    } = req.body;

    const resolvedBanner = bannerImage !== undefined ? bannerImage : (featuredImage !== undefined ? featuredImage : undefined);
    const resolvedFeatured = featuredImage !== undefined ? featuredImage : (bannerImage !== undefined ? bannerImage : undefined);
    const resolvedBanners = sanitizeBanners(banners);

    let page = await Page.findOne({
      slug: { $in: slugsToTry },
      isDeleted: { $ne: true }
    });

    if (page) {
      const updateData = {
        title: title ? title.trim() : page.title,
        slug: page.slug,
        html: html !== undefined ? html : page.html,
        css: css !== undefined ? css : page.css,
        projectData: projectData !== undefined ? projectData : page.projectData,
        published: published !== undefined ? Boolean(published) : page.published,
        parentPage: parentPage !== undefined ? parentPage : page.parentPage,
        sortingOrder: sortingOrder !== undefined ? (Number(sortingOrder) || page.sortingOrder) : page.sortingOrder,
        seoTitle: seoTitle !== undefined ? seoTitle : page.seoTitle,
        seoDescription: seoDescription !== undefined ? seoDescription : page.seoDescription,
        seoKeywords: seoKeywords !== undefined ? seoKeywords : page.seoKeywords
      };

      if (sections !== undefined) {
        updateData.sections = Array.isArray(sections) ? sections : [];
      }

      if (resolvedBanners !== undefined) {
        updateData.banners = resolvedBanners;
        if (resolvedBanners.length > 0) {
          updateData.bannerImage = resolvedBanners[0].url;
          updateData.featuredImage = resolvedBanners[0].url;
        } else {
          updateData.bannerImage = '';
        }
      } else if (resolvedBanner !== undefined) {
        updateData.bannerImage = resolvedBanner;
        updateData.banners = resolvedBanner ? [{ url: resolvedBanner, position: 'top-center' }] : [];
      }

      if (resolvedFeatured !== undefined && resolvedBanners === undefined) {
        updateData.featuredImage = resolvedFeatured;
      }

      page = await Page.findByIdAndUpdate(
        page._id,
        addAuditOnUpdate(req, updateData),
        { returnDocument: 'after' }
      );
      return res.json(formatPageResponse(page));
    }

    const initialBanners = resolvedBanners !== undefined
      ? resolvedBanners
      : (resolvedBanner ? [{ url: resolvedBanner, position: 'top-center' }] : []);

    const newPageData = addAuditOnCreate(req, {
      title: (title || targetSlug).trim(),
      slug: targetSlug,
      html: html || '',
      css: css || '',
      projectData: projectData || { editor: 'ckeditor', html: html || '' },
      published: Boolean(published),
      parentPage: parentPage || null,
      featuredImage: resolvedFeatured || (initialBanners[0]?.url || ''),
      bannerImage: resolvedBanner || (initialBanners[0]?.url || ''),
      banners: initialBanners,
      sections: Array.isArray(sections) ? sections : [],
      sortingOrder: Number(sortingOrder) || 10,
      seoTitle,
      seoDescription,
      seoKeywords,
      createdBy: req.user ? req.user._id : null
    });

    const newPage = new Page(newPageData);
    await newPage.save();
    return res.status(201).json(formatPageResponse(newPage));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.createPage = async (req, res) => {
  try {
    const {
      title,
      slug,
      html,
      css,
      projectData,
      published,
      parentPage,
      featuredImage,
      bannerImage,
      banners,
      sections,
      sortingOrder,
      seoTitle,
      seoDescription,
      seoKeywords
    } = req.body;
    if (!title) return res.status(400).json({ message: 'Page title is required' });

    const cleanSlug = normalizeSlug(slug || title);
    const exists = await Page.findOne({ slug: cleanSlug, isDeleted: { $ne: true } });
    if (exists) return res.status(400).json({ message: 'Page with this slug already exists' });

    const resolvedBanner = bannerImage !== undefined ? bannerImage : (featuredImage !== undefined ? featuredImage : '');
    const resolvedFeatured = featuredImage !== undefined ? featuredImage : (bannerImage !== undefined ? bannerImage : '');
    const resolvedBanners = sanitizeBanners(banners);
    const initialBanners = resolvedBanners !== undefined
      ? resolvedBanners
      : (resolvedBanner ? [{ url: resolvedBanner, position: 'top-center' }] : []);

    const page = new Page(addAuditOnCreate(req, {
      title: title.trim(),
      slug: cleanSlug,
      html,
      css,
      projectData: projectData || {},
      published: Boolean(published),
      parentPage: parentPage || null,
      featuredImage: resolvedFeatured || (initialBanners[0]?.url || ''),
      bannerImage: resolvedBanner || (initialBanners[0]?.url || ''),
      banners: initialBanners,
      sections: Array.isArray(sections) ? sections : [],
      sortingOrder: Number(sortingOrder) || 10,
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      seoKeywords: seoKeywords || '',
      createdBy: req.user ? req.user._id : null
    }));

    await page.save();
    res.status(201).json(formatPageResponse(page));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const {
      title,
      slug,
      html,
      css,
      projectData,
      published,
      parentPage,
      featuredImage,
      bannerImage,
      banners,
      sections,
      sortingOrder,
      seoTitle,
      seoDescription,
      seoKeywords
    } = req.body;
    if (!title) return res.status(400).json({ message: 'Page title is required' });

    const cleanSlug = normalizeSlug(slug || title);
    const duplicate = await Page.findOne({
      slug: cleanSlug,
      isDeleted: { $ne: true },
      _id: { $ne: req.params.id }
    });
    if (duplicate) return res.status(400).json({ message: 'Page with this slug already exists' });

    const resolvedBanners = sanitizeBanners(banners);

    const updateData = {
      title: title.trim(),
      slug: cleanSlug,
      html,
      css,
      projectData: projectData || {},
      published: Boolean(published),
      parentPage: parentPage || null,
      sortingOrder: Number(sortingOrder) || 10,
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      seoKeywords: seoKeywords || ''
    };

    if (sections !== undefined) {
      updateData.sections = Array.isArray(sections) ? sections : [];
    }

    if (resolvedBanners !== undefined) {
      updateData.banners = resolvedBanners;
      if (resolvedBanners.length > 0) {
        updateData.bannerImage = resolvedBanners[0].url;
        updateData.featuredImage = resolvedBanners[0].url;
      } else {
        updateData.bannerImage = '';
      }
    } else if (bannerImage !== undefined) {
      updateData.bannerImage = bannerImage;
      updateData.banners = bannerImage ? [{ url: bannerImage, position: 'top-center' }] : [];
    }

    if (featuredImage !== undefined && resolvedBanners === undefined) {
      updateData.featuredImage = featuredImage;
    } else if (bannerImage !== undefined && resolvedBanners === undefined) {
      updateData.featuredImage = bannerImage;
    }

    const page = await Page.findByIdAndUpdate(
      req.params.id,
      addAuditOnUpdate(req, updateData),
      { returnDocument: 'after' }
    );

    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(formatPageResponse(page));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deletePage = async (req, res) => {
  try {
    const page = await Page.findByIdAndUpdate(req.params.id, addAuditOnUpdate(req, { isDeleted: true }), { returnDocument: 'after' });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.uploadPageImage = async (req, res) => {
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
      console.warn('Could not cache CMS image in Attachment model:', attachmentErr);
    }

    const publicOrigin = `${req.protocol}://${req.get('host')}`;
    const relativeUrl = `/uploads/cms/${req.file.filename}`;
    const imageUrl = `${publicOrigin.replace(/\/+$/, '')}${relativeUrl}`;

    return res.status(200).json({
      message: 'Image uploaded successfully',
      imageUrl,
      url: imageUrl,
      default: imageUrl,
      urls: { default: imageUrl },
      relativeUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('CMS image upload error:', error);
    return res.status(500).json({ message: error.message || 'Image upload failed' });
  }
};

exports.deletePageImage = async (req, res) => {
  try {
    const filename = req.params.filename || req.body?.filename;
    if (!filename) return res.status(400).json({ message: 'Filename is required' });

    await Attachment.deleteOne({ filename });
    const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
    const filePath = isVercel
      ? path.join('/tmp', 'uploads', 'cms', filename)
      : path.join(__dirname, '..', 'uploads', 'cms', filename);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    return res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('CMS delete image error:', error);
    return res.status(500).json({ message: error.message || 'Image deletion failed' });
  }
};
