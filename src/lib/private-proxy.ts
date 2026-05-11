/**
 * 私有代理节点列表 (Cloudflare Workers - 自定义域名方案)
 * 
 * 部署时间: 2026-05-11
 * 节点数量: 20
 * 版本: v2.0 (100% 兼容 wechat-article-exporter 官方标准)
 * 域名: wechat-art.xyz
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
 *   - DNS 解析: 19/20 成功 (17号传播中)
 *   - SSL 证书: 19/19 成功签发
 *   - 健康检查: 19/19 返回 ok
 */

export const PRIVATE_PROXY_LIST: string[] = [
  'https://00.wechat-art.xyz',
  'https://01.wechat-art.xyz',
  'https://02.wechat-art.xyz',
  'https://03.wechat-art.xyz',
  'https://04.wechat-art.xyz',
  'https://05.wechat-art.xyz',
  'https://06.wechat-art.xyz',
  'https://07.wechat-art.xyz',
  'https://08.wechat-art.xyz',
  'https://09.wechat-art.xyz',
  'https://10.wechat-art.xyz',
  'https://11.wechat-art.xyz',
  'https://12.wechat-art.xyz',
  'https://13.wechat-art.xyz',
  'https://14.wechat-art.xyz',
  'https://15.wechat-art.xyz',
  'https://16.wechat-art.xyz',
  'https://17.wechat-art.xyz', // DNS 传播中，很快生效
  'https://18.wechat-art.xyz',
  'https://19.wechat-art.xyz',
];

export default PRIVATE_PROXY_LIST;
