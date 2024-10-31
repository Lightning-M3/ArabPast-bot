const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// إعداد مجموعة لأوامر
client.commands = new Collection();

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('تم الاتصال بقاعدة البيانات MongoDB'))
.catch((err) => console.error('خطأ في الاتصال بقاعدة البيانات:', err));

// تحميل الأوامر من مجلد commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`تم تحميل الأمر ${command.data.name}`);
  } else {
    console.log(`[تحذير] الأمر في ${filePath} يفتقد إلى خاصية data أو execute المطلوبة`);
  }
}

client.once(Events.ClientReady, () => {
  console.log(`تم تسجيل الدخول كـ ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.log(`لم يتم العثور على الأمر: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ 
        content: 'حدث خطأ أثناء تنفيذ هذا الأمر!',
        ephemeral: true 
      });
    }
  }
  
  if (interaction.isButton()) {
    // التحقق من معدل الطلبات
    const now = Date.now();
    const cooldown = 60000; // دقيقة واحدة
    const userLimit = rateLimits.get(interaction.user.id) || 0;

    if (now - userLimit < cooldown) {
      return await interaction.reply({
        content: 'الرجاء الانتظار دقيقة قبل إنشاء تذكرة جديدة',
        ephemeral: true
      });
    }

    rateLimits.set(interaction.user.id, now);

    if (interaction.customId === 'create_ticket') {
      try {
        const Ticket = require('./models/Ticket');
        
        // التحقق من وجود تذكرة مفتوحة
        const existingTicket = await Ticket.findOne({
          userId: interaction.user.id,
          status: 'open'
        });

        if (existingTicket) {
          return await interaction.reply({
            content: 'لديك تذكرة مفتوحة بالفعل!',
            ephemeral: true
          });
        }
        
        // الحصول على رقم التذكرة التالي
        const ticketNumber = await Ticket.getNextSequence();
        const formattedNumber = String(ticketNumber).padStart(4, '0'); // تنسيق الرقم مثل 0001
        
        // إنشاء قناة التذكرة
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${formattedNumber}`,
          type: 0,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: ['ViewChannel'],
            },
            {
              id: interaction.user.id,
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            }
          ]
        });

        // إنشاء سجل التذكرة في قاعدة البيانات
        const ticket = new Ticket({
          ticketId: `TICKET-${formattedNumber}`,
          ticketNumber: ticketNumber,
          userId: interaction.user.id,
          channelId: ticketChannel.id,
          guildId: interaction.guild.id
        });
        await ticket.save();

        // إرسال رسالة الترحيب في قناة التذكرة
        const welcomeEmbed = {
          title: '🎫 تذكرة جديدة',
          description: `مرحباً ${interaction.user}!\nالرجاء وصف مشكلتك وسيقوم فريق الدعم بالرد عليك قريباً.`,
          color: 0x00ff00,
          fields: [
            {
              name: 'رقم التذكرة',
              value: `TICKET-${formattedNumber}`
            }
          ]
        };

        const closeButton = {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              label: 'إغلاق التذكرة',
              custom_id: `close_ticket_${formattedNumber}`
            }
          ]
        };

        await ticketChannel.send({ 
          embeds: [welcomeEmbed],
          components: [closeButton]
        });

        // إرسال تأكيد للمستخدم
        await interaction.reply({ 
          content: `تم إنشاء تذكرتك في ${ticketChannel}`,
          ephemeral: true 
        });

        // تسجيل في قناة السجلات
        const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
        if (logChannel) {
          await logChannel.send({
            embeds: [{
              title: '📝 تذكرة جديدة',
              description: `تم إنشاء تذكرة جديدة بواسطة ${interaction.user}`,
              fields: [
                {
                  name: 'رقم التذكرة',
                  value: `TICKET-${formattedNumber}`
                },
                {
                  name: 'القناة',
                  value: `${ticketChannel}`
                }
              ],
              color: 0x00ff00,
              timestamp: new Date()
            }]
          });
        }
      } catch (error) {
        console.error(error);
        await interaction.reply({ 
          content: 'حدث خطأ أثناء إنشاء التذكرة',
          ephemeral: true 
        });
      }
    }
    
    // معالجة إغلاق التذكرة
    if (interaction.customId.startsWith('close_ticket_')) {
      try {
        // التحقق من صلاحيات المستخدم
        if (!interaction.member.permissions.has('MANAGE_CHANNELS')) {
          return await interaction.reply({ 
            content: 'ليس لديك صلاحية إغلاق التذاكر!',
            ephemeral: true 
          });
        }
        const ticketId = interaction.customId.replace('close_ticket_', '');
        const Ticket = require('./models/Ticket');
        
        // تحديث حالة التذكرة في قاعدة البيانات
        const ticket = await Ticket.findOne({ ticketId: ticketId });
        if (ticket) {
          ticket.status = 'closed';
          await ticket.save();
        }

        // إرسال رسالة في قناة السجلات
        const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
        if (logChannel) {
          await logChannel.send({
            embeds: [{
              title: '🔒 تم إغلاق التذكرة',
              description: `تم إغلاق التذكرة بواسطة ${interaction.user}`,
              fields: [
                {
                  name: 'رقم التذكرة',
                  value: ticketId
                }
              ],
              color: 0xff0000,
              timestamp: new Date()
            }]
          });
        }

        // حذف قناة التذكرة بعد 5 ثواني
        await interaction.reply('سيتم إغلاق هذه التذكرة خلال 5 ثواني...');
        setTimeout(() => {
          interaction.channel.delete();
        }, 5000);

      } catch (error) {
        console.error(error);
        await interaction.reply({ 
          content: 'حدث خطأ أثناء إغلاق التذكرة',
          ephemeral: true 
        });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN); 