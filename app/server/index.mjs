/**
 * 服务器入口（零依赖，Node 内置 http）。
 *  - /api/*  → JSON 接口
 *  - /img/*  → 真题图片（直接服务 真题数据/90-图片）
 *  - 其余    → 前端静态资源（web/）
 */
import { PORT, HOST, WEB_ROOT, IMG_SOURCE, BUILD_OUTPUT } from '../config.mjs';
import { QuestionBank } from './lib/bank.mjs';
import { createApp } from './app.mjs';

// 启动时加载题库索引（约 6MB，常驻内存）
const bank = new QuestionBank(BUILD_OUTPUT).load();
const server = createApp({ bank, webRoot: WEB_ROOT, imgSource: IMG_SOURCE });

server.listen(PORT, HOST, () => {
  const m = bank.getMeta();
  console.log('==============================================');
  console.log('  行测真题刷题系统已启动');
  console.log(`  访问地址: http://${HOST}:${PORT}`);
  console.log(`  题库: ${m.totalOccurrences} 条出现 / ${m.totalUniqueQuestions} 唯一题 / ${m.totalMaterials} 材料`);
  console.log('  按 Ctrl+C 停止');
  console.log('==============================================');
});
