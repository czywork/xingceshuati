/**
 * 题目渲染组件：材料、题干、选项、解析、元信息徽章。
 * 支持两种模式：
 *   - quiz  ：可交互选项，不显示对错
 *   - review：只读，标出正确答案与用户选择，并展示解析
 * 所有题目 HTML 均为本地可信数据，直接以 innerHTML 注入。
 */
import { h } from '../dom.js';

/** 元信息徽章（模块/考点/年份/地区/多选） */
export function metaBadges(q) {
  const items = [];
  if (q.module?.name) items.push(h('span', { class: 'badge badge-primary', text: q.module.name }));
  if (q.knowledgePoint) items.push(h('span', { class: 'badge', text: q.knowledgePoint }));
  if (q.year) items.push(h('span', { class: 'badge', text: `${q.year}年` }));
  if (q.region) items.push(h('span', { class: 'badge', text: q.region }));
  if (q.isMulti) items.push(h('span', { class: 'badge badge-warning', text: '多选题' }));
  return h('div', { class: 'q-meta' }, items);
}

/** 材料块（资料分析/言语等材料题群） */
export function materialBlock(q) {
  if (!q.material || !q.material.html) return null;
  return h('div', { class: 'material-box' },
    h('div', { class: 'material-label', text: '📄 给定材料' }),
    h('div', { class: 'q-content', html: q.material.html })
  );
}

/** 题干块 */
export function stemBlock(q) {
  // 修复：过滤字面量 "null" 字符串
  const html = (q.stemHtml || '').replace(/^null\s*/, '');
  return h('div', { class: 'stem q-content', html });
}

/**
 * 选项块。
 * @param {object} q 题目对象
 * @param {{mode?:'quiz'|'review', selected?:string[], answer?:string[], onToggle?:(key:string)=>void}} opts
 */
export function optionsBlock(q, opts = {}) {
  const { mode = 'quiz', selected = [], answer = [], onToggle } = opts;
  const sel = new Set(selected);
  const ans = new Set(answer);
  const wrap = h('div', { class: 'options' });

  for (const opt of q.options || []) {
    const classes = ['option'];
    if (q.isMulti) classes.push('multi');

    let tag = null;
    if (mode === 'review') {
      classes.push('review');
      const isCorrect = ans.has(opt.key);
      const isPicked = sel.has(opt.key);
      if (isCorrect) {
        classes.push('correct');
        tag = h('span', { class: 'option-tag right', text: '正确答案' });
      } else if (isPicked) {
        classes.push('wrong');
        tag = h('span', { class: 'option-tag yours', text: '你的选择' });
      }
    } else if (sel.has(opt.key)) {
      classes.push('selected');
    }

    wrap.append(
      h('div', {
        class: classes.join(' '),
        onClick: mode === 'quiz' && onToggle ? () => onToggle(opt.key) : null,
      },
        h('div', { class: 'option-key', text: opt.key }),
        h('div', { class: 'option-body' },
          h('div', { class: 'q-content', html: opt.html || '' }),
          tag
        )
      )
    );
  }
  return wrap;
}

/** 官方解析块（回顾态） */
export function analysisBlock(q) {
  if (!q.analysisHtml) return null;
  return h('div', { class: 'analysis-box' },
    h('div', { class: 'analysis-label', text: '💡 官方解析' }),
    h('div', { class: 'q-content', html: q.analysisHtml })
  );
}
