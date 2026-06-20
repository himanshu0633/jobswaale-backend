const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const roleController = require('../controllers/adminRoleController');
const userController = require('../controllers/adminUserController');

router.use(protect, authorizeAdminPortal);

router.get('/stats', roleController.getUsersRolesStats);
router.get('/permissions', roleController.getPermissionGroups);

router.get('/roles', roleController.getRoles);
router.get('/roles/:id', roleController.getRoleById);
router.post('/roles', roleController.createRole);
router.put('/roles/:id', roleController.updateRole);
router.delete('/roles/:id', roleController.deleteRole);

router.get('/users', userController.getAdminUsers);
router.get('/users/:id', userController.getAdminUserById);
router.post('/users', userController.createAdminUser);
router.put('/users/:id', userController.updateAdminUser);
router.delete('/users/:id', userController.deleteAdminUser);

module.exports = router;
