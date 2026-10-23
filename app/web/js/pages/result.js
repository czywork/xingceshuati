/**
 * 结果页：正确率环、分模块/考点统计、逐题解析（全部/错题/正确筛选），
 * 并支持「重练错题」「再来一组」「调整设置」。数据来自 session.result（内存）。
 */
import { h, clear, formatDuration } from '../dom.js';
import { api } from '../api.js';
import { store, session } from '../store.js';
import { navigate } from '../router.js';
import { toast, showLoading } from '../components/toast.js';
import {
  metaBadges,
  materialBlock,
  stemBlock,
  optionsBlock,
  analysisBlock,
} from '../components/questionView.js';

function verdictOf(acc) {
  if (acc >= 90) return ['近乎满分！', '正确率极高，保持这个状态继续冲刺。'];
  if (acc >= 80) return ['表现优秀', '基础扎实，再接再厉冲击更高分。'];
  if (acc >= 60) return ['及格线之上', '整体不错，针对错题查漏补缺。'];
  if (acc >= 40) return ['仍需努力', '薄弱点较多，重点回顾错题解析。'];
  return ['别灰心', '从错题本开始，逐题攻克。'];
}

export function renderResult() {
  const result = session.result;
  if (!result || !result.summary) {
    toast('没有可查看的结果，请先完成一次测验', 'warning');
    navigate('setup', { replace: true });
    return null;
  }

  const { summary, details, questions } = result;
  const byQid = new Map(details.map((d) => [d.qid, d]));
  const wrongCount = summary.total - summary.correct;

  // ---- 正确率环 ----
  const acc = summary.accuracy;
  const ringClass = acc >= 80 ? 'good' : acc >= 60 ? 'mid' : 'bad';
  const ring = h('div', { class: `accuracy-ring ${ringClass}` },
    h('div', { class: 'ring-value' },
      h('div', { class: 'pct', text: `${acc}%` }),
      h('div', { class: 'lbl', text: '正确率' })
    )
  );
  ring.style.setProperty('--pct', String(acc));
  const [vTitle, vText] = verdictOf(acc);

  // ---- 统计卡 ----
  const statCard = (value, label, cls = '') =>
    h('div', { class: 'stat-card' },
      h('div', { class: `stat-value ${cls}`.trim(), text: String(value) }),
      h('div', { class: 'stat-label', text: label })
    );
  const stats = h('div', { class: 'result-stats' },
    statCard(summary.total, '总题数'),
    statCard(summary.correct, '答对', 'correct'),
    statCard(wrongCount, '答错', 'wrong'),
    statCard(`${acc}%`, '正确率'),
    statCard(formatDuration(summary.timeUsed || 0), '用时')
  );

  // ---- 条形统计 ----
  function barRow(label, correct, total, accuracy) {
    const cls = accuracy >= 80 ? 'good' : accuracy >= 60 ? 'mid' : 'bad';
    return h('div', { class: 'bar-row' },
      h('div', { class: 'bar-head' },
        h('span', { text: label }),
        h('span', { class: 'muted', text: `${correct}/${total} · ${accuracy}%` })
      ),
      h('div', { class: 'bar-track' },
        h('div', { class: `bar-fill ${cls}`, style: { width: `${Math.max(2, accuracy)}%` } })
      )
    );
  }
  const moduleCard = h('div', { class: 'card card-pad' },
    h('div', { class: 'card-title' }, h('span', { class: 'dot' }), '模块统计'),
    summary.byModule.length
      ? h('div', {}, summary.byModule.map((m) => barRow(m.name, m.correct, m.total, m.accuracy)))
      : h('div', { class: 'muted', text: '暂无数据' })
  );
  const kpList = summary.byKnowledgePoint.slice(0, 15);
  const kpCard = h('div', { class: 'card card-pad' },
    h('div', { class: 'card-title' }, h('span', { class: 'dot' }), '考点统计',
      summary.byKnowledgePoint.length > 15
        ? h('span', { class: 'muted', style: { fontWeight: '400', fontSize: '12px' }, text: '（按题量取前 15）' })
        : null),
    kpList.length
      ? h('div', {}, kpList.map((k) => barRow(k.name, k.correct, k.total, k.accuracy)))
      : h('div', { class: 'muted', text: '暂无考点标签' })
  );

  // ---- 逐题解析 ----
  let reviewFilter = 'all';
  const reviewList = h('div', { class: 'review-list' });
  const tabsEl = h('div', { class: 'tabs' });

  function renderTabs() {
    clear(tabsEl);
    const defs = [
      ['all', `全部 ${summary.total}`],
      ['wrong', `错题 ${wrongCount}`],
      ['correct', `正确 ${summary.correct}`],
    ];
    for (const [key, label] of defs) {
      tabsEl.append(
        h('button', {
          class: `tab${reviewFilter === key ? ' active' : ''}`,
          text: label,
          onClick: () => { reviewFilter = key; renderTabs(); renderReview(); },
        })
      );
    }
  }

  function reviewItem(q, d, num) {
    const merged = { ...q, answer: d.answer, analysisHtml: d.analysisHtml };
    const selText = d.selected.length ? d.selected.join(' ') : '未作答';
    const ansText = (d.answer || []).join(' ');

    const favBtn = h('button', {
      class: `btn btn-sm fav-btn${store.isFavorite(q.qid) ? ' active' : ''}`,
      text: store.isFavorite(q.qid) ? '★ 已收藏' : '☆ 收藏',
      onClick: () => {
        const added = store.toggleFavorite(q);
        favBtn.classList.toggle('active', added);
        favBtn.textContent = added ? '★ 已收藏' : '☆ 收藏';
      },
    });

    return h('div', { class: `card review-item ${d.correct ? 'correct' : 'wrong'}` },
      h('div', { class: 'review-head' },
        h('span', { class: 'review-num', text: `第 ${num} 题` }),
        h('span', { class: `badge ${d.correct ? 'badge-success' : 'badge-danger'}`, text: d.correct ? '答对' : '答错' }),
        h('span', { class: 'spacer' }),
        favBtn
      ),
      metaBadges(q),
      materialBlock(q),
      stemBlock(q),
      optionsBlock(merged, { mode: 'review', selected: d.selected, answer: d.answer }),
      h('div', { class: 'answer-line' },
        h('span', { class: 'ans-item' }, '你的答案：',
          h('b', { class: d.correct ? 'yours right' : 'yours wrong', text: selText })),
        h('span', { class: 'ans-item' }, '正确答案：',
          h('b', { class: 'right', text: ansText }))
      ),
      analysisBlock(merged) || h('div', { class: 'analysis-box' },
        h('div', { class: 'analysis-label', text: '💡 官方解析' }),
        h('div', { class: 'muted', text: '本题暂无解析' }))
    );
  }

  function renderReview() {
    clear(reviewList);
    let shown = 0;
    questions.forEach((q, i) => {
      const d = byQid.get(q.qid);
      if (!d) return;
      if (reviewFilter === 'wrong' && d.correct) return;
      if (reviewFilter === 'correct' && !d.correct) return;
      shown += 1;
      reviewList.append(reviewItem(q, d, i + 1));
    });
    if (!shown) {
      reviewList.append(
        h('div', { class: 'empty' },
          h('div', { class: 'empty-icon', text: reviewFilter === 'wrong' ? '🎉' : '📭' }),
          h('div', { text: reviewFilter === 'wrong' ? '本次没有错题，全部答对！' : '没有符合筛选的题目' })
        )
      );
    }
  }

  // ---- 工具栏动作 ----
  async function retryWrong() {
    const wrongQids = details.filter((d) => !d.correct).map((d) => d.qid);
    if (!wrongQids.length) { toast('本次全部答对，没有错题', 'success'); return; }
    const close = showLoading('正在生成重练…');
    try {
      const res = await api.fetchQuestions(wrongQids, 'quiz');
      session.quiz = {
        questions: res.questions, answers: {}, index: 0, timeLimit: 0,
        startedAt: Date.now(), source: 'wrong', filter: {}, submitted: false,
      };
      navigate('quiz');
    } catch (err) {
      toast(err.message || '生成重练失败', 'error');
    } finally {
      close();
    }
  }

  async function playAgain() {
    const f = result.filter || {};
    const body = { count: f.count || 20 };
    if (f.modules?.length) body.modules = f.modules;
    if (f.yearFrom) body.yearFrom = f.yearFrom;
    if (f.yearTo) body.yearTo = f.yearTo;
    if (f.regions?.length) body.regions = f.regions;
    if (f.knowledgePoints?.length) body.knowledgePoints = f.knowledgePoints;
    const close = showLoading('正在抽题…');
    try {
      const res = await api.generateQuiz(body);
      if (!res.questions.length) { toast('当前条件下没有可用题目', 'error'); return; }
      session.quiz = {
        questions: res.questions, answers: {}, index: 0,
        timeLimit: f.timeLimit ? (f.timeLimitMinutes || 30) * 60 : 0,
        startedAt: Date.now(), source: 'normal', filter: { ...f }, submitted: false,
      };
      navigate('quiz');
    } catch (err) {
      toast(err.message || '抽题失败', 'error');
    } finally {
      close();
    }
  }

  const toolbar = h('div', { class: 'review-toolbar' },
    tabsEl,
    h('span', { class: 'spacer' }),
    wrongCount
      ? h('button', { class: 'btn btn-primary btn-sm', onClick: retryWrong }, `重练错题（${wrongCount}）`)
      : null,
    h('button', { class: 'btn btn-sm', onClick: playAgain }, '再来一组'),
    h('button', { class: 'btn btn-sm', onClick: () => navigate('setup') }, '调整设置')
  );

  // ---- 组装 ----
  const el = h('div', {},
    h('div', { class: 'card result-hero' },
      ring,
      h('div', { class: 'result-hero-text', style: { flex: '1', minWidth: '260px' } },
        h('h2', { text: vTitle }),
        h('div', { class: 'verdict', text: vText }),
        stats
      )
    ),
    h('div', { class: 'result-grid' }, moduleCard, kpCard),
    h('div', { class: 'page-head mt-24' }, h('h1', { text: '逐题解析' })),
    toolbar,
    reviewList
  );

  renderTabs();
  renderReview();

  return { el };
}
