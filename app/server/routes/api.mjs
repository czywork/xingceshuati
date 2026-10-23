/**
 * API 路由：元数据、抽题、判分、取题。
 * 统一错误结构 {error:{status,message}}；请求体经 readBody 解析并做基本校验。
 */
import { sendJson, sendError, readBody } from '../lib/http.mjs';
import { MODULE_MAP } from '../../config.mjs';

const VALID_CODES = new Set(Object.keys(MODULE_MAP));
const MAX_COUNT = 1000;

/** 校验并规范化抽题参数 */
function parseQuizOptions(body) {
  const opts = {};

  if (body.modules != null) {
    if (!Array.isArray(body.modules)) throw Object.assign(new Error('modules 必须是数组'), { status: 400 });
    const codes = body.modules.map(String);
    const bad = codes.filter((c) => !VALID_CODES.has(c));
    if (bad.length) throw Object.assign(new Error(`未知模块编码：${bad.join(',')}`), { status: 400 });
    opts.modules = codes;
  }

  const count = Number(body.count);
  if (!Number.isFinite(count) || count < 1 || count > MAX_COUNT) {
    throw Object.assign(new Error(`题量需在 1–${MAX_COUNT} 之间`), { status: 400 });
  }
  opts.count = Math.floor(count);

  if (body.yearFrom != null && body.yearFrom !== '') {
    const y = Number(body.yearFrom);
    if (!Number.isFinite(y)) throw Object.assign(new Error('yearFrom 非法'), { status: 400 });
    opts.yearFrom = y;
  }
  if (body.yearTo != null && body.yearTo !== '') {
    const y = Number(body.yearTo);
    if (!Number.isFinite(y)) throw Object.assign(new Error('yearTo 非法'), { status: 400 });
    opts.yearTo = y;
  }
  if (opts.yearFrom != null && opts.yearTo != null && opts.yearFrom > opts.yearTo) {
    throw Object.assign(new Error('起始年份不能大于结束年份'), { status: 400 });
  }

  if (Array.isArray(body.regions) && body.regions.length) opts.regions = body.regions.map(String);
  if (Array.isArray(body.knowledgePoints) && body.knowledgePoints.length) {
    opts.knowledgePoints = body.knowledgePoints.map(String);
  }
  return opts;
}

/** 注册全部 API 路由 */
export function registerApi(router, bank) {
  // 元数据：模块/地区/年份/考点统计
  router.add('GET', '/api/meta', (req, res) => {
    sendJson(res, 200, bank.getMeta());
  });

  // 抽题：返回不含答案的题目列表
  router.add('POST', '/api/quiz', async (req, res) => {
    const body = await readBody(req);
    const opts = parseQuizOptions(body);
    const result = bank.generate(opts);
    if (!result.questions.length) {
      sendError(res, 422, '当前筛选条件下没有可用题目，请放宽条件', {
        availableUnique: result.availableUnique,
      });
      return;
    }
    sendJson(res, 200, result);
  });

  // 统计：返回当前筛选条件下的可用题量（不返回内容）
  router.add('POST', '/api/count', async (req, res) => {
    const body = await readBody(req);
    const opts = parseQuizOptions({ ...body, count: body.count || 1 });
    sendJson(res, 200, bank.count(opts));
  });

  // 判分：提交答案，返回正确率与逐题结果
  router.add('POST', '/api/grade', async (req, res) => {
    const body = await readBody(req);
    if (!Array.isArray(body.answers)) {
      sendError(res, 400, 'answers 必须是数组');
      return;
    }
    const timeUsed = Number.isFinite(Number(body.timeUsed)) ? Number(body.timeUsed) : null;
    sendJson(res, 200, bank.grade(body.answers, timeUsed));
  });

  // 取题：按 qid 列表获取（错题本重练 / 收藏回看）。mode='review' 含答案与解析
  router.add('POST', '/api/questions', async (req, res) => {
    const body = await readBody(req);
    if (!Array.isArray(body.qids) || !body.qids.length) {
      sendError(res, 400, 'qids 必须是非空数组');
      return;
    }
    if (body.qids.length > MAX_COUNT) {
      sendError(res, 400, `单次最多取 ${MAX_COUNT} 题`);
      return;
    }
    const mode = body.mode === 'quiz' ? 'quiz' : 'review';
    sendJson(res, 200, { questions: bank.fetchQuestions(body.qids.map(String), mode), mode });
  });
}
