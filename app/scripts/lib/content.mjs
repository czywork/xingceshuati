/**
 * 内容处理工具：图片路径重写、HTML/纯文本识别与规范化。
 * 原始数据为本地可信导出，HTML 片段仅做图片路径重写，不引入第三方消毒库（零依赖）。
 */

/** md 中图片相对路径前缀（相对各模块目录），如 ../90-图片/公式图/x.png */
const IMG_SRC_RE = /(?:\.\.\/)?90-图片\//g;

/** 重写图片 src，使其指向前端可访问的 /img/ 路径 */
export function rewriteImgPaths(html) {
  if (!html) return html;
  return html.replace(IMG_SRC_RE, '/img/');
}

/** 提取 HTML 中所有图片 URL（重写后） */
export function collectImages(html) {
  if (!html) return [];
  const urls = [];
  const re = /src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

/** 视为 HTML 的标签白名单（出现即按 HTML 处理） */
const HTML_TAG_RE =
  /<(img|p|br|sub|sup|table|thead|tbody|tr|td|th|div|span|b|i|u|strong|em|ul|ol|li|font|center|h[1-6])\b/i;

/** 判断文本是否包含 HTML 结构 */
export function looksLikeHtml(text) {
  return HTML_TAG_RE.test(text);
}

/** 转义纯文本中的 HTML 实体 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 将原始内容（可能多行、可能含 HTML）规范化为可直接 innerHTML 渲染的字符串。
 * - 含 HTML 标签：仅重写图片路径，保留原结构。
 * - 纯文本：转义实体后将换行转为 <br>。
 * @param {string|string[]} raw 原始文本或按行数组
 */
export function normalizeContent(raw) {
  if (raw == null) return '';
  const text = (Array.isArray(raw) ? raw.join('\n') : String(raw)).trim();
  if (!text) return '';
  if (looksLikeHtml(text)) return rewriteImgPaths(text);
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

/** 去除选项尾部的正确标记（全角空格 + ✅） */
export function stripAnswerMarker(content) {
  const marked = /✅\s*$/.test(content);
  const clean = content.replace(/[\s\u3000]*✅\s*$/, '').trimEnd();
  return { marked, clean };
}
