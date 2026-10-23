/**
 * 极简路由：按「方法 + 精确路径」匹配处理器。
 * API 路径固定，无需路径参数，保持零依赖与可读性。
 */
export function createRouter() {
  const routes = new Map();
  return {
    /** 注册路由 */
    add(method, path, handler) {
      routes.set(`${method.toUpperCase()} ${path}`, handler);
      return this;
    },
    /** 匹配路由，未命中返回 undefined */
    match(method, path) {
      return routes.get(`${method.toUpperCase()} ${path}`);
    },
  };
}
