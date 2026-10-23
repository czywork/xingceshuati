/**
 * 前端入口：注册路由、导航高亮、头部统计。
 * 全部为零依赖原生实现，页面通过 hash 路由切换。
 */
import { h, clear, qs, qsa, appendAll } from './dom.js';
import { defineRoutes, setFallback, startRouter } from './router.js';
import { store } from './store.js';
import { getMeta } from './meta.js';
import { renderSetup } from './pages/setup.js';
import { renderQuiz } from './pages/quiz.js';
import { renderResult } from './pages/result.js';
import { renderLibrary } from './pages/library.js';

// ---- 路由表 ----
defineRoutes({
  setup: renderSetup,
  quiz: renderQuiz,
  result: renderResult,
  library: renderLibrary,
});
setFallback('setup');

// ---- 导航高亮 ----
function updateNav(name) {
  for (const a of qsa('.nav-link')) {
    a.classList.toggle('active', a.dataset.route === name);
  }
}
document.addEventListener('route:change', (e) => updateNav(e.detail.name));

// ---- 头部统计 ----
let bankTotal = null;
function updateHeaderStats() {
  const el = qs('#header-stats');
  if (!el) return;
  clear(el);
  const mk = (label, value) => h('span', {}, `${label} `, h('b', { text: String(value) }));
  appendAll(
    el,
    bankTotal != null ? mk('题库', bankTotal) : null,
    mk('错题', store.getWrongBook().length),
    mk('收藏', store.getFavorites().length)
  );
}
store.subscribe(updateHeaderStats);

// ---- 启动 ----
updateHeaderStats();
startRouter(qs('#outlet'));

getMeta()
  .then((meta) => {
    bankTotal = meta.totalUniqueQuestions;
    updateHeaderStats();
  })
  .catch(() => {
    /* 元数据加载失败时头部仅少一项统计，不影响使用 */
  });

// ---- 主题切换：日间「纸墨」 / 夜间「夜读」----
const THEME_KEY = 'xingce-theme';
const rootEl = document.documentElement;
const themeBtn = qs('#theme-toggle');

function currentTheme() {
  return rootEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, { persist = true } = {}) {
  if (theme === 'dark') rootEl.setAttribute('data-theme', 'dark');
  else rootEl.removeAttribute('data-theme');

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 隐私模式下写入失败，忽略即可 */
    }
  }

  if (themeBtn) {
    const next = theme === 'dark' ? '日间' : '夜间';
    themeBtn.title = `切换到${next}模式`;
    themeBtn.setAttribute('aria-label', `切换到${next}模式`);
    themeBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
}

if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
  applyTheme(currentTheme(), { persist: false }); // 首屏只同步按钮文案，不重复写存储
}
