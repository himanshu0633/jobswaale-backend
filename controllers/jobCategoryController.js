const JobCategory = require('../models/JobCategory');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');

exports.getJobCategories = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      const filter = { isDeleted: { $ne: true } };
      if (search) {
        const cleanedSearch = search.replace(/^0+/, '');
        const filterOr = [
          { id: { $regex: search, $options: 'i' } },
          { categoryName: { $regex: search, $options: 'i' } }
        ];
        if (cleanedSearch) {
          filterOr.push({ id: { $regex: cleanedSearch, $options: 'i' } });
        }
        filter.$or = filterOr;
      }

      const total = await JobCategory.countDocuments(filter);
      const docs = await JobCategory.find(filter)
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
      const list = await JobCategory.find({ isDeleted: { $ne: true } })
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1, id: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createJobCategory = async (req, res) => {
  try {
    const { id, categoryName, sortingNo, status } = req.body;
    if (!id || !categoryName) {
      return res.status(400).json({ message: 'ID and CategoryName are required' });
    }

    const exists = await JobCategory.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await JobCategory.findOne({ sortingNo: Number(sortingNo) });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const item = new JobCategory(addAuditOnCreate(req, { id, categoryName, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateJobCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    const { categoryName, sortingNo, status } = req.body;

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await JobCategory.findOne({ sortingNo: Number(sortingNo), _id: { $ne: uid } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await JobCategory.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { categoryName, sortingNo, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteJobCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    await JobCategory.findByIdAndUpdate(uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Job category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
