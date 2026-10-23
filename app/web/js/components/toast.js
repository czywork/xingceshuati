/**
 * 轻量 toast 提示（零依赖）。
 */
import { h } from '../dom.js';

function root() {
  return document.getElementById('toast-root');
}

/**
 * 弹出一条提示。
 * @param {string} message 文本
 * @param {'success'|'error'|'warning'|''} type 类型
 * @param {number} duration 毫秒
 */
export function toast(message, type = '', duration = 2400) {
  const el = h('div', { class: `toast ${type}`.trim(), text: message });
  root().append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/** 全屏加载遮罩，返回关闭函数 */
export function showLoading(text = '加载中…') {
  const mask = h('div', { class: 'loading-mask' },
    h('div', { class: 'text-center' },
      h('div', { class: 'spinner' }),
      h('div', { class: 'muted', text, style: { marginTop: '8px' } })
    )
  );
  document.body.append(mask);
  return () => mask.remove();
}
