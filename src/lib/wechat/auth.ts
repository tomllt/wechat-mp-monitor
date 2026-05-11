import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  expireActiveAuthSession,
  getActiveAuthSession,
  replaceActiveAuthSession,
  touchAuthSessionValidation,
} from '../storage/db.js';
import type { ActiveAuthSession, LoginAccount, ScanLoginResult, StoredCookie } from '../types.js';
import { qrCodeDir } from '../paths.js';
import { createLocalAuthKey, randomId, sleep } from '../utils.js';
import { logInfo, logWarn } from '../logger.js';
import { wechatRequest, mergeCookies, serializeCookies } from './http.js';

export type QrImageFormat = 'png' | 'jpg' | 'unknown';

export type ScanStatus =
  | 'pending'
  | 'confirmed'
  | 'scanned'
  | 'expired'
  | 'no-email'
  | 'unavailable'
  | 'unknown';

export function mapScanStatus(status: number): ScanStatus {
  switch (status) {
    case 0:
      return 'pending';
    case 1:
      return 'confirmed';
    case 2:
    case 3:
      return 'expired';
    case 4:
    case 6:
      return 'scanned';
    case 5:
      return 'no-email';
    default:
      return 'unknown';
  }
}

export async function startLoginSession(sessionId = `${Date.now()}${Math.floor(Math.random() * 100)}`): Promise<{
  sessionId: string;
  cookies: StoredCookie[];
}> {
  const response = await wechatRequest<{ base_resp: { ret: number; err_msg: string } }>({
    method: 'POST',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/bizlogin',
    query: {
      action: 'startlogin',
    },
    body: {
      userlang: 'zh_CN',
      redirect_url: '',
      login_type: 3,
      sessionid: sessionId,
      token: '',
      lang: 'zh_CN',
      f: 'json',
      ajax: 1,
    },
  });

  const uuidCookies = response.cookies.filter(cookie => cookie.name === 'uuid');
  if (!uuidCookies.length) {
    throw new Error('未能获取登录 uuid cookie');
  }

  return {
    sessionId,
    cookies: uuidCookies,
  };
}

export async function fetchQrCodeImage(cookies: StoredCookie[]): Promise<Buffer> {
  const response = await wechatRequest<Buffer>({
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/scanloginqrcode',
    query: {
      action: 'getqrcode',
      random: Date.now(),
    },
    cookies,
    responseType: 'buffer',
  });

  return response.data;
}

export function detectQrImageFormat(buffer: Buffer): QrImageFormat {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  return 'unknown';
}

export function saveQrCode(buffer: Buffer, outputPath?: string): string {
  const format = detectQrImageFormat(buffer);
  const ext = format === 'jpg' ? '.jpg' : '.png';
  let filename = outputPath ?? path.join(qrCodeDir, `qrcode-${Date.now()}${ext}`);

  if (!outputPath) {
    filename = path.join(qrCodeDir, `qrcode-${Date.now()}${ext}`);
  } else {
    const parsed = path.parse(outputPath);
    const normalizedExt = parsed.ext.toLowerCase();
    if ((format === 'jpg' && normalizedExt !== '.jpg' && normalizedExt !== '.jpeg') || (format === 'png' && normalizedExt !== '.png')) {
      filename = path.join(parsed.dir, `${parsed.name}${ext}`);
    }
  }

  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, buffer);
  return filename;
}

export function renderQrPngToTerminal(buffer: Buffer): void {
  if (detectQrImageFormat(buffer) !== 'png') {
    logWarn('终端二维码渲染跳过: 微信返回的二维码不是 PNG，已按真实格式保存到文件');
    return;
  }

  let image: PNG;
  try {
    image = PNG.sync.read(buffer);
  } catch (error) {
    logWarn(`终端二维码渲染跳过: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const scaleX = 2;
  const scaleY = 2;
  const rows: string[] = [];

  for (let y = 0; y < image.height; y += scaleY) {
    let line = '';
    for (let x = 0; x < image.width; x += scaleX) {
      const index = (image.width * y + x) << 2;
      const red = image.data[index] ?? 255;
      const green = image.data[index + 1] ?? 255;
      const blue = image.data[index + 2] ?? 255;
      const alpha = image.data[index + 3] ?? 255;
      const luminance = alpha === 0 ? 255 : (red + green + blue) / 3;
      line += luminance < 128 ? '██' : '  ';
    }
    rows.push(line);
  }

  console.log(rows.join('\n'));
}

export async function fetchScanStatus(cookies: StoredCookie[]): Promise<ScanLoginResult> {
  const response = await wechatRequest<ScanLoginResult>({
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/scanloginqrcode',
    query: {
      action: 'ask',
      token: '',
      lang: 'zh_CN',
      f: 'json',
      ajax: 1,
    },
    cookies,
  });
  return response.data;
}

export async function pollScanStatus(
  cookies: StoredCookie[],
  timeoutSeconds: number,
  onProgress?: (status: ScanStatus, payload: ScanLoginResult) => void
): Promise<ScanLoginResult> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const payload = await fetchScanStatus(cookies);
    const status = mapScanStatus(payload.status);
    onProgress?.(status, payload);
    if (status === 'confirmed') {
      return payload;
    }
    if (status === 'expired' || status === 'no-email' || status === 'unavailable') {
      throw new Error(`二维码状态异常: ${status}`);
    }
    await sleep(2000);
  }
  throw new Error('等待扫码超时');
}

export async function finishBizLogin(cookies: StoredCookie[]): Promise<{
  token: string;
  cookies: StoredCookie[];
  expiresAt: string;
}> {
  const response = await wechatRequest<{ redirect_url?: string; base_resp?: { ret: number; err_msg: string } }>({
    method: 'POST',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/bizlogin',
    query: {
      action: 'login',
    },
    cookies,
    body: {
      userlang: 'zh_CN',
      redirect_url: '',
      cookie_forbidden: 0,
      cookie_cleaned: 0,
      plugin_used: 0,
      login_type: 3,
      token: '',
      lang: 'zh_CN',
      f: 'json',
      ajax: 1,
    },
  });

  if (!response.data.redirect_url) {
    throw new Error(response.data.base_resp?.err_msg || '登录失败');
  }

  const token = new URL(`https://example.com${response.data.redirect_url}`).searchParams.get('token');
  if (!token) {
    throw new Error('登录返回中缺少 token');
  }

  return {
    token,
    cookies: mergeCookies(cookies, response.cookies),
    expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function fetchLoginProfile(token: string, cookies: StoredCookie[]): Promise<LoginAccount> {
  const response = await wechatRequest<string>({
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/home',
    query: {
      t: 'home/index',
      token,
      lang: 'zh_CN',
    },
    cookies,
    responseType: 'text',
  });

  const nicknameMatch = response.data.match(/wx\.cgiData\.nick_name\s*?=\s*?"(?<value>[^"]+)"/);
  const avatarMatch = response.data.match(/wx\.cgiData\.head_img\s*?=\s*?"(?<value>[^"]+)"/);

  return {
    nickname: nicknameMatch?.groups?.value ?? '',
    avatar: avatarMatch?.groups?.value ?? '',
    expires: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function performLogin(options: {
  timeoutSeconds: number;
  savePngPath?: string;
}): Promise<{ account: LoginAccount; qrCodePath: string }> {
  let currentCookies = (await startLoginSession()).cookies;
  const qrBuffer = await fetchQrCodeImage(currentCookies);
  const qrCodePath = saveQrCode(qrBuffer, options.savePngPath);
  renderQrPngToTerminal(qrBuffer);
  logInfo(`二维码已保存到 ${qrCodePath}`);

  await pollScanStatus(currentCookies, options.timeoutSeconds, (status, payload) => {
    if (status === 'scanned') {
      logInfo('扫码成功，等待确认');
      return;
    }
    if (status === 'pending') {
      return;
    }
    logInfo(`扫码状态: ${status}(${payload.status})`);
  });

  const login = await finishBizLogin(currentCookies);
  currentCookies = login.cookies;
  const profile = await fetchLoginProfile(login.token, currentCookies);
  replaceActiveAuthSession({
    authKey: createLocalAuthKey(),
    token: login.token,
    cookieJson: JSON.stringify(currentCookies),
    nickname: profile.nickname,
    avatar: profile.avatar,
    expiresAt: login.expiresAt,
  });
  logInfo(`登录成功: ${profile.nickname}`);
  return {
    account: profile,
    qrCodePath,
  };
}

export function getSessionCookies(session: ActiveAuthSession): StoredCookie[] {
  return JSON.parse(session.cookie_json) as StoredCookie[];
}

export async function validateActiveSession(): Promise<ActiveAuthSession | null> {
  const session = getActiveAuthSession();
  if (!session) {
    return null;
  }

  try {
    const cookies = getSessionCookies(session);
    const profile = await fetchLoginProfile(session.token, cookies);
    if (!profile.nickname) {
      throw new Error('昵称为空');
    }
    touchAuthSessionValidation();
    return session;
  } catch (error) {
    logWarn(`登录态校验失败: ${error instanceof Error ? error.message : String(error)}`);
    expireActiveAuthSession();
    return null;
  }
}

export function printSessionStatus(session: ActiveAuthSession | null): void {
  if (!session) {
    console.log('未登录');
    return;
  }

  console.log(
    JSON.stringify(
      {
        nickname: session.nickname,
        expiresAt: session.expires_at,
        lastValidatedAt: session.last_validated_at,
        cookieCount: getSessionCookies(session).length,
        cookiePreview: serializeCookies(getSessionCookies(session)).slice(0, 120),
      },
      null,
      2
    )
  );
}
