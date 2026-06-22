const Blog = require('../models/Blog');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, validateWholeNumber } = require('../utils/masterHelpers');

const normalizeSlug = (value = '') => {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/');
  return slug || 'post';
};

exports.getBlogs = async (req, res) => {
  try {
    const { page, limit = 10, search = '', category, paginate } = req.query;

    const filter = activeFilter(req);

    if (category) {
      filter.category = category;
    }

    if (search) {
      const cleanedSearch = search.replace(/^0+/, '');
      const filterOr = [
        { id: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
      if (cleanedSearch) {
        filterOr.push({ id: { $regex: cleanedSearch, $options: 'i' } });
      }
      filter.$or = filterOr;
    }

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      const total = await Blog.countDocuments(filter);
      const docs = await Blog.find(filter)
        .populate('category', 'name')
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1, id: 1 })
        .skip(skip)
        .limit(limitNum);

      return res.json({
        docs,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      });
    } else {
      const list = await Blog.find(filter)
        .populate('category', 'name')
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1, title: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getBlog = async (req, res) => {
  try {
    const blog = await Blog.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate('category', 'name');
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPublicBlogs = async (req, res) => {
  try {
    const list = await Blog.find({ status: 'active', isDeleted: { $ne: true } })
      .populate('category', 'name')
      .sort({ sortingNo: 1, createDate: -1, title: 1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPublicBlogBySlug = async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug || '');
    const blog = await Blog.findOne({ slug, status: 'active', isDeleted: { $ne: true } })
      .populate('category', 'name');
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createBlog = async (req, res) => {
  try {
    const {
      id,
      title,
      slug,
      category,
      content,
      sortingNo,
      status,
      featuredImage,
      seoTitle,
      seoDescription,
      seoKeywords
    } = req.body;

    if (!id || !title || !category || !content || !featuredImage) {
      return res.status(400).json({ message: 'ID, Title, Category, Content and Featured Image are required' });
    }

    const cleanTitle = title.trim();
    const cleanSlug = normalizeSlug(slug || cleanTitle);

    const exists = await Blog.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Blog with this ID already exists' });
    }

    const slugExists = await Blog.findOne({ slug: cleanSlug, isDeleted: { $ne: true } });
    if (slugExists) {
      return res.status(400).json({ message: 'Blog with this Slug/Title already exists' });
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await Blog.findOne({ sortingNo: Number(sortingNo) });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const blog = new Blog(addAuditOnCreate(req, {
      id,
      title: cleanTitle,
      slug: cleanSlug,
      category,
      content: content || '',
      sortingNo: Number(sortingNo) || 0,
      status: status || 'active',
      featuredImage: featuredImage || '',
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      seoKeywords: seoKeywords || ''
    }));

    await blog.save();
    res.status(201).json(blog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug,
      category,
      content,
      sortingNo,
      status,
      featuredImage,
      seoTitle,
      seoDescription,
      seoKeywords
    } = req.body;

    if (!title || !category || !content || !featuredImage) {
      return res.status(400).json({ message: 'Title, Category, Content and Featured Image are required' });
    }

    const cleanTitle = title.trim();
    const cleanSlug = normalizeSlug(slug || cleanTitle);

    const slugExists = await Blog.findOne({ slug: cleanSlug, _id: { $ne: id }, isDeleted: { $ne: true } });
    if (slugExists) {
      return res.status(400).json({ message: 'Blog with this Slug/Title already exists' });
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await Blog.findOne({ sortingNo: Number(sortingNo), _id: { $ne: id } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await Blog.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, {
        title: cleanTitle,
        slug: cleanSlug,
        category,
        content: content || '',
        sortingNo: Number(sortingNo) || 0,
        status: status || 'active',
        featuredImage: featuredImage || '',
        seoTitle: seoTitle || '',
        seoDescription: seoDescription || '',
        seoKeywords: seoKeywords || ''
      }),
      { returnDocument: 'after' }
    );

    if (!updated) return res.status(404).json({ message: 'Blog not found' });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Blog.findByIdAndUpdate(id, addAuditOnUpdate(req, { isDeleted: true }));
    if (!deleted) return res.status(404).json({ message: 'Blog not found' });
    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
