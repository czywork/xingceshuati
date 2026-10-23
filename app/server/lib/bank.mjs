/**
 * 题库服务：负责加载索引、按需懒加载模块分片、筛选、随机抽题、判分与取题。
 *
 * 数据模型回顾：
 *   - index.json：全部「出现记录」（每条带准确年份/地区/试卷/考点），用于筛选与抽题；
 *   - questions-<code>.json：按 qid 去重的「题目内容」+ 材料，懒加载并缓存；
 *   - qid 全局唯一且不跨模块，故以 qid 作为题目主键。
 */
import fs from 'node:fs';
import path from 'node:path';
import { FILES, MODULE_MAP } from '../../config.mjs';

/** 规范化选项键：去重、大写、升序 */
function normalizeKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.map((k) => String(k).trim().toUpperCase()).filter(Boolean))].sort();
}

/** 比较两个选项键集合是否相等 */
function sameKeys(a, b) {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/** Fisher–Yates 洗牌（返回新数组） */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const round2 = (n) => Math.round(n * 100) / 100;

export class QuestionBank {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.index = [];
    this.meta = null;
    /** @type {Map<string, object>} 模块分片缓存 code -> shard */
    this.shards = new Map();
    /** @type {Map<string, object>} qid -> 首条出现记录（含元数据） */
    this.qidEntry = new Map();
  }

  /** 加载索引与元数据到内存（启动时调用） */
  load() {
    const indexPath = path.join(this.dataDir, FILES.index);
    const metaPath = path.join(this.dataDir, FILES.meta);
    if (!fs.existsSync(indexPath) || !fs.existsSync(metaPath)) {
      throw new Error('题库数据未构建，请先运行：npm run build（node scripts/parse.mjs）');
    }
    this.index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    this.meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    this.qidEntry.clear();
    for (const e of this.index) {
      if (!this.qidEntry.has(e.qid)) this.qidEntry.set(e.qid, e);
    }
    return this;
  }

  getMeta() {
    return this.meta;
  }

  /** 懒加载并缓存某模块分片 */
  loadShard(code) {
    if (this.shards.has(code)) return this.shards.get(code);
    const p = path.join(this.dataDir, FILES.shard(code));
    const shard = fs.existsSync(p)
      ? JSON.parse(fs.readFileSync(p, 'utf8'))
      : { materials: {}, questions: {} };
    this.shards.set(code, shard);
    return shard;
  }

  /** 按 qid 取内容与所属分片 */
  getContent(qid) {
    const entry = this.qidEntry.get(qid);
    if (!entry) return null;
    const shard = this.loadShard(entry.m);
    const content = shard.questions[qid];
    if (!content) return null;
    return { content, shard, entry };
  }

  /** 按筛选条件过滤出现记录 */
  filter({ modules, yearFrom, yearTo, regions, knowledgePoints } = {}) {
    const modSet = modules && modules.length ? new Set(modules) : null;
    const regSet = regions && regions.length ? new Set(regions) : null;
    const kpSet = knowledgePoints && knowledgePoints.length ? new Set(knowledgePoints) : null;
    const hasYear = yearFrom != null || yearTo != null;
    const yf = yearFrom ?? -Infinity;
    const yt = yearTo ?? Infinity;

    return this.index.filter((e) => {
      if (modSet && !modSet.has(e.m)) return false;
      if (hasYear && (e.y == null || e.y < yf || e.y > yt)) return false;
      if (regSet && !regSet.has(e.r)) return false;
      if (kpSet && !kpSet.has(e.k)) return false;
      return true;
    });
  }

  /**
   * 生成一套题：筛选 → 洗牌 → 按 qid 去重抽取 count 道（不含答案）。
   * @returns {{questions: object[], requested: number, availableUnique: number, poolSize: number}}
   */
  generate(opts = {}) {
    const pool = this.filter(opts);
    const availableUnique = new Set(pool.map((e) => e.qid)).size;
    const requested = Math.max(1, Math.floor(Number(opts.count) || 10));
    const count = Math.min(requested, availableUnique);

    const picked = [];
    if (count > 0) {
      const seen = new Set();
      for (const e of shuffle(pool)) {
        if (seen.has(e.qid)) continue;
        seen.add(e.qid);
        const q = this.toQuestion(e, { withAnswers: false });
        if (q) picked.push(q);
        if (picked.length >= count) break;
      }
    }
    return { questions: picked, requested, availableUnique, poolSize: pool.length };
  }

  /** 统计某筛选条件下的可用题量（供前端实时反馈，不返回题目内容） */
  count(opts = {}) {
    const pool = this.filter(opts);
    return {
      poolSize: pool.length,
      availableUnique: new Set(pool.map((e) => e.qid)).size,
    };
  }

  /** 由出现记录构建题目对象；withAnswers 控制是否附带答案与解析 */
  toQuestion(entry, { withAnswers = false } = {}) {
    const got = this.getContent(entry.qid);
    if (!got) return null;
    const { content, shard } = got;
    const material = content.materialId ? shard.materials[content.materialId] : null;
    const q = {
      qid: entry.qid,
      module: { code: entry.m, name: MODULE_MAP[entry.m]?.name || entry.m },
      year: entry.y,
      region: entry.r,
      knowledgePoint: entry.k,
      paper: entry.p,
      order: entry.ord,
      isMulti: !!entry.multi,
      material: material ? { id: content.materialId, html: material.html } : null,
      stemHtml: content.stemHtml,
      options: (content.options || []).map((o) => ({ key: o.key, html: o.html })),
    };
    if (withAnswers) {
      q.answer = content.answer;
      q.analysisHtml = content.analysisHtml;
    }
    return q;
  }

  /** 按 qid 列表取题（错题本/收藏）。mode='review' 附带答案与解析 */
  fetchQuestions(qids, mode = 'review') {
    const withAnswers = mode === 'review';
    const out = [];
    for (const qid of qids || []) {
      const entry = this.qidEntry.get(String(qid));
      if (!entry) continue;
      const q = this.toQuestion(entry, { withAnswers });
      if (q) out.push(q);
    }
    return out;
  }

  /**
   * 判分：answers = [{qid, selected:[keys]}]
   * @returns {{summary: object, details: object[]}}
   */
  grade(answers, timeUsed = null) {
    const details = [];
    const byModule = new Map();
    const byKp = new Map();
    let correctCount = 0;

    for (const a of answers || []) {
      const got = this.getContent(String(a.qid));
      if (!got) continue;
      const { content, entry } = got;
      const selected = normalizeKeys(a.selected);
      const correct = sameKeys(selected, content.answer || []);
      if (correct) correctCount += 1;

      details.push({
        qid: entry.qid,
        correct,
        selected,
        answer: content.answer,
        analysisHtml: content.analysisHtml,
      });

      const mk = byModule.get(entry.m) || { total: 0, correct: 0 };
      mk.total += 1;
      if (correct) mk.correct += 1;
      byModule.set(entry.m, mk);

      const kpName = entry.k || '未分类';
      const kk = byKp.get(kpName) || { total: 0, correct: 0 };
      kk.total += 1;
      if (correct) kk.correct += 1;
      byKp.set(kpName, kk);
    }

    const total = details.length;
    const summary = {
      total,
      correct: correctCount,
      accuracy: total ? round2((correctCount / total) * 100) : 0,
      timeUsed,
      byModule: [...byModule.entries()]
        .map(([code, v]) => ({
          code,
          name: MODULE_MAP[code]?.name || code,
          total: v.total,
          correct: v.correct,
          accuracy: v.total ? round2((v.correct / v.total) * 100) : 0,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      byKnowledgePoint: [...byKp.entries()]
        .map(([name, v]) => ({
          name,
          total: v.total,
          correct: v.correct,
          accuracy: v.total ? round2((v.correct / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total),
    };

    return { summary, details };
  }
}
