/**
 * wechat-article-exporter 标准公共代理节点
 * 所有节点均使用自定义域名，规避 DNS 污染问题
 * 每个域名提供 00-15 共 16 个子域名，总计 96 个公共代理节点
 */

export const PUBLIC_PROXY_DOMAINS = [
  'worker-proxy.asia',
  'net-proxy.asia',
  '1235566.space',
  'worker-proxy.shop',
  'worker-proxys.cyou',
  'worker-proxy.cyou',
];

// 生成从 00. 到 15. 的 16 个子域名
function getDomainProxyList(domain: string): string[] {
  const list: string[] = [];
  for (let i = 0; i < 16; i++) {
    list.push(`https://${('0' + i).slice(-2)}.${domain}`);
  }
  return list;
}

// 生成全部公共代理列表
export const PUBLIC_PROXY_LIST: string[] = PUBLIC_PROXY_DOMAINS.flatMap(
  domain => getDomainProxyList(domain)
);

export default PUBLIC_PROXY_LIST;
