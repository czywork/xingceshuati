/**
 * 错题本 / 收藏 / 历史记录页。数据均持久化于 localStorage（store）。
 * 支持：单题练习、内联查看答案解析、移除、重练全部错题、清空。
 */
import { h, clear, formatDuration } from '../dom.js';
import { api } from '../api.js';
import { store, session } from '../store.js';
import { navigate } from '../router.js';
import { getMeta, moduleName } from '../meta.js';
import { toast, showLoading } from '../components/toast.js';
import {
  metaBadges,
  materialBlock,
  stemBlock,
  optionsBlock,
  analysisBlock,
} from '../components/questionView.js';

/** 以一批 qid 启动一次练习 */
async function startPractice(qids, source) {
  if (!qids.length) { toast('没有可练习的题目', 'warning'); return; }
  const close = showLoading('正在准备题目…');
  try {
    const res = await api.fetchQuestions(qids, 'quiz');
    if (!res.questions.length) { toast('题目不可用或已下架', 'error'); return; }
    session.quiz = {
      questions: res.questions, answers: {}, index: 0, timeLimit: 0,
      startedAt: Date.now(), source, filter: {}, submitted: false,
    };
    navigate('quiz');
  } catch (err) {
    toast(err.message || '加载题目失败', 'error');
  } finally {
    close();
  }
}

/** 构建只读回顾块（标出正确答案 + 解析），用于内联展开 */
function buildReview(q) {
  return h('div', { class: 'card review-item mt-8' },
    metaBadges(q),
    materialBlock(q),
    stemBlock(q),
    optionsBlock(q, { mode: 'review', selected: [], answer: q.answer || [] }),
    h('div', { class: 'answer-line' },
      h('span', { class: 'ans-item' }, '正确答案：',
        h('b', { class: 'right', text: (q.answer || []).join(' ') || '—' }))
    ),
    analysisBlock(q) || h('div', { class: 'analysis-box' },
      h('div', { class: 'analysis-label', text: '💡 官方解析' }),
      h('div', { class: 'muted', text: '本题暂无解析' }))
  );
}

function metaBadgesFromEntry(entry) {
  const items = [];
  if (entry.moduleName) items.push(h('span', { class: 'badge badge-primary', text: entry.moduleName }));
  if (entry.kp) items.push(h('span', { class: 'badge', text: entry.kp }));
  if (entry.year) items.push(h('span', { class: 'badge', text: `${entry.year}年` }));
  if (entry.region) items.push(h('span', { class: 'badge', text: entry.region }));
  return h('div', { class: 'lib-meta' }, items);
}

export async function renderLibrary() {
  await getMeta().catch(() => null); // 确保 moduleName 可用
  let tab = 'wrong';

  const tabsEl = h('div', { class: 'tabs' });
  const toolbarEl = h('div', { class: 'lib-toolbar' });
  const listEl = h('div', { class: 'lib-list' });

  /** 生成一个可展开解析的条目行 */
  function entryRow(entry, kind) {
    const expandSlot = h('div');
    let expanded = false;

    const reviewBtn = h('button', { class: 'btn btn-sm', text: '解析', onClick: async () => {
      if (expanded) {
        clear(expandSlot); expanded = false; reviewBtn.textContent = '解析';
        return;
      }
      reviewBtn.disabled = true; reviewBtn.textContent = '加载中…';
      try {
        const res = await api.fetchQuestions([entry.qid], 'review');
        const q = res.questions[0];
        if (!q) { toast('题目不存在或已下架', 'error'); return; }
        clear(expandSlot);
        expandSlot.append(buildReview(q));
        expanded = true; reviewBtn.textContent = '收起';
      } catch (err) {
        toast(err.message || '加载失败', 'error');
      } finally {
        reviewBtn.disabled = false;
        if (!expanded) reviewBtn.textContent = '解析';
      }
    }});

    const removeBtn = h('button', {
      class: 'btn btn-sm btn-ghost',
      text: kind === 'wrong' ? '移除' : '取消收藏',
      onClick: () => {
        if (kind === 'wrong') store.removeWrong([entry.qid]);
        else store.toggleFavorite({ qid: entry.qid });
        render();
      },
    });

    const row = h('div', { class: 'lib-item' },
      h('div', { class: 'lib-main' },
        h('div', { class: 'lib-snippet', text: entry.stemText || '（无题干摘要）' }),
        h('div', {},
          metaBadgesFromEntry(entry),
          kind === 'wrong' && entry.wrongCount > 1
            ? h('span', { class: 'wrong-count', text: `累计错 ${entry.wrongCount} 次` })
            : null
        )
      ),
      h('div', { class: 'lib-actions' },
        h('button', { class: 'btn btn-sm btn-primary', text: '练习', onClick: () => startPractice([entry.qid], kind === 'wrong' ? 'wrong' : 'fav') }),
        reviewBtn,
        removeBtn
      )
    );
    return h('div', {}, row, expandSlot);
  }

  function renderWrong() {
    const items = store.getWrongBook();
    clear(toolbarEl);
    toolbarEl.append(
      h('span', { class: 'muted', text: `共 ${items.length} 道错题` }),
      h('span', { class: 'spacer' }),
      items.length
        ? h('button', { class: 'btn btn-sm btn-primary', text: '重练全部错题', onClick: () => startPractice(items.map((i) => i.qid), 'wrong') })
        : null,
      items.length
        ? h('button', { class: 'btn btn-sm btn-ghost', text: '清空错题本', onClick: () => {
            if (window.confirm('确定清空错题本吗？此操作不可撤销。')) { store.clearWrong(); render(); }
          } })
        : null
    );
    clear(listEl);
    if (!items.length) {
      listEl.append(h('div', { class: 'empty' },
        h('div', { class: 'empty-icon', text: '🎉' }),
        h('div', { text: '错题本是空的，去刷几道题吧' }),
        h('button', { class: 'btn btn-primary mt-16', text: '开始刷题', onClick: () => navigate('setup') })
      ));
      return;
    }
    for (const entry of items) listEl.append(entryRow(entry, 'wrong'));
  }

  function renderFav() {
    const items = store.getFavorites();
    clear(toolbarEl);
    toolbarEl.append(
      h('span', { class: 'muted', text: `共 ${items.length} 道收藏` }),
      h('span', { class: 'spacer' }),
      items.length
        ? h('button', { class: 'btn btn-sm btn-primary', text: '练习全部收藏', onClick: () => startPractice(items.map((i) => i.qid), 'fav') })
        : null,
      items.length
        ? h('button', { class: 'btn btn-sm btn-ghost', text: '清空收藏', onClick: () => {
            if (window.confirm('确定清空收藏吗？此操作不可撤销。')) { store.clearFavorites(); render(); }
          } })
        : null
    );
    clear(listEl);
    if (!items.length) {
      listEl.append(h('div', { class: 'empty' },
        h('div', { class: 'empty-icon', text: '⭐' }),
        h('div', { text: '还没有收藏题目，答题时点击「☆ 收藏」即可加入' })
      ));
      return;
    }
    for (const entry of items) listEl.append(entryRow(entry, 'fav'));
  }

  function renderHistory() {
    const items = store.getHistory();
    clear(toolbarEl);
    toolbarEl.append(
      h('span', { class: 'muted', text: `最近 ${items.length} 次记录` }),
      h('span', { class: 'spacer' }),
      items.length
        ? h('button', { class: 'btn btn-sm btn-ghost', text: '清空历史', onClick: () => {
            if (window.confirm('确定清空历史记录吗？')) { store.clearHistory(); render(); }
          } })
        : null
    );
    clear(listEl);
    if (!items.length) {
      listEl.append(h('div', { class: 'empty' },
        h('div', { class: 'empty-icon', text: '📊' }),
        h('div', { text: '暂无刷题记录' })
      ));
      return;
    }
    for (const it of items) {
      const date = new Date(it.at).toLocaleString('zh-CN', { hour12: false });
      const mods = (it.modules || []).map((c) => moduleName(c)).join('、') || '全部模块';
      listEl.append(
        h('div', { class: 'lib-item' },
          h('div', { class: 'lib-main' },
            h('div', { class: 'lib-snippet', text: `${date} · ${mods}` }),
            h('div', { class: 'lib-meta' },
              h('span', { class: 'badge', text: `共 ${it.total} 题` }),
              h('span', { class: 'badge badge-success', text: `对 ${it.correct}` }),
              h('span', { class: `badge ${it.accuracy >= 60 ? 'badge-primary' : 'badge-danger'}`, text: `${it.accuracy}%` }),
              h('span', { class: 'badge', text: `用时 ${formatDuration(it.timeUsed || 0)}` })
            )
          )
        )
      );
    }
  }

  function renderTabs() {
    clear(tabsEl);
    const defs = [
      ['wrong', `错题本 ${store.getWrongBook().length}`],
      ['fav', `收藏 ${store.getFavorites().length}`],
      ['history', `历史 ${store.getHistory().length}`],
    ];
    for (const [key, label] of defs) {
      tabsEl.append(h('button', {
        class: `tab${tab === key ? ' active' : ''}`,
        text: label,
        onClick: () => { tab = key; render(); },
      }));
    }
  }

  function render() {
    renderTabs();
    if (tab === 'wrong') renderWrong();
    else if (tab === 'fav') renderFav();
    else renderHistory();
  }

  const el = h('div', {},
    h('div', { class: 'page-head' },
      h('h1', { text: '错题本 / 收藏' }),
      h('p', { text: '答错的题目会自动收入错题本；收藏与历史保存在本地浏览器，随时可重练或回看解析。' })
    ),
    tabsEl,
    toolbarEl,
    listEl
  );

  render();
  return { el };
}
