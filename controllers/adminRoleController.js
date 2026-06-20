const Role = require('../models/Role');
const User = require('../models/User');
const { permissionGroups, allPermissions } = require('../utils/permissions');

const sanitizePermissions = (permissions = []) => {
  const allowed = new Set(allPermissions);
  return [...new Set(permissions)].filter(permission => allowed.has(permission));
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const roleLookupQuery = (identifier) => {
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    return { _id: identifier, isDeleted: { $ne: true } };
  }

  return {
    name: { $regex: `^${escapeRegex(decodeURIComponent(identifier))}$`, $options: 'i' },
    isDeleted: { $ne: true }
  };
};

const roleNameExists = (name, excludeId = null) => {
  const query = {
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
    isDeleted: { $ne: true }
  };

  if (excludeId) query._id = { $ne: excludeId };
  return Role.findOne(query);
};

const adminUserQuery = {
  isDeleted: { $ne: true },
  $or: [
    { accountType: 'admin' },
    { role: 'Admin' },
    { roleRef: { $ne: null } }
  ]
};

exports.getPermissionGroups = async (req, res) => {
  res.json({ groups: permissionGroups, allPermissions });
};

exports.getUsersRolesStats = async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [totalUsers, activeUsers, totalRoles, newThisMonth] = await Promise.all([
      User.countDocuments(adminUserQuery),
      User.countDocuments({ ...adminUserQuery, status: 'active' }),
      Role.countDocuments({ isDeleted: { $ne: true } }),
      User.countDocuments({ ...adminUserQuery, createDate: { $gte: monthStart } })
    ]);

    res.json({ totalUsers, activeUsers, totalRoles, newThisMonth });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find({ isDeleted: { $ne: true } }).sort({ createDate: -1 }).lean();
    const userCounts = await User.aggregate([
      { $match: { isDeleted: { $ne: true }, roleRef: { $ne: null } } },
      { $group: { _id: '$roleRef', count: { $sum: 1 } } }
    ]);
    const countMap = userCounts.reduce((acc, item) => {
      acc[String(item._id)] = item.count;
      return acc;
    }, {});

    res.json(roles.map(role => ({ ...role, userCount: countMap[String(role._id)] || 0 })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRoleById = async (req, res) => {
  try {
    const role = await Role.findOne(roleLookupQuery(req.params.id));
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { name, description, status, permissions } = req.body;
    if (!name) return res.status(400).json({ message: 'Role name is required' });

    const exists = await roleNameExists(name);
    if (exists) return res.status(400).json({ message: 'Role already exists' });

    const role = await Role.create({
      name: name.trim(),
      description,
      status: status || 'active',
      permissions: sanitizePermissions(permissions),
      ip: req.clientIp || '127.0.0.1',
      login: req.user?._id
    });

    res.status(201).json(role);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { name, description, status, permissions } = req.body;
    const role = await Role.findOne(roleLookupQuery(req.params.id));
    if (!role) return res.status(404).json({ message: 'Role not found' });

    if (name && name.trim().toLowerCase() !== role.name.toLowerCase()) {
      const exists = await roleNameExists(name, role._id);
      if (exists) return res.status(400).json({ message: 'Role already exists' });
      role.name = name.trim();
    }

    role.description = description || '';
    role.status = status || role.status;
    role.permissions = sanitizePermissions(permissions);
    role.ip = req.clientIp || '127.0.0.1';
    role.updatedLogin = req.user?._id;
    await role.save();

    res.json(role);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findOne(roleLookupQuery(req.params.id));
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const assignedUsers = await User.countDocuments({ roleRef: role._id, isDeleted: { $ne: true } });
    if (assignedUsers > 0) {
      return res.status(400).json({ message: 'Role is assigned to users and cannot be deleted' });
    }

    role.isDeleted = true;
    role.updatedLogin = req.user?._id;
    await role.save();
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
