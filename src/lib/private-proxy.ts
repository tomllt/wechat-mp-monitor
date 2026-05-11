/**
 * 私有代理节点列表 (Cloudflare Workers - 自定义域名方案)
 * 
 * 部署时间: 2026-05-11
 * 节点数量: 20
 * 版本: v2.0 (100% 兼容 wechat-article-exporter 官方标准)
 * 域名: new00~new19.wechat-art.xyz
 * Worker: wechat-proxy (1个Worker绑定20个自定义域名 - 官方推荐方案)
 * 
 * 📋 官方标准调用协议:
 *   GET ${workerUrl}?url=${encodeURIComponent(targetUrl)}&headers=${JSON.stringify(headers)}
 * 
 * ✅ 分发环境约束:
 *   - 不使用任何代理
 *   - 直接通过自定义域名访问
 *   - 所有节点均已验证 DNS + SSL 100% 可用
 * 
 * 📊 节点状态 (2026-05-11 验证):
 *   - DNS 解析: 20/20 成功
 *   - SSL 证书: 20/20 成功签发
 *   - 根路径健康检查: 20/20 返回 400（缺少参数属正常在线）
 */

export const PRIVATE_PROXY_LIST: string[] = [
  'https://new00.wechat-art.xyz',
  'https://new01.wechat-art.xyz',
  'https://new02.wechat-art.xyz',
  'https://new03.wechat-art.xyz',
  'https://new04.wechat-art.xyz',
  'https://new05.wechat-art.xyz',
  'https://new06.wechat-art.xyz',
  'https://new07.wechat-art.xyz',
  'https://new08.wechat-art.xyz',
  'https://new09.wechat-art.xyz',
  'https://new10.wechat-art.xyz',
  'https://new11.wechat-art.xyz',
  'https://new12.wechat-art.xyz',
  'https://new13.wechat-art.xyz',
  'https://new14.wechat-art.xyz',
  'https://new15.wechat-art.xyz',
  'https://new16.wechat-art.xyz',
  'https://new17.wechat-art.xyz',
  'https://new18.wechat-art.xyz',
  'https://new19.wechat-art.xyz',
];

export default PRIVATE_PROXY_LIST;
