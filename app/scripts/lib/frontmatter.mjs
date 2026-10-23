/**
 * 解析 md 文件头部的 YAML-ish frontmatter（由 --- 包裹的 key: "value" 行）。
 * 仅处理本项目实际的简单键值格式，不引入 YAML 库（零依赖）。
 */

/**
 * @param {string} fileContent 整个 md 文件文本
 * @returns {{ meta: Record<string,string>, body: string }}
 */
export function parseFrontmatter(fileContent) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(fileContent);
  if (!match) return { meta: {}, body: fileContent };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([^:]+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body: fileContent.slice(match[0].length) };
}
