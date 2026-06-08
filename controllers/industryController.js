const IndustryType = require('../models/IndustryType');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');

exports.getIndustryTypes = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // Build search filter on ID and Name
      const filter = {};
      if (search) {
        const cleanedSearch = search.replace(/^0+/, '');
        const filterOr = [
          { id: { $regex: search, $options: 'i' } },
          { industryType: { $regex: search, $options: 'i' } }
        ];
        if (cleanedSearch) {
          filterOr.push({ id: { $regex: cleanedSearch, $options: 'i' } });
        }
        filter.$or = filterOr;
      }

      const total = await IndustryType.countDocuments(filter);
      const docs = await IndustryType.find(filter)
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
      const list = await IndustryType.find()
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1, id: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createIndustryType = async (req, res) => {
  try {
    const { id, industryType, sortingNo, status } = req.body;
    if (!id || !industryType) {
      return res.status(400).json({ message: 'ID and IndustryType name are required' });
    }

    const exists = await IndustryType.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await IndustryType.findOne({ sortingNo: Number(sortingNo) });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const item = new IndustryType(addAuditOnCreate(req, { id, industryType, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateIndustryType = async (req, res) => {
  try {
    const { uid } = req.params;
    const { industryType, sortingNo, status } = req.body;

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await IndustryType.findOne({ sortingNo: Number(sortingNo), _id: { $ne: uid } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await IndustryType.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { industryType, sortingNo, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteIndustryType = async (req, res) => {
  try {
    const { uid } = req.params;
    await IndustryType.findByIdAndDelete(uid);
    res.json({ message: 'Industry type deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
