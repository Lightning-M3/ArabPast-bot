const mongoose = require('mongoose');

// إضافة مخطط للعداد
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

// مخطط التذكرة
const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  ticketNumber: {
    type: Number,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  guildId: {
    type: String,
    required: true
  },
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
  const lastTicket = await this.findOne().sort({ ticketNumber: -1 });
  return lastTicket ? lastTicket.ticketNumber + 1 : 1;
};

// دالة للتحقق من وجود تذكرة مفتوحة
ticketSchema.statics.hasOpenTicket = async function(userId, guildId) {
  const openTicket = await this.findOne({
    userId: userId,
    guildId: guildId,
    status: 'open'
  });
  return openTicket !== null;
};

ticketSchema.pre('save', function(next) {
  if (!this.guildId?.match(/^\d+$/) || !this.userId?.match(/^\d+$/)) {
    next(new Error('معرّف غير صالح'));
    return;
  }
  
  if (!['open', 'closed'].includes(this.status)) {
    this.status = 'open';
  }
  
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema); 