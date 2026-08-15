/* 拾页 · 书库数据层：IndexedDB 全文存储 + 拆书任务 + 原文定位 */
(function () {
  'use strict';
  const DB = window.ShiyeDB;
  const DBNAME = 'shiye-library';
  const STORE = 'books';
  const K_TASK = 'shiye_deconstruct_task';

  // ---------- IndexedDB ----------
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(DBNAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbPromise;
  }
  function idbReq(r) {
    return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function putBook(book) {
    const db = await openDB();
    return idbReq(db.transaction(STORE, 'readwrite').objectStore(STORE).put(book));
  }
  async function getBook(id) {
    const db = await openDB();
    return (await idbReq(db.transaction(STORE).objectStore(STORE).get(id))) || null;
  }
  async function deleteBook(id) {
    const db = await openDB();
    return idbReq(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  }
  async function listBooks() {
    const db = await openDB();
    const all = await idbReq(db.transaction(STORE).objectStore(STORE).getAll());
    return (all || []).sort((a, b) => b.importedAt - a.importedAt);
  }

  // ---------- 导入 ----------
  async function importFile(file, onProgress) {
    if (!window.ShiyeParse) throw new Error('解析模块未加载');
    const fmt = window.ShiyeParse.detectFormat(file.name);
    if (!fmt) throw new Error('不支持的文件格式：仅支持 EPUB / PDF / TXT / MD');
    let parsed;
    try {
      if (fmt === 'epub') parsed = await window.ShiyeParse.parseEpub(await file.arrayBuffer());
      else if (fmt === 'pdf') parsed = await window.ShiyeParse.parsePdf(await file.arrayBuffer(), onProgress);
      else parsed = window.ShiyeParse.parseTextFile(file.name, await file.text());
    } catch (e) {
      throw new Error('解析失败：' + (e && e.message || '未知错误'));
    }
    const id = 'lib-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const book = {
      id, format: fmt,
      title: parsed.title || file.name.replace(/\.[^.]+$/, ''),
      author: parsed.author || '',
      chapters: parsed.chapters || [],
      importedAt: Date.now(), size: file.size,
    };
    await putBook(book);
    return book;
  }

  function bookChars(book) {
    return (book.chapters || []).reduce((s, c) => s + (c.text || '').length, 0);
  }

  // ---------- 原文定位（关键词搜索，按命中密度打分） ----------
  function findPassages(book, query, max) {
    max = max || 3;
    const keys = unique((String(query || '').match(/[\u4e00-\u9fa5]{2,}/g) || []).slice(0, 6));
    if (!keys.length) return [];
    const hits = [];
    (book.chapters || []).forEach(ch => {
      const text = ch.text || '';
      keys.forEach(k => {
        let pos = 0;
        while (hits.length < 200) {
          const idx = text.indexOf(k, pos);
          if (idx < 0) break;
          const start = Math.max(0, idx - 60);
          const end = Math.min(text.length, idx + k.length + 100);
          const windowText = text.slice(start, end);
          const score = keys.filter(x => windowText.includes(x)).length;
          hits.push({ chapter: ch.title, start, score, excerpt: '…' + windowText + '…' });
          pos = idx + k.length;
          if (pos > text.length) break;
        }
      });
    });
    // 同一章内相近位置去重
    const seen = new Set();
    const dedup = hits.filter(h => {
      const key = h.chapter + '|' + Math.floor(h.start / 200);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    dedup.sort((a, b) => b.score - a.score || a.start - b.start);
    return dedup.slice(0, max);
  }

  // 跨全库搜索（用于「在任何书里定位原文」）
  async function searchAllBooks(query, max) {
    const books = await listBooks();
    const out = [];
    for (const b of books) {
      const ps = findPassages(b, query, 5);
      ps.forEach(p => out.push({ bookId: b.id, bookTitle: b.title, ...p }));
      if (out.length >= (max || 5)) break;
    }
    return out.slice(0, max || 5);
  }

  // ---------- 拆书切片 ----------
  function buildChunks(book) {
    const chunks = [];
    let buf = { title: '', text: '' };
    const flush = () => {
      if (buf.text.trim().length > 60) chunks.push({ title: buf.title, text: buf.text.trim() });
      buf = { title: '', text: '' };
    };
    (book.chapters || []).forEach(ch => {
      const t = (ch.text || '').trim();
      if (!t) return;
      if (t.length <= 4200) {
        if ((buf.text + '\n\n' + t).length <= 4200) {
          buf.text = buf.text ? buf.text + '\n\n' + t : t;
          buf.title = buf.title ? buf.title + '／' + ch.title : ch.title;
        } else {
          flush();
          buf = { title: ch.title, text: t };
        }
      } else {
        flush();
        let start = 0, part = 1;
        while (start < t.length) {
          let end = Math.min(start + 3800, t.length);
          if (end < t.length) {
            const cut = t.lastIndexOf('。', end);
            if (cut > start + 1900) end = cut + 1;
          }
          chunks.push({ title: ch.title + '（' + part + '）', text: t.slice(start, end) });
          start = end; part++;
        }
      }
    });
    flush();
    return chunks;
  }

  // ---------- 拆书任务 ----------
  function getTask() {
    try { return JSON.parse(localStorage.getItem(K_TASK) || 'null'); } catch (e) { return null; }
  }
  function saveTask(t) {
    try { localStorage.setItem(K_TASK, JSON.stringify(t)); } catch (e) { /* ignore */ }
  }
  function cancelTask() {
    const t = getTask();
    if (t) { t.running = false; t.cancelled = true; saveTask(t); }
  }
  function clearTask() { try { localStorage.removeItem(K_TASK); } catch (e) { /* ignore */ } }
  function taskRunning() { const t = getTask(); return !!(t && t.running); }

  async function startDeconstruct(bookId, onProgress) {
    const book = await getBook(bookId);
    if (!book) throw new Error('这本书不在书库里');
    if (taskRunning()) throw new Error('已有拆书任务在运行');
    const chunks = buildChunks(book);
    if (!chunks.length) throw new Error('书中没有可拆解的文本');
    // 续传：若上次任务未完成且是同一本书，沿用进度
    const prev = getTask();
    const resume = prev && prev.bookId === bookId && prev.done > 0 && !prev.running;
    const task = {
      bookId, bookTitle: book.title, total: chunks.length,
      done: resume ? Math.min(prev.done, chunks.length) : 0,
      created: resume ? (prev.created || 0) : 0,
      running: true, cancelled: false, lastError: '',
    };
    saveTask(task);
    let created = task.created;
    for (let i = task.done; i < chunks.length; i++) {
      const t = getTask();
      if (!t || !t.running) break; // 被取消
      const c = chunks[i];
      let notes;
      try {
        notes = await window.ShiyeAI.deconstructChunk(c.title, c.text);
      } catch (e) {
        task.lastError = (e && e.message) || 'AI 调用失败';
        task.done = i; task.running = false;
        saveTask(task);
        throw e;
      }
      (notes || []).forEach(dn => {
        if (!dn.title) return;
        DB.upsertNote({
          title: dn.title,
          bookId: '',
          time: dn.time || {},
          quote: {
            chapter: (dn.quote && dn.quote.chapter) || c.title,
            page: (dn.quote && dn.quote.page) || '',
            text: (dn.quote && dn.quote.text) || '',
          },
          keyData: (dn.keyData || []).map(k => ({
            indicator: k.indicator || '', value: k.value, unit: k.unit || '',
            year: k.year, desc: k.desc || '',
          })),
          thoughts: dn.thoughts || '',
          tags: dn.tags || [],
          status: 'draft',
          sourceRef: { libraryId: book.id, chapter: c.title },
        });
        created++;
      });
      task.done = i + 1; task.created = created;
      saveTask(task);
      if (onProgress) onProgress({ done: task.done, total: task.total, created });
    }
    const final = getTask();
    if (final) { final.running = false; if (!final.cancelled && final.done >= final.total) clearTask(); else saveTask(final); }
    return { created };
  }

  function unique(arr) { return Array.from(new Set(arr)); }

  window.ShiyeLibrary = {
    listBooks, getBook, deleteBook, importFile, bookChars,
    findPassages, searchAllBooks,
    getTask, cancelTask, clearTask, taskRunning, startDeconstruct, buildChunks,
  };
})();
