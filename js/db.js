/* 拾页 · 数据层：本地存储（localStorage）+ CRUD + 预置示例数据 */
(function () {
  'use strict';
  const STORAGE_KEY = 'shiye_notes_v1';

  // ---------- 底层读写（localStorage 不可用时降级为内存存储） ----------
  let memoryStore = null;
  function storageOK() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  }
  function loadRaw() {
    if (storageOK()) {
      try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch (e) { /* ignore */ }
      return null;
    }
    return memoryStore;
  }
  function persist(obj) {
    if (storageOK()) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } else {
      memoryStore = obj;
    }
  }

  // ---------- 数据结构 ----------
  let data = loadRaw() || { version: 2, books: [], notes: [], links: [] };

  // 迁移：为旧数据补默认字段（草稿态等）
  (data.notes || []).forEach(n => { if (!n.status) n.status = 'confirmed'; });
  if (!data.version) data.version = 2;

  function save() { persist(data); }
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- 书籍 ----------
  function getBooks() { return data.books.slice(); }
  function addBook(title, author) {
    const b = { id: uid('b'), title: title || '未命名书籍', author: author || '' };
    data.books.push(b); save(); return b;
  }
  function getBook(id) { return data.books.find(b => b.id === id) || null; }

  // ---------- 笔记 ----------
  function getNotes() { return data.notes.slice(); }
  function getNote(id) { return data.notes.find(n => n.id === id) || null; }

  // 归一化笔记：清空字段、解析标签、过滤空数据点
  function normalize(note) {
    const n = {
      id: note.id || uid('n'),
      bookId: note.bookId || '',
      title: (note.title || '').trim() || '（无标题）',
      time: {
        year: parseInt(note.time && note.time.year, 10) || null,
        yearEnd: parseInt(note.time && note.time.yearEnd, 10) || null,
        label: (note.time && note.time.label || '').trim(),
      },
      quote: {
        chapter: (note.quote && note.quote.chapter || '').trim(),
        page: (note.quote && note.quote.page || '').trim(),
        text: (note.quote && note.quote.text || '').trim(),
      },
      keyData: (note.keyData || []).filter(d =>
        d && ((d.indicator || '').trim() || (d.value != null && d.value !== ''))
      ).map(d => ({
        indicator: (d.indicator || '').trim(),
        value: (d.value == null || d.value === '') ? null : parseFloat(d.value),
        unit: (d.unit || '').trim(),
        year: parseInt(d.year, 10) || null,
        desc: (d.desc || '').trim(),
      })),
      thoughts: (note.thoughts || '').trim(),
      tags: unique(
        (Array.isArray(note.tags) ? note.tags : (note.tags || '').split(/[,，、;；\s]+/))
          .map(t => String(t).trim()).filter(Boolean)
      ),
      status: note.status === 'draft' ? 'draft' : 'confirmed',
      sourceRef: note.sourceRef || null,   // {libraryId, chapter, quoteText} AI 拆书来源引用
      createdAt: note.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    return n;
  }

  function upsertNote(raw) {
    const n = normalize(raw);
    const i = data.notes.findIndex(x => x.id === n.id);
    if (i >= 0) data.notes[i] = n; else data.notes.push(n);
    save();
    return n;
  }

  function deleteNote(id) {
    data.notes = data.notes.filter(n => n.id !== id);
    data.links = data.links.filter(l => l.from !== id && l.to !== id);
    save();
  }

  function setNoteStatus(id, status) {
    const n = data.notes.find(x => x.id === id);
    if (!n) return null;
    n.status = status === 'draft' ? 'draft' : 'confirmed';
    n.updatedAt = Date.now();
    save();
    return n;
  }

  function draftCount() {
    return data.notes.filter(n => n.status === 'draft').length;
  }

  // ---------- 因果链 ----------
  function getLinks() { return data.links.slice(); }
  function addLink(from, to, type, note) {
    if (!from || !to || from === to) return null;
    const l = { id: uid('l'), from, to, type: (type || '导致').trim() || '导致', note: (note || '').trim() };
    data.links.push(l); save(); return l;
  }
  function deleteLink(id) {
    data.links = data.links.filter(l => l.id !== id); save();
  }

  // ---------- 标签聚合 ----------
  function allTags() {
    const m = {};
    data.notes.forEach(n => (n.tags || []).forEach(t => { m[t] = (m[t] || 0) + 1; }));
    return Object.keys(m).sort((a, b) => m[b] - m[a] || a.localeCompare(b, 'zh'));
  }

  // ---------- 导入导出 ----------
  function exportJSON() {
    return JSON.stringify({ app: '拾页读书笔记', version: data.version, exportedAt: new Date().toISOString(), ...data }, null, 2);
  }
  function importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || !Array.isArray(obj.notes) || !Array.isArray(obj.books) || !Array.isArray(obj.links)) {
      throw new Error('文件格式不正确：缺少 books/notes/links 字段');
    }
    data = { version: obj.version || 1, books: obj.books, notes: obj.notes, links: obj.links };
    save();
    return data;
  }
  function clearAll() { data = { version: 1, books: [], notes: [], links: [] }; save(); }

  function isEmpty() { return data.notes.length === 0 && data.books.length === 0; }

  // ---------- 《日本大衰退》研读包（自撰示例内容，可一键载入/可编辑删除） ----------
  const PACK_BOOK_TITLE = '日本大衰退';
  const Q = (text) => ({ chapter: '', page: '', text: '【示例】' + text });
  const PACK_NOTES = [
    { id: 'jp-pack-1', title: '低利率环境：泡沫的起点', time: { year: 1987, label: '1980年代后期' },
      quote: Q('利率下降使资金变得便宜，投资随之活跃。'),
      thoughts: '日本银行连续降息，1987年贴现率降至 2.5% 的历史低点，开启了资产泡沫的资金条件。',
      tags: ['利率', '银行', '研读包'] },
    { id: 'jp-pack-2', title: '投资扩张', time: { year: 1987, label: '1980年代后期' },
      quote: Q('低利率刺激企业扩大设备投资，也鼓励了投机。'),
      thoughts: '利率下降 → 投资扩张，是整条因果链的第一环。（可在书中补充设备投资增速数据）',
      tags: ['投资', '实体经济', '研读包'] },
    { id: 'jp-pack-3', title: '房地产、土地价格上涨', time: { year: 1988, label: '1980年代后期' },
      quote: Q('投资扩张推动房地产与土地价格持续上涨。'),
      thoughts: '东京圈地价在 80 年代后期暴涨，土地成为最重要的投机品。（可补地价涨幅数据）',
      tags: ['房地产', '土地', '研读包'] },
    { id: 'jp-pack-4', title: '银行土地抵押贷款增加', time: { year: 1988, label: '1980年代后期' },
      quote: Q('土地价格上涨使抵押品价值上升，银行贷款随之增加。'),
      thoughts: '地价上涨 → 抵押品增值 → 银行以土地为抵押的贷款同步膨胀，银行与地产深度绑定。',
      tags: ['银行', '贷款', '土地抵押', '研读包'] },
    { id: 'jp-pack-5', title: '正向循环形成', time: { year: 1989, label: '1980年代末' },
      quote: Q('地价上涨与贷款增加相互强化，形成正向循环。'),
      thoughts: '地价↑ → 抵押贷款↑ → 投资↑ → 地价再↑。所有参与者都从中获利，无人愿意停下。',
      tags: ['正循环', '泡沫', '研读包'] },
    { id: 'jp-pack-6', title: '泡沫顶点：日经指数 38957 点', time: { year: 1989, label: '1989年12月29日' },
      keyData: [
        { indicator: '日经指数', value: 38957, unit: '点', year: 1989, desc: '历史最高收盘（1989-12-29）' },
        { indicator: '日经指数', value: 15000, unit: '点', year: 1992, desc: '三年后，累计下跌约60%' },
      ],
      quote: Q('日经指数在1989年末达到历史顶峰。'),
      thoughts: '关键数据：1989 年见顶 38957 点，后续三年下跌约 60% 至 15000 点附近。',
      tags: ['日经指数', '股市', '关键数据', '研读包'] },
    { id: 'jp-pack-7', title: '「土地神话」：东京地价可买下美国', time: { year: 1989, label: '泡沫顶峰' },
      quote: Q('当时流传的说法：东京的土地总值足以买下整个美国。'),
      thoughts: '背景知识：这一广为流传的说法侧面反映当时土地估值的荒谬程度（流传说法，非精确统计）。',
      tags: ['背景知识', '土地', '研读包'] },
    { id: 'jp-pack-8', title: '日本银行加息转向', time: { year: 1990, yearEnd: 1990, label: '1989～1990' },
      quote: Q('为抑制泡沫，央行开始连续加息。'),
      thoughts: '1989 年起日本银行连续加息，贴现率从 2.5% 一路升至 6%，宽松急转紧缩。',
      tags: ['利率', '央行', '紧缩', '研读包'] },
    { id: 'jp-pack-9', title: '大藏省限制房地产融资', time: { year: 1990, label: '1990年3月' },
      quote: Q('监管层对房地产相关融资实施总量限制。'),
      thoughts: '1990 年 3 月大藏省推出不动产融资总量规制，直接掐断流向土地的资金。',
      tags: ['监管', '房地产', '信贷', '研读包'] },
    { id: 'jp-pack-10', title: '正循环反转为负循环', time: { year: 1990, label: '1990年代初' },
      quote: Q('信贷收紧后，支撑资产价格的资金消失，循环方向逆转。'),
      thoughts: '银行防范风险收紧信贷 → 资产失去资金支撑 → 正循环变负循环：价格↓ → 抵押品贬值 → 贷款收缩 → 价格再↓。',
      tags: ['负循环', '银行', '风险', '研读包'] },
    { id: 'jp-pack-11', title: '股市崩盘：三年跌去六成', time: { year: 1992, yearEnd: 1992, label: '1992年8月' },
      quote: Q('日经指数跌破15000点，较顶峰跌去约六成。'),
      thoughts: '1992 年 8 月日经跌破 15000 点。从 38957 到 15000，资产幻觉三年内破灭。',
      tags: ['股市', '崩盘', '关键数据', '研读包'] },
    { id: 'jp-pack-12', title: '地价进入长期下跌', time: { year: 1991, label: '1991年起' },
      quote: Q('1991年起全国地价转入长期下跌。'),
      thoughts: '全国地价自 1991 年起连跌十余年，累计跌幅巨大（可补具体百分比数据）。',
      tags: ['土地', '通缩', '研读包'] },
    { id: 'jp-pack-13', title: '资产负债表衰退（核心概念）', time: { year: 1995, label: '1990年代中期' },
      quote: Q('资产缩水而负债不变，企业的目标从利润最大化转为债务最小化。'),
      thoughts: '核心概念：资产价格崩盘后，企业资不抵债却仍背负旧债，于是优先还债、停止借贷与投资——宏观上形成「没人借钱」的衰退。',
      tags: ['核心概念', '资产负债表', '研读包'] },
    { id: 'jp-pack-14', title: '银行不良债权与惜贷', time: { year: 1995, label: '1990年代' },
      quote: Q('银行背负巨额不良债权，放贷能力与意愿双双下降。'),
      thoughts: '抵押品贬值 → 银行不良债权累积 → 惜贷，进一步加深负循环。',
      tags: ['银行', '不良债权', '惜贷', '研读包'] },
    { id: 'jp-pack-15', title: '普通人生活变化不大', time: { year: 1995, label: '1990年代' },
      quote: Q('资产价格崩盘的同时，普通人的生活并未发生太大变化。'),
      thoughts: '与常识相反：资产崩盘但失业率未失控、日常消费照旧。待探究：为什么日本资产崩盘对普通人的冲击有限？',
      tags: ['民生', '待探究', '研读包'] },
    { id: 'jp-pack-16', title: '零利率与量化宽松为何失效', time: { year: 1999, yearEnd: 2001, label: '1999～2001' },
      quote: Q('即使利率降到零、央行大量投放货币，信贷也没有恢复。'),
      thoughts: '1999 零利率、2001 量化宽松。但资产负债表衰退下无人借款，货币政策传导中断。',
      tags: ['货币政策', '零利率', '量化宽松', '研读包'] },
    { id: 'jp-pack-17', title: '财政刺激与政府债务累积', time: { year: 1998, label: '1990年代末起' },
      quote: Q('政府以财政支出填补需求缺口，债务随之累积。'),
      thoughts: '货币政策失灵后只能靠财政；日本政府债务/GDP 因此攀升到全球最高水平之一。',
      tags: ['财政', '政府债务', '研读包'] },
    { id: 'jp-pack-18', title: '失去的二十年', time: { year: 1991, yearEnd: 2012, label: '1991～2010s' },
      quote: Q('从泡沫破裂到经济重新站稳，日本花了超过二十年。'),
      thoughts: '从 1991 到 2010 年代，低增长、通缩、债务循环交织，构成「失去的二十年」。',
      tags: ['长期衰退', '通缩', '研读包'] },
    { id: 'jp-pack-19', title: '联想：中国近年土地价格也在下降', time: { year: 2022, yearEnd: 2024, label: '2021～2024' },
      quote: Q('中国近些年土地价格同样转入下行。'),
      thoughts: '中国 2021 年后土地市场转冷，与日本 1991 年后的进程有结构上的相似之处。',
      tags: ['中国', '土地', '联想', '研读包'] },
    { id: 'jp-pack-20', title: '中国银行把风险转嫁普通人', time: { year: 2023, label: '2021～2024' },
      quote: Q('与日本不同，中国的银行体系未爆发系统性危机。'),
      thoughts: '关键差异：中国银行通过购房者、储户等渠道转嫁风险，因此未出现日本式银行业金融风险——但代价由普通人承担。',
      tags: ['中国', '银行', '风险', '对比', '研读包'] },
    { id: 'jp-pack-21', title: '2024年9月中国股市走牛：按日本进程属异常', time: { year: 2024, label: '2024年9月' },
      quote: Q('按日本的经验，资产价格应继续下行，但中国股市却开启了牛市。'),
      thoughts: '按日本进程资产价格应继续下跌，2024 年 9 月中国股市却走牛，属异常现象。待探究：政策组合拳？预期逆转？',
      tags: ['中国', '股市', '异常', '待探究', '研读包'] },
  ];
  const PACK_LINKS = [
    { id: 'jp-pack-l1', from: 'jp-pack-1', to: 'jp-pack-2', type: '导致', note: '低利率引发投资扩张' },
    { id: 'jp-pack-l2', from: 'jp-pack-2', to: 'jp-pack-3', type: '导致', note: '投资扩张推高地价房价' },
    { id: 'jp-pack-l3', from: 'jp-pack-3', to: 'jp-pack-4', type: '导致', note: '地价上涨使抵押品增值' },
    { id: 'jp-pack-l4', from: 'jp-pack-4', to: 'jp-pack-2', type: '循环', note: '贷款增加支撑投资，形成正循环' },
    { id: 'jp-pack-l5', from: 'jp-pack-4', to: 'jp-pack-5', type: '促进', note: '' },
    { id: 'jp-pack-l6', from: 'jp-pack-5', to: 'jp-pack-6', type: '促进', note: '正循环把股市推上顶点' },
    { id: 'jp-pack-l7', from: 'jp-pack-3', to: 'jp-pack-7', type: '联想', note: '地价暴涨的极端表现' },
    { id: 'jp-pack-l8', from: 'jp-pack-6', to: 'jp-pack-8', type: '导致', note: '泡沫顶点迫使央行转向' },
    { id: 'jp-pack-l9', from: 'jp-pack-8', to: 'jp-pack-10', type: '导致', note: '加息抽走流动性' },
    { id: 'jp-pack-l10', from: 'jp-pack-9', to: 'jp-pack-10', type: '导致', note: '总量规制掐断土地资金' },
    { id: 'jp-pack-l11', from: 'jp-pack-10', to: 'jp-pack-11', type: '导致', note: '负循环引发股市崩盘' },
    { id: 'jp-pack-l12', from: 'jp-pack-10', to: 'jp-pack-12', type: '导致', note: '负循环引发地价长期下跌' },
    { id: 'jp-pack-l13', from: 'jp-pack-6', to: 'jp-pack-11', type: '对比', note: '顶点 38957 → 三年后 15000' },
    { id: 'jp-pack-l14', from: 'jp-pack-11', to: 'jp-pack-13', type: '导致', note: '资产缩水触发资产负债表衰退' },
    { id: 'jp-pack-l15', from: 'jp-pack-12', to: 'jp-pack-13', type: '促进', note: '' },
    { id: 'jp-pack-l16', from: 'jp-pack-13', to: 'jp-pack-14', type: '导致', note: '企业不还钱 → 银行不良债权' },
    { id: 'jp-pack-l17', from: 'jp-pack-14', to: 'jp-pack-10', type: '循环', note: '惜贷加深负循环' },
    { id: 'jp-pack-l18', from: 'jp-pack-11', to: 'jp-pack-15', type: '对比', note: '资产崩盘，但普通人生活变化不大' },
    { id: 'jp-pack-l19', from: 'jp-pack-13', to: 'jp-pack-16', type: '导致', note: '资产负债表衰退使货币政策失效' },
    { id: 'jp-pack-l20', from: 'jp-pack-16', to: 'jp-pack-17', type: '联想', note: '货币失效后转向财政' },
    { id: 'jp-pack-l21', from: 'jp-pack-17', to: 'jp-pack-18', type: '导致', note: '债务累积拖累长期增长' },
    { id: 'jp-pack-l22', from: 'jp-pack-12', to: 'jp-pack-19', type: '联想', note: '日本地价下跌 → 联想到中国' },
    { id: 'jp-pack-l23', from: 'jp-pack-19', to: 'jp-pack-20', type: '对比', note: '日本银行 vs 中国银行：风险处置方式不同' },
    { id: 'jp-pack-l24', from: 'jp-pack-11', to: 'jp-pack-21', type: '对比', note: '按日本进程资产应继续下跌，中国却走牛' },
    { id: 'jp-pack-l25', from: 'jp-pack-20', to: 'jp-pack-21', type: '联想', note: '风险转嫁 → 是否与2024年9月牛市有关？' },
  ];

  // 一键载入研读包：找到/创建《日本大衰退》书籍，补齐缺失的笔记与关联
  function installContentPack() {
    let book = data.books.find(b => (b.title || '').replace(/\s/g, '') === PACK_BOOK_TITLE);
    if (!book) {
      book = { id: 'jp-pack-book', title: PACK_BOOK_TITLE, author: '' };
      data.books.push(book);
    }
    const noteIds = new Set(data.notes.map(n => n.id));
    let added = 0;
    PACK_NOTES.forEach(p => {
      if (noteIds.has(p.id)) return;
      data.notes.push({
        id: p.id, bookId: book.id, title: p.title,
        time: p.time, keyData: p.keyData || [], quote: p.quote,
        thoughts: p.thoughts, tags: p.tags, status: 'confirmed',
        sourceRef: null, createdAt: 0, updatedAt: 0,
      });
      added++;
    });
    const linkKeys = new Set(data.links.map(l => l.from + '>' + l.to + '>' + l.type));
    PACK_LINKS.forEach(l => {
      if (linkKeys.has(l.from + '>' + l.to + '>' + l.type)) return;
      data.links.push({ id: l.id, from: l.from, to: l.to, type: l.type, note: l.note });
    });
    save();
    return { added, bookId: book.id };
  }

  function seedIfEmpty() {
    if (!isEmpty()) return false;
    installContentPack();
    return true;
  }

  function deleteBook(id) {
    data.books = data.books.filter(b => b.id !== id);
    save();
  }

  function unique(arr) { return Array.from(new Set(arr)); }

  window.ShiyeDB = {
    storageOK, getBooks, addBook, getBook, deleteBook,
    getNotes, getNote, upsertNote, deleteNote, setNoteStatus, draftCount,
    getLinks, addLink, deleteLink, allTags,
    exportJSON, importJSON, clearAll, isEmpty, seedIfEmpty, installContentPack,
  };
})();
