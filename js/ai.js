/* 拾页 · AI 层：密钥管理 + Worker 客户端（流式）+ 提示词 + OCR */
(function () {
  'use strict';
  const DB = window.ShiyeDB;
  const K_KEY = 'shiye_ai_key';
  const K_WORKER = 'shiye_worker_url';
  const K_AUTOLINK = 'shiye_ai_autolink';
  const K_SUGGEST = 'shiye_ai_suggestions_';   // per noteId
  const K_CHAT = 'shiye_ai_chat_';             // per noteId

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  // ---------- 配置 ----------
  const DEFAULT_WORKER_URL = ''; // 部署 Worker 后填入，如 https://reading-notes-worker.xxx.workers.dev
  function getKey() { return lsGet(K_KEY); }
  function setKey(k) { lsSet(K_KEY, k.trim()); }
  function getWorkerUrl() { return lsGet(K_WORKER) || DEFAULT_WORKER_URL; }
  function setWorkerUrl(u) { lsSet(K_WORKER, u.trim()); }
  function configured() { return !!getKey() && !!getWorkerUrl(); }
  function autoLinkEnabled() { return lsGet(K_AUTOLINK) !== '0'; }
  function setAutoLink(v) { lsSet(K_AUTOLINK, v ? '1' : '0'); }

  // ---------- Worker 客户端 ----------
  async function aiChat(messages, opts) {
    opts = opts || {};
    if (!configured()) throw new Error('请先在「⚙ 数据 → AI 设置」里填好 DeepSeek API Key 与代理地址');
    const body = {
      apiKey: getKey(),
      messages: messages,
      stream: !!opts.stream,
    };
    if (opts.json) body.response_format = { type: 'json_object' };
    if (opts.temperature != null) body.temperature = opts.temperature;
    let res;
    try {
      res = await fetch(getWorkerUrl() + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('无法连接 AI 代理（' + (e && e.message || '网络错误') + '），请检查代理地址与网络');
    }
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* ignore */ }
      throw new Error('AI 服务错误：' + msg);
    }
    if (!opts.stream) {
      const j = await res.json();
      const c = j && j.choices && j.choices[0] && j.choices[0].message;
      return (c && c.content) || '';
    }
    // SSE 流式解析
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', out = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return out;
        try {
          const j = JSON.parse(data);
          const delta = j && j.choices && j.choices[0] && j.choices[0].delta;
          if (delta && delta.content) {
            out += delta.content;
            if (opts.onDelta) opts.onDelta(delta.content, out);
          }
        } catch (e) { /* 忽略坏行 */ }
      }
    }
    return out;
  }

  function extractJSON(text) {
    let t = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  // ---------- 提示词 ----------
  const PROMPTS = {
    organize: '你是读书笔记整理助手。【任务：整理】用户会提供：①笔记库中已有笔记列表（含 id）②一段书中的原文片段或转述。请输出严格 JSON（不要输出任何其它文字）：{"title":"","time":{"year":1989,"yearEnd":null,"label":""},"keyData":[{"indicator":"","value":123,"unit":"","year":1989,"desc":""}],"quote":{"chapter":"","page":"","text":""},"thoughts":"","tags":[""],"linkSuggestions":[{"toId":"","type":"","reason":""}]}。规则：只从原文提取，绝不编造数值；keyData 仅在原文含明确数值时给出（value 用数字），否则空数组；quote.text 填原文原句或忠实摘录；thoughts 写研究启发、与其它现象的联想或待探究的问题；tags 给 2-5 个中文短语；linkSuggestions 最多 3 条，toId 必须取自已有笔记列表中的 id，type 从 导致/促进/循环/反转/对比/联想 中选，reason 一句话说明理由，无关则空数组；time.year 能判断就填数字，否则 null。',
    deconstruct: '你是深度读书拆解助手。【任务：拆书】用户会提供一本书某章节的一段原文（含章节名）。请输出严格 JSON：{"notes":[{"title":"","time":{"year":null,"yearEnd":null,"label":""},"keyData":[{"indicator":"","value":123,"unit":"","year":1989,"desc":""}],"quote":{"chapter":"","page":"","text":""},"thoughts":"","tags":[""]}]}。规则：只提炼这段文本中真正重要的内容——明确的数据与年代、因果链条、核心概念、反常识结论；最多 5 条，没有值得记的内容就返回空数组；绝不编造数值与内容；quote.text 必须是原文中的原句（50-150字），chapter 填给定的章节名；thoughts 提示值得追问的问题；tags 给 2-5 个中文短语。',
    link: '你是读书笔记的因果链助手。【任务：关联】用户会给出一条新笔记和笔记库中的已有笔记列表（含 id 与标题摘要）。请输出严格 JSON：{"suggestions":[{"toId":"","type":"","reason":""}]}。找出与新笔记在逻辑上真正相关的已有笔记（因果推进、对比、联想、反转等），最多 3 条；toId 必须取自列表中的 id；type 从 导致/促进/循环/反转/对比/联想 中选；reason 一句话说明；没有真正相关的就返回空数组。',
    chat: '你是严谨的读书研究助手。【任务：追问】下面是用户的笔记上下文（本条笔记 + 因果链关联的笔记 + 关键数据点）。请基于上下文回答用户的问题：优先引用上下文中的具体数据与原文；上下文不足以回答时明确说「依据现有笔记无法判断」，绝不编造；可补充常识性背景知识，但需标明「背景知识：」。用中文回答，适度分段，结尾给 1-2 个值得继续追问的问题。',
  };

  // ---------- 高层能力 ----------
  function notesDigest(excludeId) {
    return DB.getNotes()
      .filter(n => n.status !== 'draft' && n.id !== excludeId)
      .map(n => n.id + ' | ' + n.title + ' | ' + String(n.thoughts || '').slice(0, 60))
      .join('\n');
  }

  // ① 单条整理：原文 → 结构化草稿对象
  async function organizeNote(rawText) {
    const user = '【已有笔记列表】\n' + (notesDigest(null) || '（空）') + '\n\n【原文片段】\n' + rawText;
    const text = await aiChat(
      [{ role: 'system', content: PROMPTS.organize }, { role: 'user', content: user }],
      { json: true, temperature: 0.3 }
    );
    const obj = extractJSON(text);
    if (!obj) throw new Error('AI 返回无法解析，请重试');
    return obj;
  }

  // ② 拆书：一段章节文本 → 草稿数组
  async function deconstructChunk(chapterTitle, chunkText) {
    const text = await aiChat(
      [{ role: 'system', content: PROMPTS.deconstruct },
       { role: 'user', content: '章节：' + chapterTitle + '\n\n原文：\n' + chunkText }],
      { json: true, temperature: 0.3 }
    );
    const obj = extractJSON(text);
    if (!obj || !Array.isArray(obj.notes)) throw new Error('AI 返回无法解析，请重试');
    return obj.notes || [];
  }

  // ③ 关联建议：新笔记 → 建议数组
  async function suggestLinks(note) {
    const user = '【新笔记】\n' + JSON.stringify({
      title: note.title, thoughts: note.thoughts, tags: note.tags,
      keyData: note.keyData, time: note.time,
    }) + '\n\n【已有笔记】\n' + (notesDigest(note.id) || '（空）');
    const text = await aiChat(
      [{ role: 'system', content: PROMPTS.link }, { role: 'user', content: user }],
      { json: true, temperature: 0.3 }
    );
    const obj = extractJSON(text);
    if (!obj || !Array.isArray(obj.suggestions)) throw new Error('AI 返回无法解析，请重试');
    return obj.suggestions || [];
  }

  // ④ 追问：基于笔记上下文流式回答
  function buildChatContext(noteId) {
    const n = DB.getNote(noteId);
    if (!n) return '';
    const parts = [];
    parts.push('本条笔记《' + n.title + '》\n时间：' + (n.time.label || n.time.year || '未标注')
      + '\n思考：' + (n.thoughts || '（无）'));
    (n.keyData || []).forEach(d => {
      if (d.value != null) parts.push('数据点：' + d.indicator + ' = ' + d.value + (d.unit || '') + '（' + d.year + '）' + (d.desc ? '，' + d.desc : ''));
    });
    if (n.quote && n.quote.text) parts.push('原文摘录：' + n.quote.text);
    DB.getLinks().filter(l => l.from === noteId || l.to === noteId).forEach(l => {
      const other = DB.getNote(l.from === noteId ? l.to : l.from);
      if (other) parts.push('关联笔记（' + l.type + '）《' + other.title + '》：' + String(other.thoughts || '').slice(0, 200));
    });
    return parts.join('\n\n');
  }

  async function askChat(noteId, question, onDelta) {
    const ctx = buildChatContext(noteId);
    const text = await aiChat(
      [{ role: 'system', content: PROMPTS.chat },
       { role: 'user', content: '【上下文】\n' + ctx + '\n\n【问题】\n' + question }],
      { stream: true, temperature: 0.7, onDelta }
    );
    return text;
  }

  // ---------- 关联建议存储 ----------
  function getSuggestions(noteId) {
    try { return JSON.parse(lsGet(K_SUGGEST + noteId) || '[]'); } catch (e) { return []; }
  }
  function setSuggestions(noteId, arr) { lsSet(K_SUGGEST + noteId, JSON.stringify(arr || [])); }
  function clearSuggestions(noteId) { lsDel(K_SUGGEST + noteId); }

  // ---------- 追问会话存储 ----------
  function getChat(noteId) {
    try { return JSON.parse(lsGet(K_CHAT + noteId) || '[]'); } catch (e) { return []; }
  }
  function setChat(noteId, msgs) {
    const arr = (msgs || []).slice(-40);
    lsSet(K_CHAT + noteId, JSON.stringify(arr));
  }

  // ---------- OCR（Tesseract.js 懒加载） ----------
  let tesseractPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractPromise) return tesseractPromise;
    tesseractPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => res(window.Tesseract);
      s.onerror = () => { tesseractPromise = null; rej(new Error('OCR 组件加载失败，请检查网络后重试')); };
      document.head.appendChild(s);
    });
    return tesseractPromise;
  }
  let ocrWorker = null;
  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    const T = await loadTesseract();
    ocrWorker = await T.createWorker('chi_sim', 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    });
    return ocrWorker;
  }
  async function ocrImage(file) {
    const w = await getOcrWorker();
    const res = await w.recognize(file);
    return (res.data.text || '').trim();
  }

  window.ShiyeAI = {
    getKey, setKey, getWorkerUrl, setWorkerUrl, configured,
    autoLinkEnabled, setAutoLink,
    aiChat, extractJSON,
    organizeNote, deconstructChunk, suggestLinks, askChat, buildChatContext,
    getSuggestions, setSuggestions, clearSuggestions,
    getChat, setChat,
    ocrImage,
  };
})();
