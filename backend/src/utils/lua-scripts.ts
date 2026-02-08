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

// [新增] 通用同步逻辑：向 Stream 发送事件
// 参数: streamKey, playerKey, actionName
const SYNC_LOGIC = `
    local realPid = string.match(playerKey, "game:player:(.+)")
    if realPid then
        redis.call('XADD', streamKey, '*', 'playerId', realPid, 'action', actionName, 'ts', ARGV[3] or '0')
    end
`;

export const LUA_SCRIPTS = {

  // ==========================================
  // 1. 种植 (Plant)
  // ==========================================
  PLANT: `
    ${XP_TABLE_LUA} 
    local landKey = KEYS[1]
    local playerKey = KEYS[2]
    local streamKey = KEYS[3] -- [修改] 接收 Stream Key
    
    local cropId = ARGV[1]
    local matureAt = ARGV[2]
    local now = ARGV[3]
    local maxHarvests = ARGV[4]
    local expGain = tonumber(ARGV[5])
    local requiredLandLevel = tonumber(ARGV[6])
    local seedCost = tonumber(ARGV[7])
    local requiredPlayerLevel = tonumber(ARGV[8])
    
    local actionName = 'PLANT'

    -- 1. 检查土地状态
    local landInfo = redis.call('HMGET', landKey, 'status', 'landType')
    local status = landInfo[1]
    local landType = landInfo[2] or 'normal'

    if status and status ~= 'empty' then
      return {err = 'Land is not empty'}
    end

    -- 2. 检查土地等级
    local currentLandLevel = 0
    if landType == 'red' then currentLandLevel = 1
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
      'status', 'planted', 'cropId', cropId, 'plantedAt', now, 'matureAt', matureAt,
      'remainingHarvests', maxHarvests, 'hasWeeds', 'false', 'hasPests', 'false', 'needsWater', 'false', 'stolenCount', 0
    )

    -- [核心修改] 发送事件到 Stream
    ${SYNC_LOGIC}

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
    local streamKey = KEYS[3]
    
    local baseGold = tonumber(ARGV[1])
    local baseExp = tonumber(ARGV[2])
    local now = ARGV[3]
    local stealPenaltyRate = tonumber(ARGV[4])
    local healthPenaltyRate = tonumber(ARGV[5])
    local regrowTime = tonumber(ARGV[6]) * 1000
    
    local actionName = 'HARVEST'

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
    if status == 'planted' and tonumber(now) >= matureAt then isReady = true end

    if not isReady then return {err = 'Crop not mature yet'} end

    -- 1. 计算收益
    local finalRate = 1.0
    finalRate = finalRate - (stolenCount * stealPenaltyRate)
    if hasWeeds then finalRate = finalRate - healthPenaltyRate end
    if hasPests then finalRate = finalRate - healthPenaltyRate end
    if needsWater then finalRate = finalRate - healthPenaltyRate end
    if finalRate < 0.1 then finalRate = 0.1 end

    local finalGold = math.floor(baseGold * finalRate + 0.5)
    local finalExp = baseExp 

    redis.call('HINCRBYFLOAT', playerKey, 'gold', finalGold)
    
    -- 2. 经验与升级逻辑
    local expGain = finalExp 
    ${XP_LOGIC}

    -- 3. 处理多季/枯萎逻辑
    local nextRemaining = remaining - 1
    
    if nextRemaining > 0 then
      local nextMatureAt = tonumber(now) + regrowTime
      redis.call('HMSET', landKey, 'status', 'planted', 'matureAt', nextMatureAt, 'plantedAt', now, 'remainingHarvests', nextRemaining, 'stolenCount', 0, 'hasWeeds', 'false', 'hasPests', 'false', 'needsWater', 'false')
    else
      redis.call('HMSET', landKey, 'status', 'withered', 'matureAt', '0', 'plantedAt', '0', 'remainingHarvests', 0, 'stolenCount', 0, 'hasWeeds', 'false', 'hasPests', 'false', 'needsWater', 'false')
    end
    
    redis.call('DEL', landKey .. ':thieves')
    
    ${SYNC_LOGIC}

    return {finalGold, finalExp, tostring(finalRate), nextRemaining, tostring(isLevelUp), tostring(hasWeeds), tostring(hasPests), tostring(needsWater)}
  `,

  // ==========================================
  // 3. 偷菜 (Steal)
  // ==========================================
  STEAL: `
    local landKey = KEYS[1]
    local stealerKey = KEYS[2]
    local thievesKey = KEYS[3]
    local streamKey = KEYS[4] -- [修改] 
    local victimKey = KEYS[5]
    local dailyStealKey = KEYS[6]

    local stealerId = ARGV[1]
    local rawGoldGain = tonumber(ARGV[2])
    local goldGain = math.floor(rawGoldGain)
    if goldGain < 1 and rawGoldGain > 0 then goldGain = 1 end
    local now = ARGV[3]
    local maxStolen = tonumber(ARGV[4])
    local dogCatchRate = tonumber(ARGV[5])
    local dogPenalty = tonumber(ARGV[6])
    local maxDailySteal = tonumber(ARGV[7])

    local actionName = 'STEAL'
    local playerKey = stealerKey -- 用于 SYNC_LOGIC

    -- 检查每日上限
    local currentDailySteal = tonumber(redis.call('GET', dailyStealKey) or '0')
    if currentDailySteal + goldGain > maxDailySteal then
       return cjson.encode({err = 'Daily steal limit reached', current = currentDailySteal, limit = maxDailySteal})
    end

    -- 狗
    local dogTime = tonumber(redis.call('HGET', victimKey, 'dogActiveUntil') or '0')
    if tonumber(now) < dogTime then
       if math.random(1, 100) <= dogCatchRate then
          redis.call('HINCRBYFLOAT', stealerKey, 'gold', -dogPenalty)
          ${SYNC_LOGIC}
          return cjson.encode({err = 'Bitten by dog', penalty = dogPenalty})
       end
    end

    local landInfo = redis.call('HMGET', landKey, 'status', 'matureAt', 'stolenCount')
    local status = landInfo[1]
    local matureAt = tonumber(landInfo[2] or '0')
    local stolenCount = tonumber(landInfo[3] or '0')

    local canSteal = false
    if status == 'harvestable' then canSteal = true end
    if status == 'planted' and tonumber(now) >= matureAt then canSteal = true end
    if not canSteal then return {err = 'Not harvestable'} end
    if stolenCount >= maxStolen then return {err = 'Already fully stolen'} end
    if redis.call('SISMEMBER', thievesKey, stealerId) == 1 then return {err = 'Already stolen by you'} end

    redis.call('HINCRBY', landKey, 'stolenCount', 1)
    redis.call('SADD', thievesKey, stealerId)
    redis.call('EXPIRE', thievesKey, 172800) 
    redis.call('HINCRBYFLOAT', stealerKey, 'gold', goldGain)
    redis.call('INCRBY', dailyStealKey, goldGain)
    redis.call('EXPIRE', dailyStealKey, 172800)

    -- 这里需要同步两个玩家：偷窃者(金币) 和 受害者(土地被标记)
    -- 1. 同步偷窃者
    ${SYNC_LOGIC}
    
    -- 2. 同步受害者 (土地被标记stolen，虽然只影响收益计算，但也算状态变更)
    local victimAction = 'STOLEN'
    local victimRealId = string.match(victimKey, "game:player:(.+)")
    if victimRealId then
        redis.call('XADD', streamKey, '*', 'playerId', victimRealId, 'action', victimAction, 'ts', now)
    end
    
    -- 土地脏数据由 victim 的同步逻辑处理
    return {stolenCount + 1}
  `,

  // ==========================================
  // 4. 照料 (Care)
  // ==========================================
  CARE: `
    ${XP_TABLE_LUA}
    local landKey = KEYS[1]
    local playerKey = KEYS[2]
    local streamKey = KEYS[3]
    local dailyExpKey = KEYS[4]
    
    local typeField = ARGV[1]
    local gainVal = tonumber(ARGV[2])
    local maxDailyExp = tonumber(ARGV[3])
    
    local actionName = 'CARE'

    local needCare = redis.call('HGET', landKey, typeField)
    if needCare ~= 'true' then return {err = 'No need to care'} end

    local currentDailyExp = tonumber(redis.call('GET', dailyExpKey) or '0')
    local actualExpGain = 0
    local isLevelUp = false

    if currentDailyExp < maxDailyExp then
      actualExpGain = gainVal
      redis.call('INCRBY', dailyExpKey, actualExpGain)
      redis.call('EXPIRE', dailyExpKey, 172800) 
      local expGain = actualExpGain
      ${XP_LOGIC}
      ${SYNC_LOGIC}
    end

    redis.call('HSET', landKey, typeField, 'false')
    
    -- 同步土地拥有者 (如果 owner 不是操作者)
    local playerIdFromLand = string.match(landKey, "game:land:(.+):%d+")
    local operatorId = string.match(playerKey, "game:player:(.+)")
    
    if playerIdFromLand and playerIdFromLand ~= operatorId then
       redis.call('XADD', streamKey, '*', 'playerId', playerIdFromLand, 'action', 'HELPED', 'ts', ARGV[4] or '0')
    end

    return {actualExpGain, tostring(isLevelUp)}
  `,

  // ==========================================
  // 5. 铲除 (Shovel)
  // ==========================================
  SHOVEL: `
    ${XP_TABLE_LUA}
    local landKey = KEYS[1]
    local playerKey = KEYS[2]
    local streamKey = KEYS[3]
    local expGain = tonumber(ARGV[1])
    local isOwner = ARGV[2] == 'true'
    
    local actionName = 'SHOVEL'

    local status = redis.call('HGET', landKey, 'status')
    if status == 'empty' then return {err = 'Land is already empty'} end
    if not isOwner and status ~= 'withered' then return {err = 'Cannot shovel others planted crops'} end

    redis.call('HMSET', landKey, 'status', 'empty', 'cropId', '', 'matureAt', '0', 'plantedAt', '0', 'remainingHarvests', 0, 'stolenCount', 0, 'hasWeeds', 'false', 'hasPests', 'false', 'needsWater', 'false')
    
    ${XP_LOGIC}
    redis.call('DEL', landKey .. ':thieves')
    ${SYNC_LOGIC}
    return {'OK', tostring(isLevelUp)}
  `,

  FERTILIZE: `
    local landKey = KEYS[1]
    local playerKey = KEYS[2]
    local streamKey = KEYS[3]
    local price = tonumber(ARGV[1])
    local reduceTime = tonumber(ARGV[2]) * 1000
    local now = tonumber(ARGV[3])
    
    local actionName = 'FERTILIZE'

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
    ${SYNC_LOGIC}

    return {newMatureAt}
  `,

  UPGRADE_LAND: `
    local landKey = KEYS[1]
    local playerKey = KEYS[2]
    local streamKey = KEYS[3]
    local cost = tonumber(ARGV[1])
    local targetType = ARGV[2]
    local levelReq = tonumber(ARGV[3])
    
    local actionName = 'UPGRADE'

    local playerInfo = redis.call('HMGET', playerKey, 'gold', 'level')
    local gold = tonumber(playerInfo[1] or '0')
    local level = tonumber(playerInfo[2] or '1')

    if level < levelReq then return {err = 'Player level too low'} end
    if gold < cost then return {err = 'Not enough gold'} end

    redis.call('HINCRBYFLOAT', playerKey, 'gold', -cost)
    redis.call('HSET', landKey, 'landType', targetType)
    ${SYNC_LOGIC}
    return 'OK'
  `,

  EXPAND_LAND: `
    local playerKey = KEYS[1]
    local streamKey = KEYS[2]
    local cost = tonumber(ARGV[1])
    local maxLimit = tonumber(ARGV[2])
    local playerId = ARGV[3]
    
    local actionName = 'EXPAND'

    local gold = tonumber(redis.call('HGET', playerKey, 'gold') or 0)
    if gold < cost then return { err = 'Not enough gold' } end
    
    local currentCount = tonumber(redis.call('HGET', playerKey, 'landCount') or 6)
    if currentCount >= maxLimit then return { err = 'Max land limit reached' } end
    
    local newPos = currentCount 
    redis.call('HINCRBYFLOAT', playerKey, 'gold', -cost)
    redis.call('HSET', playerKey, 'landCount', currentCount + 1)
    
    local newLandKey = 'game:land:' .. playerId .. ':' .. newPos
    redis.call('HMSET', newLandKey, 'id', '0', 'position', newPos, 'status', 'empty', 'landType', 'normal', 'remainingHarvests', 0, 'stolenCount', 0)
    
    ${SYNC_LOGIC}
    return { newPos, currentCount + 1 }
  `,

  BUY_OR_FEED_DOG: `
    local playerKey = KEYS[1]
    local streamKey = KEYS[2]
    local price = tonumber(ARGV[1])
    local duration = tonumber(ARGV[2]) * 1000
    local now = tonumber(ARGV[3])
    local isFeed = ARGV[4] == 'true'
    
    local actionName = 'DOG'

    if isFeed then
       local hasDog = redis.call('HGET', playerKey, 'hasDog')
       if hasDog ~= 'true' then return {err = 'No dog to feed'} end
    end

    local gold = tonumber(redis.call('HGET', playerKey, 'gold') or '0')
    if gold < price then return {err = 'Not enough gold'} end

    redis.call('HINCRBYFLOAT', playerKey, 'gold', -price)
    local currentExpire = tonumber(redis.call('HGET', playerKey, 'dogActiveUntil') or '0')
    local newExpire = 0
    if isFeed and currentExpire > now then newExpire = currentExpire + duration else newExpire = now + duration end

    redis.call('HMSET', playerKey, 'hasDog', 'true', 'dogActiveUntil', newExpire)
    ${SYNC_LOGIC}
    return {newExpire}
  `,

  TRIGGER_EVENTS: `
    local playerKey = KEYS[1]
    local streamKey = KEYS[2] -- [修改] 
    
    local maxLands = tonumber(ARGV[1])
    local probWeed = tonumber(ARGV[2])
    local probPest = tonumber(ARGV[3])
    local probWater = tonumber(ARGV[4])
    local now = tonumber(ARGV[5])
    local interval = tonumber(ARGV[6])
    
    local actionName = 'DISASTER'

    local lastCheck = tonumber(redis.call('HGET', playerKey, 'lastDisasterCheck') or '0')
    if (now - lastCheck) < interval then return {} end
    redis.call('HSET', playerKey, 'lastDisasterCheck', now)

    local affected = {}
    local playerId = string.match(playerKey, "game:player:(.+)")
    local anyChange = false

    for i = 0, (maxLands - 1) do
      local landKey = "game:land:" .. playerId .. ":" .. i
      local info = redis.call('HMGET', landKey, 'status', 'matureAt', 'plantedAt')
      local status = info[1]
      local matureAt = tonumber(info[2] or '0')
      local plantedAt = tonumber(info[3] or '0')

      if status == 'planted' then
        local changed = false
        if now >= matureAt then
            redis.call('HSET', landKey, 'status', 'harvestable')
            changed = true
        else
            local totalDuration = matureAt - plantedAt
            local passed = now - plantedAt
            local isProtected = false
            if totalDuration > 0 and (passed / totalDuration) < 0.2 then isProtected = true end

            if not isProtected then
                local currentStates = redis.call('HMGET', landKey, 'hasWeeds', 'hasPests', 'needsWater')
                if currentStates[1] ~= 'true' and probWeed > 0 and math.random(1, 100) <= probWeed then redis.call('HSET', landKey, 'hasWeeds', 'true'); changed = true end
                if currentStates[2] ~= 'true' and probPest > 0 and math.random(1, 100) <= probPest then redis.call('HSET', landKey, 'hasPests', 'true'); changed = true end
                if currentStates[3] ~= 'true' and probWater > 0 and math.random(1, 100) <= probWater then redis.call('HSET', landKey, 'needsWater', 'true'); changed = true end
            end
        end

        if changed then
          table.insert(affected, i)
          anyChange = true
        end
      end
    end

    if anyChange then
        ${SYNC_LOGIC}
    end

    return affected
  `
};