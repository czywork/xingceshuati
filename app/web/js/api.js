/**
 * 后端 API 封装（零依赖，使用原生 fetch）。
 * 统一错误处理：非 2xx 抛出带 status 的 Error，message 取自后端 error.message。
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? JSON_HEADERS : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error('无法连接服务器，请确认已运行 npm start');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error?.message || `请求失败（${res.status}）`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  /** 获取筛选元数据（模块/地区/年份/考点） */
  getMeta: () => request('/api/meta'),

  /** 生成一套题（不含答案） */
  generateQuiz: (options) => request('/api/quiz', { method: 'POST', body: options }),

  /** 提交答案判分 */
  grade: (answers, timeUsed) =>
    request('/api/grade', { method: 'POST', body: { answers, timeUsed } }),

  /** 按 qid 取题；mode='review' 含答案与解析，'quiz' 不含 */
  fetchQuestions: (qids, mode = 'review') =>
    request('/api/questions', { method: 'POST', body: { qids, mode } }),
};
