/**
 * 静态文件服务（零依赖）。
 *  - /img/*  → 映射到 真题数据/90-图片/*（直接服务原始图片，不复制 256MB）
 *  - 其余    → 映射到前端目录 web/
 * 含路径穿越防护；前端为 hash 路由，无需 SPA 回退。
 */
import fs from 'node:fs';
import path from 'node:path';
import { MIME, sendError } from './http.mjs';

const IMG_PREFIX = '/img/';

/**
 * 创建静态文件处理器。
 * @param {{ webRoot: string, imgSource: string }} opts
 */
export function createStaticHandler({ webRoot, imgSource }) {
  const roots = {
    img: path.resolve(imgSource),
    web: path.resolve(webRoot),
  };

  return function serveStatic(req, res, pathname) {
    let root;
    let rel;
    if (pathname.startsWith(IMG_PREFIX)) {
      root = roots.img;
      rel = pathname.slice(IMG_PREFIX.length);
    } else {
      root = roots.web;
      rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    }

    let target;
    try {
      target = path.resolve(root, decodeURIComponent(rel));
    } catch {
      sendError(res, 400, '非法路径');
      return;
    }

    // 路径穿越防护：解析后的路径必须仍在对应根目录内
    if (target !== root && !target.startsWith(root + path.sep)) {
      sendError(res, 403, '禁止访问');
      return;
    }

    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        sendError(res, 404, '资源不存在');
        return;
      }
      const ext = path.extname(target).toLowerCase();
      const isHtml = ext === '.html';
      const isImg = pathname.startsWith(IMG_PREFIX);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        // 图片与静态资源可长期缓存；HTML 不缓存便于更新
        'Cache-Control': isHtml ? 'no-cache' : isImg ? 'public, max-age=604800' : 'public, max-age=3600',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(target).pipe(res);
    });
  };
}
