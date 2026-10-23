/**
 * 全局路径与常量配置。
 * 解析脚本（scripts）与服务器（server）共用，保证路径一致。
 * 零依赖：仅使用 Node 内置模块。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** app/ 目录绝对路径 */
export const APP_ROOT = __dirname;
/** 仓库根目录（app 的上一级，即 xingceshuti/） */
export const REPO_ROOT = path.resolve(__dirname, '..');

/** 原始真题数据目录（只读） */
export const DATA_SOURCE = path.join(REPO_ROOT, '真题数据');
/** 图片资源目录（公式图 / 题目图） */
export const IMG_SOURCE = path.join(DATA_SOURCE, '90-图片');

/** 解析产物输出目录 */
export const BUILD_OUTPUT = path.join(APP_ROOT, 'data');
/** 前端静态资源目录 */
export const WEB_ROOT = path.join(APP_ROOT, 'web');

/** 服务器监听端口（可用环境变量 PORT 覆盖） */
export const PORT = Number(process.env.PORT || 5173);
/** 服务器监听主机 */
export const HOST = process.env.HOST || '127.0.0.1';

/**
 * 模块编码 → 展示名 / 数据子目录名。
 * 子目录形如 "01-政治理论"，与编码一一对应。
 */
export const MODULES = [
  { code: '01', name: '政治理论', dir: '01-政治理论' },
  { code: '02', name: '常识判断', dir: '02-常识判断' },
  { code: '03', name: '言语理解与表达', dir: '03-言语理解与表达' },
  { code: '04', name: '数量关系', dir: '04-数量关系' },
  { code: '05', name: '判断推理', dir: '05-判断推理' },
  { code: '06', name: '资料分析', dir: '06-资料分析' },
];

/** 模块编码 → 模块对象 的快速查表 */
export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.code, m]));

/** 图片在 md 中的相对前缀（相对各模块目录） */
export const IMG_REL_PREFIX = '../90-图片/';
/** 前端访问图片的 URL 前缀（由服务器映射到 IMG_SOURCE） */
export const IMG_URL_PREFIX = '/img/';

/** 构建产物文件名 */
export const FILES = {
  index: 'index.json',
  meta: 'meta.json',
  /** 模块内容分片：questions-<code>.json */
  shard: (code) => `questions-${code}.json`,
};
