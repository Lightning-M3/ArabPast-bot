// ============= استيراد المكتبات الأساسية =============
const { 
  Client, 
  Events, 
  GatewayIntentBits, 
  Collection, 
  PermissionFlagsBits, 
  EmbedBuilder 
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const NodeCache = require('node-cache');
require('dotenv').config();

// ============= الدوال المساعدة الأساسية =============

// دالة لإعادة محاولة العمليات على قاعدة البيانات
async function retryOperation(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // انتظار قبل إعادة المحاولة
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      
      // محاولة إعادة الاتصال إذا كان مقطوعاً
      if (mongoose.connection.readyState !== 1) {
        try {
          await mongoose.connect(process.env.MONGO_URI);
        } catch (connError) {
          console.error('فشل في إعادة الاتصال:', connError);
        }
      }
    }
  }
}

// ============= إعداد المتغيرات العامة =============
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ]
});

client.commands = new Collection();
const rateLimits = new Map();
const commandCooldowns = new Map();
const ticketAttempts = new Map();
const attendanceLocks = new Map();

// ============= إعداد Logger =============
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// إضافة في بيئة التطوير
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// ============= استيراد الملفات المحلية =============
const { setupDailyReset } = require('./cronJobs/dailyReset');
const { 
  checkRequiredChannels, 
  checkBotPermissions, 
  handleError 
} = require('./utils/helpers');

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.stack || error.message,
    timestamp: new Date()
  });

  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    logger.error('Critical error detected. Restarting bot...');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason: reason instanceof Error ? reason.stack : reason,
    promise: promise
  });
});

// ============= الاتصال بقاعدة البيانات =============
mongoose.set('bufferCommands', true);

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  maxPoolSize: 10,
  minPoolSize: 2
})
.then(() => {
  console.log('تم الاتصال بقاعدة البيانات MongoDB');
  
  // إعداد إعادة الضبط اليومية
  setupDailyReset(client);
})
.catch((err) => {
  console.error('خطأ في الاتصال بقاعدة البيانات:', err);
  process.exit(1);
});

// معالجة أحداث قاعدة البيانات
mongoose.connection.on('disconnected', async () => {
  console.log('انقطع الاتصال بقاعدة البيانات. محاولة إعادة الاتصال...');
  let retries = 5;
  while (retries > 0) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('تم إعادة الاتصال بنجاح');
      break;
    } catch (error) {
      console.error(`فشلت محاولة إعادة الاتصال. محاولات متبقية: ${retries}`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  if (retries === 0) {
    console.error('فشل في إعادة الاتصال بعد عدة محاولات. إيقاف البوت...');
    process.exit(1);
  }
});

mongoose.connection.on('error', async (err) => {
  console.error('خطأ في اتصال قاعدة البيانات:', err);
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (error) {
    console.error('فشل في إعادة الاتصال:', error);
  }
});

// ============= تحميل الأوامر =============
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`تم تحميل الأمر ${command.data.name}`);
  }
}

// ============= إعداد الأحداث الأساسية =============
client.once(Events.ClientReady, async () => {
  console.log(`تم تسجيل الدخول كـ ${client.user.tag}!`);
  
  // تحديث حالة البوت
  client.user.setPresence({
    activities: [{ 
      name: 'نظام الحضور والتذاكر',
      type: 3 // WATCHING
    }],
    status: 'online'
  });

  // إحصاء التذاكر المفتوحة
  try {
    const Ticket = require('./models/Ticket');
    const openTickets = await Ticket.countDocuments({ status: 'open' });
    console.log(`Server open tickets: ${openTickets}`);
  } catch (error) {
    console.error('Error counting open tickets:', error);
  }

  // إعداد إعادة الضبط اليومية
  setupDailyReset(client);
});

// معالجة الأوامر
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await handleInteractionError(interaction, error);
  }
});

// معالجة الأزرار
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  try {
    console.log(`Button pressed: ${interaction.customId}`);

    switch (interaction.customId) {
      case 'check_in':
        console.log('Processing check-in for user:', interaction.user.tag);
        await handleCheckIn(interaction);
        break;
      case 'check_out':
        console.log('Processing check-out for user:', interaction.user.tag);
        await handleCheckOut(interaction);
        break;
      case interaction.customId.startsWith('create_ticket') && interaction.customId:
        await handleCreateTicket(interaction);
        break;
      case interaction.customId.startsWith('close_ticket_') && interaction.customId:
        await handleCloseTicket(interaction);
        break;
      default:
        console.log('Unknown button ID:', interaction.customId);
    }
  } catch (error) {
    console.error('Error in button interaction:', error);
    try {
      const errorMessage = 'حدث خطأ أثناء معالجة الطلب. الرجاء المحاولة مرة أخرى.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (err) {
      console.error('Error sending error message:', err);
    }
  }
});

// ============= معالجة الأحداث والتفاعلات =============

// معالجة حدث انضمام البوت لسيرفر جديد
client.on(Events.GuildCreate, async guild => {
  console.log(`تم إضافة البوت إلى سيرفر جديد: ${guild.name}`);
  
  try {
    // التحقق من الصلاحيات المطلوبة
    const missingPermissions = await checkBotPermissions(guild, client);
    if (missingPermissions.length > 0) {
      const owner = await guild.fetchOwner();
      await owner.send({
        embeds: [{
          title: '⚠️ تنبيه: صلاحيات مفقودة',
          description: `البوت يفتقد للصلاحيات التالية في ${guild.name}:\n${missingPermissions.join('\n')}`,
          color: 0xff0000
        }]
      }).catch(console.error);
    }

    // التحقق من القنوات المطلوبة
    const missingChannels = await checkRequiredChannels(guild);
    if (missingChannels.length > 0) {
      const owner = await guild.fetchOwner();
      await owner.send({
        embeds: [{
          title: '⚠️ تنبيه: قنوات مفقودة',
          description: `يجب إنشاء القنوات التالية في ${guild.name}:\n${missingChannels.join('\n')}`,
          color: 0xff0000
        }]
      }).catch(console.error);
    }

    // إنشاء إعدادات افتراضية للسيرفر
    const ServerSettings = require('./bot-dashboard/server/models/ServerSettings');
    await ServerSettings.findOneAndUpdate(
      { guildId: guild.id },
      { $setOnInsert: { guildId: guild.id } },
      { upsert: true, new: true }
    );

  } catch (error) {
    console.error(`Error in guild create event for ${guild.name}:`, error);
  }
});

// معالجة حدث مغادرة البوت من سيرفر
client.on(Events.GuildDelete, async guild => {
  console.log(`تمت إزالة البوت من سيرفر: ${guild.name}`);
  
  try {
    // حذف إعدادات السيرفر
    const ServerSettings = require('./bot-dashboard/server/models/ServerSettings');
    await ServerSettings.deleteOne({ guildId: guild.id });
    
    console.log(`تم حذف إعدادات السيرفر ${guild.name}`);
  } catch (error) {
    console.error(`Error cleaning up after guild delete for ${guild.name}:`, error);
  }
});

// معالجة حدث تحديث السيرفر
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  try {
    // تحديث مظهر البوت إذا تغيرت إعدادات السيرفر
    await updateBotPresence(newGuild.id);
  } catch (error) {
    console.error(`Error in guild update event for ${newGuild.name}:`, error);
  }
});

// معالجة حدث إضافة عضو جديد
client.on(Events.GuildMemberAdd, async member => {
  try {
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === 'الترحيب');
    if (welcomeChannel) {
      await welcomeChannel.send({
        embeds: [{
          title: '👋 عضو جديد',
          description: `مرحباً ${member} في ${member.guild.name}!`,
          color: 0x00ff00,
          thumbnail: {
            url: member.user.displayAvatarURL()
          },
          timestamp: new Date()
        }]
      });
    }
  } catch (error) {
    console.error(`Error in member add event for ${member.user.tag}:`, error);
  }
});

// ============= دوال معالجة التذاكر والحضور =============

// دالة معالجة إنشاء التذكرة
async function handleCreateTicket(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // التحقق من Rate Limit
    if (!checkRateLimit(interaction.user.id, 'createTicket', 2, 300000)) {
      return await interaction.followUp({
        content: 'الرجاء الانتظار قبل إنشاء تذكرة جديدة.',
        ephemeral: true
      });
    }

    const Ticket = require('./models/Ticket');
    
    // التحقق من التذكرة المفتوحة
    const existingTicket = await Ticket.findOne({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      status: 'open'
    });

    if (existingTicket) {
      const ticketChannel = interaction.guild.channels.cache.get(existingTicket.channelId);
      if (ticketChannel) {
        return await interaction.followUp({
          content: `لديك تذكرة مفتوحة بالفعل في ${ticketChannel}`,
          ephemeral: true
        });
      }
    }

    // إنشاء قناة التذكرة
    const ticketCount = await Ticket.countDocuments({ guildId: interaction.guild.id });
    const ticketNumber = (ticketCount + 1).toString().padStart(4, '0');
    const ticketId = `TICKET-${ticketNumber}`;
    
    const channel = await interaction.guild.channels.create({
      name: `ticket-${ticketNumber}`,
      type: 0,
      parent: interaction.channel.parent,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: ['ViewChannel']
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels']
        }
      ]
    });

    // إنشاء التذكرة في قاعدة البيانات
    const ticket = new Ticket({
      ticketId,
      ticketNumber: ticketCount + 1,
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      channelId: channel.id,
      status: 'open'
    });
    await ticket.save();

    // إرسال رسالة الترحيب
    const closeButton = {
      type: 1,
      components: [{
        type: 2,
        label: 'إغلاق التذكرة',
        style: 4,
        custom_id: `close_ticket_${ticketCount + 1}`
      }]
    };

    await channel.send({
      embeds: [{
        title: `تذكرة جديدة - ${ticketId}`,
        description: `مرحباً ${interaction.user}!\nسيقوم فريق الإدارة بالرد عليك قريباً.`,
        color: 0x00ff00,
        timestamp: new Date()
      }],
      components: [closeButton]
    });

    // تسجيل في قناة السجلات
    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
    if (logChannel) {
      await logChannel.send({
        embeds: [{
          title: '🎫 تذكرة جديدة',
          description: `تم إنشاء تذكرة جديدة بواسطة ${interaction.user}`,
          fields: [
            {
              name: 'رقم التذكرة',
              value: ticketId
            },
            {
              name: 'القناة',
              value: `${channel}`
            },
            {
              name: 'التاريخ والوقت',
              value: new Date().toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Riyadh',
                hour12: true
              })
            }
          ],
          color: 0x00ff00,
          timestamp: new Date()
        }]
      });
    }

    await interaction.followUp({
      content: `تم إنشاء تذكرتك بنجاح في ${channel}`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Error in handleCreateTicket:', error);
    await handleInteractionError(interaction, error);
  }
}

// دالة معالجة إغلاق التذكرة
async function handleCloseTicket(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return await interaction.followUp({
        content: 'ليس لديك صلاحية إغلاق التذاكر!',
        ephemeral: true 
      });
    }

    const ticketId = interaction.customId.replace('close_ticket_', '');
    const Ticket = require('./models/Ticket');
    
    const ticket = await Ticket.findOne({ ticketId: `TICKET-${ticketId}` });
    if (ticket) {
      ticket.status = 'closed';
      await ticket.save();
    }

    await interaction.followUp({
      content: 'تم إغلاق التذكرة بنجاح!',
      ephemeral: true
    });

    // إغلاق القناة بعد 5 ثواني
    await interaction.channel.send('سيتم إغلاق هذه التذكرة خلال 5 ثواني...');
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
      } catch (error) {
        console.error('فشل في حذف القناة:', error);
      }
    }, 5000);

    // تسجيل في قناة السجلات
    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
    if (logChannel) {
      await logChannel.send({
        embeds: [{
          title: '🔒 تم إغلاق التذكرة',
          description: `تم إغلاق التذكرة بواسطة ${interaction.user}`,
          fields: [
            {
              name: 'رقم التذكرة',
              value: `TICKET-${ticketId}`
            },
            {
              name: 'القناة',
              value: interaction.channel.name
            },
            {
              name: 'التاريخ والوقت',
              value: new Date().toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Riyadh',
                hour12: true
              })
            }
          ],
          color: 0xff0000,
          timestamp: new Date()
        }]
      });
    }

  } catch (error) {
    console.error('Error in handleCloseTicket:', error);
    await handleInteractionError(interaction, error);
  }
}

// ============= دوال معالجة الحضور والانصراف =============

// دالة معالجة تسجيل الحضور
async function handleCheckIn(interaction) {
  const userId = interaction.user.id;
  
  try {
    console.log('Starting check-in process for user:', userId);

    // التحقق من القفل
    if (attendanceLocks.get(userId)) {
      return await interaction.reply({
        content: 'جاري معالجة طلب سابق، الرجاء الانتظار...',
        ephemeral: true
      });
    }

    // وضع قفل للمستخدم
    attendanceLocks.set(userId, true);
    
    await interaction.deferReply({ ephemeral: true });

    const Attendance = require('./models/Attendance');
    
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    let attendance = await Attendance.findOne({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    // إنشاء سجل حضور جديد إذا لم يكن موجوداً
    if (!attendance) {
      attendance = new Attendance({
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        date: today,
        sessions: []
      });
    }

    // إضافة جلسة جديدة
    attendance.sessions.push({
      checkIn: now
    });

    await attendance.save();
    console.log('Attendance saved successfully');

    // البحث عن قناة السجلات
    console.log('Looking for log channel in guild:', interaction.guild.name);
    const logChannels = interaction.guild.channels.cache.filter(c => c.name === 'سجل-الحضور');
    console.log('Found log channels:', logChannels.size);

    const logChannel = logChannels.first();
    if (logChannel) {
      console.log('Found log channel:', logChannel.name);
      try {
        // التحقق من صلاحيات البوت في القناة
        const permissions = logChannel.permissionsFor(interaction.client.user);
        console.log('Bot permissions in log channel:', permissions.toArray());

        if (!permissions.has('SendMessages')) {
          console.log('Bot does not have permission to send messages in log channel');
          return;
        }

        await logChannel.send({
          embeds: [{
            title: '✅ تسجيل حضور',
            description: `${interaction.user} قام بتسجيل الحضور`,
            fields: [
              {
                name: 'التاريخ',
                value: today.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })
              },
              {
                name: 'الوقت',
                value: now.toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: 'Asia/Riyadh'
                })
              },
              {
                name: 'رقم الجلسة',
                value: `#${attendance.sessions.length}`
              }
            ],
            color: 0x00ff00,
            timestamp: new Date()
          }]
        });
        console.log('Successfully sent log message');
      } catch (logError) {
        console.error('Error sending to log channel:', logError);
      }
    } else {
      console.log('Log channel not found');
    }

    // إضافة رتبة "مسجل حضوره"
    const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');
    if (attendanceRole) {
      try {
        await interaction.member.roles.add(attendanceRole);
        console.log(`تمت إضافة رتبة مسجل حضوره للعضو ${interaction.user.tag}`);
      } catch (error) {
        console.error('Error adding attendance role:', error);
      }
    }

    // إرسال رسالة التأكيد
    await interaction.followUp({
      embeds: [{
        title: '✅ تم تسجيل الحضور',
        description: 'تم تسجيل حضورك بنجاح!',
        fields: [
          {
            name: 'رقم الجلسة',
            value: `#${attendance.sessions.length}`
          },
          {
            name: 'الوقت',
            value: now.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Asia/Riyadh'
            })
          }
        ],
        color: 0x00ff00
      }],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error in handleCheckIn:', error);
    await handleInteractionError(interaction, error);
  } finally {
    // إزالة القفل بعد الانتهاء
    attendanceLocks.delete(userId);
  }
}

async function handleCheckOut(interaction) {
  const userId = interaction.user.id;
  
  try {
    console.log('Starting check-out process for user:', userId);

    // التحقق من القفل
    if (attendanceLocks.get(userId)) {
      return await interaction.reply({
        content: 'جاري معالجة طلب سابق، الرجاء الانتظار...',
        ephemeral: true
      });
    }

    // وضع قفل للمستخدم
    attendanceLocks.set(userId, true);
    
    await interaction.deferReply({ ephemeral: true });

    const Attendance = require('./models/Attendance');
    
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const attendance = await Attendance.findOne({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    if (!attendance || attendance.sessions.length === 0) {
      return await interaction.followUp({
        content: 'لم تسجل حضورك اليوم بعد!',
        ephemeral: true
      });
    }

    const lastSession = attendance.sessions[attendance.sessions.length - 1];
    if (lastSession.checkOut) {
      return await interaction.followUp({
        content: 'لم تسجل حضورك بعد! يجب تسجيل الحضور أولاً.',
        ephemeral: true
      });
    }

    // تسجيل وقت الانصراف
    lastSession.checkOut = now;
    await attendance.save();
    console.log('Check-out saved successfully');

    // حساب المدة
    const sessionDuration = Math.floor((now - lastSession.checkIn) / 1000 / 60); // بالدقائق
    const hours = Math.floor(sessionDuration / 60);
    const minutes = sessionDuration % 60;
    const durationText = hours > 0 ? 
      `${hours} ساعة و ${minutes} دقيقة` : 
      `${minutes} دقيقة`;

    // تحديث السجل
    lastSession.duration = sessionDuration;
    await attendance.save();

    // تسجيل في قناة السجلات
    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-الحضور');
    if (logChannel) {
      await logChannel.send({
        embeds: [{
          title: '👋 تسجيل انصراف',
          description: `${interaction.user} قام بتسجيل الانصراف`,
          fields: [
            {
              name: 'وقت الحضور',
              value: lastSession.checkIn.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Riyadh'
              })
            },
            {
              name: 'وقت الانصراف',
              value: now.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Riyadh'
              })
            },
            {
              name: 'مدة الجلسة',
              value: durationText
            }
          ],
          color: 0xff0000,
          timestamp: new Date()
        }]
      });
    }

    // إرسال رسالة التأكيد
    await interaction.followUp({
      embeds: [{
        title: '👋 تم تسجيل الانصراف',
        description: 'تم تسجيل انصرافك بنجاح!',
        fields: [
          {
            name: 'مدة الجلسة',
            value: durationText
          },
          {
            name: 'وقت الانصراف',
            value: now.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Asia/Riyadh'
            })
          }
        ],
        color: 0xff0000
      }],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error in handleCheckOut:', error);
    await handleInteractionError(interaction, error);
  } finally {
    // إزالة القفل بعد الانتهاء
    attendanceLocks.delete(userId);
  };
    // ... الكود السابق حتى حفظ السجل

  // إزالة رتبة "مسجل حضوره"
  const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');
  if (attendanceRole) {
    try {
      await interaction.member.roles.remove(attendanceRole);
      console.log(`تمت إزالة رتبة مسجل حضوره من العضو ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error removing attendance role:', error);
    }
  }
}

// =============== الدوال المساعدة ==================
// دالة لإرسال التقرير اليومي
async function sendDailyReport(guild) {
  try {
    const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
    if (!logChannel) return;

    const Attendance = require('./models/Attendance');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = await Attendance.find({
      guildId: guild.id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    if (records.length === 0) {
      await logChannel.send({
        embeds: [{
          title: '📊 التقرير اليومي للحضور',
          description: `لا توجد سجلات حضور ليوم ${today.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}`,
          color: 0xffff00,
          timestamp: new Date()
        }]
      });
      return;
    }

    let reportText = '';
    let totalMinutes = 0;
    let earliestCheckIn = null;
    let latestCheckOut = null;
    let totalSessions = 0;
    const userStats = new Map();

    // تجميع إحصائيات كل مستخدم
    for (const record of records) {
      const member = await guild.members.fetch(record.userId).catch(() => null);
      if (!member) continue;

      let userTotal = 0;
      let userSessions = 0;
      let userEarliestCheckIn = null;
      let userLatestCheckOut = null;

      for (const session of record.sessions) {
        if (session.checkIn && session.checkOut) {
          const duration = Math.floor((session.checkOut - session.checkIn) / 1000 / 60);
          userTotal += duration;
          userSessions++;
          totalSessions++;

          if (!userEarliestCheckIn || session.checkIn < userEarliestCheckIn) {
            userEarliestCheckIn = session.checkIn;
          }
          if (!userLatestCheckOut || session.checkOut > userLatestCheckOut) {
            userLatestCheckOut = session.checkOut;
          }
          if (!earliestCheckIn || session.checkIn < earliestCheckIn) {
            earliestCheckIn = session.checkIn;
          }
          if (!latestCheckOut || session.checkOut > latestCheckOut) {
            latestCheckOut = session.checkOut;
          }
        }
      }

      totalMinutes += userTotal;
      userStats.set(member.id, {
        username: member.user.username,
        totalMinutes: userTotal,
        sessions: userSessions,
        earliestCheckIn: userEarliestCheckIn,
        latestCheckOut: userLatestCheckOut
      });
    }

    // تنسيق التقرير
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    // ترتيب المستخدمين حسب الوقت الإجمالي
    const sortedUsers = Array.from(userStats.entries())
      .sort(([, a], [, b]) => b.totalMinutes - a.totalMinutes);

    reportText = sortedUsers.map(([, stats], index) => {
      const hours = Math.floor(stats.totalMinutes / 60);
      const minutes = stats.totalMinutes % 60;
      return `**${index + 1}.** ${stats.username}\n` +
             `⏰ المدة: ${hours}:${minutes.toString().padStart(2, '0')} ساعة\n` +
             `📊 عدد الجلسات: ${stats.sessions}\n` +
             `🕐 أول حضور: ${stats.earliestCheckIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}\n` +
             `🕐 آخر انصراف: ${stats.latestCheckOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}\n`;
    }).join('\n');

    await logChannel.send({
      embeds: [{
        title: '📊 التقرير اليومي للحضور',
        description: `تقرير يوم ${today.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })}`,
        fields: [
          {
            name: '📈 إحصائيات عامة',
            value: 
              `👥 إجمالي الحضور: ${records.length} عضو\n` +
              `⏱️ إجمالي ساعات العمل: ${totalHours}:${remainingMinutes.toString().padStart(2, '0')} ساعة\n` +
              `🔄 إجمالي الجلسات: ${totalSessions}\n` +
              `⏰ أول حضور: ${earliestCheckIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}\n` +
              `⏰ آخر انصراف: ${latestCheckOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}`
          },
          {
            name: '👤 تفاصيل الأعضاء',
            value: reportText || 'لا يوجد سجلات'
          }
        ],
        color: 0x00ff00,
        timestamp: new Date(),
        footer: {
          text: 'تم إنشاء التقرير في'
        }
      }]
    });
  } catch (error) {
    console.error('Error sending daily report:', error);
  }
}

// دالة لمعالجة الأخطاء في التفاعلات
async function handleInteractionError(interaction, error) {
  try {
    console.error('Error in interaction:', error);

    const errorMessage = {
      title: '❌ حدث خطأ',
      description: 'عذراً، حدث خطأ أثناء تنفيذ العملية.',
      color: 0xff0000,
      timestamp: new Date()
    };

    if (error.code === 50013) {
      errorMessage.description = 'البوت لا يملك الصلاحيات الكافية.';
    } else if (error.code === 50001) {
      errorMessage.description = 'لا يمكن الوصول إلى القناة المطلوبة.';
    } else if (error.name === 'MongoError') {
      errorMessage.description = 'حدث خطأ في قاعدة البيانات.';
    }

    if (interaction.deferred) {
      await interaction.followUp({ 
        embeds: [errorMessage],
        ephemeral: true 
      });
    } else if (!interaction.replied) {
      await interaction.reply({ 
        embeds: [errorMessage],
        ephemeral: true 
      });
    }

    // تسجيل في قناة السجلات
    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-الأخطاء');
    if (logChannel) {
      await logChannel.send({
        embeds: [{
          title: '🚨 تقرير خطأ',
          description: `حدث خطأ أثناء تنفيذ عملية من قبل ${interaction.user}`,
          fields: [
            {
              name: 'نوع التفاعل',
              value: interaction.commandName || interaction.customId || 'غير معروف'
            },
            {
              name: 'رسالة الخطأ',
              value: error.message || 'لا توجد رسالة'
            },
            {
              name: 'كود الخطأ',
              value: error.code?.toString() || 'لا يوجد كود'
            }
          ],
          color: 0xff0000,
          timestamp: new Date()
        }]
      });
    }
  } catch (err) {
    console.error('Error in error handler:', err);
  }
}

// دالة لتنظيف الذاكرة المؤقتة
function cleanupCache() {
  const now = Date.now();
  
  // تنظيف Rate Limits
  rateLimits.forEach((timestamps, key) => {
    const validTimestamps = timestamps.filter(timestamp => now - timestamp < 60000);
    if (validTimestamps.length === 0) {
      rateLimits.delete(key);
    } else {
      rateLimits.set(key, validTimestamps);
    }
  });

  // تنظيف Cooldowns
  commandCooldowns.forEach((timestamp, key) => {
    if (now - timestamp > 3600000) {
      commandCooldowns.delete(key);
    }
  });

  // تنظيف محاولات التذاكر
  ticketAttempts.forEach((attempts, key) => {
    if (now - attempts.timestamp > 3600000) {
      ticketAttempts.delete(key);
    }
  });
}

// تشغيل تنظيف الذاكرة المؤقتة كل ساعة
setInterval(cleanupCache, 3600000);

// ============= تسجيل الدخول للبوت =============

// دالة لتحديث حالة البوت
async function updateBotStatus() {
  try {
    client.user.setPresence({
      activities: [{ 
        name: 'نظام الحضور والتذاكر',
        type: 3 // WATCHING
      }],
      status: 'online'
    });
  } catch (error) {
    console.error('Error updating bot status:', error);
  }
}

// دالة لإعداد البوت عند بدء التشغيل
async function setupBot() {
  try {
    // تحديث حالة البوت
    await updateBotStatus();

    // إعداد إعادة الضبط اليومية
    setupDailyReset(client);

    // تنظيف الذاكرة المؤقتة كل ساعة
    setInterval(cleanupCache, 3600000);

    // فحص حالة الاتصال كل 5 دقائق
    setInterval(async () => {
      if (!client.isReady()) {
        console.log('البوت غير متصل. محاولة إعادة الاتصال...');
        try {
          await client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
          console.error('فشل في إعادة الاتصال:', error);
        }
      }
    }, 300000);

    console.log('تم إعداد البوت بنجاح');
  } catch (error) {
    console.error('Error in bot setup:', error);
    process.exit(1);
  }
}

// تسجيل الدخول للبوت مع إعادة المحاولة
async function loginWithRetry(maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.login(process.env.DISCORD_TOKEN);
      console.log('تم تسجيل الدخول بنجاح');
      await setupBot();
      return;
    } catch (error) {
      console.error(`فشل في تسجيل الدخول (محاولة ${i + 1}/${maxRetries}):`, error);
      if (i === maxRetries - 1) {
        console.error('فشل في تسجيل الدخول بعد عدة محاولات');
        process.exit(1);
      }
      // انتظار قبل إعادة المحاولة
      await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1)));
    }
  }
}

// بدء تشغيل البوت
loginWithRetry().catch(error => {
  console.error('Error starting bot:', error);
  process.exit(1);
});

// تصدير الدوال المهمة
module.exports = {
  client,
  updateBotStatus,
  setupBot,
  loginWithRetry
};

// ============= نظام Rate Limits المتقدم =============
const rateLimitQueue = new Map();

// دالة للتعامل مع Rate Limits
async function handleRateLimit(operation, key, timeout) {
  if (rateLimitQueue.has(key)) {
    const queue = rateLimitQueue.get(key);
    return new Promise((resolve) => queue.push(resolve));
  }
  
  const queue = [];
  rateLimitQueue.set(key, queue);
  
  setTimeout(() => {
    const currentQueue = rateLimitQueue.get(key);
    rateLimitQueue.delete(key);
    currentQueue.forEach(resolve => resolve());
  }, timeout);
}

// دالة للتحقق من Rate Limit
async function checkDiscordRateLimit(operation, key, options = {}) {
  const {
    maxAttempts = 3,
    timeout = 5000,
    increaseFactor = 2
  } = options;

  let attempt = 0;
  let currentTimeout = timeout;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      
      if (error.code === 429) { // Rate limit hit
        const retryAfter = error.response?.data?.retry_after || currentTimeout / 1000;
        console.log(`Rate limit hit for ${key}. Retrying after ${retryAfter} seconds...`);
        
        await handleRateLimit(operation, key, retryAfter * 1000);
        currentTimeout *= increaseFactor; // زيادة وقت الانتظار تصاعدياً
        
        continue;
      }
      
      throw error; // إذا كان الخطأ ليس بسبب Rate Limit
    }
  }

  throw new Error(`Exceeded maximum retry attempts (${maxAttempts}) for ${key}`);
}

// تطبيق النظام على العمليات المهمة
async function sendDiscordMessage(channel, content) {
  return await checkDiscordRateLimit(
    async () => await channel.send(content),
    `send_message_${channel.id}`,
    { timeout: 2000 }
  );
}

async function createDiscordChannel(guild, options) {
  return await checkDiscordRateLimit(
    async () => await guild.channels.create(options),
    `create_channel_${guild.id}`,
    { timeout: 5000 }
  );
}

// ============= تحسينات الأمان =============

// حماية من التكرار المفرط للطلبات
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // حد أقصى 100 طلب
  message: 'تم تجاوز الحد المسموح من الطلبات. الرجاء المحاولة لاحقاً.',
  standardHeaders: true,
  legacyHeaders: false
});

// حماية من هجمات التخمين
const bruteForce = new Map();
function checkBruteForce(userId, action, maxAttempts = 5) {
  const key = `${userId}-${action}`;
  const attempts = bruteForce.get(key) || 0;
  
  if (attempts >= maxAttempts) {
    return false;
  }
  
  bruteForce.set(key, attempts + 1);
  setTimeout(() => bruteForce.delete(key), 3600000); // إعادة تعيين بعد ساعة
  
  return true;
}

// حماية من محاولات الاختراق
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '') // منع HTML
    .replace(/javascript:/gi, '') // منع JavaScript
    .trim();
}

// ============= تحسينات المراقبة =============

// إعداد نظام المراقبة
const metrics = {
  commands: {
    total: 0,
    success: 0,
    failed: 0,
    types: {}
  },
  tickets: {
    created: 0,
    closed: 0,
    total: 0
  },
  attendance: {
    checkIns: 0,
    checkOuts: 0,
    totalSessions: 0
  },
  errors: {
    count: 0,
    types: {}
  },
  performance: {
    avgResponseTime: 0,
    totalRequests: 0
  }
};

// دالة لتسجيل الإحصائيات
function trackMetric(category, action, value = 1, extra = {}) {
  if (!metrics[category]) metrics[category] = {};
  
  if (typeof metrics[category][action] === 'number') {
    metrics[category][action] += value;
  } else {
    metrics[category][action] = value;
  }

  // تسجيل معلومات إضافية
  if (Object.keys(extra).length > 0) {
    if (!metrics[category].details) metrics[category].details = [];
    metrics[category].details.push({
      timestamp: new Date(),
      ...extra
    });
  }
}

// دالة لقياس زمن الاستجابة
async function measureResponseTime(operation) {
  const start = process.hrtime();
  try {
    return await operation();
  } finally {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds * 1000 + nanoseconds / 1e6; // تحويل إلى ميلي ثانية
    
    metrics.performance.totalRequests++;
    metrics.performance.avgResponseTime = 
      (metrics.performance.avgResponseTime * (metrics.performance.totalRequests - 1) + duration) 
      / metrics.performance.totalRequests;
  }
}

// إرسال تقرير دوري
setInterval(async () => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الإحصائيات');
    if (!logChannel) return;

    const statsEmbed = new EmbedBuilder()
      .setTitle('📊 تقرير الإحصائيات')
      .setColor(0x00ff00)
      .addFields([
        {
          name: '🤖 الأوامر',
          value: `إجمالي: ${metrics.commands.total}\nناجح: ${metrics.commands.success}\nفشل: ${metrics.commands.failed}`
        },
        {
          name: '🎫 التذاكر',
          value: `مفتوحة: ${metrics.tickets.created - metrics.tickets.closed}\nمغلقة: ${metrics.tickets.closed}\nإجمالي: ${metrics.tickets.total}`
        },
        {
          name: '⏰ الحضور',
          value: `تسجيل حضور: ${metrics.attendance.checkIns}\nتسجيل انصراف: ${metrics.attendance.checkOuts}\nإجمالي الجلسات: ${metrics.attendance.totalSessions}`
        },
        {
          name: '⚡ الأداء',
          value: `متوسط زمن الاستجابة: ${metrics.performance.avgResponseTime.toFixed(2)}ms\nإجمالي الطلبات: ${metrics.performance.totalRequests}`
        }
      ])
      .setTimestamp();

    await logChannel.send({ embeds: [statsEmbed] });

    // إعادة تعيين بعض الإحصائيات
    metrics.commands.total = 0;
    metrics.commands.success = 0;
    metrics.commands.failed = 0;
    metrics.errors.count = 0;
    metrics.performance.avgResponseTime = 0;
    metrics.performance.totalRequests = 0;

  } catch (error) {
    console.error('Error sending stats report:', error);
  }
}, 86400000); // كل 24 ساعة

// دالة لإرسال رسائل مخصصة
async function sendCustomEmbed(interaction, content, options = {}) {
  try {
    const ServerSettings = require('./bot-dashboard/server/models/ServerSettings');
    const settings = await ServerSettings.findOne({ guildId: interaction.guild.id });
    
    const embed = new EmbedBuilder()
      .setColor(options.color || 0x0099FF)
      .setDescription(content);

    if (options.fields) {
      embed.addFields(options.fields);
    }

    if (settings?.botPresence) {
      const botName = settings.botPresence.nickname || client.user.username;
      const botAvatar = settings.botPresence.avatar || client.user.displayAvatarURL();
      
      embed.setAuthor({
        name: botName,
        iconURL: botAvatar
      });

      if (settings.botPresence.about) {
        embed.setFooter({
          text: settings.botPresence.about,
          iconURL: botAvatar
        });
      }
    }

    return await interaction.reply({ 
      embeds: [embed],
      ephemeral: options.ephemeral || false
    });
  } catch (error) {
    console.error('Error sending custom embed:', error);
    return await interaction.reply({
      content: 'حدث خطأ أثناء إرسال الرسالة',
      ephemeral: true
    });
  }
}

// دالة للتحقق من Rate Limit
function checkRateLimit(userId, action, limit = 5, windowMs = 60000) {
  const key = `${userId}-${action}`;
  const now = Date.now();
  const userLimits = rateLimits.get(key) || [];
  
  // إزالة الطلبات القديمة
  const validRequests = userLimits.filter(timestamp => now - timestamp < windowMs);
  
  if (validRequests.length >= limit) {
    return false; // تجاوز الحد
  }
  
  // إضافة الطلب الجديد
  validRequests.push(now);
  rateLimits.set(key, validRequests);
  
  // تنظيف تلقائي بعد انتهاء النافذة الزمنية
  setTimeout(() => {
    const currentLimits = rateLimits.get(key) || [];
    const updatedLimits = currentLimits.filter(timestamp => now - timestamp < windowMs);
    if (updatedLimits.length === 0) {
      rateLimits.delete(key);
    } else {
      rateLimits.set(key, updatedLimits);
    }
  }, windowMs);

  return true;
}

// تنظيف دوري للـ Rate Limits
setInterval(() => {
  const now = Date.now();
  rateLimits.forEach((timestamps, key) => {
    const validTimestamps = timestamps.filter(timestamp => now - timestamp < 60000);
    if (validTimestamps.length === 0) {
      rateLimits.delete(key);
    } else {
      rateLimits.set(key, validTimestamps);
    }
  });
}, 300000); // كل 5 دقائق

