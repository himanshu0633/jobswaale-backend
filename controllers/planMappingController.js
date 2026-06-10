const PlanMapping = require('../models/PlanMapping');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');

exports.getPlanMappings = async (req, res) => {
  try {
    const list = await PlanMapping.find({ isDeleted: { $ne: true } }).populate('plan').populate('feature');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.savePlanMappings = async (req, res) => {
  try {
    const mappings = req.body; // Expecting array of { plan, feature, value }
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ message: 'Mappings array is required' });
    }

    const operations = mappings.map(item => {
      const query = { plan: item.plan, feature: item.feature };
      const update = addAuditOnUpdate(req, { value: item.value });
      const onCreate = addAuditOnCreate(req, { plan: item.plan, feature: item.feature, value: item.value });
      return {
        updateOne: {
          filter: query,
          update: { $set: update, $setOnInsert: { login: onCreate.login, ip: onCreate.ip } },
          upsert: true
        }
      };
    });

    if (operations.length > 0) {
      await PlanMapping.bulkWrite(operations);
    }

    res.json({ message: 'Plan mappings saved successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
