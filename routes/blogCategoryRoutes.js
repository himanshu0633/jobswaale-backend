const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getBlogCategories,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory
} = require('../controllers/blogCategoryController');

router.use(protect, authorizeAdminPortal);
router.get('/blog-categories', getBlogCategories);
router.post('/blog-categories', authorize('Admin'), auditMiddleware, createBlogCategory);
router.put('/blog-categories/:uid', authorize('Admin'), auditMiddleware, updateBlogCategory);
router.delete('/blog-categories/:uid', authorize('Admin'), deleteBlogCategory);

module.exports = router;
