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

  // ---------- 预置示例：《日本大衰退》研读 ----------
  function seedIfEmpty() {
    if (!isEmpty()) return false;
    const b1 = { id: 'b-seed-1', title: '日本大衰退', author: '' };
    const n = (o) => {
      const base = {
        bookId: b1.id,
        quote: { chapter: '', page: '', text: '（待补：原文摘录与页码）' },
        keyData: [],
        thoughts: '',
        tags: [],
        createdAt: 0, updatedAt: 0,
      };
      return { ...base, ...o };
    };
    const n1 = n({ id: 'n-seed-1', title: '银行利率下降——信贷扩张的起点', time: { year: 1987, label: '1980年代后期' },
      quote: { chapter: '', page: '', text: '（待补：原文摘录与页码）' },
      thoughts: '因为银行利率下降，导致投资扩张。这是日本资产泡沫链条的起点。',
      tags: ['利率', '银行'] });
    const n2 = n({ id: 'n-seed-2', title: '投资扩张', time: { year: 1987, label: '1980年代后期' },
      thoughts: '利率下降 → 投资扩张（可补充书中具体数据，如设备投资增速）。',
      tags: ['投资', '实体经济'] });
    const n3 = n({ id: 'n-seed-3', title: '房地产、土地价格上涨', time: { year: 1988, label: '1980年代后期' },
      thoughts: '投资扩张导致房地产、土地价格上涨。（可补充书中地价涨幅数据）',
      tags: ['房地产', '土地'] });
    const n4 = n({ id: 'n-seed-4', title: '银行土地抵押贷款增加', time: { year: 1988, label: '1980年代后期' },
      thoughts: '土地价格上涨 → 抵押品价值上升 → 银行以土地为抵押的贷款也增加。',
      tags: ['银行', '贷款', '土地抵押'] });
    const n5 = n({ id: 'n-seed-5', title: '正向循环形成', time: { year: 1989, label: '1980年代末' },
      thoughts: '地价上涨 → 抵押贷款增加 → 投资扩张 → 地价再上涨，形成正向循环。',
      tags: ['正循环', '泡沫'] });
    const n6 = n({ id: 'n-seed-6', title: '银行为防范风险，正循环转为负循环', time: { year: 1990, label: '1990年代初' },
      thoughts: '后续银行为防范风险而收紧信贷，正向循环变为负向循环。',
      tags: ['银行', '风险', '负循环'] });
    const n7 = n({ id: 'n-seed-7', title: '日经指数1989年见顶，三年下跌约60%', time: { year: 1989, yearEnd: 1992, label: '1989年末～1992' },
      keyData: [
        { indicator: '日经指数', value: 38957, unit: '点', year: 1989, desc: '历史顶峰（1989年末）' },
        { indicator: '日经指数', value: 15000, unit: '点', year: 1992, desc: '三年累计下跌约60%' },
      ],
      thoughts: '关键数据：1989年日经指数达到顶峰，后续三年下跌60%到15000。',
      tags: ['日经指数', '股市', '关键数据'] });
    const n8 = n({ id: 'n-seed-8', title: '同期普通人的生活并未太多变化', time: { year: 1992, label: '1990年代' },
      thoughts: '资产价格大跌，但同期普通人的生活并未太多变化。（待探究：为什么资产崩盘对普通人冲击有限？）',
      tags: ['民生', '待探究'] });
    const n9 = n({ id: 'n-seed-9', title: '联想：中国近年土地价格也在下降', time: { year: 2022, yearEnd: 2024, label: '2021～2024' },
      thoughts: '中国近些年同样是土地价格下降，与日本1990年代初的进程有相似之处。',
      tags: ['中国', '土地', '联想'] });
    const n10 = n({ id: 'n-seed-10', title: '中国银行把风险转嫁普通人，未出现日本式银行业危机', time: { year: 2023, label: '2021～2024' },
      thoughts: '与日本不同：中国银行把风险转嫁给了普通人（购房者、储户），所以没有出现日本银行业的金融风险。',
      tags: ['中国', '银行', '风险', '对比'] });
    const n11 = n({ id: 'n-seed-11', title: '2024年9月中国股市走牛——按日本进程属异常现象', time: { year: 2024, label: '2024年9月' },
      thoughts: '按日本的进程，资产价格一定会下跌；但2024年9月中国股市却开启牛市，这是异常现象。待探究原因（政策组合拳？预期逆转？）。',
      tags: ['中国', '股市', '异常', '待探究'] });
    const l = (from, to, type, note) => ({ id: uid('l'), from, to, type, note });
    data = {
      version: 1,
      books: [b1],
      notes: [n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11],
      links: [
        l(n1.id, n2.id, '导致', '利率下降引发投资扩张'),
        l(n2.id, n3.id, '导致', '投资扩张推高地价房价'),
        l(n3.id, n4.id, '导致', '地价上涨使抵押品增值'),
        l(n4.id, n2.id, '循环', '贷款增加支撑投资，形成正循环'),
        l(n4.id, n5.id, '促进', ''),
        l(n5.id, n6.id, '反转', '银行防范风险，正循环变负循环'),
        l(n6.id, n7.id, '导致', '信贷收缩引发资产价格下跌'),
        l(n7.id, n8.id, '对比', '资产崩盘，但普通人生活变化不大'),
        l(n7.id, n9.id, '联想', '日本资产下跌 → 联想到中国土地价格下降'),
        l(n9.id, n10.id, '对比', '日本银行 vs 中国银行：风险处置方式不同'),
        l(n7.id, n11.id, '对比', '按日本进程资产应继续下跌，中国却走牛'),
        l(n10.id, n11.id, '联想', '银行风险转嫁 → 是否与2024年9月牛市有关？'),
      ],
    };
    save();
    return true;
  }

  function unique(arr) { return Array.from(new Set(arr)); }

  window.ShiyeDB = {
    storageOK, getBooks, addBook, getBook,
    getNotes, getNote, upsertNote, deleteNote, setNoteStatus, draftCount,
    getLinks, addLink, deleteLink, allTags,
    exportJSON, importJSON, clearAll, isEmpty, seedIfEmpty,
  };
})();
