// SPDX-License-Identifier: GPL-3.0-or-later
// えらぶの窓 さわる2・3択：画面に依存しない決まり（セットの形・読み込み・触れた位置の判定）。
// 0.2.0：質問ごとに2択（左・右）か3択（左・真ん中・右）を選べる。
// Node のテストとページの両方から読む。
(function (root) {
  'use strict';

  // 見本の絵（assets/choices-atlas.png の 4列×2行）。並びは元の「えらぶの窓」と同じ。
  const ASSETS = [
    {id: 'apple', label: 'りんご', col: 0, row: 0}, {id: 'banana', label: 'バナナ', col: 1, row: 0},
    {id: 'rice', label: 'おにぎり', col: 2, row: 0}, {id: 'bread', label: 'パン', col: 3, row: 0},
    {id: 'dog', label: 'いぬ', col: 0, row: 1}, {id: 'cat', label: 'ねこ', col: 1, row: 1},
    {id: 'rabbit', label: 'うさぎ', col: 2, row: 1}, {id: 'elephant', label: 'ぞう', col: 3, row: 1}
  ];
  const LIMITS = {setName: 50, question: 80, label: 40, speech: 200, questions: 50, sets: 50,
    fileBytes: 50 * 1024 * 1024, photoChars: 2200000, gifBytes: 5 * 1024 * 1024, gifChars: 7000000, id: 100};
  // 真ん中の反応しない幅（画面の幅に対する割合）。
  const DEAD_ZONES = {none: 0, narrow: 0.08, wide: 0.16};
  const DEFAULT_PREFS = {deadZone: 'none', afterTouch: 'none', labels: true, rate: 0.9, keepAwake: true};

  const makeId = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

  function fail(message, field) { const e = new Error(message); if (field) e.field = field; return e; }
  function clean(value, max, name, field) {
    if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > max) throw fail(`${name}を1〜${max}文字で入力してください。`, field);
    return value.trim();
  }
  function cleanId(value, fresh, id) {
    if (fresh) return id();
    if (typeof value !== 'string' || !value || value.length > LIMITS.id) throw fail('IDが正しくありません。');
    return value;
  }
  function validImage(image) {
    if (image && image.kind === 'builtin' && ASSETS.some(a => a.id === image.id)) return {kind: 'builtin', id: image.id};
    if (image && image.kind === 'photo' && typeof image.data === 'string' && image.data.length <= LIMITS.photoChars &&
        /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.data)) return {kind: 'photo', data: image.data};
    // GIF：動きを残すため縮めずにそのまま保存するので、上限を別に持つ。
    if (image && image.kind === 'photo' && typeof image.data === 'string' && image.data.length <= LIMITS.gifChars &&
        /^data:image\/gif;base64,R0lGOD[A-Za-z0-9+/]+=*$/.test(image.data)) return {kind: 'photo', data: image.data};
    throw fail('それぞれの選択肢に、見本の絵か写真を設定してください。');
  }
  // 選べる数は2つか3つ。並びは画面の左から。
  const CHOICE_COUNTS = [2, 3];
  const SLOT_NAMES = {2: ['左', '右'], 3: ['左', '真ん中', '右']};
  const slotName = (count, index) => (SLOT_NAMES[count] || SLOT_NAMES[2])[index] || `${index + 1}つ目`;
  function normalizeOption(raw, index, fresh, id, count) {
    const name = slotName(count, index);
    if (!raw || typeof raw !== 'object') throw fail(`${name}の選択肢を確認してください。`);
    return {
      id: cleanId(raw.id, fresh, id),
      label: clean(raw.label, LIMITS.label, `${name}の言葉`, `label-${index}`),
      speech: typeof raw.speech === 'string' ? Array.from(raw.speech.trim()).slice(0, LIMITS.speech).join('') : '',
      image: validImage(raw.image)
    };
  }
  const usableQuestion = q => !!q && Array.isArray(q.options) && CHOICE_COUNTS.includes(q.options.length);
  // 2択か3択だけ。4択などは呼び出し側で読み飛ばす。
  function normalizeQuestion(raw, {freshIds = false, id = makeId} = {}) {
    if (!usableQuestion(raw)) throw fail('選択肢は2つ（左・右）か3つ（左・真ん中・右）にしてください。');
    const count = raw.options.length;
    const q = {id: cleanId(raw.id, freshIds, id), question: clean(raw.question, LIMITS.question, '問いかけ', 'question'),
      options: raw.options.map((o, i) => normalizeOption(o, i, freshIds, id, count))};
    if (new Set(q.options.map(o => o.id)).size !== count) throw fail('選択肢のIDが重複しています。');
    return q;
  }
  function rawQuestions(raw) {
    // 元のアプリの版1（質問が1つだけのセット）も読む。
    return raw.questions === undefined ? [{id: 'q-' + String(raw.id || 'legacy').slice(0, 98), question: raw.question, options: raw.options}] : raw.questions;
  }
  function normalizeSet(raw, config = {}) {
    const {freshIds = false, id = makeId} = config;
    if (!raw || typeof raw !== 'object') throw fail('セットの内容を確認してください。');
    const questions = rawQuestions(raw);
    if (!Array.isArray(questions) || !questions.length || questions.length > LIMITS.questions) throw fail(`質問は1〜${LIMITS.questions}個にしてください。`);
    const set = {id: cleanId(raw.id, freshIds, id), name: clean(raw.name, LIMITS.setName, 'セット名', 'set-name'),
      questions: questions.map((q, i) => {
        try { return normalizeQuestion(q, config); } catch (e) { throw Object.assign(fail(`質問${i + 1}：${e.message}`, e.field), {questionIndex: i}); }
      })};
    if (new Set(set.questions.map(q => q.id)).size !== set.questions.length) throw fail('質問のIDが重複しています。');
    return set;
  }

  function option(id, label, image, speech = '') { return {id, label, speech, image: {kind: 'builtin', id: image}}; }
  function starterSets() {
    return [
      {id: 'starter-food', name: '食べもの', questions: [
        {id: 'starter-food-1', question: 'どちらが すき？', options: [option('sf1-apple', 'りんご', 'apple'), option('sf1-banana', 'バナナ', 'banana')]},
        {id: 'starter-food-2', question: 'なにを たべたい？', options: [option('sf2-rice', 'おにぎり', 'rice', 'おにぎりを たべたいです。'), option('sf2-bread', 'パン', 'bread', 'パンを たべたいです。')]}
      ]},
      {id: 'starter-animal', name: '動物', questions: [
        {id: 'starter-animal-1', question: 'どちらの どうぶつが すき？', options: [option('sa1-dog', 'いぬ', 'dog'), option('sa1-cat', 'ねこ', 'cat')]},
        {id: 'starter-animal-2', question: 'どちらに あいたい？', options: [option('sa2-rabbit', 'うさぎ', 'rabbit'), option('sa2-elephant', 'ぞう', 'elephant')]}
      ]}
    ].map(s => normalizeSet(s));
  }

  const utf8Bytes = text => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : Buffer.byteLength(text, 'utf8'));
  // 元の「えらぶの窓」と同じ形式（format・版2）で書き出す。元のアプリでも読める。
  function exportSet(set) {
    const text = JSON.stringify({format: 'erabu-choice-sets', version: 2, sets: [normalizeSet(set)]}, null, 2);
    if (utf8Bytes(text) > LIMITS.fileBytes) throw fail('セットのファイルが50MBを超えています。写真を減らすか、セットを分けてください。');
    return text;
  }
  // 元のアプリのファイル（4択を含む）も読む。2択・3択でない質問は読み飛ばし、数を返す。
  function importSets(text, id = makeId) {
    if (utf8Bytes(text) > LIMITS.fileBytes) throw fail('セットのファイルは50MB以下にしてください。');
    let input;
    try { input = JSON.parse(text); } catch { throw fail('ファイルを読み取れませんでした。「えらぶの窓」から書き出したファイルを選んでください。'); }
    if (!input || input.format !== 'erabu-choice-sets' || ![1, 2].includes(input.version) || !Array.isArray(input.sets) || !input.sets.length || input.sets.length > LIMITS.sets) {
      throw fail('「えらぶの窓」から書き出したセットのファイルを選んでください。');
    }
    const sets = [];
    let skippedQuestions = 0, skippedSets = 0;
    for (const raw of input.sets) {
      if (!raw || typeof raw !== 'object') { skippedSets++; continue; }
      const questions = rawQuestions(raw);
      if (!Array.isArray(questions)) { skippedSets++; continue; }
      const usable = questions.filter(usableQuestion);
      skippedQuestions += questions.length - usable.length;
      if (!usable.length) { skippedSets++; continue; }
      sets.push(normalizeSet({id: 'import', name: raw.name, questions: usable.map(q => ({...q, id: 'import'}))}, {freshIds: true, id}));
    }
    return {sets, skippedQuestions, skippedSets};
  }

  // 触れた位置から、何番目（左から0）の区切りかを決める。区切りの境目の、反応しない幅の中なら null。
  // 区切りの外（左右の余白）に触れたときは、端の区切りとする。
  function slotAt(x, width, count = 2, deadZone = 'none') {
    if (!Number.isFinite(x) || !(width > 0) || !CHOICE_COUNTS.includes(count)) return null;
    const half = (DEAD_ZONES[deadZone] || 0) * width / 2;
    for (let k = 1; k < count; k++) if (Math.abs(x - width * k / count) < half) return null;
    return Math.max(0, Math.min(count - 1, Math.floor(x / width * count)));
  }
  // 2択の左右（前の版の呼び方）。
  function sideAt(x, width, deadZone = 'none') {
    const slot = slotAt(x, width, 2, deadZone);
    return slot === null ? null : (slot === 0 ? 'left' : 'right');
  }
  const slotIndex = slot => (slot === 'left' ? 0 : slot === 'right' ? -1 : slot);

  // 1つの質問の状態。選んだら「えらびなおす」まで保つ。次の質問へは自動で進まない。
  class ChoiceSession {
    constructor(set, questionId = null) { this.load(set, questionId); }
    load(set, questionId = null) {
      this.set = set;
      const i = set.questions.findIndex(q => q.id === questionId);
      this.index = i < 0 ? 0 : i;
      this.start();
    }
    get question() { return this.set.questions[this.index]; }
    get count() { return this.set.questions.length; }
    start() { this.order = this.question.options.map(o => o.id); this.selected = null; }
    get size() { return this.order.length; }
    // 左から何番目か（数）。'left'（一番左）・'right'（一番右）でもよい。選べたら選択肢を返す。選択中は null。
    slot(value) { const i = slotIndex(value); if (!Number.isInteger(i)) return null; const n = i < 0 ? this.size + i : i; return n >= 0 && n < this.size ? n : null; }
    choose(value) {
      const i = this.slot(value);
      if (this.selected || i === null) return null;
      this.selected = this.order[i];
      return this.question.options.find(o => o.id === this.selected);
    }
    get chosen() { return this.selected ? this.question.options.find(o => o.id === this.selected) : null; }
    get chosenSlot() { return this.selected ? this.order.indexOf(this.selected) : null; }
    get chosenSide() { const i = this.chosenSlot; return i === null ? null : i === 0 ? 'left' : i === this.size - 1 ? 'right' : 'middle'; }
    optionAt(value) { const i = this.slot(value); return i === null ? null : this.question.options.find(o => o.id === this.order[i]); }
    reset() { this.selected = null; }
    swap() { this.order.reverse(); this.selected = null; }
    go(step) {
      const next = Math.max(0, Math.min(this.count - 1, this.index + step));
      if (next === this.index) return false;
      this.index = next; this.start(); return true;
    }
  }

  function sanitizePrefs(raw) {
    const p = {...DEFAULT_PREFS};
    if (raw && typeof raw === 'object') {
      if (raw.deadZone in DEAD_ZONES) p.deadZone = raw.deadZone;
      if (raw.afterTouch === 'none' || raw.afterTouch === 'repeat') p.afterTouch = raw.afterTouch;
      if (typeof raw.labels === 'boolean') p.labels = raw.labels;
      if (typeof raw.keepAwake === 'boolean') p.keepAwake = raw.keepAwake;
      const r = Number(raw.rate); if (Number.isFinite(r)) p.rate = Math.round(Math.max(0.5, Math.min(1.3, r)) * 10) / 10;
      if (typeof raw.setId === 'string') p.setId = raw.setId.slice(0, LIMITS.id);
      if (typeof raw.questionId === 'string') p.questionId = raw.questionId.slice(0, LIMITS.id);
    }
    return p;
  }

  const api = {ASSETS, LIMITS, DEAD_ZONES, DEFAULT_PREFS, CHOICE_COUNTS, SLOT_NAMES, slotName, makeId, validImage, normalizeQuestion, normalizeSet, starterSets,
    exportSet, importSets, slotAt, sideAt, ChoiceSession, sanitizePrefs};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SawaruLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
