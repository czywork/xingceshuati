/**
 * 端到端冒烟测试（真实数据 + 真实静态服务）。
 * 用 Node 内置 http/fetch 启动 createApp，逐项断言后退出。
 * 运行：node smoke.mjs
 */
import { QuestionBank } from './server/lib/bank.mjs';
import { createApp } from './server/app.mjs';
import { BUILD_OUTPUT, WEB_ROOT, IMG_SOURCE } from './config.mjs';

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${name}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${name}`); }
}

const bank = new QuestionBank(BUILD_OUTPUT).load();
const server = createApp({ bank, webRoot: WEB_ROOT, imgSource: IMG_SOURCE });

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
console.log(`服务器已启动：${BASE}\n`);

async function json(path, opts) {
  const res = await fetch(BASE + path, opts);
  return { status: res.status, body: await res.json().catch(() => null) };
}
const post = (path, body) =>
  json(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

try {
  // 1) 首页与静态资源
  const home = await fetch(BASE + '/');
  const homeText = await home.text();
  check('GET / 返回 HTML 首页', home.status === 200 && homeText.includes('行测真题刷题'));

  const jsRes = await fetch(BASE + '/js/main.js');
  check('GET /js/main.js (JS MIME)', jsRes.status === 200 && /javascript/.test(jsRes.headers.get('content-type') || ''));

  const cssRes = await fetch(BASE + '/css/base.css');
  check('GET /css/base.css (CSS MIME)', cssRes.status === 200 && /css/.test(cssRes.headers.get('content-type') || ''));

  const pageRes = await fetch(BASE + '/js/pages/quiz.js');
  check('GET /js/pages/quiz.js', pageRes.status === 200);

  // 2) 元数据
  const meta = await json('/api/meta');
  check('GET /api/meta 唯一题数 > 0', meta.body?.totalUniqueQuestions > 0);
  check('GET /api/meta 六个模块', meta.body?.modules?.length === 6);

  // 3) 抽题（不含答案）
  const quiz = await post('/api/quiz', { count: 5, modules: ['02', '05'] });
  const qs = quiz.body?.questions || [];
  check('POST /api/quiz 返回 5 题', qs.length === 5);
  check('抽题不泄露 answer', qs.every((q) => q.answer == null));
  check('每题含 stemHtml 与 options', qs.every((q) => q.stemHtml && q.options?.length));

  // 4) 判分闭环
  const answers = qs.map((q) => ({ qid: q.qid, selected: ['A'] }));
  const grade = await post('/api/grade', { answers, timeUsed: 42 });
  check('POST /api/grade total=5', grade.body?.summary?.total === 5);
  check('判分含分模块统计', (grade.body?.summary?.byModule?.length || 0) >= 1);
  check('逐题详情含 answer 字段', grade.body?.details?.[0]?.answer != null);

  // 5) 取题 review（含答案解析）
  const rev = await post('/api/questions', { qids: [qs[0].qid], mode: 'review' });
  check('POST /api/questions review 含 answer', rev.body?.questions?.[0]?.answer != null);

  // 6) count 统计
  const cnt = await post('/api/count', { count: 1, modules: ['06'] });
  check('POST /api/count 可用题量 > 0', cnt.body?.availableUnique > 0);

  // 7) 参数校验
  const bad = await post('/api/quiz', { count: 0 });
  check('POST /api/quiz 非法题量 → 400', bad.status === 400);

  // 8) 图片服务：从资料分析题里找一个 /img/ 路径
  const imgQuiz = await post('/api/quiz', { count: 40, modules: ['06'] });
  let imgUrl = null;
  const re = /\/img\/[^"' )]+\.(?:png|jpg|jpeg|gif)/i;
  for (const q of imgQuiz.body?.questions || []) {
    const hay = `${q.material?.html || ''}${q.stemHtml || ''}`;
    const m = hay.match(re);
    if (m) { imgUrl = m[0]; break; }
  }
  if (imgUrl) {
    const img = await fetch(BASE + imgUrl);
    check(`GET ${imgUrl.slice(0, 40)}… 返回图片`, img.status === 200 && /image/.test(img.headers.get('content-type') || ''));
  } else {
    console.log('  \x1b[33mSKIP\x1b[0m  未在资料分析题中找到图片引用');
  }

  // 9) 路径穿越防护
  const trav = await fetch(BASE + '/img/%2e%2e/%2e%2e/app/config.mjs');
  check('路径穿越被拦截 (403/404)', trav.status === 403 || trav.status === 404);

  // 10) 未知 API
  const nf = await fetch(BASE + '/api/nope');
  check('未知 API 返回 404', nf.status === 404);
} catch (err) {
  fail++;
  console.error('冒烟测试异常：', err);
} finally {
  server.close();
}

console.log('');
if (fail === 0) console.log(`\x1b[32m全部 ${pass} 项冒烟测试通过 ✅\x1b[0m`);
else console.log(`\x1b[31m${pass} 通过 / ${fail} 失败 ❌\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
