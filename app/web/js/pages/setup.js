/**
 * 配置页：选择题型模块、数量、年份范围、地区、考点、限时，随机抽题进入答题。
 */
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { getMeta } from '../meta.js';
import { store, session } from '../store.js';
import { navigate } from '../router.js';
import { toast, showLoading } from '../components/toast.js';

const COUNT_PRESETS = [10, 20, 50, 100];

function defaultSettings() {
  return {
    modules: [],
    count: 20,
    yearFrom: null,
    yearTo: null,
    regions: [],
    knowledgePoints: [],
    timeLimit: 0,
    timeLimitMinutes: 30,
  };
}

/** 由设置构造筛选请求体 */
function filterBody(s) {
  const body = { count: Math.max(1, Number(s.count) || 1) };
  if (s.modules.length) body.modules = s.modules;
  if (s.yearFrom) body.yearFrom = s.yearFrom;
  if (s.yearTo) body.yearTo = s.yearTo;
  if (s.regions.length) body.regions = s.regions;
  if (s.knowledgePoints.length) body.knowledgePoints = s.knowledgePoints;
  return body;
}

function debounce(fn, wait) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export async function renderSetup() {
  const meta = await getMeta();
  const s = { ...defaultSettings(), ...store.settings };
  // 迁移：确保 timeLimitMinutes 有值
  if (!s.timeLimitMinutes) s.timeLimitMinutes = 30;

  const years = meta.years.list.map((y) => y.year);

  // ---- 需要动态更新的元素引用 ----
  let availableEl, startBtn, countInput;
  let summaryEls = {};
  let kpSectionBody;

  // ---- 持久化 + 汇总 + 计数 ----
  const persist = () => store.saveSettings(s);

  const updateSummary = () => {
    summaryEls.modules.textContent = s.modules.length
      ? s.modules.map((c) => meta.modules.find((m) => m.code === c)?.name || c).join('、')
      : '全部模块';
    summaryEls.count.textContent = `${s.count} 题`;
    summaryEls.year.textContent =
      s.yearFrom || s.yearTo ? `${s.yearFrom || years[0]} – ${s.yearTo || years[years.length - 1]}` : '不限';
    summaryEls.region.textContent = s.regions.length ? `${s.regions.length} 个地区` : '不限';
    summaryEls.kp.textContent = s.knowledgePoints.length ? `${s.knowledgePoints.length} 个考点` : '不限';
    summaryEls.time.textContent = s.timeLimit ? `${s.timeLimitMinutes} 分钟` : '不限时';
  };

  const refreshCount = debounce(async () => {
    availableEl.textContent = '…';
    try {
      const { availableUnique } = await api.count(filterBody(s));
      availableEl.textContent = String(availableUnique);
      availableEl.classList.toggle('muted', availableUnique === 0);
      startBtn.disabled = availableUnique === 0;
    } catch (err) {
      availableEl.textContent = '—';
    }
  }, 300);

  const onChange = () => {
    persist();
    updateSummary();
    refreshCount();
  };

  // ---- 模块卡片 ----
  const moduleGrid = h('div', { class: 'module-grid' });
  const renderModules = () => {
    clear(moduleGrid);
    for (const m of meta.modules) {
      const selected = s.modules.includes(m.code);
      moduleGrid.append(
        h('div', {
          class: `module-card${selected ? ' selected' : ''}`,
          onClick: (e) => {
            const card = e.currentTarget;
            const i = s.modules.indexOf(m.code);
            if (i >= 0) s.modules.splice(i, 1);
            else s.modules.push(m.code);
            s.modules.sort();
            // 清理不再可见模块下的考点选择
            if (s.modules.length) {
              const visibleKp = new Set(s.modules.flatMap((c) => (meta.knowledgePoints[c] || []).map((k) => k.name)));
              s.knowledgePoints = s.knowledgePoints.filter((k) => visibleKp.has(k));
            }
            renderModules();
            renderKp();
            onChange();
          },
        },
          h('div', { class: 'mc-check', html: selected ? '✓' : '' }),
          h('div', { class: 'mc-code', text: m.code }),
          h('div', { class: 'mc-name', text: m.name }),
          h('div', { class: 'mc-count', text: `${m.unique} 题` })
        )
      );
    }
  };

  // ---- 地区 chips ----
  const regionGroup = h('div', { class: 'chip-group' });
  for (const r of meta.regions) {
    regionGroup.append(
      h('div', {
        class: `chip${s.regions.includes(r.name) ? ' active' : ''}`,
        onClick: (e) => {
          const i = s.regions.indexOf(r.name);
          if (i >= 0) s.regions.splice(i, 1);
          else s.regions.push(r.name);
          e.currentTarget.classList.toggle('active');
          onChange();
        },
      }, r.name, h('span', { class: 'chip-count', text: r.count }))
    );
  }

  // ---- 考点 chips（按模块分组，随模块选择变化）----
  const renderKp = () => {
    clear(kpSectionBody);
    const modulesToShow = s.modules.length
      ? meta.modules.filter((m) => s.modules.includes(m.code))
      : meta.modules;
    let any = false;
    for (const m of modulesToShow) {
      const list = meta.knowledgePoints[m.code] || [];
      if (!list.length) continue;
      any = true;
      kpSectionBody.append(h('div', { class: 'kp-module-label', text: m.name }));
      const group = h('div', { class: 'chip-group' });
      for (const kp of list) {
        group.append(
          h('div', {
            class: `chip${s.knowledgePoints.includes(kp.name) ? ' active' : ''}`,
            onClick: (e) => {
              const i = s.knowledgePoints.indexOf(kp.name);
              if (i >= 0) s.knowledgePoints.splice(i, 1);
              else s.knowledgePoints.push(kp.name);
              e.currentTarget.classList.toggle('active');
              onChange();
            },
          }, kp.name, h('span', { class: 'chip-count', text: kp.count }))
        );
      }
      kpSectionBody.append(group);
    }
    if (!any) kpSectionBody.append(h('div', { class: 'muted', text: '该模块暂无考点标签' }));
  };

  // ---- 年份选择 ----
  const yearOptions = (selectedVal) => [
    h('option', { value: '', text: '不限', selected: !selectedVal }),
    ...years.map((y) => h('option', { value: String(y), text: `${y}年`, selected: selectedVal === y })),
  ];
  const yearFromSel = h('select', { class: 'select', onChange: (e) => {
    s.yearFrom = e.target.value ? Number(e.target.value) : null;
    if (s.yearFrom && s.yearTo && s.yearFrom > s.yearTo) { s.yearTo = s.yearFrom; yearToSel.value = String(s.yearTo); }
    onChange();
  }}, yearOptions(s.yearFrom));
  const yearToSel = h('select', { class: 'select', onChange: (e) => {
    s.yearTo = e.target.value ? Number(e.target.value) : null;
    if (s.yearFrom && s.yearTo && s.yearFrom > s.yearTo) { s.yearFrom = s.yearTo; yearFromSel.value = String(s.yearFrom); }
    onChange();
  }}, yearOptions(s.yearTo));

  // ---- 数量 ----
  countInput = h('input', {
    class: 'input input-sm', type: 'number', min: '1', max: '500', value: String(s.count),
    onInput: (e) => {
      let v = parseInt(e.target.value, 10);
      if (Number.isNaN(v)) v = 1;
      v = Math.max(1, Math.min(500, v));
      s.count = v;
      onChange();
    },
  });
  const presetGroup = h('div', { class: 'chip-group' },
    COUNT_PRESETS.map((n) =>
      h('div', {
        class: `chip${s.count === n ? ' active' : ''}`,
        onClick: (e) => {
          s.count = n;
          countInput.value = String(n);
          clear(presetGroup);
          presetGroup.append(...COUNT_PRESETS.map((m) =>
            h('div', { class: `chip${s.count === m ? ' active' : ''}`, onClick: (ev) => ev.currentTarget.click && e.currentTarget.parentElement.querySelector } , String(m))
          ));
          onChange();
        },
      }, String(n))
    )
  );

  // ---- 限时 ----
  const timeSwitch = h('input', { type: 'checkbox', checked: !!s.timeLimit, onChange: (e) => {
    s.timeLimit = e.target.checked ? 1 : 0;
    minutesInput.disabled = !e.target.checked;
    onChange();
  }});
  const minutesInput = h('input', {
    class: 'input input-sm', type: 'number', min: '1', max: '300', value: String(s.timeLimitMinutes),
    disabled: !s.timeLimit,
    onInput: (e) => {
      let v = parseInt(e.target.value, 10);
      if (Number.isNaN(v)) v = 1;
      s.timeLimitMinutes = Math.max(1, Math.min(300, v));
      onChange();
    },
  });

  // ---- 汇总卡元素 ----
  availableEl = h('b', { text: '…' });
  summaryEls = {
    modules: h('b'), count: h('b'), year: h('b'), region: h('b'), kp: h('b'), time: h('b'),
  };
  const summaryRow = (label, valueEl) =>
    h('div', { class: 'summary-row' }, h('span', { class: 'muted', text: label }), valueEl);

  // ---- 开始按钮 ----
  startBtn = h('button', { class: 'btn btn-primary btn-lg btn-block', onClick: onStart }, '开始刷题 →');

  async function onStart() {
    if (startBtn.disabled) return;
    const close = showLoading('正在抽题…');
    try {
      const body = filterBody(s);
      const res = await api.generateQuiz(body);
      if (!res.questions.length) {
        toast('当前条件下没有可用题目，请放宽筛选', 'error');
        return;
      }
      if (res.questions.length < s.count) {
        toast(`该条件下仅 ${res.questions.length} 道可用题，已全部加入`, 'warning', 3000);
      }
      session.quiz = {
        questions: res.questions,
        answers: {},
        index: 0,
        timeLimit: s.timeLimit ? s.timeLimitMinutes * 60 : 0,
        startedAt: Date.now(),
        source: 'normal',
        filter: { ...s },
        submitted: false,
      };
      navigate('quiz');
    } catch (err) {
      toast(err.message || '抽题失败', 'error');
    } finally {
      close();
    }
  }

  // ---- 组装页面 ----
  kpSectionBody = h('div');
  renderModules();
  renderKp();

  const el = h('div', {},
    h('div', { class: 'page-head' },
      h('h1', { text: '开始刷题' }),
      h('p', { text: `题库共 ${meta.totalUniqueQuestions} 道唯一真题（${meta.totalOccurrences} 条试卷收录），支持按模块 / 年份 / 地区 / 考点筛选` })
    ),
    h('div', { class: 'setup-wrap' },
      // 左：配置区
      h('div', {},
        h('section', { class: 'card card-pad' },
          h('div', { class: 'card-title' }, h('span', { class: 'dot' }), '选择题型模块'),
          moduleGrid,
          h('div', { class: 'field-hint', text: '不选则默认包含全部模块' })
        ),
        h('section', { class: 'card card-pad mt-16' },
          h('div', { class: 'card-title' }, h('span', { class: 'dot' }), '数量与年份'),
          h('div', { class: 'inline-fields' },
            h('div', { class: 'field' },
              h('label', { class: 'field-label', text: '刷题数量' }),
              h('div', { class: 'row gap-8' }, countInput, h('span', { class: 'muted', text: '题' })),
              h('div', { class: 'row gap-8 mt-8' }, presetGroup)
            ),
            h('div', { class: 'field' },
              h('label', { class: 'field-label', text: '年份范围' }),
              h('div', { class: 'row gap-8' }, yearFromSel, h('span', { class: 'muted', text: '至' }), yearToSel)
            )
          )
        ),
        h('section', { class: 'card card-pad mt-16' },
          h('div', { class: 'card-title' }, h('span', { class: 'dot' }), '地区筛选'),
          h('div', { class: 'scroll-box' }, regionGroup),
          h('div', { class: 'field-hint', text: '不选则不限地区' })
        ),
        h('section', { class: 'card card-pad mt-16' },
          h('div', { class: 'card-title' }, h('span', { class: 'dot' }), '考点筛选'),
          h('div', { class: 'scroll-box' }, kpSectionBody),
          h('div', { class: 'field-hint', text: '考点随所选模块联动；不选则不限考点' })
        )
      ),
      // 右：汇总 + 开始
      h('aside', {},
        h('div', { class: 'card card-pad summary-card' },
          h('div', { class: 'card-title' }, h('span', { class: 'dot' }), '本次设置'),
          summaryRow('模块', summaryEls.modules),
          summaryRow('数量', summaryEls.count),
          summaryRow('年份', summaryEls.year),
          summaryRow('地区', summaryEls.region),
          summaryRow('考点', summaryEls.kp),
          h('div', { class: 'summary-row', style: { alignItems: 'center' } },
            h('span', { class: 'muted', text: '限时' }),
            h('div', { class: 'row gap-8' },
              h('label', { class: 'switch' }, timeSwitch, h('span', { class: 'slider' })),
              minutesInput, h('span', { class: 'muted', text: '分' })
            )
          ),
          h('div', { class: 'summary-total' }, '当前条件可用 ', availableEl, ' 题'),
          startBtn
        )
      )
    )
  );

  updateSummary();
  refreshCount();

  return { el, cleanup: () => refreshCount.cancel() };
}
