/**
 * 考点细化规则。
 *
 * 数据源 md 中每题已带考点标签（如「数学运算」），但个别模块粒度偏粗：
 * 数量关系（04）的题在题库里被统一标为「数学运算」，其中还混有大量
 * 「数字推理（数列推理）」题。这类题的题干是纯数字序列、不含任何汉字，
 * 而数学运算题必然有文字场景描述，因此「题干无汉字」是可靠的区分信号。
 *
 * 规则集中在本文件，便于维护与单元测试。
 */

/** 汉字字符 */
const HAN_RE = /[\u4e00-\u9fa5]/;
/** 数字序列题干中允许出现的非数字字符（分隔符、括号、运算符、空白等） */
const SERIES_NOISE_RE = /[，,、;；:：()（）\[\]【】{}<>《》\s.．。·…～~\-—_/／|｜"'“”‘’]/g;
/** 数量关系模块编码 */
const QUANT_MODULE = '04';
/** 数量关系题在题库中的原始考点标签 */
const QUANT_ORIGINAL_KP = '数学运算';

/** 细分出的数列推理考点名（行测标准名称，即俗称的“数列推理”） */
export const NUMBER_SERIES_KP = '数字推理';

/** HTML → 纯文本（去标签与常见实体） */
function toPlainText(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

/**
 * 题干是否属于「数字推理」形式。
 *
 * 判据：题干不含汉字（数学运算题必有文字场景描述），且
 *  - 数字以文本给出（出现 ≥2 个数字），如 “-12，-7，2，19，52，（ ）”；或
 *  - 数字被截成公式图/题目图，剔除数字与分隔符后已无可读内容（含题干整张是图片的情况）。
 * 含拉丁字母的代数题（如 “x²+y²=（ ）”）不属于数列题。
 * @param {string} stemHtml 题干 HTML
 * @returns {boolean}
 */
export function isNumberSeriesQuestion(stemHtml) {
  const html = String(stemHtml ?? '');
  // 保留空白：题干中数字常以空格分隔（如 “13 26 39 52”），合并会漏判
  const text = toPlainText(html).trim();
  if (HAN_RE.test(text)) return false;

  const nums = text.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length >= 2) return true;

  // 去掉数字与分隔符后仍有内容（字母、符号等）→ 不是数列题
  const residue = text.replace(/\d+(?:\.\d+)?/g, '').replace(SERIES_NOISE_RE, '');
  return residue.length === 0 && /<img\b/i.test(html);
}

/**
 * 按模块细化考点。
 * 目前仅处理数量关系：把其中的数列题从「数学运算」改写为「数字推理」。
 * @param {string} moduleCode 模块编码
 * @param {{knowledgePoint?: string, stemHtml?: string}} q 题目对象
 * @returns {string} 细化后的考点；无法判断时原样返回
 */
export function refineKnowledgePoint(moduleCode, q) {
  const kp = (q && q.knowledgePoint) || '';
  if (moduleCode !== QUANT_MODULE || kp !== QUANT_ORIGINAL_KP) return kp;
  return isNumberSeriesQuestion(q.stemHtml) ? NUMBER_SERIES_KP : kp;
}