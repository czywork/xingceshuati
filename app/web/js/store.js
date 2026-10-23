/**
 * 应用状态：持久化部分（错题本/收藏/设置/历史）存于 localStorage；
 * 瞬时会话（当前测验、最近结果）仅存于内存（session），刷新即清空。
 * 采用发布-订阅，页面可监听变更。
 */
import { htmlToText } from './dom.js';

const LS_KEY = 'xingce-quiz:v1';

const DEFAULT_SETTINGS = {
  modules: [], // 空表示全部模块
  count: 20,
  yearFrom: null,
  yearTo: null,
  regions: [],
  knowledgePoints: [],
  timeLimit: 0, // 分钟，0 = 不限时
};

const DEFAULTS = {
  wrongBook: [], // [{qid,m.moduleName,kp,year,region,stemText,wrongCount,updatedAt}]
  favorites: [], // [{qid,m,moduleName,kp,year,region,stemText,addedAt}]
  settings: { ...DEFAULT_SETTINGS },
  history: [], // [{at,total,correct,accuracy,timeUsed,modules}]
};

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let data = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('本地存储写入失败：', err);
  }
}

function emit() {
  for (const fn of listeners) fn(data);
}

/** 由题目对象构造错题本/收藏条目 */
function toEntry(q) {
  return {
    qid: q.qid,
    m: q.module?.code,
    moduleName: q.module?.name,
    kp: q.knowledgePoint || '',
    year: q.year,
    region: q.region || '',
    stemText: htmlToText(q.stemHtml, 48),
  };
}

/** 瞬时会话（不持久化） */
export const session = {
  quiz: null, // {questions, answers:Map, order:[qid], timeLimit, startedAt, source}
  result: null, // {summary, details, questions, filter}
};

export const store = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  get settings() {
    return data.settings;
  },
  saveSettings(patch) {
    data.settings = { ...data.settings, ...patch };
    persist();
    emit();
  },

  // ---- 收藏夹 ----
  getFavorites: () => data.favorites,
  isFavorite(qid) {
    return data.favorites.some((f) => f.qid === qid);
  },
  toggleFavorite(q) {
    const i = data.favorites.findIndex((f) => f.qid === q.qid);
    if (i >= 0) {
      data.favorites.splice(i, 1);
      persist();
      emit();
      return false;
    }
    data.favorites.unshift({ ...toEntry(q), addedAt: Date.now() });
    persist();
    emit();
    return true;
  },
  clearFavorites() {
    data.favorites = [];
    persist();
    emit();
  },

  // ---- 错题本 ----
  getWrongBook: () => data.wrongBook,
  hasWrong(qid) {
    return data.wrongBook.some((w) => w.qid === qid);
  },
  /** 根据判分结果写入错题（去重、累计错误次数） */
  addWrongFromResult(questions, details) {
    const byQid = new Map(questions.map((q) => [q.qid, q]));
    const now = Date.now();
    for (const d of details) {
      if (d.correct) continue;
      const q = byQid.get(d.qid);
      if (!q) continue;
      const existing = data.wrongBook.find((w) => w.qid === d.qid);
      if (existing) {
        existing.wrongCount = (existing.wrongCount || 1) + 1;
        existing.updatedAt = now;
      } else {
        data.wrongBook.unshift({ ...toEntry(q), wrongCount: 1, updatedAt: now });
      }
    }
    persist();
    emit();
  },
  /** 答对后从错题本移除（重练时） */
  removeWrong(qids) {
    const set = new Set(qids);
    const before = data.wrongBook.length;
    data.wrongBook = data.wrongBook.filter((w) => !set.has(w.qid));
    if (data.wrongBook.length !== before) {
      persist();
      emit();
    }
  },
  clearWrong() {
    data.wrongBook = [];
    persist();
    emit();
  },

  // ---- 历史记录（轻量摘要） ----
  getHistory: () => data.history,
  addHistory(summary, modules) {
    data.history.unshift({
      at: Date.now(),
      total: summary.total,
      correct: summary.correct,
      accuracy: summary.accuracy,
      timeUsed: summary.timeUsed,
      modules: modules || [],
    });
    data.history = data.history.slice(0, 50); // 最多保留 50 条
    persist();
    emit();
  },
  clearHistory() {
    data.history = [];
    persist();
    emit();
  },
};
