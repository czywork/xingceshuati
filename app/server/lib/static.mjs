/**
 * 静态文件服务（零依赖）。
 *  - /img/*  → 映射到 真题数据/90-图片/*（直接服务原始图片，不复制 256MB）
 *  - 其余    → 映射到前端目录 web/
 * 含路径穿越防护；前端为 hash 路由，无需 SPA 回退。
 *
 * 缓存策略：
 *  - 图片/字体等二进制资源内容不变 → 长期强缓存（max-age=7 天）
 *  - html/css/js/json 等文本资源   → 协商缓存（no-cache + ETag/Last-Modified）
 *    改动后普通刷新即生效；命中则回 304，不重复传输正文。
 */
import fs from 'node:fs';
import path from 'node:path';
import { MIME, sendError } from './http.mjs';

const IMG_PREFIX = '/img/';

/** 内容视为不变的扩展名，可长期强缓存 */
const IMMUTABLE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf',
]);
/** 强缓存时长：7 天 */
const IMMUTABLE_MAX_AGE = 604800;

/** 由文件大小 + 修改时间生成弱 ETag（零依赖，够用） */
function makeEtag(stat) {
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

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
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      const immutable = pathname.startsWith(IMG_PREFIX) || IMMUTABLE_EXT.has(ext);

      if (immutable) {
        headers['Cache-Control'] = `public, max-age=${IMMUTABLE_MAX_AGE}`;
      } else {
        const etag = makeEtag(stat);
        headers.ETag = etag;
        headers['Last-Modified'] = stat.mtime.toUTCString();
        // no-cache 表示“可缓存但每次需校验”，不是“不缓存”
        headers['Cache-Control'] = 'no-cache';

        const ifNoneMatch = req.headers['if-none-match'];
        const ifModifiedSince = req.headers['if-modified-since'];
        const notModified = ifNoneMatch
          ? ifNoneMatch === '*' || ifNoneMatch.split(',').some((t) => t.trim() === etag)
          : Boolean(ifModifiedSince) &&
            Math.floor(stat.mtimeMs / 1000) * 1000 <= Date.parse(ifModifiedSince);
        if (notModified) {
          res.writeHead(304, headers); // 304 不带 Content-Length
          res.end();
          return;
        }
      }

      headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(target).pipe(res);
    });
  };
}
