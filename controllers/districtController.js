const District = require('../models/District');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, caseInsensitiveExactFilter } = require('../utils/masterHelpers');

exports.getDistricts = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    const filter = activeFilter(req);
    if (req.query.sid) {
      filter.sid = req.query.sid;
    }

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      if (search) {
        filter.$or = [
          { did: { $regex: search, $options: 'i' } },
          { districtName: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await District.countDocuments(filter);
      const docs = await District.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ did: 1 })
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
      const list = await District.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ districtName: 1, did: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createDistrict = async (req, res) => {
  try {
    const { sid, did, districtName, status } = req.body;
    if (!sid || !did || !districtName) {
      return res.status(400).json({ message: 'sid, did, and districtName are required' });
    }

    const cleanDistrictName = districtName.trim();

    const exists = await District.findOne({
      $or: [
        { did },
        caseInsensitiveExactFilter('districtName', cleanDistrictName, { sid })
      ]
    });
    if (exists) {
      return res.status(400).json({ message: 'District with this DID or Name already exists' });
    }

    const newDistrict = new District(addAuditOnCreate(req, { sid, did, districtName: cleanDistrictName, status }));
    await newDistrict.save();
    res.status(201).json(newDistrict);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    const { sid, districtName, status } = req.body;

    const district = await District.findById(id);
    if (!district) {
      return res.status(404).json({ message: 'District not found' });
    }
    const cleanDistrictName = districtName ? districtName.trim() : districtName;
    if (cleanDistrictName) {
      const duplicate = await District.findOne(caseInsensitiveExactFilter('districtName', cleanDistrictName, {
        sid,
        _id: { $ne: id }
      }));
      if (duplicate) {
        return res.status(400).json({ message: 'District with this Name already exists' });
      }
    }

    const updated = await District.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { sid, districtName: cleanDistrictName, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    await District.findByIdAndUpdate(id, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'District deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
