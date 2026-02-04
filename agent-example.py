#!/usr/bin/env python3
"""
QQ 农场 V2 - Agent 自动化示例
使用 API Key 认证进行游戏操作
"""

import requests
import time
from typing import Optional

class FarmAgent:
    def __init__(self, api_url: str = "http://localhost:3001/api"):
        self.api_url = api_url
        self.api_key: Optional[str] = None
        self.player_id: Optional[str] = None
    
    def create_player(self, name: str) -> dict:
        """创建玩家并获取 API Key"""
        response = requests.post(
            f"{self.api_url}/player",
            json={"name": name}
        )
        player = response.json()
        self.api_key = player["apiKey"]
        self.player_id = player["id"]
        print(f"✅ 创建玩家: {player['name']}")
        print(f"   API Key: {self.api_key}")
        print(f"   初始金币: {player['gold']}")
        return player
    
    def _headers(self) -> dict:
        """获取认证头"""
        return {"X-API-KEY": self.api_key, "Content-Type": "application/json"}
    
    def get_state(self) -> dict:
        """获取当前状态"""
        response = requests.get(f"{self.api_url}/me", headers=self._headers())
        return response.json()
    
    def plant(self, position: int, crop_type: str) -> dict:
        """种植作物"""
        response = requests.post(
            f"{self.api_url}/plant",
            headers=self._headers(),
            json={"position": position, "cropType": crop_type}
        )
        return response.json()
    
    def harvest(self, position: int) -> dict:
        """收获作物"""
        response = requests.post(
            f"{self.api_url}/harvest",
            headers=self._headers(),
            json={"position": position}
        )
        return response.json()
    
    def get_crops(self) -> list:
        """获取作物列表"""
        response = requests.get(f"{self.api_url}/crops")
        return response.json()
    
    def auto_plant_all(self, crop_type: str = "radish"):
        """自动种植所有空地"""
        state = self.get_state()
        planted = 0
        for land in state["lands"]:
            if land["status"] == "empty":
                result = self.plant(land["position"], crop_type)
                if result.get("success"):
                    planted += 1
                    print(f"   种植 {crop_type} 到位置 {land['position']}")
        print(f"✅ 种植完成: {planted} 块土地")
        return planted
    
    def auto_harvest_all(self):
        """自动收获所有成熟作物"""
        state = self.get_state()
        harvested = 0
        total_gold = 0
        for land in state["lands"]:
            if land["status"] == "harvestable":
                result = self.harvest(land["position"])
                if result.get("success"):
                    harvested += 1
                    total_gold += result["reward"]["gold"]
                    print(f"   收获位置 {land['position']}: +{result['reward']['gold']} 金币")
        print(f"✅ 收获完成: {harvested} 块, +{total_gold} 金币")
        return harvested, total_gold
    
    def show_status(self):
        """显示当前状态"""
        state = self.get_state()
        print("\n" + "="*50)
        print(f"📊 {state['name']} 状态")
        print("="*50)
        print(f"💰 金币: {state['gold']}")
        print(f"⭐ 等级: {state['level']} (经验: {state['exp']})")
        
        empty = sum(1 for l in state["lands"] if l["status"] == "empty")
        planted = sum(1 for l in state["lands"] if l["status"] == "planted")
        harvestable = sum(1 for l in state["lands"] if l["status"] == "harvestable")
        print(f"🌾 土地: 空闲 {empty} | 种植中 {planted} | 可收获 {harvestable}")
        print("="*50 + "\n")
    
    def run_cycle(self, crop_type: str = "radish", wait_time: int = 30):
        """运行一个完整的种植-收获周期"""
        print(f"\n🔄 开始种植周期 (作物: {crop_type})")
        
        # 收获成熟作物
        self.auto_harvest_all()
        
        # 种植新作物
        planted = self.auto_plant_all(crop_type)
        
        if planted > 0:
            print(f"\n⏰ 等待作物成熟 ({wait_time} 秒)...")
            time.sleep(wait_time)
            
            # 再次收获
            self.auto_harvest_all()
        
        self.show_status()


def main():
    agent = FarmAgent()
    
    # 创建玩家
    agent.create_player("Python Agent V2")
    
    # 显示作物信息
    print("\n📋 可用作物:")
    crops = agent.get_crops()
    for crop in crops:
        print(f"   {crop['name']:6s} | 价格: {crop['seedPrice']:3d} | 成熟: {crop['matureTime']:3d}秒")
    
    # 显示初始状态
    agent.show_status()
    
    # 运行 3 个周期
    for i in range(3):
        print(f"\n{'='*50}")
        print(f"🎮 第 {i+1}/3 周期")
        print(f"{'='*50}")
        agent.run_cycle("radish", 30)
    
    print("\n🎉 游戏完成!")


if __name__ == "__main__":
    main()
