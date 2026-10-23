/**
 * 单篇试卷 md 解析器。
 *
 * 支持两种结构：
 *  1) 平铺题：   `## 第 N 题　<sub>qid X · 考点</sub>`
 *  2) 材料题群： `## 材料 M` 材料内容 + `### 第 N 题　<sub>qid X · 考点</sub>` 子题
 *
 * 每题产出：qid、考点、题干 HTML、选项、答案（字母数组）、官方解析 HTML、所属材料 id。
 * 答案缺失（如「（缺）」且无 ✅ 标记）的题目会被跳过（无法判分）。
 */
import { parseFrontmatter } from './frontmatter.mjs';
import {
  normalizeContent,
  collectImages,
  stripAnswerMarker,
} from './content.mjs';

const HEADING_RE = /^(#{2,3})\s+(.*)$/;
const MATERIAL_TITLE_RE = /^材料/;
const QUESTION_TITLE_RE = /第\s*\d+\s*题/;
const OPTION_RE = /^-\s+\*\*([A-Z])\*\*[.．]\s*(.*)$/;
const ANSWER_RE = /^\*\*答案\*\*[：:]\s*(.*)$/;
const ANALYSIS_RE = /^\*\*官方解析\*\*/;
const QID_RE = /qid\s*(\d+)/i;
const KP_RE = /·\s*([^<]*?)\s*<\/sub>/;
const ORDER_RE = /第\s*(\d+)\s*题/;

/**
 * 从答案文本与选项中解析出正确答案字母数组。
 * 优先取答案行中的字母；为空时回退到被 ✅ 标记的选项。
 * @returns {string[]} 升序去重的字母数组，空数组表示无法判分
 */
export function parseAnswer(answerRaw, options) {
  let letters = (answerRaw || '').toUpperCase().match(/[A-Z]/g) || [];
  if (letters.length === 0) {
    letters = options.filter((o) => o.isAnswer).map((o) => o.key);
  }
  return [...new Set(letters)].sort();
}

/** 解析一个题目小节的内容行 */
function parseQuestionBody(lines) {
  const stemLines = [];
  const options = [];
  const analysisLines = [];
  let answerRaw = '';
  // stem → options → answered → analysis
  let mode = 'stem';

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (trimmed === '---' || trimmed === '***') continue; // 题目分隔线

    const optMatch = OPTION_RE.exec(line);
    if (optMatch) {
      mode = 'options';
      const { marked, clean } = stripAnswerMarker(optMatch[2]);
      options.push({ key: optMatch[1], html: normalizeContent(clean), isAnswer: marked });
      continue;
    }

    const ansMatch = ANSWER_RE.exec(trimmed);
    if (ansMatch) {
      answerRaw = ansMatch[1].trim();
      mode = 'answered';
      continue;
    }

    if (ANALYSIS_RE.test(trimmed)) {
      mode = 'analysis';
      // 同行可能紧跟解析内容：**官方解析**：xxx
      const rest = trimmed.replace(ANALYSIS_RE, '').replace(/^[：:]\s*/, '');
      if (rest) analysisLines.push(rest);
      continue;
    }

    if (mode === 'stem') {
      stemLines.push(line);
    } else if (mode === 'analysis') {
      analysisLines.push(line);
    } else if (mode === 'options') {
      // 选项理论上单行；若出现续行则并入上一个选项
      if (trimmed && options.length) {
        options[options.length - 1].html += '<br>' + normalizeContent(line);
      }
    }
    // mode === 'answered'：答案与解析之间的空行，忽略
  }

  return {
    stemHtml: normalizeContent(stemLines),
    options: options.map((o) => ({ key: o.key, html: o.html })),
    correctKeys: options.filter((o) => o.isAnswer).map((o) => o.key),
    answerRaw,
    analysisHtml: normalizeContent(analysisLines),
    _optionsWithFlag: options,
  };
}

/**
 * 解析单篇试卷。
 * @param {string} fileContent md 全文
 * @param {{ fileKey: string }} ctx fileKey 为全局唯一文件标识，用于生成材料 id
 * @returns {{ meta: object, materials: Array, questions: Array, skipped: { noQid: number, noAnswer: number } }}
 */
export function parsePaper(fileContent, { fileKey }) {
  const { meta, body } = parseFrontmatter(fileContent);
  const lines = body.split(/\r?\n/);

  const materials = [];
  const questions = [];
  const skipped = { noQid: 0, noAnswer: 0 };

  let currentMaterialId = null;
  let section = null; // { type:'material'|'question', heading?, index?, lines:[] }

  const flushMaterial = () => {
    const html = normalizeContent(section.lines);
    const id = `${fileKey}#m${section.index}`;
    materials.push({ id, index: section.index, html, images: collectImages(html) });
    currentMaterialId = id;
  };

  const flushQuestion = () => {
    const heading = section.heading;
    const qidMatch = QID_RE.exec(heading);
    const qid = qidMatch ? qidMatch[1] : null;
    if (!qid) {
      skipped.noQid += 1;
      return;
    }
    const kpMatch = KP_RE.exec(heading);
    const orderMatch = ORDER_RE.exec(heading);
    const parsed = parseQuestionBody(section.lines);
    const answer = parseAnswer(parsed.answerRaw, parsed._optionsWithFlag);
    if (answer.length === 0) {
      skipped.noAnswer += 1;
      return;
    }

    const stemHtml = parsed.stemHtml;
    const analysisHtml = parsed.analysisHtml;
    const images = [
      ...collectImages(stemHtml),
      ...parsed.options.flatMap((o) => collectImages(o.html)),
      ...collectImages(analysisHtml),
    ];

    questions.push({
      qid,
      knowledgePoint: kpMatch ? kpMatch[1].trim() : '',
      order: orderMatch ? Number(orderMatch[1]) : null,
      stemHtml,
      options: parsed.options,
      answer,
      isMulti: answer.length > 1,
      analysisHtml,
      materialId: section.level === 3 ? currentMaterialId : null,
      images,
    });
  };

  const flush = () => {
    if (!section) return;
    if (section.type === 'material') flushMaterial();
    else if (section.type === 'question') flushQuestion();
    section = null;
  };

  for (const line of lines) {
    const h = HEADING_RE.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const title = h[2].trim();
      if (MATERIAL_TITLE_RE.test(title)) {
        const idx = /材料\s*(\d+)/.exec(title);
        section = {
          type: 'material',
          index: idx ? Number(idx[1]) : materials.length + 1,
          level,
          lines: [],
        };
      } else if (QUESTION_TITLE_RE.test(title)) {
        section = { type: 'question', heading: title, level, lines: [] };
      } else {
        section = { type: 'other', level, lines: [] };
      }
      continue;
    }
    if (section && section.type !== 'other') section.lines.push(line);
  }
  flush();

  return { meta, materials, questions, skipped };
}
