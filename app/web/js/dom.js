/**
 * 极简 DOM 工具（零依赖）。
 * h() 用于声明式创建元素；受信 HTML 内容通过 { html } 属性注入。
 */

/** 将子节点追加到元素（支持数组、字符串、Node、null） */
function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * 创建元素。
 * @param {string} tag 标签名
 * @param {object} attrs 属性：class/html/text/style/on*/dataset/普通属性
 * @param  {...any} children 子节点
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  appendChildren(el, children);
  return el;
}

/** 清空元素内容并返回该元素 */
export function clear(el) {
  el.innerHTML = '';
  return el;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 将受信 HTML 转为纯文本（用于列表摘要），去除标签与多余空白 */
export function htmlToText(html, maxLen = 60) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  return maxLen && text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

/** 格式化秒数为 mm:ss 或 h:mm:ss */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}
