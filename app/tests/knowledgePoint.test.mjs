import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNumberSeriesQuestion,
  refineKnowledgePoint,
  NUMBER_SERIES_KP,
} from '../scripts/lib/knowledgePoint.mjs';

test('数列题：数字以文本给出 → 数字推理', () => {
  assert.equal(isNumberSeriesQuestion('<p>-12，-7，2，19，52，（ ）</p>'), true);
  assert.equal(isNumberSeriesQuestion('<p>1/2，1，1，（ ），9/11，11/13</p>'), true);
  // 空格分隔，验证不会因去空白而粘连
  assert.equal(isNumberSeriesQuestion('<p>13 26 39 52 （ ）</p>'), true);
  assert.equal(isNumberSeriesQuestion('<p>4.2，5.2，8.4，17.8，44.22，( )</p>'), true);
});

test('数列题：数字被截成图片 → 仍为数字推理', () => {
  assert.equal(
    isNumberSeriesQuestion('<p><img src="/img/题目图/a.png" />，<img src="/img/题目图/b.png" />，1，5，35，( )</p>'),
    true
  );
  assert.equal(
    isNumberSeriesQuestion('<p><img src="/img/题目图/a.png" />，<img src="/img/题目图/b.png" />，（ ）。</p>'),
    true
  );
  // 数字与图片混合：部分数字被截成公式图
  assert.equal(
    isNumberSeriesQuestion('<p><img src="/img/公式图/a.png" />，-1，<img src="/img/公式图/b.png" />，（ ）</p>'),
    true
  );
});

test('数学运算题：含文字描述 → 不判定为数字推理', () => {
  assert.equal(
    isNumberSeriesQuestion('<p>某电器工作功耗为370瓦，待机状态下功耗为37瓦，问其周一的耗电量是周二的多少倍？</p>'),
    false
  );
  assert.equal(isNumberSeriesQuestion('<p>甲、乙两部门每隔两天、每隔3天有一个发布日，最多有几天同时发布？</p>'), false);
});

test('含字母的代数题 → 不判定为数列题', () => {
  assert.equal(isNumberSeriesQuestion('<p>x²+y²=（ ）</p>'), false);
});

test('空题干不判定；题干整张是图片 → 判定为数列题', () => {
  assert.equal(isNumberSeriesQuestion(''), false);
  assert.equal(isNumberSeriesQuestion('<p></p>'), false);
  // 数量关系中题干完全没有汉字、只有一张图，即数列被渲染成图片
  assert.equal(isNumberSeriesQuestion('<p><img src="/img/题目图/a.png" /></p>'), true);
});

test('仅数量关系模块的「数学运算」会被细化', () => {
  const series = { knowledgePoint: '数学运算', stemHtml: '<p>2，3，5，8，13，（ ）</p>' };
  const wordy = { knowledgePoint: '数学运算', stemHtml: '<p>甲乙两人相向而行，甲速度为5米每秒</p>' };

  assert.equal(refineKnowledgePoint('04', series), NUMBER_SERIES_KP);
  assert.equal(refineKnowledgePoint('04', wordy), '数学运算');
  // 其他模块 / 其他考点原样返回
  assert.equal(refineKnowledgePoint('05', { knowledgePoint: '图形推理', stemHtml: '<p>2，3，5</p>' }), '图形推理');
  assert.equal(refineKnowledgePoint('04', { knowledgePoint: '资料分析', stemHtml: '<p>2，3，5</p>' }), '资料分析');
  assert.equal(refineKnowledgePoint('04', { knowledgePoint: '', stemHtml: '<p>2，3，5</p>' }), '');
});