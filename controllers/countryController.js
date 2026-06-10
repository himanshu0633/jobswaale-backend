const Country = require('../models/Country');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, caseInsensitiveExactFilter } = require('../utils/masterHelpers');

exports.getCountries = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    const filter = activeFilter(req);
    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      if (search) {
        filter.$or = [
          { cid: { $regex: search, $options: 'i' } },
          { countryName: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await Country.countDocuments(filter);
      const docs = await Country.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ cid: 1 })
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
      const list = await Country.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ countryName: 1, cid: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCountry = async (req, res) => {
  try {
    const { cid, countryName, status } = req.body;
    if (!cid || !countryName) {
      return res.status(400).json({ message: 'cid and countryName are required' });
    }
    const cleanCountryName = countryName.trim();
    
    const exists = await Country.findOne({
      $or: [
        { cid },
        caseInsensitiveExactFilter('countryName', cleanCountryName)
      ]
    });
    if (exists) {
      return res.status(400).json({ message: 'Country with this CID or Name already exists' });
    }

    const newCountry = new Country(addAuditOnCreate(req, { cid, countryName: cleanCountryName, status }));
    await newCountry.save();
    res.status(201).json(newCountry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const { countryName, status } = req.body;
    
    const country = await Country.findById(id);
    if (!country) {
      return res.status(404).json({ message: 'Country not found' });
    }
    const cleanCountryName = countryName ? countryName.trim() : countryName;
    if (cleanCountryName) {
      const duplicate = await Country.findOne(caseInsensitiveExactFilter('countryName', cleanCountryName, { _id: { $ne: id } }));
      if (duplicate) {
        return res.status(400).json({ message: 'Country with this Name already exists' });
      }
    }

    const updated = await Country.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { countryName: cleanCountryName, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const country = await Country.findById(id);
    if (!country) {
      return res.status(404).json({ message: 'Country not found' });
    }
    
    await Country.findByIdAndUpdate(id, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Country deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
