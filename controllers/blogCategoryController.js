const BlogCategory = require('../models/BlogCategory');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, validateWholeNumber, caseInsensitiveExactFilter } = require('../utils/masterHelpers');

exports.getBlogCategories = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    const filter = activeFilter(req);
    if (search) {
      const cleanedSearch = search.replace(/^0+/, '');
      const filterOr = [
        { id: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
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

      const total = await BlogCategory.countDocuments(filter);
      const docs = await BlogCategory.find(filter)
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
      const list = await BlogCategory.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ name: 1, id: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createBlogCategory = async (req, res) => {
  try {
    const { id, name, sortingNo, status } = req.body;
    if (!id || !name) {
      return res.status(400).json({ message: 'ID and Name are required' });
    }

    const cleanName = name.trim();

    const exists = await BlogCategory.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const nameExists = await BlogCategory.findOne(caseInsensitiveExactFilter('name', cleanName, { isDeleted: { $ne: true } }));
    if (nameExists) {
      return res.status(400).json({ message: 'Blog category with this Name already exists' });
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await BlogCategory.findOne({ sortingNo: Number(sortingNo), isDeleted: { $ne: true } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const item = new BlogCategory(addAuditOnCreate(req, { id, name: cleanName, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateBlogCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    const { name, sortingNo, status } = req.body;

    const cleanName = name ? name.trim() : name;
    if (cleanName) {
      const duplicate = await BlogCategory.findOne(caseInsensitiveExactFilter('name', cleanName, { _id: { $ne: uid }, isDeleted: { $ne: true } }));
      if (duplicate) {
        return res.status(400).json({ message: 'Blog category with this Name already exists' });
      }
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await BlogCategory.findOne({ sortingNo: Number(sortingNo), _id: { $ne: uid }, isDeleted: { $ne: true } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await BlogCategory.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { name: cleanName, sortingNo, status }),
      { returnDocument: 'after' }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteBlogCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    await BlogCategory.findByIdAndUpdate(uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Blog category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
