// backend/src/utils/lua-scripts.ts
import { GAME_CONFIG } from './game-keys';

/**
 * 自动生成 Lua 格式的经验表字符串
 * 格式: local xpTable = {100, 200, 400, ...}
 */
const XP_TABLE_LUA = `local xpTable = {${GAME_CONFIG.LEVEL_UP_EXP.join(',')}}`;

/**
 * 通用经验升级逻辑
 * 依赖变量: playerKey, expGain, xpTable
 */
const XP_LOGIC = `
    local currentExp = redis.call('HINCRBY', playerKey, 'exp', expGain)
    local currentLvl = tonumber(redis.call('HGET', playerKey, 'level') or '1')
    
    -- 获取当前等级升级所需的经验 (Lua 数组下标从1开始)
    local reqExp = xpTable[currentLvl] or 999999999
    
    local isLevelUp = false
    if currentExp >= reqExp then
       redis.call('HINCRBY', playerKey, 'level', 1)
       redis.call('HINCRBY', playerKey, 'exp', -reqExp)
       isLevelUp = true
    end
`;

export const LUA_SCRIPTS = {

  // ==========================================
  // 1. 种植 (Plant)
  // ==========================================
  PLANT: `
    ${XP_TABLE_LUA} 
    local landKey = KEYS[1]
    local dirtyLands = KEYS[2]
    local playerKey = KEYS[3]
    local dirtyPlayers = KEYS[4]
    
    local cropId = ARGV[1]
    local matureAt = ARGV[2]
    local now = ARGV[3]
    local maxHarvests = ARGV[4]
    local expGain = tonumber(ARGV[5])
    local requiredLandLevel = tonumber(ARGV[6])
    local seedCost = tonumber(ARGV[7])
    local requiredPlayerLevel = tonumber(ARGV[8])

    -- 1. 检查土地状态
    local landInfo = redis.call('HMGET', landKey, 'status', 'landType')
    local status = landInfo[1]
    local landType = landInfo[2] or 'normal'

    if status and status ~= 'empty' then
      return {err = 'Land is not empty'}
    end

    -- 2. 检查土地等级
    local currentLandLevel = 0
    if landType == 'normal' then currentLandLevel = 0
    elseif landType == 'red' then currentLandLevel = 1
    elseif landType == 'black' then currentLandLevel = 2
    elseif landType == 'gold' then currentLandLevel = 3
    end

    if currentLandLevel < requiredLandLevel then
      return {err = 'Land level too low'}
    end

    -- 3. 检查玩家等级
    local playerLevel = tonumber(redis.call('HGET', playerKey, 'level') or '1')
    if playerLevel < requiredPlayerLevel then
      return {err = 'Player level too low'}
    end

    -- 4. 检查余额并扣费
    local gold = tonumber(redis.call('HGET', playerKey, 'gold') or '0')
    if gold < seedCost then
      return {err = 'Not enough gold'}
    end
    redis.call('HINCRBYFLOAT', playerKey, 'gold', -seedCost)

    -- 5. 执行种植
    redis.call('HMSET', landKey, 
      'status', 'planted',
      'cropId', cropId,
      'plantedAt', now,
      'matureAt', matureAt,
      'remainingHarvests', maxHarvests,
      'hasWeeds', 'false',
      'hasPests', 'false',
      'needsWater', 'false',
      'stolenCount', 0
    )

    redis.call('SADD', dirtyLands, landKey)
    redis.call('SADD', dirtyPlayers, playerKey)

    -- 6. 经验与升级逻辑
    ${XP_LOGIC}

    return {'OK', tostring(isLevelUp)}
  `,

  // ==========================================
  // 2. 收获 (Harvest)
  // ==========================================
  HARVEST: `
    ${XP_TABLE_LUA}
    local landKey = KEYS[1]
    local playerKey = KEYS[2]
    local dirtyLands = KEYS[3]
    local dirtyPlayers = KEYS[4]
    
    local baseGold = tonumber(ARGV[1])
    local baseExp = tonumber(ARGV[2]) -- [修复] 修正注释符号
    local now = tonumber(ARGV[3])
    local stealPenaltyRate = tonumber(ARGV[4])
    local healthPenaltyRate = tonumber(ARGV[5])
    local regrowTime = tonumber(ARGV[6]) * 1000

    local landInfo = redis.call('HMGET', landKey, 'status', 'matureAt', 'stolenCount', 'hasWeeds', 'hasPests', 'remainingHarvests', 'needsWater')
    local status = landInfo[1]
    local matureAt = tonumber(landInfo[2] or '0')
    local stolenCount = tonumber(landInfo[3] or '0')
    local hasWeeds = (landInfo[4] == 'true')
    local hasPests = (landInfo[5] == 'true')
    local remaining = tonumber(landInfo[6] or '1')
    local needsWater = (landInfo[7] == 'true')

    -- 检查是否可收获
    local isReady = false
    if status == 'harvestable' then isReady = true end
    if status == 'planted' and now >= matureAt then isReady = true end

    if not isReady then return {err = 'Crop not mature yet'} end

    -- 1. 计算收益
    local finalRate = 1.0
    finalRate = finalRate - (stolenCount * stealPenaltyRate)
    if hasWeeds then finalRate = finalRate - healthPenaltyRate end
    if hasPests then finalRate = finalRate - healthPenaltyRate end
    if needsWater then finalRate = finalRate - healthPenaltyRate end
    if finalRate < 0.1 then finalRate = 0.1 end

    -- 修复浮点数精度: 使用四舍五入而不是直接floor
    local finalGold = math.floor(baseGold * finalRate + 0.5)
    -- 经验不受惩罚影响
    local finalExp = baseExp 

    redis.call('HINCRBYFLOAT', playerKey, 'gold', finalGold)
    
    -- 2. 经验与升级逻辑
    local expGain = finalExp 
    ${XP_LOGIC}

    -- 3. 处理多季/枯萎逻辑
    local nextRemaining = remaining - 1
    
    if nextRemaining > 0 then
      local nextMatureAt = now + regrowTime
      redis.call('HMSET', landKey, 
        'status', 'planted',
        'matureAt', nextMatureAt,
        'plantedAt', now,
        'remainingHarvests', nextRemaining,
        'stolenCount', 0,             
        'hasWeeds', 'false',          
        'hasPests', 'false',
        'needsWater', 'false'
      )
    else
      redis.call('HMSET', landKey, 
        'status', 'withered', 
        'matureAt', '0', 
        'plantedAt', '0',
        'remainingHarvests', 0,
        'stolenCount', 0,
        'hasWeeds', 'false',
        'hasPests', 'false',
        'needsWater', 'false'
      )
    end
    
    redis.call('DEL', landKey .. ':thieves')
    redis.call('SADD', dirtyLands, landKey)
    redis.call('SADD', dirtyPlayers, playerKey)

    return {finalGold, finalExp, tostring(finalRate), nextRemaining, tostring(isLevelUp), tostring(hasWeeds), tostring(hasPests), tostring(needsWater)}
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
    local dailyStealKey = KEYS[7]

    local stealerId = ARGV[1]
    local goldGain = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local maxStolen = tonumber(ARGV[4])
    local dogCatchRate = tonumber(ARGV[5])
    local dogPenalty = tonumber(ARGV[6])
    local maxDailySteal = tonumber(ARGV[7])

    -- 1. 检查每日偷取上限
    local currentDailySteal = tonumber(redis.call('GET', dailyStealKey) or '0')
    if currentDailySteal + goldGain > maxDailySteal then
       return {err = 'Daily steal limit reached', current = currentDailySteal, limit = maxDailySteal}
    end

    -- 2. 🐶 检查狗
    local dogTime = tonumber(redis.call('HGET', victimKey, 'dogActiveUntil') or '0')
    if now < dogTime then
       if math.random(1, 100) <= dogCatchRate then
          redis.call('HINCRBYFLOAT', stealerKey, 'gold', -dogPenalty)
          redis.call('SADD', dirtyPlayers, stealerKey)
          return {err = 'Bitten by dog', penalty = dogPenalty}
       end
    end

    -- 3. 检查土地
    local landInfo = redis.call('HMGET', landKey, 'status', 'matureAt', 'stolenCount')
    local status = landInfo[1]
    local matureAt = tonumber(landInfo[2] or '0')
    local stolenCount = tonumber(landInfo[3] or '0')

    local canSteal = false
    if status == 'harvestable' then canSteal = true end
    if status == 'planted' and now >= matureAt then canSteal = true end

    if not canSteal then return {err = 'Not harvestable'} end
    if stolenCount >= maxStolen then return {err = 'Already fully stolen'} end

    if redis.call('SISMEMBER', thievesKey, stealerId) == 1 then return {err = 'Already stolen by you'} end

    -- 4. 执行偷窃
    redis.call('HINCRBY', landKey, 'stolenCount', 1)
    redis.call('SADD', thievesKey, stealerId)
    redis.call('EXPIRE', thievesKey, 172800) 

    redis.call('HINCRBYFLOAT', stealerKey, 'gold', goldGain)

    -- 5. 更新每日偷取计数
    redis.call('INCRBY', dailyStealKey, goldGain)
    redis.call('EXPIRE', dailyStealKey, 172800)

    redis.call('SADD', dirtyLands, landKey)
    redis.call('SADD', dirtyPlayers, stealerKey)

    return {stolenCount + 1}
  `,

  // ==========================================
  // 4. 照料 (Care)
  // ==========================================
  CARE: `
    ${XP_TABLE_LUA}
    local landKey = KEYS[1]
    local playerKey = KEYS[2]
    local dirtyLands = KEYS[3]
    local dirtyPlayers = KEYS[4]
    local dailyExpKey = KEYS[5]
    
    local typeField = ARGV[1]
    local gainVal = tonumber(ARGV[2]) -- [修复] 修正注释符号
    local maxDailyExp = tonumber(ARGV[3])

    local needCare = redis.call('HGET', landKey, typeField)
    if needCare ~= 'true' then return {err = 'No need to care'} end

    local currentDailyExp = tonumber(redis.call('GET', dailyExpKey) or '0')
    local actualExpGain = 0
    local isLevelUp = false

    if currentDailyExp < maxDailyExp then
      actualExpGain = gainVal
      redis.call('INCRBY', dailyExpKey, actualExpGain)
      redis.call('EXPIRE', dailyExpKey, 172800) 
      
      -- 经验与升级逻辑
      local expGain = actualExpGain
      ${XP_LOGIC}
      
      redis.call('SADD', dirtyPlayers, playerKey)
    end

    redis.call('HSET', landKey, typeField, 'false')
    redis.call('SADD', dirtyLands, landKey)

    return {actualExpGain, tostring(isLevelUp)}
  `,

  // ==========================================
  // 5. 铲除 (Shovel)
  // ==========================================
  SHOVEL: `
    ${XP_TABLE_LUA}
    local landKey = KEYS[1]
    local dirtyLands = KEYS[2]
    local playerKey = KEYS[3]
    local dirtyPlayers = KEYS[4]
    local expGain = tonumber(ARGV[1])
    local isOwner = ARGV[2] == 'true'

    local status = redis.call('HGET', landKey, 'status')
    if status == 'empty' then return {err = 'Land is already empty'} end

    if not isOwner and status ~= 'withered' then
      return {err = 'Cannot shovel others planted crops'}
    end

    redis.call('HMSET', landKey, 
      'status', 'empty',
      'cropId', '',
      'matureAt', '0',
      'plantedAt', '0',
      'remainingHarvests', 0,
      'stolenCount', 0,
      'hasWeeds', 'false',
      'hasPests', 'false',
      'needsWater', 'false'
    )
    
    -- 经验与升级逻辑
    ${XP_LOGIC}

    redis.call('DEL', landKey .. ':thieves')
    redis.call('SADD', dirtyLands, landKey)
    redis.call('SADD', dirtyPlayers, playerKey)
    return {'OK', tostring(isLevelUp)}
  `,

  // ... (FERTILIZE, UPGRADE_LAND, EXPAND_LAND, BUY_OR_FEED_DOG, TRIGGER_EVENTS 保持不变)
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

  EXPAND_LAND: `
    local playerKey = KEYS[1]
    local dirtyPlayersKey = KEYS[2]
    local dirtyLandsKey = KEYS[3]
    
    local cost = tonumber(ARGV[1])
    local maxLimit = tonumber(ARGV[2])
    local playerId = ARGV[3]
    local defaultCount = 6
    
    -- 1. 检查金币
    local gold = tonumber(redis.call('HGET', playerKey, 'gold') or 0)
    if gold < cost then
        return { err = 'Not enough gold' }
    end
    
    -- 2. 原子获取并增加土地数量
    local currentCount = tonumber(redis.call('HGET', playerKey, 'landCount') or defaultCount)
    
    if currentCount >= maxLimit then
        return { err = 'Max land limit reached' }
    end
    
    local newPos = currentCount 
    
    -- 3. 扣费并更新数量
    redis.call('HINCRBYFLOAT', playerKey, 'gold', -cost)
    redis.call('HSET', playerKey, 'landCount', currentCount + 1)
    
    -- 4. 初始化新土地
    local newLandKey = 'game:land:' .. playerId .. ':' .. newPos
    
    redis.call('HMSET', newLandKey, 
      'id', '0', 
      'position', newPos,
      'status', 'empty',
      'landType', 'normal',
      'remainingHarvests', 0,
      'stolenCount', 0
    )
    
    -- 5. 标记脏数据
    redis.call('SADD', dirtyPlayersKey, playerId)
    redis.call('SADD', dirtyLandsKey, playerId .. ':' .. newPos) 
    
    return { newPos, currentCount + 1 }
  `,

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

  TRIGGER_EVENTS: `
    local playerKey = KEYS[1]
    local dirtyLands = KEYS[2]
    
    local maxLands = tonumber(ARGV[1])
    local probWeed = tonumber(ARGV[2])
    local probPest = tonumber(ARGV[3])
    local probWater = tonumber(ARGV[4])
    local now = tonumber(ARGV[5])
    local checkInterval = tonumber(ARGV[6])

    -- 检查上次触发时间，防止过于频繁触发
    local lastCheck = tonumber(redis.call('HGET', playerKey, 'lastDisasterCheck') or '0')
    if (now - lastCheck) < checkInterval then
        return 0
    end
    redis.call('HSET', playerKey, 'lastDisasterCheck', now)

    local triggeredCount = 0

    for i = 0, (maxLands - 1) do
        local landKey = 'game:land:' .. string.match(playerKey, "player:(.+)") .. ':' .. i
        
        -- 只有种植中(planted)的土地才会发生灾害
        local status = redis.call('HGET', landKey, 'status')
        if status == 'planted' then
            local changed = false
            
            -- 读取当前状态
            local hasWeeds = redis.call('HGET', landKey, 'hasWeeds')
            local hasPests = redis.call('HGET', landKey, 'hasPests')
            local needsWater = redis.call('HGET', landKey, 'needsWater')
            
            -- [新增] 读取种植时间，用于保护期计算
            local plantedAt = tonumber(redis.call('HGET', landKey, 'plantedAt') or '0')
            local matureAt = tonumber(redis.call('HGET', landKey, 'matureAt') or '0')
            
            -- [可选] 保护期逻辑：生长前 20% 时间不发生灾害
            local totalTime = matureAt - plantedAt
            local passedTime = now - plantedAt
            local isProtected = false
            if totalTime > 0 and (passedTime / totalTime) < 0.2 then
                isProtected = true
            end

            if not isProtected then
                -- [核心修复] 只有当前不是 true 时，才执行设置
                if hasWeeds ~= 'true' and probWeed > 0 and math.random(1, 100) <= probWeed then
                   redis.call('HSET', landKey, 'hasWeeds', 'true')
                   changed = true
                end
                
                if hasPests ~= 'true' and probPest > 0 and math.random(1, 100) <= probPest then
                   redis.call('HSET', landKey, 'hasPests', 'true')
                   changed = true
                end
                
                if needsWater ~= 'true' and probWater > 0 and math.random(1, 100) <= probWater then
                   redis.call('HSET', landKey, 'needsWater', 'true')
                   changed = true
                end
            end

            -- 只有真正发生变化(changed=true)时，才加入脏集合
            if changed then
                redis.call('SADD', dirtyLands, landKey)
                triggeredCount = triggeredCount + 1
            end
        end
    end
    return triggeredCount
  `,
};