const Qualification = require('../models/Qualification');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, validateWholeNumber, caseInsensitiveExactFilter } = require('../utils/masterHelpers');

exports.getQualifications = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

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

      const total = await Qualification.countDocuments(filter);
      const docs = await Qualification.find(filter)
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
      const list = await Qualification.find(activeFilter(req))
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ name: 1, id: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createQualification = async (req, res) => {
  try {
    const { id, name, sortingNo, status } = req.body;
    if (!id || !name) {
      return res.status(400).json({ message: 'ID and Name are required' });
    }

    const cleanName = name.trim();

    const exists = await Qualification.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const nameExists = await Qualification.findOne(caseInsensitiveExactFilter('name', cleanName, { isDeleted: { $ne: true } }));
    if (nameExists) {
      return res.status(400).json({ message: 'Qualification with this Name already exists' });
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await Qualification.findOne({ sortingNo: Number(sortingNo), isDeleted: { $ne: true } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const item = new Qualification(addAuditOnCreate(req, { id, name: cleanName, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateQualification = async (req, res) => {
  try {
    const { uid } = req.params;
    const { name, sortingNo, status } = req.body;

    const cleanName = name ? name.trim() : name;
    if (cleanName) {
      const duplicate = await Qualification.findOne(caseInsensitiveExactFilter('name', cleanName, { _id: { $ne: uid }, isDeleted: { $ne: true } }));
      if (duplicate) {
        return res.status(400).json({ message: 'Qualification with this Name already exists' });
      }
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await Qualification.findOne({ sortingNo: Number(sortingNo), _id: { $ne: uid }, isDeleted: { $ne: true } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await Qualification.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { name: cleanName, sortingNo, status }),
      { returnDocument: 'after' }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteQualification = async (req, res) => {
  try {
    const { uid } = req.params;
    await Qualification.findByIdAndUpdate(uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Qualification deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
