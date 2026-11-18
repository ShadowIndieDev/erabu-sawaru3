// SPDX-License-Identifier: GPL-3.0-or-later
// node --test Tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../Web/logic.js');

const pic = id => ({kind: 'builtin', id});
const q3 = (id, a = 'apple', b = 'banana', c = 'rice') => ({id, question: 'どれ？', options: [{id: id + 'a', label: 'A', image: pic(a)}, {id: id + 'b', label: 'B', image: pic(b)}, {id: id + 'c', label: 'C', image: pic(c)}]});
const q2 = (id, a = 'apple', b = 'banana') => ({id, question: 'どちら？', options: [{id: id + 'a', label: 'A', image: pic(a)}, {id: id + 'b', label: 'B', image: pic(b)}]});

test('左右の判定：真ん中で分け、反応しない幅の中は選ばない', () => {
  assert.equal(L.sideAt(10, 1000), 'left');
  assert.equal(L.sideAt(499.9, 1000), 'left');
  assert.equal(L.sideAt(500, 1000), 'right');
  assert.equal(L.sideAt(990, 1000), 'right');
  assert.equal(L.sideAt(-30, 1000), 'left', '左の余白に触れても左');
  assert.equal(L.sideAt(1030, 1000), 'right', '右の余白に触れても右');
  assert.equal(L.sideAt(470, 1000, 'narrow'), null);
  assert.equal(L.sideAt(459, 1000, 'narrow'), 'left');
  assert.equal(L.sideAt(541, 1000, 'narrow'), 'right');
  assert.equal(L.sideAt(430, 1000, 'wide'), null);
  assert.equal(L.sideAt(NaN, 1000), null);
  assert.equal(L.sideAt(10, 0), null);
});

test('3択の区切り：3つに分け、2つの境目の反応しない幅の中は選ばない', () => {
  assert.equal(L.slotAt(10, 900, 3), 0);
  assert.equal(L.slotAt(299, 900, 3), 0);
  assert.equal(L.slotAt(300, 900, 3), 1);
  assert.equal(L.slotAt(599, 900, 3), 1);
  assert.equal(L.slotAt(600, 900, 3), 2);
  assert.equal(L.slotAt(-20, 900, 3), 0, '左の余白は左');
  assert.equal(L.slotAt(950, 900, 3), 2, '右の余白は右');
  assert.equal(L.slotAt(300, 900, 3, 'narrow'), null);
  assert.equal(L.slotAt(600, 900, 3, 'wide'), null);
  assert.equal(L.slotAt(450, 900, 3, 'wide'), 1, '真ん中の区切りの中ほどは選べる');
  assert.equal(L.slotAt(450, 900, 2, 'narrow'), null, '2択は真ん中が境目');
  assert.equal(L.slotAt(10, 900, 4), null);
});

test('3択：選んで保ち、入れ替えは左と右だけを替える', () => {
  const s = new L.ChoiceSession(L.normalizeSet({id: 's', name: 'S', questions: [q3('q1'), q2('q2')]}));
  assert.equal(s.size, 3);
  assert.equal(s.optionAt(1).id, 'q1b');
  assert.equal(s.choose(1).id, 'q1b');
  assert.equal(s.chosenSlot, 1);
  assert.equal(s.chosenSide, 'middle');
  assert.equal(s.choose(0), null);
  s.swap();
  assert.equal(s.optionAt('left').id, 'q1c');
  assert.equal(s.optionAt(1).id, 'q1b');
  assert.equal(s.choose('right').id, 'q1a');
  assert.equal(s.chosenSlot, 2);
  s.go(1);
  assert.equal(s.size, 2);
});

test('選んだら保つ：えらびなおすまで、もう選ばない', () => {
  const s = new L.ChoiceSession(L.normalizeSet({id: 's', name: 'S', questions: [q2('q1'), q2('q2', 'dog', 'cat')]}));
  assert.equal(s.choose('left').id, 'q1a');
  assert.equal(s.choose('right'), null);
  assert.equal(s.chosenSide, 'left');
  s.reset();
  assert.equal(s.choose('right').id, 'q1b');
  assert.equal(s.go(1), true, '次の質問へは支援者が進める');
  assert.equal(s.selected, null);
  assert.equal(s.go(1), false);
  s.swap();
  assert.equal(s.optionAt('left').id, 'q2b');
  assert.equal(s.choose('left').id, 'q2b');
  assert.equal(s.chosenSide, 'left');
});

test('最初のセットは2択だけで、正しい形', () => {
  const sets = L.starterSets();
  assert.ok(sets.length >= 1);
  for (const set of sets) for (const q of set.questions) assert.equal(q.options.length, 2);
});

test('2択か3択だけ作れる', () => {
  assert.throws(() => L.normalizeQuestion({id: 'q', question: 'x', options: [{id: 'a', label: 'a', image: pic('apple')}]}));
  assert.equal(L.normalizeQuestion(q3('q')).options.length, 3);
  assert.throws(() => L.normalizeQuestion({id: 'q', question: 'x', options: [1, 2, 3, 4].map(i => ({id: 'o' + i, label: 'a', image: pic('apple')}))}));
  assert.throws(() => L.normalizeQuestion({...q3('q'), options: [...q3('q').options.slice(0, 2), {...q3('q').options[0]}]}), /重複/);
  assert.throws(() => L.normalizeQuestion({...q3('q'), options: [q3('q').options[0], {id: 'z', label: ' ', image: pic('apple')}, q3('q').options[2]]}), /真ん中の言葉/);
  assert.throws(() => L.normalizeQuestion({...q2('q'), question: ' '}), /問いかけ/);
  assert.throws(() => L.normalizeQuestion({...q2('q'), options: [{id: 'a', label: 'A', image: pic('nothing')}, {id: 'b', label: 'B', image: pic('apple')}]}), /絵か写真/);
});

test('元のアプリのファイル：4択は読み飛ばし、2択・3択は新しいIDで読む', () => {
  let n = 0;
  const id = () => 'new-' + (++n);
  const file = JSON.stringify({format: 'erabu-choice-sets', version: 2, sets: [
    {id: 'x', name: '混ざったセット', questions: [q2('a'), {id: 'b', question: '3つ', options: [1, 2, 3].map(i => ({id: 'b' + i, label: 'L' + i, image: pic('dog')}))}, q2('c')]},
    {id: 'y', name: '4択だけ', questions: [{id: 'd', question: '4つ', options: [1, 2, 3, 4].map(i => ({id: 'd' + i, label: 'L' + i, image: pic('cat')}))}]}
  ]});
  const r = L.importSets(file, id);
  assert.equal(r.sets.length, 1);
  assert.equal(r.sets[0].questions.length, 3);
  assert.equal(r.sets[0].questions[1].options.length, 3);
  assert.equal(r.skippedQuestions, 1);
  assert.equal(r.skippedSets, 1);
  assert.ok(r.sets[0].id.startsWith('new-'));
  assert.ok(r.sets[0].questions.every(q => q.id.startsWith('new-') && q.options.every(o => o.id.startsWith('new-'))));
});

test('元のアプリの版1（質問が1つのセット）も読む', () => {
  const file = JSON.stringify({format: 'erabu-choice-sets', version: 1, sets: [{id: 'old', name: '前の形', question: 'どっち？', options: q2('z').options}]});
  const r = L.importSets(file);
  assert.equal(r.sets.length, 1);
  assert.equal(r.sets[0].questions[0].question, 'どっち？');
});

test('違うファイルは読まない', () => {
  assert.throws(() => L.importSets('not json'), /読み取れません/);
  assert.throws(() => L.importSets(JSON.stringify({format: 'other', version: 2, sets: []})), /えらぶの窓/);
});

test('書き出しは元のアプリと同じ形式で、読み戻せる', () => {
  const set = L.starterSets()[0];
  const text = L.exportSet(set);
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, 'erabu-choice-sets');
  assert.equal(parsed.version, 2);
  const back = L.importSets(text);
  assert.equal(back.sets[0].name, set.name);
  assert.equal(back.sets[0].questions.length, set.questions.length);
  assert.equal(back.skippedQuestions, 0);
});

test('3択のセットも書き出して読み戻せる', () => {
  const set = L.normalizeSet({id: 's', name: '3つ', questions: [q3('a'), q2('b')]});
  const back = L.importSets(L.exportSet(set)).sets[0];
  assert.deepEqual(back.questions.map(q => q.options.length), [3, 2]);
  assert.equal(back.questions[0].options[2].label, 'C');
});

test('写真は data:image だけを受け付ける', () => {
  assert.deepEqual(L.validImage({kind: 'photo', data: 'data:image/jpeg;base64,AAAA'}), {kind: 'photo', data: 'data:image/jpeg;base64,AAAA'});
  assert.throws(() => L.validImage({kind: 'photo', data: 'https://example.com/a.jpg'}));
  assert.throws(() => L.validImage({kind: 'photo', data: 'data:image/svg+xml;base64,AAAA'}));
});

test('GIFはそのまま受け付け、上限は別', () => {
  const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  assert.deepEqual(L.validImage({kind: 'photo', data: gif}), {kind: 'photo', data: gif});
  const big = 'data:image/gif;base64,R0lGODlh' + 'A'.repeat(3000000);
  assert.equal(L.validImage({kind: 'photo', data: big}).data, big);
  assert.throws(() => L.validImage({kind: 'photo', data: 'data:image/gif;base64,R0lGODlh' + 'A'.repeat(L.LIMITS.gifChars)}));
  assert.throws(() => L.validImage({kind: 'photo', data: 'data:image/gif;base64,AAAA'}));
  assert.throws(() => L.validImage({kind: 'photo', data: 'data:image/jpeg;base64,' + 'A'.repeat(3000000)}));
  const set = L.starterSets()[0]; set.questions[0].options[0].image = {kind: 'photo', data: gif};
  const back = L.importSets(L.exportSet(set)).sets[0];
  assert.equal(back.questions[0].options[0].image.data, gif);
});

test('設定は決まった値だけを残す', () => {
  const p = L.sanitizePrefs({deadZone: 'huge', afterTouch: 'repeat', labels: false, rate: 9, keepAwake: false, setId: 's1'});
  assert.equal(p.deadZone, 'none');
  assert.equal(p.afterTouch, 'repeat');
  assert.equal(p.labels, false);
  assert.equal(p.rate, 1.3);
  assert.equal(p.keepAwake, false);
  assert.equal(p.setId, 's1');
  assert.deepEqual(L.sanitizePrefs(null), {...L.DEFAULT_PREFS});
});
