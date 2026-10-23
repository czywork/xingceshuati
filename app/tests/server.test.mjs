import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionBank } from '../server/lib/bank.mjs';
import { createApp } from '../server/app.mjs';
import { WEB_ROOT, IMG_SOURCE } from '../config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

const bank = new QuestionBank(DATA_DIR).load();
const app = createApp({ bank, webRoot: WEB_ROOT, imgSource: IMG_SOURCE });

let base;

test.before(
  () =>
    new Promise((resolve) => {
      app.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${app.address().port}`;
        resolve();
      });
    })
);

test.after(
  () =>
    new Promise((resolve) => {
      app.close(resolve);
    })
);

test('GET /api/meta 返回模块与统计', async () => {
  const res = await fetch(`${base}/api/meta`);
  assert.equal(res.status, 200);
  const meta = await res.json();
  assert.equal(meta.modules.length, 6);
  assert.ok(meta.totalOccurrences > 50000);
  assert.ok(Array.isArray(meta.regions) && meta.regions.length > 0);
});

test('POST /api/quiz 抽题（不含答案）', async () => {
  const res = await fetch(`${base}/api/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules: ['04'], count: 5, yearFrom: 2018, yearTo: 2022 }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.questions.length, 5);
  assert.equal(data.questions[0].answer, undefined);
  assert.ok(data.questions[0].options.length >= 2);
});

test('POST /api/quiz 参数校验：非法题量 → 400', async () => {
  const res = await fetch(`${base}/api/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 0 }),
  });
  assert.equal(res.status, 400);
  const err = await res.json();
  assert.ok(err.error && err.error.message);
});

test('POST /api/grade 判分流程闭环', async () => {
  const quizRes = await fetch(`${base}/api/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules: ['01'], count: 5 }),
  });
  const { questions } = await quizRes.json();
  // 用题库内容构造正确答案提交
  const answers = questions.map((q) => ({ qid: q.qid, selected: bank.getContent(q.qid).content.answer }));
  const res = await fetch(`${base}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, timeUsed: 60 }),
  });
  assert.equal(res.status, 200);
  const graded = await res.json();
  assert.equal(graded.summary.total, 5);
  assert.equal(graded.summary.accuracy, 100);
  assert.ok(graded.details.every((d) => d.correct));
});

test('POST /api/questions review 模式含答案与解析', async () => {
  const quizRes = await fetch(`${base}/api/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules: ['06'], count: 3 }),
  });
  const { questions } = await quizRes.json();
  const res = await fetch(`${base}/api/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qids: questions.map((q) => q.qid), mode: 'review' }),
  });
  const data = await res.json();
  assert.equal(data.questions.length, 3);
  assert.ok(data.questions.every((q) => Array.isArray(q.answer)));
});

test('图片服务：/img/* 返回 PNG', async () => {
  // 从资料分析题中找一个含图片的题目
  const { questions } = await (
    await fetch(`${base}/api/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: ['04'], count: 40 }),
    })
  ).json();
  let imgPath = null;
  for (const q of questions) {
    const got = bank.getContent(q.qid);
    const imgs = got?.content?.images || [];
    if (imgs.length) {
      imgPath = imgs[0];
      break;
    }
  }
  assert.ok(imgPath, '应找到至少一个含图片的题目');
  const url = `${base}${encodeURI(imgPath)}`;
  const res = await fetch(url);
  assert.equal(res.status, 200, `图片应可访问: ${imgPath}`);
  assert.match(res.headers.get('content-type'), /image\/(png|jpeg)/);
});

test('路径穿越防护：编码的 ../ 不能越权读取', async () => {
  // %2e%2e 不会被 URL 解析器规范化，可真正触发 decode 后的穿越防护
  const res = await fetch(`${base}/img/%2e%2e/%2e%2e/app/config.mjs`);
  assert.ok(res.status === 403 || res.status === 404, `应被拒绝，实际 ${res.status}`);
});

test('未知 API → 404，且返回统一错误结构', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  const err = await res.json();
  assert.ok(err.error);
});
