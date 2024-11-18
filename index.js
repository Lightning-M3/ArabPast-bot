// ============= استيراد المكتبات الأساسية =============
const { 
    Client, 
    Events, 
    GatewayIntentBits, 
    Collection, 
    PermissionFlagsBits, 
    EmbedBuilder,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const NodeCache = require('node-cache');
require('dotenv').config();

// ============= استيراد النماذج والأدوات =============
const Ticket = require('./models/Ticket');
const logger = require('./utils/logger');
const maintenance = require('./utils/maintenance');
const Performance = require('./models/Performance');
const PerformanceAnalyzer = require('./utils/performanceAnalyzer');
const Points = require('./models/Points');
const Statistics = require('./models/Statistics');
const Attendance = require('./models/Attendance');
const Leave = require('./models/Leave');
const PointsManager = require('./models/PointsManager');
const StatisticsManager = require('./models/StatisticsManager');

// ============= الدوال المساعدة الأساسية =============

// دالة لإعادة محاولة العمليات على قاعدة البيانات
async function retryOperation(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            logger.warn(`Retry attempt ${i + 1}/${maxRetries}`, { error: error.message });
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            
            if (mongoose.connection.readyState !== 1) {
                try {
                    await mongoose.connect(process.env.MONGO_URI);
                } catch (connError) {
                    logger.error('Failed to reconnect:', connError);
                }
            }
        }
    }
}

async function handleCreateTicket(interaction) {
    try {
        // التحقق من وجود التفاعل وبياناته
        if (!interaction || !interaction.customId) {
            throw new Error('تفاعل غير صالح');
        }

        // استخدام customId بدلاً من getString
        const ticketType = interaction.customId.split('_')[1]; // مثال: ticket_support

        // التحقق من نوع التذكرة
        if (!ticketType) {
            throw new Error('نوع تذكرة غير صالح');
        }

        // باقي كود إنشاء التذكرة
        const ticketChannel = await createTicketChannel(interaction, ticketType);
        
        // إرسال رسالة تأكيد
        await interaction.reply({
            content: `✅ تم إنشاء تذكرتك بنجاح في ${ticketChannel}`,
            ephemeral: true
        });

    } catch (error) {
        console.error('خطأ في إنشاء التذكرة:', error);
        
        // محاولة الرد على التفاعل إذا لم يتم الرد بعد
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ حدث خطأ أثناء إنشاء التذكرة. الرجاء المحاولة مرة أخرى.',
                ephemeral: true
            }).catch(console.error);
        }
    }
}

// دالة إنشاء قناة التذكرة
async function createTicketChannel(interaction, ticketType) {
    const guild = interaction.guild;
    const member = interaction.member;

    // إنشاء اسم للتذكرة
    const ticketName = `ticket-${member.user.username}-${Date.now().toString().slice(-4)}`;

    try {
        // إنشاء القناة
        const channel = await guild.channels.create({
            name: ticketName,
            type: 0, // نوع القناة النصية
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: ['ViewChannel'],
                },
                {
                    id: member.id,
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
                {
                    id: interaction.client.user.id,
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
            ],
        });

        // إرسال الرسالة الأولى في التذكرة
        const embed = new EmbedBuilder()
            .setTitle(`تذكرة ${ticketType}`)
            .setDescription(`مرحباً ${member}! سيقوم فريق الدعم بالرد عليك قريباً.`)
            .setColor(0x00ff00)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('إغلاق التذكرة')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        return channel;
    } catch (error) {
        console.error('Error creating ticket channel:', error);
        throw new Error('فشل إنشاء قناة التذكرة. حاول مرة أخرى لاحقاً.');
    }
}

// دالة لتسجيل أحداث التذاكر
async function logTicketAction(guild, embed) {
    try {
        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        logger.error('Error logging ticket action:', error);
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

// ============= استيراد الملفات المحلية =============
const { setupDailyReset } = require('./cronJobs/dailyReset');
const { 
    checkRequiredChannels, 
    checkBotPermissions, 
    handleError 
} = require('./utils/helpers');

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error, true);
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason, true);
});

// ============= الاتصال بقاعدة البيانات =============
mongoose.set('bufferCommands', true);

mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000
}).then(() => {
    logger.info('تم الاتصال بقاعدة البيانات MongoDB');
}).catch((err) => {
    logger.error('خطأ في الاتصال بقاعدة البيانات:', err, true);
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
client.once(Events.ClientReady, () => {
    logger.info(`تم تسجيل الدخول كـ ${client.user.tag}`);
});

// معالجة الأوامر
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.commandName;

        try {
            if (command === 'performance') {
                await interaction.deferReply({ ephemeral: true });

                const { week, year } = Performance.getWeekNumber(new Date());
                const performance = await Performance.findOne({
                    userId: interaction.user.id,
                    guildId: interaction.guild.id,
                    weekNumber: week,
                    year
                });

                if (!performance) {
                    return await interaction.followUp({
                        content: 'لم يتم العثور على بيانات أداء لهذا الأسبوع',
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📊 تقرير الأداء الأسبوعي')
                    .setDescription(`تقرير الأداء للأسبوع ${week} من عام ${year}`)
                    .addFields([
                        {
                            name: '⏱️ إجمالي الساعات',
                            value: `${performance.metrics.totalHours} ساعة`,
                            inline: true
                        },
                        {
                            name: '📊 متوسط مدة الجلسة',
                            value: `${performance.metrics.averageSessionDuration} دقيقة`,
                            inline: true
                        },
                        {
                            name: '🎯 درجة الانتظام',
                            value: `${performance.metrics.consistencyScore}/100`,
                            inline: true
                        },
                        {
                            name: '⭐ حضور أوقات الذروة',
                            value: `${performance.metrics.peakTimeAttendance}/100`,
                            inline: true
                        },
                        {
                            name: '🎫 التذاكر المعالجة',
                            value: `${performance.metrics.ticketsHandled}`,
                            inline: true
                        },
                        {
                            name: '😊 درجة رضا المستخدمين',
                            value: `${performance.metrics.satisfactionScore}/100`,
                            inline: true
                        }
                    ])
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.followUp({
                    embeds: [embed],
                    ephemeral: true
                });
            } else {
                // معالجة باقي الأوامر الموجودة
                const command = client.commands.get(interaction.commandName);
                if (!command) return;
                await command.execute(interaction);
            }
        } catch (error) {
            logger.error(`Error executing command ${interaction.commandName}:`, error);
            const errorMessage = 'حدث خطأ أثناء تنفيذ الأمر';
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
});

// معالجة الأزرار
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    try {
        logger.info(`Button pressed: ${interaction.customId}`);

        switch (interaction.customId) {
            case 'create_ticket':
                await handleCreateTicket(interaction);
                break;
            case 'close_ticket_':
                await handleCloseTicket(interaction);
                break;
            case 'check_in':
                await handleCheckIn(interaction);
                break;
            case 'check_out':
                await handleCheckOut(interaction);
                break;
            default:
                logger.warn(`Unhandled button interaction: ${interaction.customId}`);
        }

    } catch (error) {
        logger.error('Error in button interaction:', error);
        const errorMessage = 'حدث خطأ أثناء معالجة الطلب. الرجاء المحاولة مرة أخرى.';
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (err) {
            logger.error('Error sending error message:', err);
        }
    }
});

// ============= معالجة الأحداث والتفاعلات =============

// معالجة حدث انضمام البوت لسيرفر جديد
client.on(Events.GuildCreate, async guild => {
    logger.info(`تم إضافة البوت إلى سيرفر جديد: ${guild.name}`);
    
    try {
        // التحقق من اتصال قاعدة البيانات أولاً
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(process.env.MONGO_URI, {
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000
            });
        }

        // استخدام retryOperation للعمليات على قاعدة البيانات
        await retryOperation(async () => {
            // التحقق من الصلاحيات المطلوبة
            const missingPermissions = await checkBotPermissions(guild, client);
            const owner = await guild.fetchOwner();

            // إنشاء إعدادات افتراضية للسيرفر
            const ServerSettings = require('./bot-dashboard/server/models/ServerSettings');
            await ServerSettings.findOneAndUpdate(
                { guildId: guild.id },
                { 
                    $setOnInsert: { 
                        guildId: guild.id,
                        createdAt: new Date(),
                        settings: {
                            prefix: '!',
                            language: 'ar',
                            timezone: 'UTC+3'
                        }
                    } 
                },
                { 
                    upsert: true, 
                    new: true,
                    maxTimeMS: 20000 // زيادة وقت timeout
                }
            );

            // إرسال رسالة ترحيبية للمالك
            await owner.send({
                embeds: [{
                    title: `👋 مرحباً بك في ${client.user.username}!`,
                    description: 'شكراً لإضافة البوت إلى سيرفرك.',
                    color: 0x00ff00
                }]
            });

            // إرسال تحذير الصلاحيات إذا كانت مفقودة
            if (missingPermissions.length > 0) {
                await owner.send({
                    embeds: [{
                        title: '⚠️ تنبيه: صلاحيات مفقودة',
                        description: `البوت يحتاج للصلاحيات التالية:\n${missingPermissions.join('\n')}`,
                        color: 0xff0000
                    }]
                });
            }
        }, 5); // زيادة عدد المحاولات إلى 5

    } catch (error) {
        logger.error(`Error in guild create event for ${guild.name}:`, error);
        
        // محاولة إرسال رسالة للمالك في حالة الخطأ
        try {
            const owner = await guild.fetchOwner();
            await owner.send({
                embeds: [{
                    title: '❌ حدث خطأ',
                    description: 'حدث خطأ أثناء إعداد البوت. سيتم حل المشكلة قريباً.',
                    color: 0xff0000
                }]
            });
        } catch (err) {
            logger.error('Failed to send error message to guild owner:', err);
        }
    }
});

// معالجة حدث مغادرة البوت من سيرفر
client.on(Events.GuildDelete, async guild => {
    console.log(`تمت إزالة البوت من سيرفر: ${guild.name}`);
    
    try {
        // استخدام retryOperation لمحاولة إعادة العملية عدة مرات
        await retryOperation(async () => {
            // حذف إعدادات السيرفر
            const ServerSettings = require('./bot-dashboard/server/models/ServerSettings');
            await ServerSettings.deleteOne({ guildId: guild.id });

            // حذف سجلات الحضور
            const Attendance = require('./models/Attendance');
            await Attendance.deleteMany({ guildId: guild.id });

            // حذف التذاكر
            const Ticket = require('./models/Ticket');
            await Ticket.deleteMany({ guildId: guild.id });

            console.log(`تم حذف جميع بيانات السيرفر ${guild.name} بنجاح`);
        }, 5); // محاولة 5 مرات

    } catch (error) {
        console.error(`Error cleaning up after guild delete for ${guild.name}:`, error);
        
        // محاولة حذف البيانات بشكل منفصل
        try {
            const ServerSettings = require('./bot-dashboard/server/models/ServerSettings');
            await ServerSettings.deleteOne({ guildId: guild.id })
                .catch(err => console.error('Error deleting server settings:', err));

            const Attendance = require('./models/Attendance');
            await Attendance.deleteMany({ guildId: guild.id })
                .catch(err => console.error('Error deleting attendance records:', err));

            const Ticket = require('./models/Ticket');
            await Ticket.deleteMany({ guildId: guild.id })
                .catch(err => console.error('Error deleting tickets:', err));

        } catch (secondError) {
            console.error('Final error in cleanup:', secondError);
        }
    }
});

// معالجة حدث تحديث السيرفر
const { updateBotPresence } = require('./utils/botPresence.js');
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
        const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === 'ترحيب');
        if (!welcomeChannel) return;

        // إنشاء رسالة الترحيب
        await welcomeChannel.send({
            embeds: [{
                title: '👋 عضو جديد!',
                description: `مرحباً ${member} في ${member.guild.name}!`,
                fields: [
                    {
                        name: '🎉 أنت العضو رقم',
                        value: `${member.guild.memberCount}`
                    },
                    {
                        name: '📅 تاريخ الانضمام',
                        value: member.joinedAt.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        })
                    }
                ],
                color: 0x00ff00,
                thumbnail: {
                    url: member.user.displayAvatarURL({ dynamic: true })
                },
                timestamp: new Date(),
                footer: {
                    text: `ID: ${member.user.id}`
                }
            }]
        });

    } catch (error) {
        console.error('Error in welcome message:', error);
    }
});

// ============= دوال معالجة التذاكر والحضور =============

// دالة للتحقق من حدود التذاكر
async function checkTicketLimits(userId, guildId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        // التحقق من التذاكر المفتوحة
        const openTicket = await Ticket.findOne({
            userId,
            guildId,
            status: 'open'
        });

        if (openTicket) {
            return {
                allowed: false,
                reason: 'لديك تذكرة مفتوحة بالفعل. يرجى إغلاقها قبل إنشاء تذكرة جديدة.',
                channel: openTicket.channelId
            };
        }

        // التحقق من عدد التذاكر اليومية
        const dailyTickets = await Ticket.countDocuments({
            userId,
            guildId,
            createdAt: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (dailyTickets >= 3) {
            return {
                allowed: false,
                reason: 'لقد وصلت للحد الأقصى من التذاكر اليومية (3 تذاكر). حاول مجدداً غداً.',
                dailyCount: dailyTickets
            };
        }

        return {
            allowed: true,
            dailyCount: dailyTickets
        };
    } catch (error) {
        console.error('Error checking ticket limits:', error);
        return {
            allowed: false,
            reason: 'حدث خطأ أثناء التحقق من حدود التذاكر'
        };
    }
}

// دالة معالجة إنشاء التذكرة
async function handleCreateTicket(interaction) {
    try {
        // إرسال رد أولي سريع
        await interaction.reply({ content: '🔄 جاري إنشاء التذكرة...', ephemeral: true });

        // التحقق من حدود التذاكر
        const userTickets = await Ticket.countDocuments({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            status: 'open'
        });

        if (userTickets >= 3) {
            return await interaction.followUp({
                content: '❌ لديك الحد الأقصى من التذاكر المفتوحة (3)',
                ephemeral: true
            });
        }

        // إذا كنت بحاجة إلى الحصول على محتوى التذكرة، تأكد من وجوده
        // مثال على ذلك إذا كان هذا يأتي من محتوى الزر:
        const content = interaction.message.content; // أو استخدام محتوى محدد مسبقاً

        if (!content) {
            return await interaction.followUp({
                content: '❌ لم يتم توفير محتوى التذكرة.',
                ephemeral: true
            });
        }

        // إنشاء تذكرة ذكية
        const smartTicketData = await SmartTicketManager.createSmartTicket(interaction, content);
        const { ticketNumber, ticketId } = await Ticket.generateNewTicketId(interaction.guild.id);

        // إنشاء القناة
        const channel = await interaction.guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: 0,
            parent: interaction.channel.parent,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ]
        });

        // حفظ التذكرة مع المعلومات الذكية
        const ticket = new Ticket({
            ...smartTicketData,
            ticketId,
            ticketNumber,
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            channelId: channel.id,
            status: 'open',
            createdAt: new Date()
        });

        await ticket.save();

        // إنشاء Embed للتذكرة
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`تذكرة جديدة - ${ticketId}`)
            .setDescription(content)
            .addFields([
                {
                    name: '📋 التصنيف',
                    value: ticket.category,
                    inline: true
                },
                {
                    name: '🎯 الأولوية',
                    value: ticket.priority,
                    inline: true
                },
                {
                    name: '⏱️ الوقت المتوقع للحل',
                    value: `${ticket.estimatedTime} دقيقة`,
                    inline: true
                }
            ])
            .setColor(0x00ff00)
            .setTimestamp();

        // إضافة التذاكر المرتبطة إذا وجدت
        if (ticket.relatedTickets?.length > 0) {
            ticketEmbed.addField('🔗 تذاكر مرتبطة',
                ticket.relatedTickets.map(id => `\`${id}\``).join(', ')
            );
        }

        // إرسال الرسالة الأولى مع الإمبد
        await channel.send({
            embeds: [ticketEmbed],
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    style: 4,
                    label: 'إغلاق التذكرة',
                    emoji: '🔒',
                    custom_id: `close_ticket_${ticketNumber}`
                }]
            }]
        });

        // البحث عن حلول مقترحة
        const suggestions = await SmartTicketManager.suggestSolution(ticket);
        if (suggestions) {
            const suggestionsEmbed = new EmbedBuilder()
                .setTitle('💡 حلول مقترحة')
                .setDescription('وجدنا بعض الحلول من تذاكر مشابهة:')
                .setColor(0x00ffff);

            suggestions.forEach((suggestion, index) => {
                suggestionsEmbed.addField(
                    `الحل ${index + 1} (تذكرة #${suggestion.ticketId})`,
                    suggestion.solution || 'لا يوجد حل مسجل'
                );
            });

            await channel.send({ embeds: [suggestionsEmbed] });
        }

        await interaction.followUp({
            content: `✅ تم إنشاء تذكرتك في ${channel}`,
            ephemeral: true
        });

    } catch (error) {
        logger.error('Error creating ticket:', error);
        await interaction.followUp({
            content: 'حدث خطأ أثناء إنشاء التذكرة. الرجاء المحاولة مرة أخرى.',
            ephemeral: true
        });
    }
}

// دالة معالجة إغلاق التذكرة
async function handleCloseTicket(interaction) {
    try {
        // إرسال رد أولي سريع
        await interaction.reply({ content: '🔄 جاري إغلاق التذكرة...', ephemeral: true });

        // التحقق من الأذونات
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return await interaction.followUp({
                content: '❌ ليس لديك صلاحية إغلاق التذاكر!',
                ephemeral: true 
            });
        }

        const ticketId = interaction.customId.replace('close_ticket_', '');
        const Ticket = require('./models/Ticket');
        
        // البحث عن التذكرة
        const ticket = await Ticket.findOne({ ticketId: `TICKET-${ticketId}` });
        if (ticket) {
            ticket.status = 'closed';
            await ticket.save();
        }

        // إغلاق القناة بعد 5 ثواني
        await interaction.followUp({
            content: 'تم إغلاق التذكرة بنجاح! سيتم إغلاق القناة خلال 5 ثواني...',
            ephemeral: true
        });

        setTimeout(async () => {
            try {
                await interaction.channel.send('سيتم حذف القناة الآن...');
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
                    title: '🔒 تم إغلاق تذكرة',
                    description: `تم إغلاق التذكرة بواسطة ${interaction.user}`,
                    fields: [
                        {
                            name: 'رقم التذكرة',
                            value: ticketId
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
                                hour12: true,
                                timeZone: 'Asia/Riyadh'
                            })
                        }
                    ],
                    color: 0xff0000,
                    timestamp: new Date()
                }]
            });
        }

        // تسجيل إغلاق التذكرة
        const closeLogEmbed = new EmbedBuilder()
            .setTitle('🔒 تم إغلاق تذكرة')
            .setDescription(`تم إغلاق التذكرة بواسطة ${interaction.user}`)
            .addFields([
                {
                    name: 'رقم التذكرة',
                    value: ticket.ticketId,
                    inline: true
                },
                {
                    name: 'صاحب التذكرة',
                    value: `<@${ticket.userId}>`,
                    inline: true
                },
                {
                    name: 'مدة التذكرة',
                    value: getTicketDuration(ticket.createdAt),
                    inline: true
                }
            ])
            .setColor(0xff0000)
            .setTimestamp();

        await logTicketAction(interaction.guild, closeLogEmbed);

    } catch (error) {
        console.error('خطأ في handleCloseTicket:', error);
        await interaction.followUp({
            content: '❌ حدث خطأ أثناء إغلاق التذكرة. يرجى المحاولة لاحقًا.',
            ephemeral: true
        });
    }
}

// دالة مساعدة لحساب مدة التذكرة
function getTicketDuration(createdAt) {
    const duration = new Date() - createdAt;
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    let durationText = '';
    if (days > 0) durationText += `${days} يوم `;
    if (hours > 0) durationText += `${hours} ساعة `;
    if (minutes > 0) durationText += `${minutes} دقيقة`;

    return durationText || 'أقل من دقيقة';
}

// ============= دوال معالجة الحضور والانصراف =============

// دالة معالجة تسجيل الحضور
async function handleCheckIn(interaction) {
    const userId = interaction.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
        
        // إرسال رد فوري للمستخدم
        await interaction.reply({
            content: '🔄 جاري تسجيل الحضور...',
            ephemeral: true
        });

        // استخدام الدالة الجديدة للتحقق من السجلات
        const { attendanceRecord, leaveRecord } = await checkAttendanceAndLeave(userId, interaction.guild.id, today);

        if (!attendanceRecord) {
            const record = new Attendance({
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                date: today,
                sessions: []
            });

            // إضافة جلسة جديدة
            record.sessions.push({
                checkIn: new Date(),
                duration: 0
            });

            await record.save();
        } else {
            // التحقق من عدم وجود جلسة مفتوحة
            const hasOpenSession = attendanceRecord.sessions.some(session => !session.checkOut);
            if (hasOpenSession) {
                return await interaction.followUp({
                    content: '❌ لديك جلسة حضور مفتوحة بالفعل',
                    ephemeral: true
                });
            }

            // إضافة جلسة جديدة
            attendanceRecord.sessions.push({
                checkIn: new Date(),
                duration: 0
            });

            await attendanceRecord.save();
        }

        // إضافة رتبة الحضور
        const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (attendanceRole) {
            await interaction.member.roles.add(attendanceRole);
        }

        // تسجيل في قناة السجلات
        const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        if (logChannel) {
            await logChannel.send({
                embeds: [{
                    title: '✅ تسجيل حضور',
                    description: `${interaction.user} سجل حضوره`,
                    fields: [{
                        name: 'وقت الحضور',
                        value: new Date().toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Riyadh',
                            hour12: true
                        })
                    }],
                    color: 0x00ff00,
                    timestamp: new Date()
                }]
            });
        }

        // إضافة نقاط الحضور
        const pointsResult = await PointsManager.addPoints(
            interaction.user.id,
            interaction.guild.id,
            PointsManager.POINTS_CONFIG.ATTENDANCE.CHECK_IN,
            'تسجيل حضور'
        );

        // تحديث الرد ليشمل النقاط
        let replyContent = '✅ تم تسجيل حضورك بنجاح';
        if (pointsResult.leveledUp) {
            replyContent += `\n🎉 مبروك! لقد وصلت للمستوى ${pointsResult.level}`;
        }
        replyContent += `\n💫 +${PointsManager.POINTS_CONFIG.ATTENDANCE.CHECK_IN} نقطة`;

        await interaction.followUp({
            content: replyContent,
            ephemeral: true
        });

    } catch (error) {
        logger.error('Error in check-in:', error);
        await interaction.followUp({
            content: '❌ حدث خطأ أثناء تسجيل الحضور',
            ephemeral: true
        });
    } finally {
        // إزالة القفل بعد الانتهاء
        attendanceLocks.delete(userId);
    }
}

// دالة لحساب وتنسيق مدة الجلسة
function formatSessionDuration(checkIn, checkOut) {
    const duration = checkOut - checkIn; // بالمللي ثانية
    const totalSeconds = Math.round(duration / 1000);
    
    // إذا كانت المدة أقل من دقيقة
    if (totalSeconds < 60) {
        if (totalSeconds < 5) {
            return "أقل من 5 ثوانٍ";
        } else if (totalSeconds >= 55) {
            return "دقيقة تقريباً";
        } else {
            return `${totalSeconds} ثانية`;
        }
    }

    // تحويل إلى دقائق مع التقريب
    let minutes = Math.round(totalSeconds / 60);
    
    // تنسيق النص
    return `${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`;
}

// تحديث دالة تسجيل الانصراف
async function handleCheckOut(interaction) {
    try {
        // إرسال رد فوري للمستخدم
        await interaction.reply({
            content: '🔄 جاري تسجيل الانصراف...',
            ephemeral: true
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const record = await Attendance.findOne({
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (!record || !record.sessions.length) {
            return await interaction.followUp({
                content: '❌ لم يتم العثور على جلسة حضور مفتوحة',
                ephemeral: true
            });
        }

        const lastSession = record.sessions[record.sessions.length - 1];
        if (lastSession.checkOut) {
            return await interaction.followUp({
                content: '❌ ليس لديك جلسة حضور مفتوحة',
                ephemeral: true
            });
        }

        lastSession.checkOut = new Date();
        const duration = formatSessionDuration(lastSession.checkIn, lastSession.checkOut);
        lastSession.duration = Math.round((lastSession.checkOut - lastSession.checkIn) / 1000 / 60);

        await record.save();

        // تحديث تحليل الأداء
        await PerformanceAnalyzer.updateUserPerformance(
            interaction.user.id,
            interaction.guild.id
        );

        const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (attendanceRole) {
            await interaction.member.roles.remove(attendanceRole);
        }

        // تسجيل في قناة السجلات
        const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        if (logChannel) {
            const checkInTime = lastSession.checkIn.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Riyadh'
            });
            
            const checkOutTime = lastSession.checkOut.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Riyadh'
            });

            await logChannel.send({
                embeds: [{
                    title: '⏹️ تسجيل انصراف',
                    description: `${interaction.user} سجل انصرافه`,
                    fields: [
                        {
                            name: 'وقت الحضور',
                            value: checkInTime,
                            inline: true
                        },
                        {
                            name: 'وقت الانصراف',
                            value: checkOutTime,
                            inline: true
                        },
                        {
                            name: 'المدة',
                            value: duration,
                            inline: true
                        }
                    ],
                    color: 0xff0000,
                    timestamp: new Date()
                }]
            });
        }

        await interaction.followUp({
            embeds: [{
                title: '✅ تم تسجيل انصرافك',
                description: `مدة الجلسة: ${duration}`,
                color: 0x00ff00,
                timestamp: new Date()
            }],
            ephemeral: true
        });

    } catch (error) {
        logger.error('Error in check-out:', error);
        await interaction.followUp({
            content: '❌ حدث خطأ أثناء تسجيل الانصراف',
            ephemeral: true
        });
    }
}

// =============== الدوال المساعدة ==================
// دالة لتقسيم الرسالة إلى أجزاء
function splitMessage(message, limit = 1024) {
    const parts = [];
    let currentPart = '';

    message.split('\n').forEach(line => {
        if (currentPart.length + line.length + 1 <= limit) {
            currentPart += (currentPart.length ? '\n' : '') + line;
        } else {
            parts.push(currentPart);
            currentPart = line;
        }
    });

    if (currentPart) {
        parts.push(currentPart); // إضافة الجزء الأخير
    }

    return parts;
}

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
                `🕐 أول حضور: ${stats.earliestCheckIn?.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: true }) || 'غير متوفر'}\n` +
                `🕐 آخر انصراف: ${stats.latestCheckOut?.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: true }) || 'غير متوفر'}\n`;
        }).join('\n');

        // تقسيم الرسالة إلى أجزاء إذا تجاوزت 1024 حرف
        const reportParts = splitMessage(reportText);
        
        // إرسال الرسالة
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
                            `⏰ أول حضور: ${earliestCheckIn?.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: true }) || 'غير متوفر'}\n` +
                            `⏰ آخر انصراف: ${latestCheckOut?.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: true }) || 'غير متوفر'}`
                    },
                    {
                        name: '👤 تفاصيل الأعضاء',
                        value: reportParts[0] || 'لا يوجد سجلات'
                    }
                ],
                color: 0x00ff00,
                timestamp: new Date(),
                footer: {
                    text: 'تم إنشاء التقرير في'
                }
            }]
        });

        // إرسال الأجزاء المتبقية
        for (let i = 1; i < reportParts.length; i++) {
            await logChannel.send({
                embeds: [{
                    description: reportParts[i]
                }]
            });
        }
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

// دالة لفرض إغلاق التذاكر المغلقة
async function forceCloseInactiveTickets() {
    try {
        const guilds = client.guilds.cache;
        
        for (const [guildId, guild] of guilds) {
            // البحث عن التذاكر المغلقة التي لم يتم حذفها
            const tickets = await Ticket.find({
                guildId: guildId,
                status: 'closed'
            });

            for (const ticket of tickets) {
                try {
                    // البحث عن القناة
                    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
                    
                    if (channel) {
                        // تسجيل في سجل-التذاكر قبل الحذف
                        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('🗑️ حذف تذكرة مغلقة')
                                .setDescription(`تم حذف التذكرة #${ticket.ticketNumber} تلقائياً`)
                                .addFields([
                                    {
                                        name: 'معرف التذكرة',
                                        value: ticket.ticketId,
                                        inline: true
                                    },
                                    {
                                        name: 'صاحب التذكرة',
                                        value: `<@${ticket.userId}>`,
                                        inline: true
                                    },
                                    {
                                        name: 'تاريخ الإنشاء',
                                        value: ticket.createdAt.toLocaleString('ar-SA'),
                                        inline: true
                                    },
                                    {
                                        name: 'تاريخ الإغلاق',
                                        value: ticket.closedAt ? ticket.closedAt.toLocaleString('ar-SA') : 'غير معروف',
                                        inline: true
                                    }
                                ])
                                .setColor(0xff0000)
                                .setTimestamp();

                            await logChannel.send({ embeds: [logEmbed] });
                        }

                        // حذف القناة
                        await channel.delete()
                            .catch(err => logger.error(`Error deleting channel for ticket ${ticket.ticketId}:`, err));
                    }

                    // حذف التذكرة من قاعدة البيانات
                    await ticket.deleteOne();
                    
                    logger.info(`Deleted closed ticket ${ticket.ticketId} in guild ${guildId}`);
                } catch (error) {
                    logger.error(`Error processing ticket ${ticket.ticketId}:`, error);
                }
            }
        }
    } catch (error) {
        logger.error('Error in forceCloseInactiveTickets:', error);
    }
}

// إضافة جدولة المهمة (كل ساعة)
function setupTicketCleanup() {
    cron.schedule('0 * * * *', async () => {
        logger.info('Starting hourly ticket cleanup...');
        await forceCloseInactiveTickets();
    }, {
        timezone: 'Asia/Riyadh'
    });
}

// تحديث دالة startBot
async function startBot() {
    try {
        // إعداد تنظيف التذاكر
        setupTicketCleanup();
    } catch (error) {
        logger.error('Error starting bot:', error);
        process.exit(1);
    }
}

// إضافة أمر عرض النقاط
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'points') {
        try {
            await interaction.deferReply({ ephemeral: true });

            const userPoints = await Points.findOne({
                userId: interaction.user.id,
                guildId: interaction.guild.id
            });

            if (!userPoints) {
                return await interaction.followUp({
                    content: 'لم يتم العثور على نقاط مسجلة',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🌟 نقاطك وإنجازاتك')
                .setDescription(`إحصائيات ${interaction.user}`)
                .addFields([
                    {
                        name: '💫 النقاط الكلية',
                        value: `${userPoints.points}`,
                        inline: true
                    },
                    {
                        name: '📊 المستوى',
                        value: `${userPoints.level}`,
                        inline: true
                    },
                    {
                        name: '🎯 النقاط الأسبوعية',
                        value: `${userPoints.weeklyPoints}`,
                        inline: true
                    },
                    {
                        name: '📈 النقاط الشهرية',
                        value: `${userPoints.monthlyPoints}`,
                        inline: true
                    }
                ])
                .setColor(0xffd700)
                .setTimestamp();

            // إضافة الشارات إذا وجدت
            if (userPoints.badges && userPoints.badges.length > 0) {
                embed.addField('🏆 الشارات', 
                    userPoints.badges.map(badge => 
                        `${badge.icon} ${badge.name}`
                    ).join('\n')
                );
            }

            await interaction.followUp({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            logger.error('Error showing points:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء عرض النقاط',
                ephemeral: true
            });
        }
    }
});

// إضافة أمر عرض المتصدرين
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'leaderboard') {
        try {
            await interaction.deferReply();

            const type = interaction.options.getString('type') || 'total';
            const leaderboard = await PointsManager.getLeaderboard(interaction.guild.id, type);

            const embed = new EmbedBuilder()
                .setTitle('🏆 المتصدرون')
                .setDescription(`أفضل 10 أعضاء ${type === 'weekly' ? 'هذا الأسبوع' : type === 'monthly' ? 'هذا الشهر' : ''}`)
                .setColor(0xffd700);

            for (let i = 0; i < leaderboard.length; i++) {
                const user = await client.users.fetch(leaderboard[i].userId);
                embed.addFields({
                    name: `#${i + 1} ${user.tag}`,
                    value: `${leaderboard[i][type === 'weekly' ? 'weeklyPoints' : type === 'monthly' ? 'monthlyPoints' : 'points']} نقطة`
                });
            }

            await interaction.followUp({ embeds: [embed] });

        } catch (error) {
            logger.error('Error showing leaderboard:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء عرض المتصدرين',
                ephemeral: true
            });
        }
    }
});

// إضافة أمر عرض الإحصائيات
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'stats') {
        try {
            await interaction.deferReply();

            const type = interaction.options.getString('type') || 'daily';
            const report = await StatisticsManager.generateReport(interaction.guild.id, type);

            if (!report) {
                return await interaction.followUp({
                    content: 'لم يتم العثور على إحصائيات',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📊 إحصائيات ${type === 'daily' ? 'اليوم' : type === 'weekly' ? 'الأسبوع' : 'الشهر'}`)
                .setDescription(
                    `${report.summary.attendanceSummary}\n` +
                    `${report.summary.ticketsSummary}\n` +
                    `${report.summary.pointsSummary}`
                )
                .addFields([
                    {
                        name: '👥 الحضور',
                        value: [
                            `مستخدمين نشطين: ${report.metrics.attendance.uniqueUsers}`,
                            `ساعات العمل: ${Math.round(report.metrics.attendance.totalHours)}`,
                            `ساعة الذروة: ${report.metrics.attendance.peakHour.hour}:00`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '🎫 التذاكر',
                        value: [
                            `جديدة: ${report.metrics.tickets.created}`,
                            `محلولة: ${report.metrics.tickets.resolved}`,
                            `معدل الرضا: ${Math.round(report.metrics.tickets.satisfactionAverage * 10) / 10}/5`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '🌟 النقاط',
                        value: [
                            `إجمالي النقاط: ${report.metrics.points.totalAwarded}`,
                            `متوسط النقاط: ${Math.round(report.metrics.points.averagePerUser)}`,
                            `عدد المتصدرين: ${report.metrics.points.topEarners.length}`
                        ].join('\n'),
                        inline: true
                    }
                ])
                .setColor(0x00ff00)
                .setTimestamp(report.date);

            // إضافة أفضل المعالجين
            if (report.metrics.tickets.topHandlers.length > 0) {
                const handlersField = {
                    name: '👑 أفضل معالجي التذاكر',
                    value: await Promise.all(report.metrics.tickets.topHandlers.map(async (handler, index) => {
                        const user = await client.users.fetch(handler.userId);
                        return `${index + 1}. ${user.tag}: ${handler.count} تذكرة (${Math.round(handler.averageRating * 10) / 10}⭐)`;
                    }))
                };
                embed.addFields(handlersField);
            }

            await interaction.followUp({ embeds: [embed] });

        } catch (error) {
            logger.error('Error showing statistics:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء عرض الإحصائيات',
                ephemeral: true
            });
        }
    }
});

// إضافة مهمة كرون لتحديث الإحصائيات
cron.schedule('0 0 * * *', async () => {
    logger.info('Generating daily statistics...');
    const guilds = client.guilds.cache;
    
    for (const [guildId] of guilds) {
        await StatisticsManager.generateDailyStats(guildId);
    }
});

// دالة لتحديث الأوامر
async function deployCommands(client) {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }

    try {
        console.log(`بدء تحديث ${commands.length} من الأوامر.`);

        // استخدام توكن البوت من client بدلاً من process.env
        const rest = new REST().setToken(client.token);

        // تحديث الأوامر لجميع السيرفرات
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log(`✅ تم تحديث ${data.length} من الأوامر بنجاح.`);
    } catch (error) {
        console.error('خطأ في تحديث الأوامر:', error);
    }
}

// تأكد من أن البوت جاهز قبل تحديث الأوامر
client.once('ready', async () => {
    try {
        console.log(`تم تسجيل الدخول كـ ${client.user.tag}`);
        // تأخير تحديث الأوامر لضمان اكتمال تهيئة البوت
        setTimeout(async () => {
            await deployCommands(client);
        }, 1000);
    } catch (error) {
        console.error('خطأ في حدث ready:', error);
    }
});

client.on('guildCreate', async (guild) => {
    try {
        // محاولة إعداد السيرفر
        await setupGuild(guild);
        logger.info(`تم إعداد السيرفر: ${guild.name}`);
    } catch (error) {
        logger.error(`خطأ في إعداد السيرفر ${guild.name}:`, error);
        // محاولة إعادة الإعداد لاحقاً
        setTimeout(() => setupGuild(guild), 5000);
    }
});

// دالة فحص الغياب وإنشاء التقرير
async function generateAbsenteeReport(guild) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // الحصول على إعدادات نظام الحضور
        const attendanceSettings = await AttendanceSettings.findOne({ guildId: guild.id });
        if (!attendanceSettings || !attendanceSettings.viewRoleId) return null; // استخدام viewRoleId بدلاً من roleId

        // الحصول على الرتبة المحددة للمشاهدة
        const viewRole = await guild.roles.fetch(attendanceSettings.viewRoleId);
        if (!viewRole) return null;

        // الحصول على الأعضاء الذين لديهم رتبة المشاهدة (مع استبعاد البوتات)
        const membersWithViewRole = viewRole.members.filter(member => !member.user.bot);
        const totalMembersRequired = membersWithViewRole.size;

        // الحصول على سجلات الحضور لليوم
        const attendanceRecords = await Attendance.find({
            guildId: guild.id,
            userId: { $in: [...membersWithViewRole.keys()] }, // فقط للأعضاء الذين لديهم رتبة المشاهدة
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        // الحصول على الإجازات النشطة
        const activeLeaves = await Leave.find({
            guildId: guild.id,
            adminId: { $in: [...membersWithViewRole.keys()] },
            startDate: { $lte: today },
            endDate: { $gte: today },
            status: 'approved'
        });

        const absentees = [];
        const presentCount = attendanceRecords.length;
        const onLeaveCount = activeLeaves.length;

        // فحص كل عضو لديه رتبة المشاهدة
        for (const [memberId, member] of membersWithViewRole) {
            const hasAttended = attendanceRecords.some(record => record.userId === memberId);
            const isOnLeave = activeLeaves.some(leave => leave.adminId === memberId);

            if (!hasAttended && !isOnLeave) {
                const consecutiveAbsenceDays = await calculateConsecutiveAbsence(memberId, guild.id);
                absentees.push({
                    member,
                    consecutiveDays: consecutiveAbsenceDays
                });
            }
        }

        // إنشاء Embed للتقرير
        const embed = new EmbedBuilder()
            .setTitle('📊 تقرير الحضور والغياب اليومي')
            .setColor(0xFF0000)
            .addFields(
                {
                    name: '📈 إحصائيات اليوم',
                    value: [
                        `👥 إجمالي الأعضاء المطلوب حضورهم: ${totalMembersRequired}`,
                        `✅ الحاضرون: ${presentCount}`,
                        `🏖️ في إجازة: ${onLeaveCount}`,
                        `❌ الغائبون: ${absentees.length}`,
                        onLeaveCount < totalMembersRequired ? 
                            `📊 نسبة الحضور: ${Math.round((presentCount / (totalMembersRequired - onLeaveCount)) * 100)}%` :
                            `📊 نسبة الحضور: 100% (الجميع في إجازة)`
                    ].join('\n'),
                    inline: false
                }
            )
            .setTimestamp();

        // إضافة قائمة الغائبين
        if (absentees.length > 0) {
            const absenteesList = absentees
                .sort((a, b) => b.consecutiveDays - a.consecutiveDays)
                .map(({ member, consecutiveDays }) => 
                    `${member} - غائب منذ ${consecutiveDays} ${consecutiveDays === 1 ? 'يوم' : 'أيام'}`
                )
                .join('\n');

            // تقسيم القائمة إذا كانت طويلة
            const chunks = splitIntoChunks(absenteesList, 1024);
            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: index === 0 ? '📝 قائمة الغائبين' : '... تابع قائمة الغائبين',
                    value: chunk,
                    inline: false
                });
            });
        } else {
            embed.addFields({
                name: '✨ ملاحظة',
                value: onLeaveCount === totalMembersRequired ? 
                    'جميع الأعضاء في إجازة اليوم!' :
                    'لا يوجد غائبين اليوم!',
                inline: false
            });
        }

        // إضافة معلومات الرتبة
        embed.setFooter({ 
            text: `رتبة نظام الحضور: ${viewRole.name}`,
            iconURL: guild.iconURL()
        });

        return embed;
    } catch (error) {
        console.error('Error generating absentee report:', error);
        return null;
    }
}

// دالة مساعدة لحساب أيام الغياب المتتالية
async function calculateConsecutiveAbsence(userId, guildId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let consecutiveDays = 1;
    let currentDate = new Date(today);

    while (true) {
        currentDate.setDate(currentDate.getDate() - 1);
        
        // التحقق من وجود سجل حضور
        const hasAttendance = await Attendance.findOne({
            userId,
            guildId,
            date: {
                $gte: currentDate,
                $lt: new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        // التحقق من وجود إجازة
        const hasLeave = await Leave.findOne({
            adminId: userId,
            guildId,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            status: 'approved'
        });

        if (hasAttendance || hasLeave) break;
        consecutiveDays++;

        // حد أقصى للبحث (مثلاً 30 يوم)
        if (consecutiveDays > 30) break;
    }

    return consecutiveDays;
}

// دالة مساعدة لتقسيم النص الطويل
function splitIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const lines = text.split('\n');

    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxLength) {
            chunks.push(currentChunk);
            currentChunk = line;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
        }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

// تحديث دالة السجل اليومي
async function generateDailyAttendanceLog(guild) {
    try {
        // ... الكود الحالي لسجل الحضور ...

        // إضافة تقرير الغياب
        const absenteeReport = await generateAbsenteeReport(guild);
        if (absenteeReport) {
            const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
            if (logChannel) {
                await logChannel.send({ embeds: [absenteeReport] });
            }
        }
    } catch (error) {
        console.error('Error in daily attendance log:', error);
    }
}

// تحسين عمليات قاعدة البيانات
async function checkAttendanceAndLeave(userId, guildId, today) {
    const [attendanceRecord, leaveRecord] = await Promise.all([
        Attendance.findOne({
            userId,
            guildId,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        }),
        Leave.findOne({
            adminId: userId,
            guildId,
            startDate: { $lte: today },
            endDate: { $gte: today },
            status: 'approved'
        })
    ]);
    return { attendanceRecord, leaveRecord };
}
