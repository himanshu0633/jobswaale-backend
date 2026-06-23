const User = require('../models/User');
const Role = require('../models/Role');
const { sendUserWelcomeEmail } = require('../utils/mail');
const { getSettings } = require('../utils/settings');
const {
  validateMobileNumber,
  generatePasswordFromNameAndPhone,
  findDuplicateMobile
} = require('../utils/userCredentials');

const userResponseFields = '-password';
const adminUserQuery = {
  isDeleted: { $ne: true },
  $or: [
    { accountType: 'admin' },
    { role: 'Admin' },
    { roleRef: { $ne: null } }
  ]
};

exports.getAdminUsers = async (req, res) => {
  try {
    const users = await User.find(adminUserQuery)
      .select(userResponseFields)
      .populate('roleRef')
      .sort({ createDate: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminUserById = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, ...adminUserQuery })
      .select(userResponseFields)
      .populate('roleRef');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAdminUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      username,
      roleRef,
      status,
      accountMethod,
      password,
      confirmPassword
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !username || !roleRef) {
      return res.status(400).json({ message: 'First name, last name, email, phone, username and role are required' });
    }

    const role = await Role.findOne({ _id: roleRef, status: 'active', isDeleted: { $ne: true } });
    if (!role) return res.status(400).json({ message: 'Please select a valid active role' });
    const settings = await getSettings();

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User with this email already exists' });

    const usernameExists = await User.findOne({ username });
    if (usernameExists) return res.status(400).json({ message: 'Username already exists' });

    const normalizedPhone = validateMobileNumber(phone);
    const phoneExists = await findDuplicateMobile(normalizedPhone);
    if (phoneExists) return res.status(400).json({ message: 'Mobile number already exists' });

    let finalPassword = password;
    if (accountMethod === 'manual') {
      if (!password || password.length < settings.minPassLen) return res.status(400).json({ message: `Password must be at least ${settings.minPassLen} characters` });
      if (password !== confirmPassword) return res.status(400).json({ message: 'Password and confirm password do not match' });
    } else {
      finalPassword = generatePasswordFromNameAndPhone(`${firstName}${lastName}`, normalizedPhone);
    }

    const user = await User.create({
      firstName,
      lastName,
      username,
      email,
      phone: normalizedPhone,
      password: finalPassword,
      role: role.name,
      roleRef: role._id,
      accountType: 'admin',
      status: status || 'active',
      ip: req.clientIp || '127.0.0.1',
      login: req.user?._id
    });

    const mail = await sendUserWelcomeEmail({
      to: email,
      firstName,
      password: finalPassword,
      roleName: role.name
    });

    const cleanUser = await User.findById(user._id).select(userResponseFields).populate('roleRef');
    res.status(201).json({
      user: cleanUser,
      mail,
      generatedPassword: mail.sent ? undefined : finalPassword,
      message: mail.sent
        ? 'User created successfully and email sent'
        : 'User created successfully. Email not sent because mail is not configured.'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateAdminUser = async (req, res) => {
  try {
    const { firstName, lastName, phone, username, roleRef, status, password, confirmPassword } = req.body;
    const user = await User.findOne({ _id: req.params.id, ...adminUserQuery });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const role = await Role.findOne({ _id: roleRef, isDeleted: { $ne: true } });
    if (!role) return res.status(400).json({ message: 'Please select a valid role' });
    const settings = await getSettings();

    const usernameExists = await User.findOne({ username, _id: { $ne: user._id } });
    if (usernameExists) return res.status(400).json({ message: 'Username already exists' });

    const normalizedPhone = validateMobileNumber(phone);

    const phoneExists = await findDuplicateMobile(normalizedPhone, { userId: user._id });
    if (phoneExists) return res.status(400).json({ message: 'Mobile number already exists' });

    user.firstName = firstName || '';
    user.lastName = lastName || '';
    user.phone = normalizedPhone;
    user.username = username;
    user.role = role.name;
    user.roleRef = role._id;
    user.status = status || user.status;
    user.updatedLogin = req.user?._id;
    user.ip = req.clientIp || '127.0.0.1';

    if (password) {
      if (password.length < settings.minPassLen) return res.status(400).json({ message: `Password must be at least ${settings.minPassLen} characters` });
      if (password !== confirmPassword) return res.status(400).json({ message: 'Password and confirm password do not match' });
      user.password = password;
    }

    await user.save();
    const cleanUser = await User.findById(user._id).select(userResponseFields).populate('roleRef');
    res.json(cleanUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteAdminUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, ...adminUserQuery });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user._id) === String(req.user?._id)) return res.status(400).json({ message: 'You cannot delete your own account' });

    user.isDeleted = true;
    user.updatedLogin = req.user?._id;
    await user.save();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
