const mongoose = require('mongoose');

const serverSettingsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  messages: {
    checkInMessage: {
      type: String,
      default: 'تم تسجيل حضورك بنجاح!'
    },
    checkOutMessage: {
      type: String,
      default: 'تم تسجيل انصرافك بنجاح!'
    },
    ticketCreateMessage: {
      type: String,
      default: 'تم إنشاء تذكرتك بنجاح!'
    },
    ticketCloseMessage: {
      type: String,
      default: 'تم إغلاق التذكرة بنجاح!'
    }
  },
  attendance: {
    maxSessionsPerDay: {
      type: Number,
      default: 4
    },
    minSessionDuration: {
      type: Number,
      default: 1
    },
    workingHours: {
      start: {
        type: String,
        default: '09:00'
      },
      end: {
        type: String,
        default: '23:59'
      }
    },
    autoClose: {
      type: Boolean,
      default: true
    }
  },
  botPresence: {
    nickname: String,
    avatar: String,
    about: String
  }
}, {
  timestamps: true,
  minimize: false,
  autoIndex: true
});

serverSettingsSchema.statics.createDefaultSettings = async function(guildId) {
  try {
    const settings = await this.findOne({ guildId });
    if (!settings) {
      return await this.create({ guildId });
    }
    return settings;
  } catch (error) {
    console.error('Error creating default settings:', error);
    throw error;
  }
};

serverSettingsSchema.statics.getSettings = async function(guildId) {
  try {
    if (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => {
        mongoose.connection.once('connected', resolve);
      });
    }

    let settings = await this.findOne({ guildId });
    if (!settings) {
      settings = await this.createDefaultSettings(guildId);
    }
    return settings;
  } catch (error) {
    console.error('Error getting settings:', error);
    return {
      messages: {
        checkInMessage: 'تم تسجيل حضورك بنجاح!',
        checkOutMessage: 'تم تسجيل انصرافك بنجاح!'
      },
      attendance: {
        maxSessionsPerDay: 4,
        workingHours: {
          start: '00:00',
          end: '23:59'
        }
      }
    };
  }
};

const ServerSettings = mongoose.model('ServerSettings', serverSettingsSchema);

module.exports = ServerSettings; 