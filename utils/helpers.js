const { PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');

// دالة للتحقق من وجود القنوات المطلوبة
async function checkRequiredChannels(guild) {
  const requiredChannels = ['سجل-التذاكر', 'سجل-الحضور'];
  const missingChannels = [];

  for (const channelName of requiredChannels) {
    if (!guild.channels.cache.find(c => c.name === channelName)) {
      missingChannels.push(channelName);
    }
  }

  return missingChannels;
}

// دالة للتحقق من صلاحيات البوت
async function checkBotPermissions(guild, client) {
  const botMember = guild.members.cache.get(client.user.id);
  const requiredPermissions = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.EmbedLinks
  ];

  return requiredPermissions.filter(perm => !botMember.permissions.has(perm));
}

// دالة لإعادة محاولة العمليات
async function retryOperation(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      
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

// دالة لمعالجة الأخطاء
async function handleError(interaction, error, customMessage = null) {
  console.error('Error:', error);
  
  let errorMessage = customMessage || 'حدث خطأ أثناء تنفيذ العملية';
  
  if (error.name === 'MongoNetworkError') {
    errorMessage = 'حدث خطأ في الاتصال بقاعدة البيانات. الرجاء المحاولة لاحقاً.';
  } else if (error.code === 50013) {
    errorMessage = 'البوت لا يملك الصلاحيات الكافية.';
  } else if (error.code === 50001) {
    errorMessage = 'لا يمكن الوصول إلى القناة المطلوبة.';
  }

  try {
    if (interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  } catch (e) {
    console.error('فشل في إرسال رسالة الخطأ:', e);
  }
}

module.exports = {
  checkRequiredChannels,
  checkBotPermissions,
  retryOperation,
  handleError
}; 