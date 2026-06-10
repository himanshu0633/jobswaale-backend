const Feature = require('../models/Feature');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, validateWholeNumber } = require('../utils/masterHelpers');

exports.getFeatures = async (req, res) => {
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
          { featureName: { $regex: search, $options: 'i' } }
        ];
        if (cleanedSearch) {
          filterOr.push({ id: { $regex: cleanedSearch, $options: 'i' } });
        }
        filter.$or = filterOr;
      }

      const total = await Feature.countDocuments(filter);
      const docs = await Feature.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ displayOrder: 1, id: 1 })
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
      const list = await Feature.find(activeFilter(req))
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ featureName: 1, id: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createFeature = async (req, res) => {
  try {
    const { id, featureName, displayOrder, status } = req.body;
    if (!id || !featureName) {
      return res.status(400).json({ message: 'ID and FeatureName are required' });
    }

    const exists = await Feature.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const sortError = validateWholeNumber(displayOrder, 'Display order');
    if (sortError) return res.status(400).json({ message: sortError });

    if (displayOrder !== undefined && displayOrder !== null && displayOrder !== '') {
      const sortExists = await Feature.findOne({ displayOrder: Number(displayOrder) });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const item = new Feature(addAuditOnCreate(req, { id, featureName, displayOrder, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateFeature = async (req, res) => {
  try {
    const { uid } = req.params;
    const { featureName, displayOrder, status } = req.body;

    const sortError = validateWholeNumber(displayOrder, 'Display order');
    if (sortError) return res.status(400).json({ message: sortError });

    if (displayOrder !== undefined && displayOrder !== null && displayOrder !== '') {
      const sortExists = await Feature.findOne({ displayOrder: Number(displayOrder), _id: { $ne: uid } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await Feature.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { featureName, displayOrder, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteFeature = async (req, res) => {
  try {
    const { uid } = req.params;
    await Feature.findByIdAndUpdate(uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Feature deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
