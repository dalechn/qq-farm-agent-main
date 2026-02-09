// backend/src/utils/lua-scripts.ts
import { GAME_CONFIG } from './game-keys';

const XP_TABLE_LUA = `local xpTable = {${GAME_CONFIG.LEVEL_UP_EXP.join(',')}}`;

/**
 * 核心：操作 JSON 数组的辅助逻辑
 * 从 playerKey 对应的 Hash 中读取 'lands' 字段，解析为 Table
 * 并在操作结束后提供保存逻辑
 */
const GET_LANDS_LOGIC = `
    local landsStr = redis.call('HGET', targetKey, 'lands')
    local lands = {}
    if landsStr and landsStr ~= '' then
        lands = cjson.decode(landsStr)
    end
    
    local function getLandByPos(pos)
        for i, land in ipairs(lands) do
            if land.position == pos then
                return land, i
            end
        end
        return nil, -1
    end

    local function saveLands(key, data)
        redis.call('HSET', key, 'lands', cjson.encode(data))
    end
`;

const XP_LOGIC = `
    local currentExp = redis.call('HINCRBY', playerKey, 'exp', expGain)
    local currentLvl = tonumber(redis.call('HGET', playerKey, 'level') or '1')
    local reqExp = xpTable[currentLvl] or 999999999
    local isLevelUp = false
    if currentExp >= reqExp then
       redis.call('HINCRBY', playerKey, 'level', 1)
       redis.call('HINCRBY', playerKey, 'exp', -reqExp)
       isLevelUp = true
    end
`;

const SYNC_LOGIC = `
    local realPid = string.match(playerKey, "game:player:(.+)")
    if realPid then
        redis.call('XADD', streamKey, '*', 'playerId', realPid, 'action', actionName, 'ts', ARGV[3] or '0')
    end
`;

export const LUA_SCRIPTS = {

  // ==========================================
  // 1. 种植 (Plant)
  // KEYS: [playerKey, streamKey]
  // ARGS: [position, cropId, matureAt, now, maxHarvests, expGain, reqLandLvl, seedCost, reqPlayerLvl]
  // ==========================================
  PLANT: `
    ${XP_TABLE_LUA} 
    local playerKey = KEYS[1]
    local streamKey = KEYS[2]
    
    local position = tonumber(ARGV[1])
    local cropId = ARGV[2]
    local matureAt = ARGV[3]
    local now = ARGV[4]
    local maxHarvests = ARGV[5]
    local expGain = tonumber(ARGV[6])
    local requiredLandLevel = tonumber(ARGV[7])
    local seedCost = tonumber(ARGV[8])
    local requiredPlayerLevel = tonumber(ARGV[9])
    
    local actionName = 'PLANT'

    -- 1. 加载土地
    local targetKey = playerKey
    ${GET_LANDS_LOGIC}
    local land, idx = getLandByPos(position)
    if not land then return {err = 'Land not found'} end

    -- 2. 检查状态
    if land.status ~= 'empty' then return {err = 'Land is not empty'} end

    -- 3. 检查土地等级
    local landType = land.landType or 'normal'
    local currentLandLevel = 0
    if landType == 'red' then currentLandLevel = 1
    elseif landType == 'black' then currentLandLevel = 2
    elseif landType == 'gold' then currentLandLevel = 3
    end

    if currentLandLevel < requiredLandLevel then return {err = 'Land level too low'} end

    -- 4. 检查玩家等级
    local playerLevel = tonumber(redis.call('HGET', playerKey, 'level') or '1')
    if playerLevel < requiredPlayerLevel then return {err = 'Player level too low'} end

    -- 5. 检查余额
    local gold = tonumber(redis.call('HGET', playerKey, 'gold') or '0')
    if gold < seedCost then return {err = 'Not enough gold'} end
    redis.call('HINCRBYFLOAT', playerKey, 'gold', -seedCost)

    -- 6. 更新土地
    land.status = 'planted'
    land.cropType = cropId -- 注意字段名 cropType vs cropId，保持与 GameService.ts 一致
    land.plantedAt = tonumber(now)
    land.matureAt = tonumber(matureAt)
    land.remainingHarvests = tonumber(maxHarvests)
    land.hasWeeds = false
    land.hasPests = false
    land.needsWater = false
    land.stolenCount = 0
    
    saveLands(playerKey, lands)

    -- Sync & XP
    ${SYNC_LOGIC}
    ${XP_LOGIC}

    return {'OK', tostring(isLevelUp)}
  `,

  // ==========================================
  // 2. 收获 (Harvest)
  // KEYS: [playerKey, streamKey]
  // ARGS: [pos, gold, exp, now, stealRate, healthRate, regrowSec]
  // ==========================================
  HARVEST: `
    ${XP_TABLE_LUA}
    local playerKey = KEYS[1]
    local streamKey = KEYS[2]
    
    local position = tonumber(ARGV[1])
    local baseGold = tonumber(ARGV[2])
    local baseExp = tonumber(ARGV[3])
    local now = ARGV[4]
    local stealPenaltyRate = tonumber(ARGV[5])
    local healthPenaltyRate = tonumber(ARGV[6])
    local regrowTime = tonumber(ARGV[7]) * 1000
    
    local actionName = 'HARVEST'

    local targetKey = playerKey
    ${GET_LANDS_LOGIC}
    local land = getLandByPos(position)
    if not land then return {err = 'Land not found'} end

    local status = land.status
    local matureAt = tonumber(land.matureAt or 0)
    local stolenCount = tonumber(land.stolenCount or 0)
    local remaining = tonumber(land.remainingHarvests or 1)
    
    -- JSON boolean 处理
    local hasWeeds = (land.hasWeeds == true)
    local hasPests = (land.hasPests == true)
    local needsWater = (land.needsWater == true)

    local isReady = false
    if status == 'harvestable' then isReady = true end
    if status == 'planted' and tonumber(now) >= matureAt then isReady = true end

    if not isReady then return {err = 'Crop not mature yet'} end

    -- 计算收益
    local finalRate = 1.0
    finalRate = finalRate - (stolenCount * stealPenaltyRate)
    if hasWeeds then finalRate = finalRate - healthPenaltyRate end
    if hasPests then finalRate = finalRate - healthPenaltyRate end
    if needsWater then finalRate = finalRate - healthPenaltyRate end
    if finalRate < 0.1 then finalRate = 0.1 end

    local finalGold = math.floor(baseGold * finalRate + 0.5)
    local finalExp = baseExp 

    redis.call('HINCRBYFLOAT', playerKey, 'gold', finalGold)
    
    local expGain = finalExp 
    ${XP_LOGIC}

    -- 枯萎或再生
    local nextRemaining = remaining - 1
    if nextRemaining > 0 then
      local nextMatureAt = tonumber(now) + regrowTime
      land.status = 'planted'
      land.matureAt = nextMatureAt
      land.plantedAt = tonumber(now)
      land.remainingHarvests = nextRemaining
      land.stolenCount = 0
      land.hasWeeds = false
      land.hasPests = false
      land.needsWater = false
    else
      land.status = 'withered'
      land.matureAt = 0
      land.plantedAt = 0
      land.remainingHarvests = 0
      land.stolenCount = 0
      land.hasWeeds = false
      land.hasPests = false
      land.needsWater = false
    end

    saveLands(playerKey, lands)
    
    -- 清除 thieves 记录 (需手动构造 key)
    local realPid = string.match(playerKey, "game:player:(.+)")
    local thievesKey = "game:land:" .. realPid .. ":" .. position .. ":thieves"
    redis.call('DEL', thievesKey)
    
    ${SYNC_LOGIC}

    return {finalGold, finalExp, tostring(finalRate), nextRemaining, tostring(isLevelUp), tostring(hasWeeds), tostring(hasPests), tostring(needsWater)}
  `,

  // ==========================================
  // 3. 偷菜 (Steal)
  // KEYS: [victimKey, stealerKey, thievesKey, streamKey, dailyKey]
  // ARGS: [stealerId, gold, now, maxStolen, catchRate, bitePenalty, maxDaily, pos]
  // ==========================================
  STEAL: `
    local victimKey = KEYS[1]
    local stealerKey = KEYS[2]
    local thievesKey = KEYS[3]
    local streamKey = KEYS[4] 
    local dailyStealKey = KEYS[5]

    local stealerId = ARGV[1]
    local rawGoldGain = tonumber(ARGV[2])
    local goldGain = math.floor(rawGoldGain)
    if goldGain < 1 and rawGoldGain > 0 then goldGain = 1 end
    local now = ARGV[3]
    local maxStolen = tonumber(ARGV[4])
    local dogCatchRate = tonumber(ARGV[5])
    local dogPenalty = tonumber(ARGV[6])
    local maxDailySteal = tonumber(ARGV[7])
    local position = tonumber(ARGV[8])

    local actionName = 'STEAL'
    local playerKey = stealerKey 

    local currentDailySteal = tonumber(redis.call('GET', dailyStealKey) or '0')
    if currentDailySteal + goldGain > maxDailySteal then
       return cjson.encode({err = 'Daily steal limit reached', current = currentDailySteal, limit = maxDailySteal})
    end

    -- 狗的逻辑 (从 victimKey 读取)
    local dogTime = tonumber(redis.call('HGET', victimKey, 'dogActiveUntil') or '0')
    if tonumber(now) < dogTime then
       if math.random(1, 100) <= dogCatchRate then
          local currentGold = tonumber(redis.call('HGET', stealerKey, 'gold') or '0')
          local actualPenalty = dogPenalty
          if currentGold < dogPenalty then actualPenalty = currentGold end
          
          if actualPenalty > 0 then
             redis.call('HINCRBYFLOAT', stealerKey, 'gold', -actualPenalty)
             redis.call('HINCRBYFLOAT', victimKey, 'gold', actualPenalty)
          end

          ${SYNC_LOGIC} 
          return cjson.encode({err = 'Bitten by dog', penalty = actualPenalty})
       end
    end

    -- 加载 Victim 土地
    local targetKey = victimKey
    ${GET_LANDS_LOGIC}
    local land = getLandByPos(position)
    if not land then return {err = 'Land not found'} end

    local canSteal = false
    if land.status == 'harvestable' then canSteal = true end
    if land.status == 'planted' and tonumber(now) >= tonumber(land.matureAt or 0) then canSteal = true end
    
    if not canSteal then return {err = 'Not harvestable'} end
    if tonumber(land.stolenCount or 0) >= maxStolen then return {err = 'Already fully stolen'} end
    if redis.call('SISMEMBER', thievesKey, stealerId) == 1 then return {err = 'Already stolen by you'} end

    -- 更新
    land.stolenCount = (land.stolenCount or 0) + 1
    saveLands(victimKey, lands)

    redis.call('SADD', thievesKey, stealerId)
    redis.call('EXPIRE', thievesKey, 172800) 
    redis.call('HINCRBYFLOAT', stealerKey, 'gold', goldGain)
    redis.call('INCRBY', dailyStealKey, goldGain)
    redis.call('EXPIRE', dailyStealKey, 172800)

    ${SYNC_LOGIC}
    
    local victimAction = 'STOLEN'
    local victimRealId = string.match(victimKey, "game:player:(.+)")
    if victimRealId then
        redis.call('XADD', streamKey, '*', 'playerId', victimRealId, 'action', victimAction, 'ts', now)
    end
    
    return {land.stolenCount}
  `,

  // ==========================================
  // 4. 照料 (Care)
  // KEYS: [ownerKey, operatorKey, streamKey, dailyExpKey]
  // ARGS: [pos, field, gain, maxDaily]
  // ==========================================
  CARE: `
    ${XP_TABLE_LUA}
    local ownerKey = KEYS[1]
    local operatorKey = KEYS[2] -- 可能是同一个人
    local streamKey = KEYS[3]
    local dailyExpKey = KEYS[4]
    
    local position = tonumber(ARGV[1])
    local typeField = ARGV[2]
    local gainVal = tonumber(ARGV[3])
    local maxDailyExp = tonumber(ARGV[4])
    
    local actionName = 'CARE'
    local playerKey = operatorKey -- 用于计算XP的key

    local targetKey = ownerKey
    ${GET_LANDS_LOGIC}
    local land = getLandByPos(position)
    if not land then return {err = 'Land not found'} end

    -- 检查是否需要照料
    if land[typeField] ~= true then return {err = 'No need to care'} end

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

    land[typeField] = false
    saveLands(ownerKey, lands)
    
    local ownerId = string.match(ownerKey, "game:player:(.+)")
    local operatorId = string.match(operatorKey, "game:player:(.+)")
    
    if ownerId and ownerId ~= operatorId then
       redis.call('XADD', streamKey, '*', 'playerId', ownerId, 'action', 'HELPED', 'ts', ARGV[5] or '0')
    end

    return {actualExpGain, tostring(isLevelUp)}
  `,

  // ==========================================
  // 5. 铲除 (Shovel)
  // KEYS: [ownerKey, operatorKey, streamKey]
  // ARGS: [pos, gain, isOwner]
  // ==========================================
  SHOVEL: `
    ${XP_TABLE_LUA}
    local ownerKey = KEYS[1]
    local operatorKey = KEYS[2]
    local streamKey = KEYS[3]
    
    local position = tonumber(ARGV[1])
    local expGain = tonumber(ARGV[2])
    local isOwner = ARGV[3] == 'true'
    
    local actionName = 'SHOVEL'
    local playerKey = operatorKey

    local targetKey = ownerKey
    ${GET_LANDS_LOGIC}
    local land = getLandByPos(position)
    if not land then return {err = 'Land not found'} end

    local status = land.status
    if status == 'empty' then return {err = 'Land is already empty'} end
    if not isOwner and status ~= 'withered' then return {err = 'Cannot shovel others planted crops'} end

    land.status = 'empty'
    land.cropType = ''
    land.matureAt = 0
    land.plantedAt = 0
    land.remainingHarvests = 0
    land.stolenCount = 0
    land.hasWeeds = false
    land.hasPests = false
    land.needsWater = false

    saveLands(ownerKey, lands)
    
    ${XP_LOGIC}
    
    local realPid = string.match(ownerKey, "game:player:(.+)")
    local thievesKey = "game:land:" .. realPid .. ":" .. position .. ":thieves"
    redis.call('DEL', thievesKey)

    ${SYNC_LOGIC}
    return {'OK', tostring(isLevelUp)}
  `,

  FERTILIZE: `
    local playerKey = KEYS[1]
    local streamKey = KEYS[2]
    
    local position = tonumber(ARGV[1])
    local price = tonumber(ARGV[2])
    local reduceTime = tonumber(ARGV[3]) * 1000
    local now = tonumber(ARGV[4])
    
    local actionName = 'FERTILIZE'

    local gold = tonumber(redis.call('HGET', playerKey, 'gold') or '0')
    if gold < price then return {err = 'Not enough gold'} end

    local targetKey = playerKey
    ${GET_LANDS_LOGIC}
    local land = getLandByPos(position)
    if not land then return {err = 'Land not found'} end

    if land.status ~= 'planted' then return {err = 'No crop'} end
    local matureAt = tonumber(land.matureAt or 0)
    if matureAt <= now then return {err = 'Already mature'} end

    redis.call('HINCRBYFLOAT', playerKey, 'gold', -price)
    local newMatureAt = matureAt - reduceTime
    if newMatureAt < now then newMatureAt = now end

    land.matureAt = newMatureAt
    saveLands(playerKey, lands)

    ${SYNC_LOGIC}
    return {newMatureAt}
  `,

  UPGRADE_LAND: `
    local playerKey = KEYS[1]
    local streamKey = KEYS[2]
    
    local position = tonumber(ARGV[1])
    local cost = tonumber(ARGV[2])
    local targetType = ARGV[3]
    local levelReq = tonumber(ARGV[4])
    
    local actionName = 'UPGRADE'

    local playerInfo = redis.call('HMGET', playerKey, 'gold', 'level')
    local gold = tonumber(playerInfo[1] or '0')
    local level = tonumber(playerInfo[2] or '1')

    if level < levelReq then return {err = 'Player level too low'} end
    if gold < cost then return {err = 'Not enough gold'} end

    local targetKey = playerKey
    ${GET_LANDS_LOGIC}
    local land = getLandByPos(position)
    if not land then return {err = 'Land not found'} end

    redis.call('HINCRBYFLOAT', playerKey, 'gold', -cost)
    land.landType = targetType
    saveLands(playerKey, lands)

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
    
    local targetKey = playerKey
    ${GET_LANDS_LOGIC}
    
    -- 新增地块
    local newLand = {
       id = tostring(newPos),
       position = newPos,
       status = 'empty',
       landType = 'normal',
       remainingHarvests = 0,
       stolenCount = 0,
       hasWeeds = false,
       hasPests = false,
       needsWater = false
    }
    table.insert(lands, newLand)
    saveLands(playerKey, lands)
    
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
    local dogId = ARGV[5] 
    
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

    if isFeed then
        redis.call('HMSET', playerKey, 'hasDog', 'true', 'dogActiveUntil', newExpire)
    else
        redis.call('HMSET', playerKey, 'hasDog', 'true', 'dogActiveUntil', newExpire, 'dogId', dogId)
    end
    
    ${SYNC_LOGIC}
    return {newExpire}
  `,

  TRIGGER_EVENTS: `
    local playerKey = KEYS[1]
    local streamKey = KEYS[2]
    
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

    local targetKey = playerKey
    ${GET_LANDS_LOGIC}

    local affected = {}
    local anyChange = false

    for i, land in ipairs(lands) do
      local status = land.status
      local matureAt = tonumber(land.matureAt or 0)
      local plantedAt = tonumber(land.plantedAt or 0)

      if status == 'planted' then
        local changed = false
        if now >= matureAt then
            land.status = 'harvestable'
            changed = true
        else
            local totalDuration = matureAt - plantedAt
            local passed = now - plantedAt
            local isProtected = false
            if totalDuration > 0 and (passed / totalDuration) < 0.2 then isProtected = true end

            if not isProtected then
                if land.hasWeeds ~= true and probWeed > 0 and math.random(1, 100) <= probWeed then land.hasWeeds = true; changed = true end
                if land.hasPests ~= true and probPest > 0 and math.random(1, 100) <= probPest then land.hasPests = true; changed = true end
                if land.needsWater ~= true and probWater > 0 and math.random(1, 100) <= probWater then land.needsWater = true; changed = true end
            end
        end

        if changed then
          table.insert(affected, land.position)
          anyChange = true
        end
      end
    end

    if anyChange then
        saveLands(playerKey, lands)
        ${SYNC_LOGIC}
    end

    return affected
  `
};