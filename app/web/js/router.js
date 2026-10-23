/**
 * 极简 hash 路由（零依赖）。
 * 路由处理函数返回 HTMLElement 或 { el, cleanup }；切换时自动调用上一个 cleanup。
 */
import { clear, h } from './dom.js';

const routes = new Map();
let outletEl = null;
let currentCleanup = null;
let currentName = null;
let notFoundRoute = null;

/** 注册路由表：{ name: handler } */
export function defineRoutes(map) {
  for (const [name, handler] of Object.entries(map)) routes.set(name, handler);
}

/** 设置未匹配时的回退路由名 */
export function setFallback(name) {
  notFoundRoute = name;
}

export function navigate(path, { replace = false } = {}) {
  const target = '#/' + String(path).replace(/^\/+/, '');
  if (replace) location.replace(target);
  else location.hash = target;
}

export function currentRoute() {
  return currentName;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = raw.split('/');
  return { name: name || notFoundRoute || 'setup', params: rest };
}

/** 启动路由并渲染到 outlet */
export function startRouter(outlet) {
  outletEl = outlet;
  window.addEventListener('hashchange', handle);
  handle();
}

async function handle() {
  const { name, params } = parseHash();
  const route = routes.get(name) || routes.get(notFoundRoute || 'setup');

  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch (err) {
      console.warn('路由清理出错：', err);
    }
  }
  currentCleanup = null;
  currentName = name;
  document.dispatchEvent(new CustomEvent('route:change', { detail: { name, params } }));

  clear(outletEl);
  if (!route) {
    outletEl.append(h('div', { class: 'page-error', text: '页面不存在' }));
    return;
  }

  try {
    const result = await route({ params, navigate });
    if (!result) return;
    if (result instanceof Node) {
      outletEl.append(result);
    } else {
      if (result.el) outletEl.append(result.el);
      currentCleanup = typeof result.cleanup === 'function' ? result.cleanup : null;
    }
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error('[route error]', err);
    outletEl.append(
      h('div', { class: 'page-error' },
        h('h2', { text: '出错了' }),
        h('p', { text: err?.message || String(err) })
      )
    );
  }
}
