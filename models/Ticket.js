const mongoose = require('mongoose');

// إضافة مخطط للعداد
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

// مخطط التذكرة
const ticketSchema = new mongoose.Schema({
  ticketId: String,
  ticketNumber: Number,
  userId: String,
  channelId: String,
  guildId: String,
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// دالة للحصول على الرقم التسلسلي التالي
ticketSchema.statics.getNextSequence = async function() {
  const counter = await Counter.findByIdAndUpdate(
    'ticketId',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

// إضافة دالة لتنظيف التذاكر القديمة
ticketSchema.statics.cleanOldTickets = async function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await this.deleteMany({
    status: 'closed',
    createdAt: { $lt: thirtyDaysAgo }
  });
};

ticketSchema.pre('save', function(next) {
  if (!this.guildId || !this.userId || !this.channelId) {
    next(new Error('البيانات المطلوبة غير مكتملة'));
  }
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema); 