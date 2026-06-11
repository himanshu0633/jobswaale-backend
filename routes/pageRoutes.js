const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
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

router.get('/pages', protect, getPages);
router.get('/pages/:id', protect, getPage);
router.post('/pages', protect, authorize('Admin'), auditMiddleware, createPage);
router.put('/pages/:id', protect, authorize('Admin'), auditMiddleware, updatePage);
router.delete('/pages/:id', protect, authorize('Admin'), deletePage);

module.exports = router;
