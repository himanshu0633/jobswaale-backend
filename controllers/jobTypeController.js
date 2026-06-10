const JobType = require('../models/JobType');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');

exports.getJobTypes = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // Build search filter on ID and Name
      const filter = { isDeleted: { $ne: true } };
      if (search) {
        const cleanedSearch = search.replace(/^0+/, '');
        const filterOr = [
          { id: { $regex: search, $options: 'i' } },
          { jobType: { $regex: search, $options: 'i' } }
        ];
        if (cleanedSearch) {
          filterOr.push({ id: { $regex: cleanedSearch, $options: 'i' } });
        }
        filter.$or = filterOr;
      }

      const total = await JobType.countDocuments(filter);
      const docs = await JobType.find(filter)
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
      const list = await JobType.find({ isDeleted: { $ne: true } })
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1, id: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createJobType = async (req, res) => {
  try {
    const { id, jobType, sortingNo, status } = req.body;
    if (!id || !jobType) {
      return res.status(400).json({ message: 'ID and JobType name are required' });
    }

    const exists = await JobType.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await JobType.findOne({ sortingNo: Number(sortingNo) });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const item = new JobType(addAuditOnCreate(req, { id, jobType, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateJobType = async (req, res) => {
  try {
    const { uid } = req.params;
    const { jobType, sortingNo, status } = req.body;

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await JobType.findOne({ sortingNo: Number(sortingNo), _id: { $ne: uid } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await JobType.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { jobType, sortingNo, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteJobType = async (req, res) => {
  try {
    const { uid } = req.params;
    await JobType.findByIdAndUpdate(uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Job type deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
