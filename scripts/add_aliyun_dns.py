#!/usr/bin/env python3
"""
阿里云 DNS 批量添加 CNAME 记录
为 ontonexus.cn 域名添加 20 条 CNAME 记录指向 Cloudflare Worker
"""

import os
import json
from alibabacloud_alidns20150109.client import Client as AlidnsClient
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_alidns20150109 import models as alidns_20150109_models
from alibabacloud_tea_util import models as util_models
from alibabacloud_tea_util.client import Client as UtilClient

DOMAIN = "ontonexus.cn"
WORKER_SUBDOMAIN = "myproxy3d45da21.workers.dev"

def create_client() -> AlidnsClient:
    """创建阿里云 DNS 客户端"""
    config = open_api_models.Config(
        access_key_id=os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID"),
        access_key_secret=os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET")
    )
    config.endpoint = 'alidns.cn-hangzhou.aliyuncs.com'
    return AlidnsClient(config)

def get_domain_records(client: AlidnsClient) -> dict:
    """获取域名的所有解析记录"""
    request = alidns_20150109_models.DescribeDomainRecordsRequest(
        domain_name=DOMAIN,
        page_size=500
    )
    runtime = util_models.RuntimeOptions()
    response = client.describe_domain_records_with_options(request, runtime)
    records = {}
    for record in response.body.domain_records.record:
        records[record.rr] = {
            'type': record.type,
            'value': record.value,
            'record_id': record.record_id
        }
    return records

def add_cname_record(client: AlidnsClient, rr: str, value: str) -> bool:
    """添加 CNAME 记录"""
    request = alidns_20150109_models.AddDomainRecordRequest(
        domain_name=DOMAIN,
        rr=rr,
        type='CNAME',
        value=value,
        ttl=600
    )
    runtime = util_models.RuntimeOptions()
    try:
        response = client.add_domain_record_with_options(request, runtime)
        print(f"✅ 添加成功: {rr}.{DOMAIN} -> {value}")
        return True
    except Exception as e:
        print(f"❌ 添加失败: {rr}.{DOMAIN} -> {value}")
        print(f"   错误: {e}")
        return False

def main():
    client = create_client()
    
    # 获取现有记录
    existing_records = get_domain_records(client)
    print(f"📋 已找到 {len(existing_records)} 条现有记录\n")
    
    # 添加 20 条 CNAME 记录
    success_count = 0
    skip_count = 0
    
    for i in range(20):
        rr = f"{i:02d}"  # 00, 01, 02, ..., 19
        value = f"mp-proxy-{rr}.{WORKER_SUBDOMAIN}"
        
        # 检查记录是否已存在
        if rr in existing_records:
            existing = existing_records[rr]
            if existing['type'] == 'CNAME' and existing['value'] == value:
                print(f"⏭️  记录已存在，跳过: {rr}.{DOMAIN}")
                skip_count += 1
                continue
            else:
                print(f"⚠️  记录类型/值不匹配，跳过: {rr}.{DOMAIN} (现有: {existing['type']} -> {existing['value']})")
                skip_count += 1
                continue
        
        # 添加新记录
        if add_cname_record(client, rr, value):
            success_count += 1
    
    print(f"\n🎉 完成！成功添加 {success_count} 条记录，跳过 {skip_count} 条")
    
    # 输出完整的地址列表
    print("\n📋 您的私有 Worker 地址列表：")
    for i in range(20):
        rr = f"{i:02d}"
        print(f"   https://{rr}.{DOMAIN}")

if __name__ == '__main__':
    main()
