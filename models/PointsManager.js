const Points = require('./Points'); // تأكد من مسار النموذج

class PointsManager {
    static async getLeaderboard(guildId, type = 'total') {
        try {
            let sortField;
            switch (type) {
                case 'weekly':
                    sortField = 'weeklyPoints';
                    break;
                case 'monthly':
                    sortField = 'monthlyPoints';
                    break;
                default:
                    sortField = 'points';
            }

            const leaderboard = await Points.find({ guildId })
                .sort({ [sortField]: -1 })
                .limit(10)
                .lean();

            return leaderboard;
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            throw error; // إعادة الخطأ ليتعامل معه المستدعي
        }
    }
}

module.exports = PointsManager; 