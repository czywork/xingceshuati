/**
 * 元数据缓存：首次访问拉取 /api/meta 并缓存于内存。
 */
import { api } from './api.js';

let cache = null;
let pending = null;

export async function getMeta() {
  if (cache) return cache;
  if (!pending) {
    pending = api.getMeta().then((m) => {
      cache = m;
      return m;
    });
  }
  return pending;
}

/** 模块编码 → 名称 */
export function moduleName(code) {
  return cache?.modules.find((m) => m.code === code)?.name || code;
}
