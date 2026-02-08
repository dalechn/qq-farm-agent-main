// 社交相关 API

import { Router } from 'express';
import prisma from '../utils/prisma';
import { FollowService } from '../services/FollowService';
import { authenticateApiKey } from '../middleware/auth';
import { redisClient, SOCIAL_KEYS } from '../utils/redis';


const router: Router = Router();

// 关注 (需要 Auth)
router.post('/follow', authenticateApiKey, async (req: any, res) => {
  const { targetId } = req.body;
  try {
    const result = await FollowService.follow(req.playerId, targetId);

    // const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    // const target = await prisma.player.findUnique({ where: { id: targetId }, select: { name: true } });

    // broadcast({
    //   type: 'action',
    //   action: 'FOLLOW',
    //   playerId: req.playerId,
    //   playerName: player?.name,
    //   details: `Followed ${target?.name}${result.isMutual ? ' (Mutual)' : ''}`
    // });


    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 取关 (需要 Auth)
router.post('/unfollow', authenticateApiKey, async (req: any, res) => {
  const { targetId } = req.body;
  try {
    const result = await FollowService.unfollow(req.playerId, targetId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// [修改] 获取关注列表 (需要认证, 支持分页)
router.get('/following', authenticateApiKey, async (req: any, res) => {
  const { userId, page, limit } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId query parameter" });
  }

  try {
    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 20;
    const result = await FollowService.getFollowing(userId as string, p, l);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// [修改] 获取粉丝列表 (需要认证, 支持分页)
router.get('/followers', authenticateApiKey, async (req: any, res) => {
  const { userId, page, limit } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId query parameter" });
  }
  try {
    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 20;
    const result = await FollowService.getFollowers(userId as string, p, l);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// [新增] 获取社交统计 (不需要认证)
router.get('/stats', async (req: any, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId query parameter" });
  }

  try {
    // Get counts from Redis ZSETs and player info in parallel
    const followingKey = `${SOCIAL_KEYS.FOLLOWING}${userId}`;
    const followersKey = `${SOCIAL_KEYS.FOLLOWERS}${userId}`;

    const [followingCount, followersCount, player] = await Promise.all([
      redisClient.zCard(followingKey),
      redisClient.zCard(followersKey),
      prisma.player.findUnique({
        where: { id: userId as string },
        select: {
          name: true,
          avatar: true,
          twitter: true,
          createdAt: true
        }
      })
    ]);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    res.json({
      followers: followersCount,
      following: followingCount,
      avatar: player.avatar || `https://robohash.org/${encodeURIComponent(player.name)}.png?set=set1`,
      twitter: player.twitter || '',
      createdAt: player.createdAt.toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /friends                  -> 获取自己的好友 (全量安全模式)
// GET /friends?page=1&limit=20  -> 获取自己的好友 (分页)
// GET /friends?userId=xxx       -> 获取 xxx 的好友 (全量安全模式)
router.get('/friends', authenticateApiKey, async (req: any, res) => {
  try {
    // 1. 确定目标用户
    // 如果 URL 参数带了 userId 就查那个人，没带就查当前登录用户 (req.playerId)
    const targetUserId = (req.query.userId as string) || req.playerId;

    // 2. 解析分页参数
    // 如果不传，FollowService 会自动处理为"全量安全模式" (limit=1000)
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    // 3. 调用 Service
    const result = await FollowService.getFriends(targetUserId, page, limit);

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 访问好友农场
// router.get('/friends/:friendId/farm', authenticateApiKey, async (req: any, res) => {
//   try {
//     const farm = await FollowService.getFriendFarm(req.playerId, req.params.friendId);
//     res.json(farm);
//   } catch (error: any) {
//     res.status(400).json({ error: error.message });
//   }
// });

// // 偷菜历史
// router.get('/steal/history', authenticateApiKey, async (req: any, res) => {
//   const type = (req.query.type as 'stolen' | 'stealer') || 'stealer';
//   try {
//     const history = await FollowService.getStealHistory(req.playerId, type);
//     res.json(history);
//   } catch (error: any) {
//     res.status(400).json({ error: error.message });
//   }
// });

export default router;
