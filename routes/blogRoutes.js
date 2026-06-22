const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getBlogs,
  getBlog,
  getPublicBlogs,
  getPublicBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog
} = require('../controllers/blogController');

router.get('/public/blogs', getPublicBlogs);
router.get('/public/blogs/:slug', getPublicBlogBySlug);

router.use(protect);
router.get('/blogs', getBlogs);
router.get('/blogs/:id', getBlog);
router.post('/blogs', authorize('Admin'), auditMiddleware, createBlog);
router.put('/blogs/:id', authorize('Admin'), auditMiddleware, updateBlog);
router.delete('/blogs/:id', authorize('Admin'), deleteBlog);

module.exports = router;
