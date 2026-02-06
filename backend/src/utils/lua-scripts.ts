// src/utils/lua-scripts.ts

/**
 * Redis Lua 脚本集合
 * 包含：种植、收获、偷菜(含狗)、照料(含每日经验上限)、铲除、施肥、扩建、买狗、[新增]触发灾害
 */
export const LUA_SCRIPTS = {
  
    // ==========================================
    // 1. 种植 (Plant)
    // ==========================================
    PLANT: `
      local landKey = KEYS[1]
      local dirtyLands = KEYS[2]
      local cropId = ARGV[1]
      local matureAt = ARGV[2]
      local now = ARGV[3]
  
      local status = redis.call('HGET', landKey, 'status')
      if status and status ~= 'empty' then
        return {err = 'Land is not empty'}
      end
  
      redis.call('HMSET', landKey, 
        'status', 'planted',
        'cropId', cropId,
        'plantedAt', now,
        'matureAt', matureAt,
        'hasWeeds', 'false',
        'hasPests', 'false',
        'needsWater', 'false',
        'stolenCount', 0
      )
  
      redis.call('SADD', dirtyLands, landKey)
      return 'OK'
    `,
  
    // ==========================================
    // 2. 收获 (Harvest)
    // ==========================================
    HARVEST: `
      local landKey = KEYS[1]
      local playerKey = KEYS[2]
      local dirtyLands = KEYS[3]
      local dirtyPlayers = KEYS[4]
      
      local baseGold = tonumber(ARGV[1])
      local baseExp = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local stealPenaltyRate = tonumber(ARGV[4])
      local healthPenaltyRate = tonumber(ARGV[5])
  
      local landInfo = redis.call('HMGET', landKey, 'status', 'matureAt', 'stolenCount', 'hasWeeds', 'hasPests')
      local status = landInfo[1]
      local matureAt = tonumber(landInfo[2] or '0')
      local stolenCount = tonumber(landInfo[3] or '0')
      local hasWeeds = (landInfo[4] == 'true')
      local hasPests = (landInfo[5] == 'true')
  
      if status ~= 'planted' and status ~= 'harvestable' then return {err = 'Land is not ready'} end
      if now < matureAt then return {err = 'Crop not mature yet'} end
  
      -- 计算收益减免
      local finalRate = 1.0
      finalRate = finalRate - (stolenCount * stealPenaltyRate)
      if hasWeeds then finalRate = finalRate - healthPenaltyRate end
      if hasPests then finalRate = finalRate - healthPenaltyRate end
      if finalRate < 0.1 then finalRate = 0.1 end
  
      local finalGold = math.floor(baseGold * finalRate)
      local finalExp = math.floor(baseExp * finalRate)
  
      redis.call('HINCRBYFLOAT', playerKey, 'gold', finalGold)
      redis.call('HINCRBY', playerKey, 'exp', finalExp)
  
      redis.call('HMSET', landKey, 
        'status', 'empty', 
        'cropId', '', 
        'matureAt', '0', 
        'plantedAt', '0',
        'stolenCount', 0,
        'hasWeeds', 'false',
        'hasPests', 'false',
        'needsWater', 'false'
      )
      
      redis.call('DEL', landKey .. ':thieves')
      redis.call('SADD', dirtyLands, landKey)
      redis.call('SADD', dirtyPlayers, playerKey)
  
      return {finalGold, finalExp, tostring(finalRate)}
    `,
  
    // ==========================================
    // 3. 偷菜 (Steal)
    // ==========================================
    STEAL: `
      local landKey = KEYS[1]
      local stealerKey = KEYS[2]
      local thievesKey = KEYS[3]
      local dirtyLands = KEYS[4]
      local dirtyPlayers = KEYS[5]
      local victimKey = KEYS[6]
  
      local stealerId = ARGV[1]
      local goldGain = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local maxStolen = tonumber(ARGV[4])
  
      -- 检查狗
      local dogTime = tonumber(redis.call('HGET', victimKey, 'dogActiveUntil') or '0')
      if now < dogTime then return {err = 'Protected by dog'} end
  
      -- 检查土地
      local landInfo = redis.call('HMGET', landKey, 'status', 'matureAt', 'stolenCount')
      local status = landInfo[1]
      local matureAt = tonumber(landInfo[2] or '0')
      local stolenCount = tonumber(landInfo[3] or '0')
  
      if status ~= 'planted' and status ~= 'harvestable' then return {err = 'Not harvestable'} end
      if now < matureAt then return {err = 'Not mature'} end
      if stolenCount >= maxStolen then return {err = 'Already fully stolen'} end
  
      if redis.call('SISMEMBER', thievesKey, stealerId) == 1 then return {err = 'Already stolen by you'} end
  
      redis.call('HINCRBY', landKey, 'stolenCount', 1)
      redis.call('SADD', thievesKey, stealerId)
      redis.call('EXPIRE', thievesKey, 172800) 
  
      redis.call('HINCRBYFLOAT', stealerKey, 'gold', goldGain)
  
      redis.call('SADD', dirtyLands, landKey)
      redis.call('SADD', dirtyPlayers, stealerKey)
  
      return {stolenCount + 1}
    `,
  
    // ==========================================
    // 4. 照料 (Care)
    // ==========================================
    CARE: `
      local landKey = KEYS[1]
      local playerKey = KEYS[2]
      local dirtyLands = KEYS[3]
      local dirtyPlayers = KEYS[4]
      local dailyExpKey = KEYS[5]
      
      local typeField = ARGV[1]
      local expGain = tonumber(ARGV[2])
      local maxDailyExp = tonumber(ARGV[3])
  
      -- 检查是否需要照料
      local needCare = redis.call('HGET', landKey, typeField)
      if needCare ~= 'true' then return {err = 'No need to care'} end
  
      -- 处理经验 (带上限检查)
      local currentDailyExp = tonumber(redis.call('GET', dailyExpKey) or '0')
      local actualExpGain = 0
  
      if currentDailyExp < maxDailyExp then
        actualExpGain = expGain
        redis.call('INCRBY', dailyExpKey, actualExpGain)
        redis.call('EXPIRE', dailyExpKey, 172800) 
        
        redis.call('HINCRBY', playerKey, 'exp', actualExpGain)
        redis.call('SADD', dirtyPlayers, playerKey)
      end
  
      redis.call('HSET', landKey, typeField, 'false')
      redis.call('SADD', dirtyLands, landKey)
  
      return {actualExpGain}
    `,
  
    // ==========================================
    // 5. 铲除 (Shovel)
    // ==========================================
    SHOVEL: `
      local landKey = KEYS[1]
      local dirtyLands = KEYS[2]
  
      redis.call('HMSET', landKey, 
        'status', 'empty',
        'cropId', '',
        'matureAt', '0',
        'plantedAt', '0',
        'stolenCount', 0,
        'hasWeeds', 'false',
        'hasPests', 'false',
        'needsWater', 'false'
      )
      redis.call('DEL', landKey .. ':thieves')
      redis.call('SADD', dirtyLands, landKey)
      return 'OK'
    `,
  
    // ==========================================
    // 6. 施肥 (Fertilize)
    // ==========================================
    FERTILIZE: `
      local landKey = KEYS[1]
      local playerKey = KEYS[2]
      local price = tonumber(ARGV[1])
      local reduceTime = tonumber(ARGV[2]) * 1000
      local now = tonumber(ARGV[3])
  
      local gold = tonumber(redis.call('HGET', playerKey, 'gold') or '0')
      if gold < price then return {err = 'Not enough gold'} end
  
      local landInfo = redis.call('HMGET', landKey, 'status', 'matureAt')
      local status = landInfo[1]
      local matureAt = tonumber(landInfo[2] or '0')
  
      if status ~= 'planted' then return {err = 'No crop'} end
      if matureAt <= now then return {err = 'Already mature'} end
  
      redis.call('HINCRBYFLOAT', playerKey, 'gold', -price)
      
      local newMatureAt = matureAt - reduceTime
      if newMatureAt < now then newMatureAt = now end
  
      redis.call('HSET', landKey, 'matureAt', newMatureAt)
      redis.call('SADD', KEYS[3], landKey)
      redis.call('SADD', KEYS[4], playerKey)
  
      return {newMatureAt}
    `,
  
    // ==========================================
    // 7. 土地升级 (Upgrade Land)
    // ==========================================
    UPGRADE_LAND: `
      local landKey = KEYS[1]
      local playerKey = KEYS[2]
      local cost = tonumber(ARGV[1])
      local targetType = ARGV[2]
      local levelReq = tonumber(ARGV[3])
  
      local playerInfo = redis.call('HMGET', playerKey, 'gold', 'level')
      local gold = tonumber(playerInfo[1] or '0')
      local level = tonumber(playerInfo[2] or '1')
  
      if level < levelReq then return {err = 'Player level too low'} end
      if gold < cost then return {err = 'Not enough gold'} end
  
      redis.call('HINCRBYFLOAT', playerKey, 'gold', -cost)
      redis.call('HSET', landKey, 'landType', targetType)
      redis.call('SADD', KEYS[3], landKey)
      redis.call('SADD', KEYS[4], playerKey)
      return 'OK'
    `,
  
    // ==========================================
    // 8. 扩建土地 (Expand Land)
    // ==========================================
    EXPAND_LAND: `
      local playerKey = KEYS[1]
      local newLandKey = KEYS[2]
      local cost = tonumber(ARGV[1])
      local maxLimit = tonumber(ARGV[2])
      local posIdStr = ARGV[3]
  
      local info = redis.call('HMGET', playerKey, 'gold', 'landCount')
      local gold = tonumber(info[1] or '0')
      local currentCount = tonumber(info[2] or '6')
  
      if currentCount >= maxLimit then return {err = 'Max land limit reached'} end
      if gold < cost then return {err = 'Not enough gold'} end
  
      redis.call('HINCRBYFLOAT', playerKey, 'gold', -cost)
      redis.call('HINCRBY', playerKey, 'landCount', 1)
  
      redis.call('HMSET', newLandKey,
        'dbId', '', 
        'tempId', posIdStr,
        'position', currentCount,
        'status', 'empty',
        'landType', 'normal',
        'stolenCount', 0
      )
  
      redis.call('SADD', KEYS[3], playerKey)
      redis.call('SADD', KEYS[4], newLandKey)
      return {currentCount}
    `,
  
    // ==========================================
    // 9. 买狗/喂狗 (Dog)
    // ==========================================
    BUY_OR_FEED_DOG: `
      local playerKey = KEYS[1]
      local dirtyPlayers = KEYS[2]
      local price = tonumber(ARGV[1])
      local duration = tonumber(ARGV[2]) * 1000
      local now = tonumber(ARGV[3])
      local isFeed = ARGV[4] == 'true'
  
      if isFeed then
         local hasDog = redis.call('HGET', playerKey, 'hasDog')
         if hasDog ~= 'true' then return {err = 'No dog to feed'} end
      end
  
      local gold = tonumber(redis.call('HGET', playerKey, 'gold') or '0')
      if gold < price then return {err = 'Not enough gold'} end
  
      redis.call('HINCRBYFLOAT', playerKey, 'gold', -price)
  
      local currentExpire = tonumber(redis.call('HGET', playerKey, 'dogActiveUntil') or '0')
      local newExpire = 0
      
      if isFeed and currentExpire > now then
         newExpire = currentExpire + duration
      else
         newExpire = now + duration
      end
  
      redis.call('HMSET', playerKey, 'hasDog', 'true', 'dogActiveUntil', newExpire)
      redis.call('SADD', dirtyPlayers, playerKey)
      
      return {newExpire}
    `,
  
    // ==========================================
    // [新增] 10. 触发自然灾害 (Lazy Trigger)
    // ==========================================
    // KEYS[1]: 玩家Key
    // KEYS[2]: 脏土地集合
    // ARGV[1]: 土地最大数量
    // ARGV[2]: 杂草概率
    // ARGV[3]: 虫害概率
    // ARGV[4]: 干旱概率
    // ARGV[5]: 当前时间戳
    // ARGV[6]: 检查间隔(毫秒)
    TRIGGER_EVENTS: `
      local playerKey = KEYS[1]
      local dirtyLands = KEYS[2]
      local maxLands = tonumber(ARGV[1])
      local probWeed = tonumber(ARGV[2])
      local probPest = tonumber(ARGV[3])
      local probWater = tonumber(ARGV[4])
      local now = tonumber(ARGV[5])
      local interval = tonumber(ARGV[6])
  
      -- 1. 检查冷却时间
      local lastCheck = tonumber(redis.call('HGET', playerKey, 'lastDisasterCheck') or '0')
      if (now - lastCheck) < interval then
        return {} -- 冷却中，不触发
      end
  
      -- 2. 更新最后检查时间 (不标记 dirtyPlayers，因为这是运行时状态，丢了也没事)
      redis.call('HSET', playerKey, 'lastDisasterCheck', now)
  
      -- 3. 遍历土地
      local affected = {}
      local playerId = string.match(playerKey, "game:player:(.+)")
  
      for i = 0, (maxLands - 1) do
        local landKey = "game:land:" .. playerId .. ":" .. i
        local status = redis.call('HGET', landKey, 'status')
  
        if status == 'planted' then
          local changed = false
          
          -- 杂草
          if probWeed > 0 and math.random(1, 100) <= probWeed then
             redis.call('HSET', landKey, 'hasWeeds', 'true')
             changed = true
          end
          -- 虫害
          if probPest > 0 and math.random(1, 100) <= probPest then
             redis.call('HSET', landKey, 'hasPests', 'true')
             changed = true
          end
          -- 干旱
          if probWater > 0 and math.random(1, 100) <= probWater then
             redis.call('HSET', landKey, 'needsWater', 'true')
             changed = true
          end
  
          if changed then
            redis.call('SADD', dirtyLands, landKey)
            table.insert(affected, i)
          end
        end
      end
  
      return affected
    `
  };