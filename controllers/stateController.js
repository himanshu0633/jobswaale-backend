const State = require('../models/State');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, caseInsensitiveExactFilter } = require('../utils/masterHelpers');

exports.getStates = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    const filter = activeFilter(req);
    if (req.query.cid) {
      filter.cid = req.query.cid;
    }

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      if (search) {
        filter.$or = [
          { sid: { $regex: search, $options: 'i' } },
          { stateName: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await State.countDocuments(filter);
      const docs = await State.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sid: 1 })
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
      const list = await State.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ stateName: 1, sid: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createState = async (req, res) => {
  try {
    const { cid, sid, stateName, status } = req.body;
    if (!cid || !sid || !stateName) {
      return res.status(400).json({ message: 'cid, sid, and stateName are required' });
    }
    const cleanStateName = stateName.trim();

    const exists = await State.findOne({
      $or: [
        { sid },
        caseInsensitiveExactFilter('stateName', cleanStateName, { cid })
      ]
    });
    if (exists) {
      return res.status(400).json({ message: 'State with this SID or Name already exists' });
    }

    const newState = new State(addAuditOnCreate(req, { cid, sid, stateName: cleanStateName, status }));
    await newState.save();
    res.status(201).json(newState);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateState = async (req, res) => {
  try {
    const { id } = req.params;
    const { cid, stateName, status } = req.body;

    const state = await State.findById(id);
    if (!state) {
      return res.status(404).json({ message: 'State not found' });
    }
    const cleanStateName = stateName ? stateName.trim() : stateName;
    if (cleanStateName) {
      const duplicate = await State.findOne(caseInsensitiveExactFilter('stateName', cleanStateName, {
        cid,
        _id: { $ne: id }
      }));
      if (duplicate) {
        return res.status(400).json({ message: 'State with this Name already exists' });
      }
    }

    const updated = await State.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { cid, stateName: cleanStateName, status }),
      { returnDocument: 'after' }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteState = async (req, res) => {
  try {
    const { id } = req.params;
    await State.findByIdAndUpdate(id, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'State deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
