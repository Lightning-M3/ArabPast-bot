const Points = require('../models/Points');
const logger = require('./logger');

class PointsManager {
    static POINTS_CONFIG = {
        ATTENDANCE: {
            CHECK_IN: 10,
            FULL_DAY: 30,
            PEAK_TIME: 15,
            STREAK_BONUS: 5
        },
        TICKETS: {
            RESOLUTION: 20,
            QUICK_RESOLUTION: 10,
            SATISFACTION_BONUS: 15
        },
        LEVELS: {
            THRESHOLD: 100, // النقاط المطلوبة للمستوى التالي
            MULTIPLIER: 1.5 // مضاعف النقاط للمستوى التالي
        }
    };

    static async addPoints(userId, guildId, amount, reason) {
        try {
            let userPoints = await Points.findOne({ userId, guildId });
            
            if (!userPoints) {
                userPoints = new Points({ userId, guildId });
            }

            userPoints.points += amount;
            userPoints.weeklyPoints += amount;
            userPoints.monthlyPoints += amount;

            // التحقق من الترقية
            const newLevel = this.calculateLevel(userPoints.points);
            if (newLevel > userPoints.level) {
                userPoints.level = newLevel;
                await this.handleLevelUp(userId, guildId, newLevel);
            }

            userPoints.lastUpdated = new Date();
            await userPoints.save();

            return {
                newPoints: userPoints.points,
                level: userPoints.level,
                leveledUp: newLevel > userPoints.level
            };
        } catch (error) {
            logger.error('Error adding points:', error);
            throw error;
        }
    }

    static calculateLevel(points) {
        return Math.floor(1 + Math.sqrt(points / this.POINTS_CONFIG.LEVELS.THRESHOLD));
    }

    static async handleLevelUp(userId, guildId, newLevel) {
        try {
            // إضافة شارة جديدة
            await this.awardBadge(userId, guildId, {
                name: `مستوى ${newLevel}`,
                description: `وصل إلى المستوى ${newLevel}`,
                icon: '⭐'
            });

            // يمكن إضافة مكافآت إضافية هنا
        } catch (error) {
            logger.error('Error handling level up:', error);
        }
    }

    static async awardBadge(userId, guildId, badgeData) {
        try {
            await Points.findOneAndUpdate(
                { userId, guildId },
                {
                    $push: {
                        badges: {
                            ...badgeData,
                            earnedAt: new Date()
                        }
                    }
                }
            );
        } catch (error) {
            logger.error('Error awarding badge:', error);
        }
    }

    static async getLeaderboard(guildId, type = 'total') {
        try {
            const query = { guildId };
            const sort = {};
            
            switch (type) {
                case 'weekly':
                    sort.weeklyPoints = -1;
                    break;
                case 'monthly':
                    sort.monthlyPoints = -1;
                    break;
                default:
                    sort.points = -1;
            }

            return await Points.find(query)
                .sort(sort)
                .limit(10);
        } catch (error) {
            logger.error('Error getting leaderboard:', error);
            throw error;
        }
    }
}

module.exports = PointsManager; 