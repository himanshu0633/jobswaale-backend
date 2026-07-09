const Payment = require('../models/Payment');
const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');
const Plan = require('../models/Plan');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { getSettings } = require('../utils/settings');
const { sendAdminNotification } = require('../utils/mail');

const getNextPaymentId = async () => {
  const lastPayment = await Payment.findOne({ paymentId: /^PAY-\d+$/ })
    .sort({ createDate: -1 })
    .select('paymentId');
  const lastNumber = lastPayment ? Number(lastPayment.paymentId.replace('PAY-', '')) : 0;
  return `PAY-${String(lastNumber + 1).padStart(3, '0')}`;
};

const getNextInvoiceNo = async () => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const lastPayment = await Payment.findOne({ invoiceNo: new RegExp(`^${prefix}\\d+$`) })
    .sort({ createDate: -1 })
    .select('invoiceNo');
  const lastNumber = lastPayment ? Number(lastPayment.invoiceNo.replace(prefix, '')) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(3, '0')}`;
};

const getCustomerDetails = async (userType, customerId) => {
  const Model = userType === 'Employer' ? Employer : Jobseeker;
  const record = await Model.findOne({ _id: customerId, isDeleted: { $ne: true } })
    .populate('userId', 'email');

  if (!record) return null;

  return {
    id: record._id,
    name: userType === 'Employer' ? record.companyName : record.name,
    email: record.userId?.email || '',
    phone: record.phone || ''
  };
};

exports.getPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      userType = '',
      status = '',
      plan = '',
      method = ''
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const filter = { isDeleted: { $ne: true } };

    if (userType) filter.userType = userType;
    if (status) filter.paymentStatus = status;
    if (plan) filter.planName = plan;
    if (method) filter.paymentMethod = method;
    if (search) {
      filter.$or = [
        { paymentId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { gatewayTxnId: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, docs] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter)
        .populate('plan', 'planName cost planValidity')
        .sort({ paymentDate: -1, createDate: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    res.json({
      docs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.uid, isDeleted: { $ne: true } })
      .populate('plan', 'planName cost planValidity');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }

    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPaymentSummary = async (req, res) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    const [revenueAgg, success, pending, failed, plans, methods] = await Promise.all([
      Payment.aggregate([
        { $match: { ...filter, paymentStatus: 'Success' } },
        { $group: { _id: null, total: { $sum: '$paidAmount' } } }
      ]),
      Payment.countDocuments({ ...filter, paymentStatus: 'Success' }),
      Payment.countDocuments({ ...filter, paymentStatus: 'Pending' }),
      Payment.countDocuments({ ...filter, paymentStatus: { $in: ['Failed', 'Refunded'] } }),
      Payment.distinct('planName', filter),
      Payment.distinct('paymentMethod', filter)
    ]);

    res.json({
      revenue: revenueAgg[0]?.total || 0,
      success,
      pending,
      failed,
      plans: plans.filter(Boolean).sort(),
      methods: methods.filter(Boolean).sort()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPaymentCustomers = async (req, res) => {
  try {
    const [employers, jobseekers] = await Promise.all([
      Employer.find({ isDeleted: { $ne: true } }).populate('userId', 'email').sort({ companyName: 1 }),
      Jobseeker.find({ isDeleted: { $ne: true } }).populate('userId', 'email').sort({ name: 1 })
    ]);

    res.json([
      ...employers.map((item) => ({
        _id: item._id,
        name: item.companyName,
        type: 'Employer',
        email: item.userId?.email || '',
        phone: item.phone || ''
      })),
      ...jobseekers.map((item) => ({
        _id: item._id,
        name: item.name,
        type: 'Jobseeker',
        email: item.userId?.email || '',
        phone: item.phone || ''
      }))
    ]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createPayment = async (req, res) => {
  try {
    const {
      paymentDate,
      userType,
      customer,
      customerName,
      plan,
      planName,
      planAmount,
      discount = 0,
      paidAmount,
      paymentMethod,
      paymentGateway,
      gatewayTxnId,
      paymentStatus,
      validityType,
      validFrom,
      validTill,
      remarks,
      recordedBy
    } = req.body;

    if (!paymentDate || !userType || !planName || paidAmount === undefined || !paymentMethod || !paymentGateway || !paymentStatus || !validityType || !validFrom || !validTill) {
      return res.status(400).json({ message: 'Please fill all required payment fields.' });
    }

    let customerDetails = null;
    if (customer) {
      customerDetails = await getCustomerDetails(userType, customer);
      if (!customerDetails) {
        return res.status(400).json({ message: 'Selected customer was not found.' });
      }
    } else if (!customerName || !req.body.email) {
      return res.status(400).json({ message: 'Customer name and email are required.' });
    }

    let planDoc = null;
    if (plan) {
      planDoc = await Plan.findOne({ _id: plan, isDeleted: { $ne: true } });
    }

    const newPayment = new Payment(addAuditOnCreate(req, {
      paymentId: await getNextPaymentId(),
      invoiceNo: await getNextInvoiceNo(),
      paymentDate,
      userType,
      customer: customerDetails?.id || undefined,
      customerModel: customerDetails ? userType : undefined,
      customerName: customerDetails?.name || customerName,
      email: customerDetails?.email || req.body.email,
      phone: customerDetails?.phone || req.body.phone || '',
      plan: planDoc?._id || undefined,
      planName: planDoc?.planName || planName,
      planAmount: Number(planAmount) || 0,
      discount: Number(discount) || 0,
      paidAmount: Number(paidAmount) || 0,
      paymentMethod,
      paymentGateway,
      gatewayTxnId,
      paymentStatus,
      validityType,
      validFrom,
      validTill,
      remarks,
      recordedBy: recordedBy || 'Admin'
    }));

    await newPayment.save();
    const settings = await getSettings();
    await sendAdminNotification({
      enabled: settings.notifPayment,
      subject: `Payment ${newPayment.paymentStatus}: ${newPayment.paymentId}`,
      title: 'Payment Received',
      rows: [
        { label: 'Payment ID', value: newPayment.paymentId },
        { label: 'Customer', value: newPayment.customerName },
        { label: 'Email', value: newPayment.email },
        { label: 'Plan', value: newPayment.planName },
        { label: 'Amount', value: `${settings.currency} ${newPayment.paidAmount}` },
        { label: 'Status', value: newPayment.paymentStatus }
      ]
    });
    res.status(201).json(newPayment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const { uid } = req.params;
    const body = { ...req.body };

    if (body.customer && body.userType) {
      const customerDetails = await getCustomerDetails(body.userType, body.customer);
      if (!customerDetails) return res.status(400).json({ message: 'Selected customer was not found.' });
      body.customerModel = body.userType;
      body.customerName = customerDetails.name;
      body.email = customerDetails.email;
      body.phone = customerDetails.phone;
    } else {
      delete body.customer;
      delete body.customerModel;
    }

    if (body.plan) {
      const planDoc = await Plan.findOne({ _id: body.plan, isDeleted: { $ne: true } });
      if (planDoc) body.planName = planDoc.planName;
    }

    delete body.invoiceNo;

    ['planAmount', 'discount', 'paidAmount'].forEach((key) => {
      if (body[key] !== undefined) body[key] = Number(body[key]) || 0;
    });

    const updated = await Payment.findByIdAndUpdate(uid, addAuditOnUpdate(req, body), { returnDocument: 'after' });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { uid } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({ message: 'Payment status is required.' });
    }

    if (!['Success', 'Pending', 'Failed', 'Refunded'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status.' });
    }

    const updated = await Payment.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { paymentStatus }),
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Payment not found.' });
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    await Payment.findByIdAndUpdate(req.params.uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
