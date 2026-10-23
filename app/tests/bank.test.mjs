import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionBank } from '../server/lib/bank.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

const bank = new QuestionBank(DATA_DIR).load();

test('加载索引与元数据', () => {
  assert.ok(bank.index.length > 50000, '索引应包含全部出现记录');
  const meta = bank.getMeta();
  assert.equal(meta.modules.length, 6);
  assert.ok(meta.totalUniqueQuestions > 20000);
});

test('抽题：数量正确、含必要字段、不泄露答案、qid 不重复', () => {
  const res = bank.generate({ modules: ['01', '04'], count: 20 });
  assert.equal(res.questions.length, 20);
  const qids = res.questions.map((q) => q.qid);
  assert.equal(new Set(qids).size, 20, '一套题内 qid 不应重复');
  for (const q of res.questions) {
    assert.ok(q.qid && q.module && Array.isArray(q.options) && q.options.length >= 2);
    assert.equal(q.answer, undefined, '抽题结果不应包含答案');
    assert.equal(q.analysisHtml, undefined, '抽题结果不应包含解析');
    assert.ok(['01', '04'].includes(q.module.code));
  }
});

test('抽题：年份范围筛选生效', () => {
  const res = bank.generate({ yearFrom: 2020, yearTo: 2021, count: 50 });
  assert.ok(res.questions.length > 0);
  for (const q of res.questions) {
    assert.ok(q.year >= 2020 && q.year <= 2021, `年份 ${q.year} 应在范围内`);
  }
});

test('抽题：地区与考点筛选生效', () => {
  const res = bank.generate({ regions: ['北京'], knowledgePoints: ['数学运算'], count: 30 });
  for (const q of res.questions) {
    assert.equal(q.region, '北京');
    assert.equal(q.knowledgePoint, '数学运算');
  }
});

test('抽题：请求数超过可用唯一题时按可用量返回', () => {
  const res = bank.generate({ modules: ['01'], regions: ['西藏'], count: 999 });
  assert.ok(res.questions.length <= res.availableUnique);
  assert.equal(res.questions.length, Math.min(999, res.availableUnique));
});

test('判分：全对 → 100%，全错 → 0%，含分模块/考点统计', () => {
  const res = bank.generate({ modules: ['02'], count: 10 });
  const answers = res.questions.map((q) => {
    const { content } = bank.getContent(q.qid);
    return { qid: q.qid, selected: content.answer }; // 提交正确答案
  });
  const graded = bank.grade(answers, 123);
  assert.equal(graded.summary.total, 10);
  assert.equal(graded.summary.correct, 10);
  assert.equal(graded.summary.accuracy, 100);
  assert.equal(graded.summary.timeUsed, 123);
  assert.ok(graded.summary.byModule.some((m) => m.code === '02'));
  assert.ok(graded.details.every((d) => d.correct));

  // 全错：提交一个必然错误的选项组合
  const wrong = res.questions.map((q) => ({ qid: q.qid, selected: ['Z'] }));
  const gradedWrong = bank.grade(wrong);
  assert.equal(gradedWrong.summary.correct, 0);
  assert.equal(gradedWrong.summary.accuracy, 0);
});

test('取题：review 模式含答案与解析，quiz 模式不含', () => {
  const res = bank.generate({ modules: ['03'], count: 3 });
  const qids = res.questions.map((q) => q.qid);
  const review = bank.fetchQuestions(qids, 'review');
  assert.equal(review.length, 3);
  for (const q of review) {
    assert.ok(Array.isArray(q.answer) && q.answer.length > 0);
    assert.ok(typeof q.analysisHtml === 'string');
  }
  const quiz = bank.fetchQuestions(qids, 'quiz');
  for (const q of quiz) {
    assert.equal(q.answer, undefined);
  }
});

test('材料题：抽中子题自动附带材料', () => {
  const res = bank.generate({ modules: ['06'], count: 30 });
  const withMaterial = res.questions.filter((q) => q.material && q.material.html);
  assert.ok(withMaterial.length > 0, '资料分析应包含带材料的题目');
});
