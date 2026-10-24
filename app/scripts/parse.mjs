/**
 * 题库构建脚本：解析 真题数据/ 下全部 md → 结构化 JSON 产物。
 *
 * 数据模型（重要）：
 *   同一道题（qid）会在多套试卷中重复出现（如各省联考共用题）。为此：
 *   - index.json 保留「全部出现记录」（每条带自己准确的年份/地区/试卷/材料），保证筛选维度不失真；
 *   - 各模块分片 questions-<code>.json 按 qid 去重存储「题目内容」，避免重复膨胀；
 *   - 抽题时服务器按 qid 去重，保证一套题内不出现重复内容。
 *
 * 产物（写入 app/data/）：
 *   - index.json               出现记录索引（服务器常驻内存，用于筛选/抽题）
 *   - questions-<code>.json    各模块内容分片：{ materials, questions }（按需懒加载）
 *   - meta.json                聚合元数据（模块/地区/年份/考点统计，供前端构建筛选表单）
 *
 * 用法：
 *   node scripts/parse.mjs                 解析全部
 *   node scripts/parse.mjs --module=01,04  仅解析指定模块
 *   node scripts/parse.mjs --limit=5       每模块最多解析 5 个文件（调试用）
 *
 * 零依赖：仅使用 Node 内置模块。
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_SOURCE, BUILD_OUTPUT, MODULES, FILES } from '../config.mjs';
import { parsePaper } from './lib/parsePaper.mjs';
import { refineKnowledgePoint } from './lib/knowledgePoint.mjs';

function parseArgs(argv) {
  const args = { modules: null, limit: Infinity };
  for (const arg of argv) {
    const m = /^--(\w+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'module') args.modules = val.split(',').map((s) => s.trim()).filter(Boolean);
    if (key === 'limit') args.limit = Number(val) || Infinity;
  }
  return args;
}

function inferYear(text) {
  const m = /(19|20)\d{2}/.exec(text || '');
  return m ? Number(m[0]) : null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  // 以 2 空格缩进输出，便于人工查看与版本 diff（体积换可读性）
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function listPaperFiles(moduleDir) {
  if (!fs.existsSync(moduleDir)) return [];
  return fs
    .readdirSync(moduleDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((f) => path.join(moduleDir, f));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  ensureDir(BUILD_OUTPUT);

  const targetModules = args.modules
    ? MODULES.filter((m) => args.modules.includes(m.code))
    : MODULES;

  const index = []; // 全部出现记录
  const stats = {
    files: 0,
    occurrences: 0, // 出现记录数（= index 长度）
    uniqueQuestions: 0, // 去重后唯一题目数
    materials: 0,
    skippedNoQid: 0,
    skippedNoAnswer: 0,
  };
  const moduleCounts = {}; // code -> 出现记录数
  const moduleUnique = {}; // code -> 唯一题目数
  const regionAgg = new Map(); // region -> 出现次数
  const yearAgg = new Map(); // year -> 出现次数
  const kpAgg = {}; // code -> Map(name -> count)
  const qidModules = new Map(); // qid -> Set(moduleCode)，用于检测跨模块 qid

  for (const mod of targetModules) {
    const moduleDir = path.join(DATA_SOURCE, mod.dir);
    const files = listPaperFiles(moduleDir).slice(0, args.limit);
    const shard = { module: mod.code, name: mod.name, materials: {}, questions: {} };
    const kpMap = new Map();
    const moduleQids = new Set(); // 本模块内容去重
    let occurrences = 0;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const baseName = path.basename(filePath, '.md');
      const fileKey = `${mod.code}/${baseName}`;

      let result;
      try {
        result = parsePaper(content, { fileKey });
      } catch (err) {
        console.error(`[跳过] 解析失败 ${fileKey}: ${err.message}`);
        continue;
      }
      stats.files += 1;

      const meta = result.meta || {};
      const paper = meta['试卷'] || baseName;
      const region = meta['地区'] || '';
      const year = Number(meta['年份']) || inferYear(baseName) || inferYear(paper);
      const isRealPaper = (meta['类型'] || '真题') === '真题';

      for (const mat of result.materials) {
        shard.materials[mat.id] = { html: mat.html, images: mat.images };
        stats.materials += 1;
      }

      for (const q of result.questions) {
        if (!isRealPaper) continue;

        // 内容按 qid 去重存储（同模块内首次出现写入内容）
        if (!moduleQids.has(q.qid)) {
          moduleQids.add(q.qid);
          shard.questions[q.qid] = {
            stemHtml: q.stemHtml,
            options: q.options,
            answer: q.answer,
            analysisHtml: q.analysisHtml,
            images: q.images,
            // 同一 qid 的材料内容一致，取首次出现的材料作为代表，使内容自包含
            materialId: q.materialId,
          };
        }

        // 考点细化：数量关系中把数列题从「数学运算」分出为「数字推理」
        const kp = refineKnowledgePoint(mod.code, q);

        // 索引保留每一条出现记录（含各自的年份/地区/试卷/材料）
        index.push({
          qid: q.qid,
          m: mod.code,
          y: year,
          r: region,
          k: kp,
          p: paper,
          multi: q.isMulti,
          ord: q.order,
        });
        occurrences += 1;

        // 跨模块 qid 检测
        if (!qidModules.has(q.qid)) qidModules.set(q.qid, new Set());
        qidModules.get(q.qid).add(mod.code);

        if (year) yearAgg.set(year, (yearAgg.get(year) || 0) + 1);
        if (region) regionAgg.set(region, (regionAgg.get(region) || 0) + 1);
        if (kp) kpMap.set(kp, (kpMap.get(kp) || 0) + 1);
      }

      stats.skippedNoQid += result.skipped.noQid;
      stats.skippedNoAnswer += result.skipped.noAnswer;
    }

    moduleCounts[mod.code] = occurrences;
    moduleUnique[mod.code] = moduleQids.size;
    stats.occurrences += occurrences;
    stats.uniqueQuestions += moduleQids.size;
    kpAgg[mod.code] = [...kpMap.entries()]
      .map(([name, c]) => ({ name, count: c }))
      .sort((a, b) => b.count - a.count);

    writeJson(path.join(BUILD_OUTPUT, FILES.shard(mod.code)), shard);
    console.log(
      `[${mod.code}] ${mod.name}: ${files.length} 卷 / ${occurrences} 条出现 / ${moduleQids.size} 唯一题 → ${FILES.shard(mod.code)}`
    );
  }

  index.sort((a, b) => a.m.localeCompare(b.m) || (a.y - b.y) || a.qid.localeCompare(b.qid));
  writeJson(path.join(BUILD_OUTPUT, FILES.index), index);

  const crossModuleQids = [...qidModules.values()].filter((s) => s.size > 1).length;
  const years = [...yearAgg.keys()].sort((a, b) => a - b);
  const meta = {
    generatedAt: new Date().toISOString(),
    totalOccurrences: index.length,
    totalUniqueQuestions: stats.uniqueQuestions,
    totalMaterials: stats.materials,
    modules: MODULES.map((m) => ({
      code: m.code,
      name: m.name,
      occurrences: moduleCounts[m.code] || 0,
      unique: moduleUnique[m.code] || 0,
    })),
    years: {
      min: years[0] ?? null,
      max: years[years.length - 1] ?? null,
      list: years.map((y) => ({ year: y, count: yearAgg.get(y) })),
    },
    regions: [...regionAgg.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    knowledgePoints: kpAgg,
    stats: { ...stats, crossModuleQids },
  };
  writeJson(path.join(BUILD_OUTPUT, FILES.meta), meta);

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('\n===== 构建完成 =====');
  console.log(
    `文件 ${stats.files} · 出现记录 ${stats.occurrences} · 唯一题 ${stats.uniqueQuestions} · 材料 ${stats.materials}`
  );
  console.log(
    `跳过：无 qid ${stats.skippedNoQid} · 无答案 ${stats.skippedNoAnswer} · 跨模块 qid ${crossModuleQids}`
  );
  console.log(`年份 ${meta.years.min}–${meta.years.max} · 地区 ${meta.regions.length} 个 · 耗时 ${secs}s`);
  console.log(`输出 → ${BUILD_OUTPUT}`);
}

main();
