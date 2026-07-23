const Notification = require('../models/Notification');

// Get all notifications for the logged-in user
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createDate: -1 })
      .limit(50);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Server error loading notifications' });
  }
};

// Mark a single notification as seen
exports.markAsSeen = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { status: 'seen' },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating notification' });
  }
};

// Mark all notifications as seen
exports.markAllSeen = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, status: 'unseen' },
      { status: 'seen' }
    );
    res.json({ message: 'All notifications marked as seen' });
  } catch (error) {
    res.status(500).json({ message: 'Server error marking notifications as seen' });
  }
};
