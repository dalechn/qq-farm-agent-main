import requests
import time
import random
import threading

# ================= 配置区域 =================
# API_BASE = "https://frenmap.fun/api"  # 线上环境
API_BASE = "http://localhost:3001/api"  # 本地环境

PLAYERS_COUNT = 10  # 机器人数量
LOOP_COUNT = 100    # 每个机器人行动的回合数
CROP_TYPES = ["radish", "carrot", "corn"] 
# ===========================================

class FarmAgent:
    def __init__(self, name):
        self.name = name
        self.api_key = None
        self.player_id = None
        self.lands = []
        self.gold = 0

    def log(self, message):
        print(f"[{self.name}] {message}")

    def register(self):
        """注册并获取 API Key (Debug 版)"""
        try:
            url = f"{API_BASE}/player"
            # print(f"正在请求: {url}") # 打开此行可调试 URL 是否正确
            res = requests.post(url, json={"name": self.name})
            
            if res.status_code in [200, 201]:
                data = res.json()
                self.player_id = data["id"]
                self.api_key = data.get("apiKey")
                self.gold = data.get("gold", 0)
                self.log(f"注册成功 (ID: {self.player_id[:4]}..)")
                return True
            else:
                # [关键] 打印状态码和详细错误响应
                self.log(f"注册失败 [Status: {res.status_code}]: {res.text}")
                return False
        except Exception as e:
            self.log(f"连接错误: {e}")
            return False

    def follow(self, target_id):
        """关注指定 ID 的玩家"""
        if not self.api_key or target_id == self.player_id: return
        try:
            res = requests.post(
                f"{API_BASE}/follow",
                headers={"X-API-KEY": self.api_key},
                json={"targetId": target_id}
            )
            if res.status_code == 200:
                data = res.json()
                relation = "互相关注(好友)" if data.get('isMutual') else "单向关注"
                # self.log(f"关注了 {target_id[:4]}.. -> {relation}")
        except Exception as e:
            self.log(f"关注失败: {e}")

    def refresh_state(self):
        """刷新自身状态（金币、土地）"""
        if not self.api_key: return
        try:
            res = requests.get(f"{API_BASE}/me", headers={"X-API-KEY": self.api_key})
            if res.status_code == 200:
                data = res.json()
                self.lands = data["lands"]
                self.gold = data["gold"]
        except:
            pass

    def play_turn(self, friends):
        """
        执行一次行动：
        1. 收获
        2. 种植
        3. 偷好友的菜
        """
        if not self.api_key: return

        self.refresh_state()

        # --- 1. 收获 ---
        for land in self.lands:
            if land["status"] == "harvestable":
                res = requests.post(
                    f"{API_BASE}/harvest",
                    headers={"X-API-KEY": self.api_key},
                    json={"position": land["position"]}
                )
                if res.status_code == 200:
                    reward = res.json().get("reward", {})
                    self.log(f"收获! +{reward.get('gold')}G")

        # --- 2. 种植 (保持资金充足) ---
        empty_lands = [l for l in self.lands if l["status"] == "empty"]
        if empty_lands and self.gold >= 20:
            # 随机选一块空地种
            target_land = random.choice(empty_lands)
            # 随机种萝卜(最快)或玉米
            crop = random.choice(CROP_TYPES)
            
            res = requests.post(
                f"{API_BASE}/plant",
                headers={"X-API-KEY": self.api_key},
                json={"position": target_land["position"], "cropType": crop}
            )
            if res.status_code == 200:
                # self.log(f"在 {target_land['position']} 号地种了 {crop}")
                self.gold -= 10 # 简单本地扣费防止连续请求失败

        # --- 3. 偷菜 (只偷传入的好友列表) ---
        if friends:
            # 随机选一个好友
            victim = random.choice(friends)
            
            # 简单策略：随机盲偷一个位置 (0-8)
            # 进阶策略应该是先调用 getFriendFarm 查看有没有成熟的，这里为了压测直接盲偷
            steal_pos = random.randint(0, 8)
            
            try:
                res = requests.post(
                    f"{API_BASE}/steal",
                    headers={"X-API-KEY": self.api_key},
                    json={"victimId": victim.player_id, "position": steal_pos}
                )
                
                if res.status_code == 200:
                    data = res.json()
                    stolen = data.get("stolen", {})
                    self.log(f"😈 成功从 [{victim.name}] 偷到了 {stolen.get('amount')} 个 {stolen.get('cropName')}!")
                elif "Too busy" in res.text:
                    pass # 正常的并发锁竞争
                elif "Nothing to steal" not in res.text and "Already stolen" not in res.text:
                    # 打印一些非预期的错误，如果是 nothing to steal 就不打印了刷屏
                    pass
                    # self.log(f"偷取失败: {res.text}")
            except Exception as e:
                pass

def bot_worker(agent, all_bots):
    """线程工作函数"""
    # 过滤掉自己，只把别人当好友
    my_friends = [b for b in all_bots if b.player_id != agent.player_id]
    
    # 稍微延迟启动，错开并发
    time.sleep(random.random() * 2)
    
    for i in range(LOOP_COUNT):
        agent.play_turn(my_friends)
        # 随机休眠 1-3 秒，模拟真人操作频率
        time.sleep(random.randint(1, 3))

def main():
    print(f"=== 1. 初始化: 创建 {PLAYERS_COUNT} 个 Bot ===")
    bots = []
    for i in range(PLAYERS_COUNT):
        # 使用时间戳防止重名
        name = f"Agent_{i}_{random.randint(100,999)}"
        bot = FarmAgent(name)
        if bot.register():
            bots.append(bot)
    
    print(f"=== 2. 建立关系: 全员互粉 (Social Network) ===")
    # 让每一个 Bot 关注列表里的其他所有 Bot
    for i, bot_a in enumerate(bots):
        for bot_b in bots:
            if bot_a.player_id != bot_b.player_id:
                bot_a.follow(bot_b.player_id)
        if (i+1) % 5 == 0:
            print(f"   已完成 {i+1} 个 Bot 的关注操作...")

    print(f"=== 3. 开始大乱斗: 多线程运行 ===")
    threads = []
    for bot in bots:
        t = threading.Thread(target=bot_worker, args=(bot, bots))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    print("=== 测试结束 ===")

if __name__ == "__main__":
    main()