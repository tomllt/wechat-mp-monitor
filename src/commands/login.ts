import type { Command } from 'commander';
import { performLogin } from '../lib/wechat/auth.js';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('二维码登录微信公众号后台')
    .option('--save-png <path>', '保存二维码 PNG')
    .option('--timeout <seconds>', '扫码超时秒数', '180')
    .action(async (options: { savePng?: string; timeout: string }) => {
      const result = await performLogin({
        timeoutSeconds: Number(options.timeout),
        savePngPath: options.savePng,
      });
      console.log(
        JSON.stringify(
          {
            nickname: result.account.nickname,
            avatar: result.account.avatar,
            qrCodePath: result.qrCodePath,
            expires: result.account.expires,
          },
          null,
          2
        )
      );
    });
}
