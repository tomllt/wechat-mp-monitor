/**
 * wechat-article-exporter 标准公共代理节点
 * 
 * ⚠️ 重要提示：所有公共代理节点已全部失效！
 * 
 * 失效原因：
 * 1. Cloudflare 检测到异常流量，全面拦截客户端直连请求
 * 2. 所有 96 个公共节点均返回 403 Forbidden（Cloudflare 拦截页面）
 * 3. 公共节点仅限官网 down.mptext.top 使用，私有部署无法使用
 * 
 * 解决方案：
 * 必须配置私有代理服务：
 * - 部署自己的 Cloudflare Worker
 * - 绑定自定义域名
 * - 将私有地址通过 privateServices 传入构造函数
 * 
 * 参考文档：https://docs.mptext.top/get-started/private-proxy.html
 */

// 已清空 - 所有公共代理均不可用
export const PUBLIC_PROXY_DOMAINS: string[] = [];

// 已清空 - 不再提供任何公共代理节点
export const PUBLIC_PROXY_LIST: string[] = [];

export default PUBLIC_PROXY_LIST;
