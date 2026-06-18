const City = require('../models/City');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, caseInsensitiveExactFilter } = require('../utils/masterHelpers');

exports.getCities = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    const filter = activeFilter(req);
    if (req.query.did) filter.did = req.query.did;
    if (req.query.sid) filter.sid = req.query.sid;
    if (req.query.cid) filter.cid = req.query.cid;

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      if (search) {
        filter.$or = [
          { ctid: { $regex: search, $options: 'i' } },
          { cityName: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await City.countDocuments(filter);
      const docs = await City.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ ctid: 1 })
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
      const list = await City.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ cityName: 1, ctid: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCity = async (req, res) => {
  try {
    const { cid, sid, did, ctid, cityName, status } = req.body;
    if (!cid || !sid || !did || !ctid || !cityName) {
      return res.status(400).json({ message: 'cid, sid, did, ctid, and cityName are required' });
    }
    const cleanCityName = cityName.trim();

    const exists = await City.findOne({
      $or: [
        { ctid },
        caseInsensitiveExactFilter('cityName', cleanCityName, { cid, sid, did })
      ]
    });
    if (exists) {
      return res.status(400).json({ message: 'City with this CTID or Name already exists' });
    }

    const item = new City(addAuditOnCreate(req, { cid, sid, did, ctid, cityName: cleanCityName, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { cid, sid, did, cityName, status } = req.body;
    const cleanCityName = cityName ? cityName.trim() : cityName;
    if (cleanCityName) {
      const duplicate = await City.findOne(caseInsensitiveExactFilter('cityName', cleanCityName, {
        cid,
        sid,
        did,
        _id: { $ne: id }
      }));
      if (duplicate) {
        return res.status(400).json({ message: 'City with this Name already exists' });
      }
    }

    const updated = await City.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { cid, sid, did, cityName: cleanCityName, status }),
      { returnDocument: 'after' }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteCity = async (req, res) => {
  try {
    const { id } = req.params;
    await City.findByIdAndUpdate(id, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'City deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
