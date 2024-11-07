const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Leave = require('../models/Leave');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vac')
        .setDescription('نظام إدارة الإجازات')
        .addSubcommand(subcommand =>
            subcommand
                .setName('vac-request')
                .setDescription('طلب إجازة جديدة')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('سبب الإجازة')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('start')
                        .setDescription('تاريخ بداية الإجازة (DD/MM/YYYY مثال: 15/12/2024)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('end')
                        .setDescription('تاريخ نهاية الإجازة (DD/MM/YYYY مثال: 20/12/2024)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vac-list')
                .setDescription('عرض الإجازات الحالية'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: 'admin',

    async execute(interaction) {
        // التحقق من صلاحيات الإداري
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return await interaction.reply({
                content: '❌ هذا الأمر للإداريين فقط',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'vac-request') {
            await handleLeaveRequest(interaction);
        } else if (subcommand === 'vac-list') {
            await handleLeaveList(interaction);
        }
    }
};

async function handleLeaveRequest(interaction) {
    try {
        const reason = interaction.options.getString('reason');
        
        // تحويل التاريخ من DD/MM/YYYY إلى كائن Date
        const startDateStr = interaction.options.getString('start');
        const endDateStr = interaction.options.getString('end');
        
        // التحقق من صيغة التاريخ
        if (!isValidDateFormat(startDateStr) || !isValidDateFormat(endDateStr)) {
            return await interaction.reply({
                content: '❌ صيغة التاريخ غير صحيحة. الرجاء استخدام DD/MM/YYYY',
                ephemeral: true
            });
        }

        // تحويل التاريخ
        const startDate = convertToDate(startDateStr);
        const endDate = convertToDate(endDateStr);

        // التحقق من صحة التواريخ
        if (startDate > endDate || startDate < new Date()) {
            return await interaction.reply({
                content: '❌ تواريخ غير صحيحة. تأكد أن تاريخ البداية لا يسبق اليوم وأن تاريخ النهاية لا يسبق تاريخ البداية',
                ephemeral: true
            });
        }

        // إنشاء طلب الإجازة
        const leave = await Leave.create({
            adminId: interaction.user.id,
            guildId: interaction.guild.id,
            reason,
            startDate,
            endDate,
            status: 'approved'
        });

        // إرسال رسالة للمستخدم
        const userEmbed = new EmbedBuilder()
            .setTitle('✅ تم تسجيل الإجازة')
            .setColor(0x00FF00)
            .addFields(
                { name: 'السبب', value: reason },
                { name: 'من', value: formatDate(startDate) },
                { name: 'إلى', value: formatDate(endDate) }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [userEmbed], ephemeral: true });

        // إنشاء أو العثور على قناة سجل الإجازات
        let logsChannel = interaction.guild.channels.cache.find(
            channel => channel.name === 'سجل-الإجازات'
        );

        // إنشاء القناة إذا لم تكن موجودة
        if (!logsChannel) {
            try {
                logsChannel = await interaction.guild.channels.create({
                    name: 'سجل-الإجازات',
                    type: 0, // نوع القناة النصية
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [
                                'ViewChannel',    // منع الجميع من رؤية القناة
                                'SendMessages'    // منع الجميع من الكتابة
                            ]
                        },
                        {
                            id: interaction.client.user.id,
                            allow: [
                                'ViewChannel',    // السماح للبوت برؤية القناة
                                'SendMessages',   // السماح للبوت بالكتابة
                                'EmbedLinks',     // السماح للبوت بإرسال Embeds
                                'AttachFiles'     // السماح للبوت بإرفاق الملفات
                            ]
                        }
                    ],
                    reason: 'قناة سجل الإجازات'
                });

                // إضافة صلاحيات للمشرفين
                const adminRole = interaction.guild.roles.cache.find(role => role.permissions.has('Administrator'));
                if (adminRole) {
                    await logsChannel.permissionOverwrites.create(adminRole, {
                        ViewChannel: true,      // السماح برؤية القناة
                        ReadMessageHistory: true // السماح بقراءة السجل
                    });
                }

                // إرسال رسالة توضيحية في القناة
                const infoEmbed = new EmbedBuilder()
                    .setTitle('📋 سجل الإجازات')
                    .setDescription('هذه القناة مخصصة لتسجيل إجازات الإداريين.\nيمكن للمشرفين فقط رؤية هذه القناة.')
                    .setColor(0x2F3136)
                    .addFields({
                        name: 'ملاحظة',
                        value: 'يتم تحديث هذا السجل تلقائياً عند تسجيل أي إجازة جديدة.'
                    })
                    .setFooter({ 
                        text: 'ArabPast Bot - نظام الإجازات',
                        iconURL: interaction.client.user.displayAvatarURL()
                    })
                    .setTimestamp();

                await logsChannel.send({ embeds: [infoEmbed] });

            } catch (error) {
                console.error('خطأ في إنشاء قناة السجل:', error);
                // الاستمرار في التنفيذ حتى لو فشل إنشاء القناة
            }
        }

        // إرسال سجل الإجازة الجديدة
        if (logsChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('📋 إجازة جديدة')
                .setColor(0x0099FF)
                .addFields(
                    { 
                        name: 'معلومات الإداري',
                        value: `الإداري: <@${interaction.user.id}>\nالاسم: ${interaction.user.tag}`
                    },
                    { 
                        name: 'تفاصيل الإجازة',
                        value: `السبب: ${reason}\nمن: ${formatDate(startDate)}\nإلى: ${formatDate(endDate)}`
                    },
                    {
                        name: 'المدة',
                        value: `${calculateDuration(startDate, endDate)} يوم`
                    },
                    {
                        name: 'وقت التسجيل',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`
                    }
                )
                .setFooter({ 
                    text: `معرف الإجازة: ${leave._id}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            await logsChannel.send({ embeds: [logEmbed] });
        }

    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: '❌ حدث خطأ أثناء تسجيل الإجازة',
            ephemeral: true
        });
    }
}

// دالة لحساب مدة الإجازة
function calculateDuration(startDate, endDate) {
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // نضيف 1 لأن اليوم الأخير محسوب
}

// دالة للتحقق من صيغة التاريخ
function isValidDateFormat(dateStr) {
    const regex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    return regex.test(dateStr);
}

// دالة لتحويل التاريخ من DD/MM/YYYY إلى كائن Date
function convertToDate(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
}

// دالة لتنسيق التاريخ بالصيغة المطلوبة
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

async function handleLeaveList(interaction) {
    try {
        const leaves = await Leave.find({
            adminId: interaction.user.id,
            guildId: interaction.guild.id,
            endDate: { $gte: new Date() }
        }).sort({ startDate: 1 });

        if (leaves.length === 0) {
            return await interaction.reply({
                content: '📝 لا توجد إجازات حالية',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📅 إجازاتك')
            .setColor(0x0099FF);

        leaves.forEach(leave => {
            embed.addFields({
                name: `إجازة ${formatDate(leave.startDate)}`,
                value: `السبب: ${leave.reason}\nمن: ${formatDate(leave.startDate)}\nإلى: ${formatDate(leave.endDate)}\nالحالة: ${getStatusArabic(leave.status)}`
            });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: '❌ حدث خطأ أثناء عرض الإجازات',
            ephemeral: true
        });
    }
}

function getStatusArabic(status) {
    const statusMap = {
        pending: 'قيد المراجعة',
        approved: 'مقبولة',
        rejected: 'مرفوضة',
        completed: 'منتهية'
    };
    return statusMap[status] || status;
} 