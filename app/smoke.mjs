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
  check('首页引用站点图标', homeText.includes('/图标.png'));

  const jsRes = await fetch(BASE + '/js/main.js');
  check('GET /js/main.js (JS MIME)', jsRes.status === 200 && /javascript/.test(jsRes.headers.get('content-type') || ''));

  const cssRes = await fetch(BASE + '/css/base.css');
  check('GET /css/base.css (CSS MIME)', cssRes.status === 200 && /css/.test(cssRes.headers.get('content-type') || ''));

  const cssText = await cssRes.text();
  check('base.css 含纸墨令牌与夜读主题', cssText.includes('--font-serif') && cssText.includes('[data-theme="dark"]'));
  check('首页含日/夜切换按钮与主题引导脚本', homeText.includes('theme-toggle') && homeText.includes('xingce-theme'));

  const pageRes = await fetch(BASE + '/js/pages/quiz.js');
  check('GET /js/pages/quiz.js', pageRes.status === 200);

  const iconRes = await fetch(BASE + '/图标.png');
  check('GET /图标.png（站点图标）返回图片', iconRes.status === 200 && /image\/png/.test(iconRes.headers.get('content-type') || ''));

  // 缓存策略：文本资源协商缓存（改完刷新即生效），图片长期强缓存
  const cssEtag = cssRes.headers.get('etag') || '';
  const cssCache = cssRes.headers.get('cache-control') || '';
  check('CSS/JS 走协商缓存（ETag + no-cache）', /^W\/"/.test(cssEtag) && cssCache.includes('no-cache'));
  check('图片长期强缓存（max-age=604800）', /max-age=604800/.test(iconRes.headers.get('cache-control') || ''));
  const revalidated = await fetch(BASE + '/css/base.css', { headers: { 'If-None-Match': cssEtag } });
  check('带 If-None-Match 命中缓存返回 304', revalidated.status === 304);

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

  // 8) 图片服务：收集资料分析题里的 /img/ 引用，逐个尝试直到成功（避免随机抽题导致的偶发失败）
  const imgQuiz = await post('/api/quiz', { count: 60, modules: ['06'] });
  const re = /\/img\/[^"' )>\s]+\.(?:png|jpg|jpeg|gif)/gi;
  const candidates = new Set();
  for (const q of imgQuiz.body?.questions || []) {
    const hay = `${q.material?.html || ''}${q.stemHtml || ''}`;
    for (const m of hay.matchAll(re)) candidates.add(m[0]);
  }
  let imgOk = false;
  for (const url of candidates) {
    const img = await fetch(BASE + url);
    if (img.status === 200 && /image/.test(img.headers.get('content-type') || '')) { imgOk = true; break; }
  }
  if (candidates.size) check(`GET 题目图片（${candidates.size} 个候选）返回图片`, imgOk);
  else console.log('  \x1b[33mSKIP\x1b[0m  未在资料分析题中找到图片引用');

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
