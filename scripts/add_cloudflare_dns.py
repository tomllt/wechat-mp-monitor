#!/usr/bin/env python3
"""
在 Cloudflare DNS 中批量添加 20 条 CNAME 记录
对应 00.ontonexus.cn ~ 19.ontonexus.cn
"""

import requests
import os

# Cloudflare 凭证
CLOUDFLARE_API_TOKEN = "YtLqL9x23x8bKZ0fQkVLx5x3W2dM7pR2sT9vN0xQ"
CLOUDFLARE_ZONE_ID = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
DOMAIN = "ontonexus.cn"

HEADERS = {
    "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    "Content-Type": "application/json"
}

def get_existing_records():
    """获取现有 DNS 记录"""
    url = f"https://api.cloudflare.com/client/v4/zones/{CLOUDFLARE_ZONE_ID}/dns_records?per_page=100"
    response = requests.get(url, headers=HEADERS)
    if response.status_code == 200:
        records = {}
        for record in response.json()['result']:
            records[record['name']] = record['id']
        return records
    else:
        print(f"❌ 获取记录失败: {response.status_code}")
        print(response.text)
        return {}

def add_cname_record(name, target):
    """添加 CNAME 记录"""
    url = f"https://api.cloudflare.com/client/v4/zones/{CLOUDFLARE_ZONE_ID}/dns_records"
    data = {
        "type": "CNAME",
        "name": name,
        "content": target,
        "ttl": 1,  # 自动
        "proxied": True  # 使用 Cloudflare 代理
    }
    response = requests.post(url, headers=HEADERS, json=data)
    return response.status_code == 200, response.json()

def main():
    print("🔍 获取现有 DNS 记录...")
    existing = get_existing_records()
    print(f"   已有 {len(existing)} 条记录")
    
    success_count = 0
    skip_count = 0
    
    print(f"\n📝 添加 20 条 CNAME 记录...")
    for i in range(20):
        name = f"{i:02d}.{DOMAIN}"
        target = f"mp-proxy-{i:02d}.myproxy3d45da21.workers.dev"
        
        if name in existing:
            print(f"   ⏭️  已存在: {name}")
            skip_count += 1
            continue
        
        success, result = add_cname_record(name, target)
        if success:
            print(f"   ✅ 添加成功: {name} -> {target}")
            success_count += 1
        else:
            print(f"   ❌ 添加失败: {name}")
            print(f"      错误: {result.get('errors')}")
    
    print(f"\n🎉 完成! 新增 {success_count} 条, 跳过 {skip_count} 条")
    print(f"\n💡 现在国际 DNS 也能正确解析 00-19.ontonexus.cn 了!")
    print(f"💡 DNS 缓存更新需要 1-5 分钟")

if __name__ == "__main__":
    main()
