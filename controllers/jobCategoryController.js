const JobCategory = require('../models/JobCategory');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { activeFilter, validateWholeNumber, caseInsensitiveExactFilter } = require('../utils/masterHelpers');

exports.getJobCategories = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate, status, isRequested, includeRequested } = req.query;

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      const filter = activeFilter(req);
      if (status) {
        filter.status = status;
      } else if (includeRequested !== 'true') {
        filter.status = { $ne: 'pending' };
      }

      if (isRequested !== undefined) {
        filter.isRequested = isRequested === 'true';
      }

      if (search) {
        const cleanedSearch = search.replace(/^0+/, '');
        const filterOr = [
          { id: { $regex: search, $options: 'i' } },
          { categoryName: { $regex: search, $options: 'i' } }
        ];
        if (cleanedSearch) {
          filterOr.push({ id: { $regex: cleanedSearch, $options: 'i' } });
        }
        filter.$or = filterOr;
      }

      const total = await JobCategory.countDocuments(filter);
      const docs = await JobCategory.find(filter)
        .populate('login', 'email companyName')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1, id: 1 })
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
      const filter = activeFilter(req);
      if (status) {
        filter.status = status;
      } else if (includeRequested !== 'true') {
        filter.status = { $ne: 'pending' };
      }
      if (isRequested !== undefined) {
        filter.isRequested = isRequested === 'true';
      }

      const list = await JobCategory.find(filter)
        .populate('login', 'email companyName')
        .populate('updatedLogin', 'email')
        .sort({ categoryName: 1, id: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPendingJobCategoryRequests = async (req, res) => {
  try {
    const filter = {
      isDeleted: { $ne: true },
      $or: [{ status: 'pending' }, { isRequested: true }]
    };
    const list = await JobCategory.find(filter)
      .populate('login', 'email companyName firstName lastName')
      .populate('updatedLogin', 'email')
      .sort({ createDate: -1, _id: -1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.requestJobCategory = async (req, res) => {
  try {
    const rawName = req.body.categoryName || req.body.name;
    if (!rawName || !rawName.trim()) {
      return res.status(400).json({ message: 'Job category name is required' });
    }
    const cleanName = rawName.trim();

    // Check if category already exists with this name (case-insensitive)
    const existing = await JobCategory.findOne(
      caseInsensitiveExactFilter('categoryName', cleanName, { isDeleted: { $ne: true } })
    );

    if (existing) {
      return res.status(200).json({
        message: existing.status === 'pending'
          ? 'Job category already requested and pending admin approval.'
          : 'Job category already exists.',
        data: existing
      });
    }

    const requesterName = req.body.requestedBy || req.user?.companyName || (req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : '') || req.user?.email || 'User';
    const requesterRole = req.user?.role || 'Employer';

    const reqId = `REQ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    const newItem = new JobCategory({
      id: reqId,
      categoryName: cleanName,
      status: 'pending',
      isRequested: true,
      requestedBy: requesterName,
      requestedRole: requesterRole,
      login: req.user?._id || undefined,
      ip: req.ip || ''
    });

    await newItem.save();
    res.status(201).json({
      message: 'Job category requested successfully. Admin can review and add it to database.',
      data: newItem
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approveJobCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    const item = await JobCategory.findById(uid);
    if (!item || item.isDeleted) {
      return res.status(404).json({ message: 'Job category not found' });
    }

    // Determine next official sequential numeric ID if not provided
    let officialId = req.body.id;
    if (!officialId) {
      const allActive = await JobCategory.find({ isDeleted: { $ne: true }, status: { $ne: 'pending' } }).select('id').lean();
      const maxId = allActive.reduce((max, d) => {
        const num = parseInt(d.id, 10);
        return !Number.isNaN(num) && num > max ? num : max;
      }, 0);
      officialId = String(maxId + 1);
    }

    // Determine next sort number if not provided
    let sortNo = req.body.sortingNo;
    if (sortNo === undefined || sortNo === null || sortNo === '') {
      const allActive = await JobCategory.find({ isDeleted: { $ne: true }, status: { $ne: 'pending' } }).select('sortingNo').lean();
      const maxSort = allActive.reduce((max, d) => {
        const num = Number(d.sortingNo);
        return Number.isFinite(num) && num > max ? num : max;
      }, 0);
      sortNo = maxSort + 1;
    } else {
      const sortError = validateWholeNumber(sortNo);
      if (sortError) return res.status(400).json({ message: sortError });
      sortNo = Number(sortNo);
    }

    // Check if categoryName collides
    const cleanName = req.body.categoryName ? req.body.categoryName.trim() : item.categoryName;
    const duplicate = await JobCategory.findOne(
      caseInsensitiveExactFilter('categoryName', cleanName, { _id: { $ne: uid }, status: { $ne: 'pending' }, isDeleted: { $ne: true } })
    );
    if (duplicate) {
      return res.status(400).json({ message: 'An active job category with this name already exists' });
    }

    const sortExists = await JobCategory.findOne({ sortingNo: sortNo, _id: { $ne: uid }, status: { $ne: 'pending' }, isDeleted: { $ne: true } });
    if (sortExists) {
      const allActive = await JobCategory.find({ isDeleted: { $ne: true }, status: { $ne: 'pending' } }).select('sortingNo').lean();
      const maxSort = allActive.reduce((max, d) => {
        const num = Number(d.sortingNo);
        return Number.isFinite(num) && num > max ? num : max;
      }, 0);
      sortNo = maxSort + 1;
    }

    item.id = officialId;
    item.categoryName = cleanName;
    item.sortingNo = sortNo;
    item.status = 'active';
    item.isRequested = false;
    item.updatedLogin = req.user?._id;

    await item.save();
    res.json({ message: 'Job category approved and added to database', data: item });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createJobCategory = async (req, res) => {
  try {
    const { id, categoryName, sortingNo, status } = req.body;
    if (!id || !categoryName) {
      return res.status(400).json({ message: 'ID and CategoryName are required' });
    }

    const cleanCategoryName = categoryName.trim();

    const exists = await JobCategory.findOne({ id, isDeleted: { $ne: true } });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const nameExists = await JobCategory.findOne(caseInsensitiveExactFilter('categoryName', cleanCategoryName, { isDeleted: { $ne: true } }));
    if (nameExists) {
      return res.status(400).json({ message: 'Job category with this Name already exists' });
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await JobCategory.findOne({ sortingNo: Number(sortingNo), isDeleted: { $ne: true } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const item = new JobCategory(addAuditOnCreate(req, { id, categoryName: cleanCategoryName, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateJobCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    const { categoryName, sortingNo, status } = req.body;

    const cleanCategoryName = categoryName ? categoryName.trim() : categoryName;
    if (cleanCategoryName) {
      const duplicate = await JobCategory.findOne(caseInsensitiveExactFilter('categoryName', cleanCategoryName, { _id: { $ne: uid }, isDeleted: { $ne: true } }));
      if (duplicate) {
        return res.status(400).json({ message: 'Job category with this Name already exists' });
      }
    }

    const sortError = validateWholeNumber(sortingNo);
    if (sortError) return res.status(400).json({ message: sortError });

    if (sortingNo !== undefined && sortingNo !== null && sortingNo !== '') {
      const sortExists = await JobCategory.findOne({ sortingNo: Number(sortingNo), _id: { $ne: uid }, isDeleted: { $ne: true } });
      if (sortExists) {
        return res.status(400).json({ message: 'Sort number is already taken. Please enter another number.' });
      }
    }

    const updated = await JobCategory.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { categoryName: cleanCategoryName, sortingNo, status }),
      { returnDocument: 'after' }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteJobCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    await JobCategory.findByIdAndUpdate(uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Job category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
