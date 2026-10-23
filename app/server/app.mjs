/**
 * 组装 HTTP 应用（与监听解耦，便于测试）。
 * @param {{ bank: import('./lib/bank.mjs').QuestionBank, webRoot: string, imgSource: string }} deps
 * @returns {import('node:http').Server}
 */
import http from 'node:http';
import { URL } from 'node:url';
import { createRouter } from './lib/router.mjs';
import { registerApi } from './routes/api.mjs';
import { createStaticHandler } from './lib/static.mjs';
import { sendError } from './lib/http.mjs';

export function createApp({ bank, webRoot, imgSource }) {
  const router = createRouter();
  registerApi(router, bank);
  const serveStatic = createStaticHandler({ webRoot, imgSource });

  return http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    } catch {
      sendError(res, 400, '非法请求 URL');
      return;
    }

    try {
      if (pathname.startsWith('/api/')) {
        const handler = router.match(req.method, pathname);
        if (!handler) {
          sendError(res, 404, `未知接口：${req.method} ${pathname}`);
          return;
        }
        await handler(req, res, pathname);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(res, 405, '仅支持 GET/HEAD');
        return;
      }
      serveStatic(req, res, pathname);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[server error]', err);
      if (!res.headersSent) sendError(res, status, err.message || '服务器内部错误');
      else res.end();
    }
  });
}
