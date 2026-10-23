/**
 * 答题页：倒计时、单选/多选交互、材料/图片渲染、上/下一题、答题卡导航、
 * 收藏与标记、交卷判分。所有瞬时状态存于 session.quiz（内存），刷新即清空。
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
} from '../components/questionView.js';

export function renderQuiz() {
  const quiz = session.quiz;
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    toast('没有进行中的测验，请重新配置', 'warning');
    navigate('setup', { replace: true });
    return null;
  }

  const total = quiz.questions.length;
  if (!quiz.marked) quiz.marked = new Set();

  // ---- 答案读写 ----
  const getSelected = (qid) => quiz.answers[qid] || [];
  const setSelected = (qid, arr) => {
    if (arr && arr.length) quiz.answers[qid] = arr;
    else delete quiz.answers[qid];
  };
  const answeredCount = () =>
    quiz.questions.reduce((n, q) => n + (getSelected(q.qid).length ? 1 : 0), 0);

  // ---- 元素引用 ----
  let index = quiz.index || 0;
  const progressCur = h('span', { class: 'cur' });
  const progressTotal = h('span');
  const progressFill = h('div', { class: 'progress-fill' });
  const timeSpan = h('span');
  const timerEl = h('div', { class: 'timer' }, h('span', { text: '⏱' }), timeSpan);

  const favBtn = h('button', { class: 'btn btn-sm fav-btn', onClick: onToggleFav });
  const markBtn = h('button', { class: 'btn btn-sm', onClick: onToggleMark });

  const questionArea = h('div');
  const prevBtn = h('button', { class: 'btn', onClick: () => goto(index - 1) }, '← 上一题');
  const nextBtn = h('button', { class: 'btn', onClick: () => goto(index + 1) }, '下一题 →');

  const paletteEl = h('div', { class: 'palette' });
  const statAnswered = h('b');
  const statMarked = h('b');
  const submitBtn = h('button', { class: 'btn btn-primary btn-block mt-16', onClick: () => submit(false) }, '交卷并查看解析');

  // ---- 选项交互 ----
  function onToggle(key) {
    const q = quiz.questions[index];
    if (q.isMulti) {
      const cur = getSelected(q.qid).slice();
      const i = cur.indexOf(key);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(key);
      setSelected(q.qid, cur.sort());
    } else {
      setSelected(q.qid, [key]);
    }
    // 仅重渲染选项区，避免材料/图片闪烁
    const old = questionArea.querySelector('.options');
    const fresh = optionsBlock(q, { mode: 'quiz', selected: getSelected(q.qid), onToggle });
    if (old) old.replaceWith(fresh);
    renderPalette();
  }

  function onToggleFav() {
    const q = quiz.questions[index];
    const added = store.toggleFavorite(q);
    favBtn.classList.toggle('active', added);
    toast(added ? '已加入收藏' : '已取消收藏', '', 1400);
  }

  function onToggleMark() {
    const q = quiz.questions[index];
    if (quiz.marked.has(q.qid)) quiz.marked.delete(q.qid);
    else quiz.marked.add(q.qid);
    updateFavMark();
    renderPalette();
  }

  function updateFavMark() {
    const q = quiz.questions[index];
    favBtn.classList.toggle('active', store.isFavorite(q.qid));
    favBtn.textContent = store.isFavorite(q.qid) ? '★ 已收藏' : '☆ 收藏';
    markBtn.classList.toggle('active', quiz.marked.has(q.qid));
    markBtn.textContent = quiz.marked.has(q.qid) ? '🚩 已标记' : '标记';
  }

  // ---- 渲染 ----
  function renderQuestion() {
    const q = quiz.questions[index];
    clear(questionArea);
    questionArea.append(
      metaBadges(q),
      materialBlock(q),
      stemBlock(q),
      optionsBlock(q, { mode: 'quiz', selected: getSelected(q.qid), onToggle })
    );
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === total - 1;
    updateFavMark();
    updateProgress();
  }

  function updateProgress() {
    progressCur.textContent = String(index + 1);
    progressTotal.textContent = ` / ${total}`;
    progressFill.style.width = `${((index + 1) / total) * 100}%`;
  }

  function renderPalette() {
    clear(paletteEl);
    quiz.questions.forEach((q, i) => {
      const classes = ['palette-cell'];
      if (getSelected(q.qid).length) classes.push('answered');
      if (i === index) classes.push('current');
      if (quiz.marked.has(q.qid)) classes.push('marked');
      paletteEl.append(
        h('div', { class: classes.join(' '), text: String(i + 1), onClick: () => goto(i) })
      );
    });
    statAnswered.textContent = `${answeredCount()} / ${total}`;
    statMarked.textContent = String(quiz.marked.size);
  }

  function goto(i) {
    if (i < 0 || i >= total || i === index) return;
    index = i;
    quiz.index = i;
    renderQuestion();
    renderPalette();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- 计时器 ----
  const secsUsed = () => Math.floor((Date.now() - quiz.startedAt) / 1000);
  function updateTimer() {
    const used = secsUsed();
    if (quiz.timeLimit) {
      const remaining = Math.max(0, quiz.timeLimit - used);
      timeSpan.textContent = formatDuration(remaining);
      timerEl.classList.toggle('danger', remaining <= 60);
      timerEl.classList.toggle('warning', remaining > 60 && remaining <= 300);
      if (remaining <= 0 && !quiz.submitted) submit(true);
    } else {
      timeSpan.textContent = formatDuration(used);
    }
  }
  const tick = setInterval(updateTimer, 1000);
  updateTimer();

  // ---- 键盘快捷键 ----
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const q = quiz.questions[index];
    if (e.key === 'ArrowRight') { goto(index + 1); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft') { goto(index - 1); e.preventDefault(); return; }
    if (/^[0-9]$/.test(e.key)) {
      const opt = q.options[Number(e.key) - 1];
      if (opt) { onToggle(opt.key); e.preventDefault(); }
      return;
    }
    const upper = e.key.toUpperCase();
    if (/^[A-Z]$/.test(upper) && q.options.some((o) => o.key === upper)) {
      onToggle(upper);
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKey);

  // ---- 离开提醒 ----
  function onBeforeUnload(e) {
    if (quiz.submitted) return undefined;
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
  window.addEventListener('beforeunload', onBeforeUnload);

  // ---- 交卷 ----
  async function submit(auto) {
    if (quiz.submitted) return;
    const unanswered = total - answeredCount();
    if (auto) {
      toast('时间到，已自动交卷', 'warning');
    } else if (
      !window.confirm(
        unanswered > 0
          ? `还有 ${unanswered} 题未作答，确定交卷吗？`
          : '全部作答完毕，确定交卷并查看解析吗？'
      )
    ) {
      return;
    }

    quiz.submitted = true;
    clearInterval(tick);
    submitBtn.disabled = true;
    const timeUsed = secsUsed();
    const answersArr = quiz.questions.map((q) => ({
      qid: q.qid,
      selected: getSelected(q.qid),
    }));

    const close = showLoading('正在判分…');
    try {
      const res = await api.grade(answersArr, timeUsed);
      const correctQids = res.details.filter((d) => d.correct).map((d) => d.qid);
      if (correctQids.length) store.removeWrong(correctQids);
      store.addWrongFromResult(quiz.questions, res.details);
      const moduleCodes = [...new Set(quiz.questions.map((q) => q.module.code))].sort();
      store.addHistory(res.summary, moduleCodes);

      session.result = {
        summary: res.summary,
        details: res.details,
        questions: quiz.questions,
        filter: quiz.filter,
        source: quiz.source || 'normal',
      };
      navigate('result', { replace: true });
    } catch (err) {
      quiz.submitted = false;
      submitBtn.disabled = false;
      toast(err.message || '判分失败，请重试', 'error');
    } finally {
      close();
    }
  }

  function quit() {
    if (!window.confirm('确定退出本次测验吗？当前作答进度将丢失。')) return;
    quiz.submitted = true; // 抑制 beforeunload
    navigate('setup');
  }

  // ---- 组装 ----
  const el = h('div', {},
    h('div', { class: 'quiz-topbar' },
      h('div', { class: 'quiz-progress-text' }, '第 ', progressCur, progressTotal, ' 题'),
      h('div', { class: 'progress' }, progressFill),
      timerEl,
      favBtn,
      markBtn
    ),
    h('div', { class: 'quiz-layout' },
      h('section', { class: 'card question-card' },
        questionArea,
        h('div', { class: 'quiz-nav' }, prevBtn, nextBtn)
      ),
      h('aside', { class: 'quiz-sidebar', style: { position: 'sticky', top: 'calc(var(--header-h) + 20px)' } },
        h('div', { class: 'card' },
          h('div', { class: 'sidebar-title', text: '答题卡' }),
          paletteEl,
          h('div', { class: 'palette-legend' },
            h('span', {}, h('i', { class: 'legend-dot answered' }), '已答'),
            h('span', {}, h('i', { class: 'legend-dot' }), '未答'),
            h('span', {}, h('i', { class: 'legend-dot current' }), '当前'),
            h('span', { text: '★ 标记' })
          ),
          h('div', { class: 'summary-row mt-16' }, h('span', { class: 'muted', text: '已作答' }), statAnswered),
          h('div', { class: 'summary-row' }, h('span', { class: 'muted', text: '已标记' }), statMarked),
          submitBtn,
          h('button', { class: 'btn btn-ghost btn-block mt-8', onClick: quit }, '退出测验')
        )
      )
    )
  );

  renderQuestion();
  renderPalette();

  return {
    el,
    cleanup: () => {
      clearInterval(tick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
    },
  };
}
