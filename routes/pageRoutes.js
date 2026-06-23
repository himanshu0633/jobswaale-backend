const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getPages,
  getPage,
  getPublicPage,
  createPage,
  updatePage,
  deletePage
} = require('../controllers/pageController');

router.get('/public/pages/:slug', getPublicPage);

router.get('/pages', protect, authorizeAdminPortal, getPages);
router.get('/pages/:id', protect, authorizeAdminPortal, getPage);
router.post('/pages', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createPage);
router.put('/pages/:id', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updatePage);
router.delete('/pages/:id', protect, authorizeAdminPortal, authorize('Admin'), deletePage);

module.exports = router;
