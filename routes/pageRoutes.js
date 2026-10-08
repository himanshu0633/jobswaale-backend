const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { createImageUpload } = require('../middleware/imageUpload');
const {
  getPages,
  getPage,
  getPageBySlug,
  getPublicPage,
  createPage,
  updatePage,
  upsertPageBySlug,
  deletePage,
  uploadPageImage,
  deletePageImage
} = require('../controllers/pageController');

router.get('/public/pages/:slug', getPublicPage);

// Image upload & delete routes for CMS
const cmsImageUploader = createImageUpload('cms')(['image', 'upload', 'file']);
router.post('/upload-image', protect, authorizeAdminPortal, authorize('Admin'), cmsImageUploader, uploadPageImage);
router.post('/pages/upload-image', protect, authorizeAdminPortal, authorize('Admin'), cmsImageUploader, uploadPageImage);
router.delete('/delete-image/:filename', protect, authorizeAdminPortal, authorize('Admin'), deletePageImage);

router.get('/pages', protect, authorizeAdminPortal, getPages);
router.get('/pages/by-slug/:slug', protect, authorizeAdminPortal, getPageBySlug);
router.put('/pages/by-slug/:slug', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, upsertPageBySlug);
router.get('/pages/:id', protect, authorizeAdminPortal, getPage);
router.post('/pages', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createPage);
router.put('/pages/:id', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updatePage);
router.delete('/pages/:id', protect, authorizeAdminPortal, authorize('Admin'), deletePage);

module.exports = router;
