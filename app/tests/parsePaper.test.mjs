import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaper, parseAnswer } from '../scripts/lib/parsePaper.mjs';

const FRONT = `---
类型: "真题"
试卷: "2016年北京市公务员录用考试《行测》题"
地区: "北京"
年份: "2016"
模块: "政治理论"
题数: "2"
---

# 2016年北京市公务员录用考试《行测》题

> 政治理论 · 2 题 · 北京 2016
`;

test('解析平铺单选题：qid/考点/题干/选项/答案/解析', () => {
  const md =
    FRONT +
    `
## 第 1 题　<sub>qid 1752692 · 新思想</sub>

题干内容（  ）。

- **A**. 选项一
- **B**. 选项二　✅
- **C**. 选项三
- **D**. 选项四

**答案**：B

**官方解析**

因为所以，故正确答案为B。

---
`;
  const { questions, materials } = parsePaper(md, { fileKey: '01/北京2016' });
  assert.equal(materials.length, 0);
  assert.equal(questions.length, 1);
  const q = questions[0];
  assert.equal(q.qid, '1752692');
  assert.equal(q.knowledgePoint, '新思想');
  assert.equal(q.order, 1);
  assert.equal(q.stemHtml, '题干内容（  ）。');
  assert.deepEqual(
    q.options.map((o) => o.key),
    ['A', 'B', 'C', 'D']
  );
  assert.deepEqual(q.answer, ['B']);
  assert.equal(q.isMulti, false);
  assert.equal(q.materialId, null);
  assert.match(q.analysisHtml, /故正确答案为B/);
});

test('解析多选题：答案 ABCD', () => {
  const md =
    FRONT +
    `
## 第 1 题　<sub>qid 100 · 考点X</sub>

下列哪些正确（  ）

- **A**. 甲　✅
- **B**. 乙　✅
- **C**. 丙　✅
- **D**. 丁　✅

**答案**：ABCD

**官方解析**

全对。
`;
  const { questions } = parsePaper(md, { fileKey: '01/x' });
  assert.deepEqual(questions[0].answer, ['A', 'B', 'C', 'D']);
  assert.equal(questions[0].isMulti, true);
});

test('答案含顿号分隔也能解析', () => {
  assert.deepEqual(parseAnswer('A、B、C', []), ['A', 'B', 'C']);
  assert.deepEqual(parseAnswer('（缺）', [{ key: 'C', isAnswer: true }]), ['C']);
  assert.deepEqual(parseAnswer('（缺）', []), []);
});

test('材料题群：子题关联材料 id，材料单独产出', () => {
  const md =
    FRONT +
    `
## 材料 1

<p>材料正文<img width="700px" src="../90-图片/题目图/abc.png" /></p>

### 第 1 题　<sub>qid 200 · 增长</sub>

根据材料，答案是？

- **A**. 2　✅
- **B**. 3

**答案**：A

**官方解析**

定位材料可知。

---

### 第 2 题　<sub>qid 201 · 比重</sub>

比重约为？

- **A**. 上升
- **B**. 下降　✅

**答案**：B

**官方解析**

略。
`;
  const { questions, materials } = parsePaper(md, { fileKey: '06/资料' });
  assert.equal(materials.length, 1);
  assert.equal(materials[0].id, '06/资料#m1');
  // 图片路径已重写为 /img/
  assert.match(materials[0].html, /src="\/img\/题目图\/abc\.png"/);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].materialId, '06/资料#m1');
  assert.equal(questions[1].materialId, '06/资料#m1');
});

test('选项含 HTML 图片：保留结构并重写路径', () => {
  const md =
    FRONT +
    `
## 第 1 题　<sub>qid 300 · 图形推理</sub>

<p>选出最合适的一项</p>

- **A**. <p><img flag="tex" src="../90-图片/公式图/f1.png" /></p>
- **B**. <p>文本选项</p>　✅
- **C**. <p>丙</p>
- **D**. <p>丁</p>

**答案**：B

**官方解析**

<p>解析<img src="../90-图片/公式图/f2.png" /></p>
`;
  const { questions } = parsePaper(md, { fileKey: '05/g' });
  const q = questions[0];
  assert.match(q.options[0].html, /src="\/img\/公式图\/f1\.png"/);
  assert.equal(q.options[1].html, '<p>文本选项</p>');
  assert.deepEqual(q.answer, ['B']);
  assert.match(q.analysisHtml, /src="\/img\/公式图\/f2\.png"/);
  assert.ok(q.images.includes('/img/公式图/f1.png'));
  assert.ok(q.images.includes('/img/公式图/f2.png'));
});

test('多行纯文本题干拼接为 <br>', () => {
  const md =
    FRONT +
    `
## 第 1 题　<sub>qid 400 · 逻辑</sub>

第一行前提。
第二行问题？

- **A**. 甲　✅
- **B**. 乙

**答案**：A

**官方解析**

略。
`;
  const { questions } = parsePaper(md, { fileKey: '05/l' });
  assert.equal(questions[0].stemHtml, '第一行前提。<br>第二行问题？');
});

test('答案缺失且无 ✅ 标记的题目被跳过', () => {
  const md =
    FRONT +
    `
## 第 1 题　<sub>qid 500 · 考点</sub>

题干。

- **A**. 甲
- **B**. 乙

**答案**：（缺）

**官方解析**

无。
`;
  const { questions, skipped } = parsePaper(md, { fileKey: '03/s' });
  assert.equal(questions.length, 0);
  assert.equal(skipped.noAnswer, 1);
});
