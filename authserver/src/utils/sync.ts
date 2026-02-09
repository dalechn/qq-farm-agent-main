
import prisma from './prisma';
import redisClient, { SOCIAL_KEYS } from './redis';

/**
 * 启动时全量同步关注关系到 Redis
 * 
 * 策略:
 * 1. 分批读取数据库中的 Follow 记录 (避免内存溢出)
 * 2. 使用 Redis Pipeline 批量写入 ZSET
 * 3. 写入 Key: 
 *    - social:v2:following:{followerId} -> member: followingId, score: createdAt
 *    - social:v2:followers:{followingId} -> member: followerId, score: createdAt
 */
export async function syncFollowsToRedis() {
    const isSynced = await redisClient.exists('SOCIAL_KEYS');
    if (isSynced) {
        console.log('✅ SOCIAL_KEYS exists, skipping sync.');
        return;
    }

    console.log('🔄 Starting full sync of Follow relationships to Redis...');
    const startTime = Date.now();

    try {
        // 1. 获取总记录数
        const totalCount = await prisma.follow.count();
        console.log(`📊 Found ${totalCount} follow relationships in DB.`);

        if (totalCount === 0) {
            console.log('✅ No follows to sync.');
            // Even if empty, mark as synced to avoid re-checking DB every time?
            // User didn't specify, but logically yes.
            await redisClient.set('SOCIAL_KEYS', 'true');
            return;
        }

        const BATCH_SIZE = 1000;
        let processedConfig = 0;

        // 2. 分批处理
        for (let skip = 0; skip < totalCount; skip += BATCH_SIZE) {
            const batch = await prisma.follow.findMany({
                skip,
                take: BATCH_SIZE,
                select: {
                    followerId: true,
                    followingId: true,
                    createdAt: true
                }
            });

            // 3. 构建 Redis Pipeline
            const pipeline = redisClient.multi();

            for (const follow of batch) {
                const score = follow.createdAt.getTime();

                // Add to Following list of follower
                pipeline.zAdd(
                    `${SOCIAL_KEYS.FOLLOWING}${follow.followerId}`,
                    { score, value: follow.followingId }
                );

                // Add to Followers list of following
                pipeline.zAdd(
                    `${SOCIAL_KEYS.FOLLOWERS}${follow.followingId}`,
                    { score, value: follow.followerId }
                );
            }

            // 4. 执行写入
            await pipeline.exec();
            processedConfig += batch.length;
            console.log(`   ⏳ Synced ${processedConfig}/${totalCount} relationships...`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        await redisClient.set('SOCIAL_KEYS', 'true');
        console.log(`✅ Successfully synced ${totalCount} relationships in ${duration}s.`);

    } catch (error) {
        console.error('❌ Failed to sync follow relationships:', error);
        // 不抛出错误，避免阻断服务器启动，但记录严重错误
    }
}
