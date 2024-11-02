const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir);
        }
    }

    log(type, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            type,
            message,
            ...data
        };

        const logFile = path.join(this.logsDir, `${type}-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

        // إرسال الأخطاء المهمة للمشرفين
        if (type === 'error' && data.critical) {
            this.notifyAdmins(message, data);
        }
    }

    async notifyAdmins(message, data) {
        // سيتم تنفيذ هذا لاحقاً
    }
}

module.exports = new Logger(); 