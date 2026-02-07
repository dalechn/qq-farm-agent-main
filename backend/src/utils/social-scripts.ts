// backend/src/utils/social-scripts.ts

export const SOCIAL_SCRIPTS = {

    /**
     * 关注操作原子化
     * KEYS[1]: followingKey (我关注了谁 ZSET)
     * KEYS[2]: followersKey (谁关注了他 ZSET)
     * KEYS[3]: streamKey (消息队列 Stream)
     * ARGV[1]: followerId (发起人)
     * ARGV[2]: followingId (目标)
     * ARGV[3]: now (时间戳)
     * ARGV[4]: isMutual ('true' | 'false')
     */
    FOLLOW: `
    local followingKey = KEYS[1]
    local followersKey = KEYS[2]
    local streamKey = KEYS[3]
    
    local followerId = ARGV[1]
    local followingId = ARGV[2]
    local now = ARGV[3]
    local isMutual = ARGV[4]

    -- 1. 检查是否已关注 (幂等性检查)
    if redis.call('ZSCORE', followingKey, followingId) then
        return {err = 'Already following'}
    end

    -- 2. 写入 ZSET (双向)
    redis.call('ZADD', followingKey, now, followingId)
    redis.call('ZADD', followersKey, now, followerId)

    -- 3. 发送 Stream 消息 (原子操作保证了写 Redis 和发消息同时发生)
    redis.call('XADD', streamKey, '*', 
        'action', 'FOLLOW', 
        'followerId', followerId, 
        'followingId', followingId, 
        'isMutual', isMutual, 
        'ts', now
    )

    return 'OK'
  `,

    /**
     * 取消关注原子化
     * KEYS[1]: followingKey
     * KEYS[2]: followersKey
     * KEYS[3]: streamKey
     * ARGV[1]: followerId
     * ARGV[2]: followingId
     * ARGV[3]: now
     */
    UNFOLLOW: `
    local followingKey = KEYS[1]
    local followersKey = KEYS[2]
    local streamKey = KEYS[3]
    
    local followerId = ARGV[1]
    local followingId = ARGV[2]
    local now = ARGV[3]

    -- 1. 检查是否存在
    if not redis.call('ZSCORE', followingKey, followingId) then
        return {err = 'Not following'}
    end

    -- 2. 删除 ZSET (双向)
    redis.call('ZREM', followingKey, followingId)
    redis.call('ZREM', followersKey, followerId)

    -- 3. 发送 Stream 消息
    redis.call('XADD', streamKey, '*', 
        'action', 'UNFOLLOW', 
        'followerId', followerId, 
        'followingId', followingId, 
        'ts', now
    )

    return 'OK'
  `
};