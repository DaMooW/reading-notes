/* 拾页 · 界面层：笔记列表 / 详情 / 编辑 / 数据管理 */
(function () {
  'use strict';
  const DB = window.ShiyeDB;

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function fmtVal(v) {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return v.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
    return esc(v);
  }
  function fmtYear(y) { return y == null ? '' : String(y); }
  function fmtTime(note) {
    const t = note.time || {};
    if (t.year == null && !t.label) return '未标注时间';
    let s = t.year != null ? String(t.year) : '';
    if (t.yearEnd != null) s += '–' + t.yearEnd;
    if (t.label) s += (s ? ' · ' : '') + t.label;
    return s;
  }
  function timeBadge(note) {
    const t = note.time || {};
    if (t.year != null) return String(t.year);
    if (t.label) return t.label;
    return '?';
  }
  function dataChipHTML(d) {
    const parts = [];
    if (d.indicator) parts.push(esc(d.indicator));
    parts.push('<b>' + fmtVal(d.value) + '</b>' + (d.unit ? ' ' + esc(d.unit) : ''));
    if (d.year != null) parts.push('<i>' + d.year + '</i>');
    return '<span class="chip chip-data" title="' + esc(d.desc || '') + '">' + parts.join(' ') + '</span>';
  }
  function tagHTML(t, active) {
    return '<span class="chip chip-tag' + (active ? ' active' : '') + '" data-action="set-tag-filter" data-tag="' + esc(t) + '">#' + esc(t) + '</span>';
  }
  function bookName(note) {
    const b = DB.getBook(note.bookId);
    return b ? b.title : '';
  }

  // ---------- 列表状态 ----------
  const listState = { q: '', bookId: '', tag: '', sort: 'time-desc', draftOnly: false };

  function filteredNotes() {
    let arr = DB.getNotes();
    const q = listState.q.trim().toLowerCase();
    if (listState.bookId) arr = arr.filter(n => n.bookId === listState.bookId);
    if (listState.tag) arr = arr.filter(n => (n.tags || []).includes(listState.tag));
    if (listState.draftOnly) arr = arr.filter(n => n.status === 'draft');
    if (q) {
      arr = arr.filter(n => {
        const b = bookName(n).toLowerCase();
        const hay = [
          n.title, n.thoughts, (n.quote || {}).text, (n.quote || {}).chapter,
          (n.tags || []).join(' '), b,
          (n.keyData || []).map(d => (d.indicator || '') + ' ' + (d.desc || '')).join(' '),
        ].join('\n').toLowerCase();
        return hay.includes(q);
      });
    }
    const t = n => (n.time && n.time.year) != null ? n.time.year : -1e9;
    arr.sort((a, b) => {
      if (listState.sort === 'time-asc') return t(a) - t(b) || a.updatedAt - b.updatedAt;
      if (listState.sort === 'updated') return b.updatedAt - a.updatedAt;
      return t(b) - t(a) || b.updatedAt - a.updatedAt;
    });
    return arr;
  }

  function renderList(el) {
    const notes = filteredNotes();
    const books = DB.getBooks();
    const tags = DB.allTags();
    const chips = notes.slice(0, 60).map(n => {
      const b = bookName(n);
      const dchips = (n.keyData || []).slice(0, 4).map(dataChipHTML).join('');
      const isDraft = n.status === 'draft';
      return `
      <article class="note-card${isDraft ? ' is-draft' : ''}" data-action="open-note" data-id="${esc(n.id)}">
        ${isDraft ? '<div class="draft-flag">🧾 AI 草稿' + (n.sourceRef && n.sourceRef.chapter ? ' · ' + esc(n.sourceRef.chapter) : '') + '</div>' : ''}
        <div class="note-card-top">
          <span class="time-badge">${esc(timeBadge(n))}</span>
          <h3 class="note-title">${esc(n.title)}</h3>
        </div>
        <div class="note-meta">
          ${b ? '<span class="book-name">《' + esc(b) + '》</span>' : '<span class="book-name dim">未关联书籍</span>'}
          <span class="note-tags">${(n.tags || []).map(t => '<span class="mini-tag">#' + esc(t) + '</span>').join('')}</span>
        </div>
        ${dchips ? '<div class="note-chips">' + dchips + '</div>' : ''}
        ${n.thoughts ? '<p class="note-snippet">' + esc(n.thoughts.slice(0, 110)) + (n.thoughts.length > 110 ? '…' : '') + '</p>' : ''}
        <div class="note-card-foot"><span class="dim">' + esc(fmtTime(n)) + '</span>
          <span class="note-card-btns">
            ${isDraft ? '<button class="btn btn-accept btn-sm" data-action="accept-draft" data-id="' + esc(n.id) + '">✅ 采纳</button>' : ''}
            <button class="btn btn-ghost btn-sm" data-action="edit-note" data-id="${esc(n.id)}">编辑</button>
          </span>
        </div>
      </article>`;
    }).join('');

    const draftN = DB.draftCount();
    el.innerHTML = `
      <div class="list-toolbar">
        <div class="search-box">
          <input id="list-search" type="search" placeholder="搜索标题、原文、思考、数据点…" value="${esc(listState.q)}">
        </div>
        <select id="list-book" class="select">
          <option value="">全部书籍</option>
          ${books.map(b => '<option value="' + esc(b.id) + '"' + (listState.bookId === b.id ? ' selected' : '') + '>《' + esc(b.title) + '》</option>').join('')}
        </select>
        <select id="list-sort" class="select">
          <option value="time-desc"${listState.sort === 'time-desc' ? ' selected' : ''}>时间 ↓ 新→旧</option>
          <option value="time-asc"${listState.sort === 'time-asc' ? ' selected' : ''}>时间 ↑ 旧→新</option>
          <option value="updated"${listState.sort === 'updated' ? ' selected' : ''}>最近更新</option>
        </select>
        <button class="btn btn-primary" data-action="new-note">＋ 新笔记</button>
      </div>
      <div class="tag-cloud">
        <button class="chip chip-draft${listState.draftOnly ? ' active' : ''}" data-action="toggle-drafts">🧾 待审阅草稿${draftN ? '（' + draftN + '）' : ''}</button>
        ${tags.map(t => tagHTML(t, listState.tag === t)).join('')}
      </div>
      <div class="list-count dim">共 ${notes.length} 条笔记${listState.draftOnly ? '（仅草稿）' : ''}</div>
      ${notes.length ? '<div class="note-grid">' + chips + '</div>' : renderEmptyState()}
    `;

    const s = el.querySelector('#list-search');
    s.addEventListener('input', () => { listState.q = s.value; renderList(el); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
    el.querySelector('#list-book').addEventListener('change', e => { listState.bookId = e.target.value; renderList(el); });
    el.querySelector('#list-sort').addEventListener('change', e => { listState.sort = e.target.value; renderList(el); });
  }

  function renderEmptyState() {
    const empty = DB.isEmpty();
    return `
      <div class="empty-state">
        <div class="empty-glyph">❖</div>
        <p>还没有笔记。先「＋ 新笔记」记下第一条吧。</p>
        ${empty ? '<button class="btn btn-outline" data-action="load-seed">载入《日本大衰退》示例数据</button>' : ''}
      </div>`;
  }

  // ---------- 详情 ----------
  function renderDetail(el, id) {
    const n = DB.getNote(id);
    if (!n) { renderList(el); return; }
    const b = DB.getBook(n.bookId);
    const links = DB.getLinks().filter(l => l.from === id || l.to === id);
    const linkName = (nid) => {
      const t = DB.getNote(nid);
      return t ? t.title : '（已删除）';
    };
    const outHTML = links.filter(l => l.from === id).map(l => `
      <div class="link-row out">
        <span class="link-arrow">→</span>
        <span class="link-type type-${esc(l.type)}">${esc(l.type)}</span>
        <a class="link-target" data-action="open-note" data-id="${esc(l.to)}">${esc(linkName(l.to))}</a>
        ${l.note ? '<span class="dim link-note">' + esc(l.note) + '</span>' : ''}
        <button class="btn btn-ghost btn-sm" data-action="remove-link" data-id="${esc(l.id)}">✕</button>
      </div>`).join('');
    const inHTML = links.filter(l => l.to === id).map(l => `
      <div class="link-row in">
        <a class="link-target" data-action="open-note" data-id="${esc(l.from)}">${esc(linkName(l.from))}</a>
        <span class="link-type type-${esc(l.type)}">${esc(l.type)}</span>
        <span class="link-arrow">→</span><span class="dim">本条</span>
        ${l.note ? '<span class="dim link-note">' + esc(l.note) + '</span>' : ''}
        <button class="btn btn-ghost btn-sm" data-action="remove-link" data-id="${esc(l.id)}">✕</button>
      </div>`).join('');

    // AI 关联建议
    const sugHTML = renderSuggestionRows(id);
    // 追问上下文统计
    const ctxCount = 1 + links.length + (n.keyData || []).length;

    el.innerHTML = `
      <div class="detail-page">
        <button class="btn btn-ghost" data-action="goto-list">← 返回列表</button>
        ${n.status === 'draft' ? `
        <div class="draft-banner">
          <span>🧾 这是 AI 拆书生成的草稿，确认无误后采纳入库。</span>
          <span class="draft-banner-btns">
            <button class="btn btn-accept btn-sm" data-action="accept-draft" data-id="${esc(n.id)}">✅ 采纳</button>
            <button class="btn btn-outline btn-sm" data-action="edit-note" data-id="${esc(n.id)}">✏️ 先改再采纳</button>
            <button class="btn btn-ghost btn-sm" data-action="delete-note" data-id="${esc(n.id)}">🗑 丢弃</button>
          </span>
        </div>` : ''}
        <div class="detail-head">
          <span class="time-badge big">${esc(fmtTime(n))}</span>
          <h2 class="detail-title">${esc(n.title)}</h2>
          ${b ? '<div class="book-name">《' + esc(b.title) + '》' + (b.author ? ' · ' + esc(b.author) : '') + '</div>' : ''}
          ${n.sourceRef && n.sourceRef.chapter ? '<div class="dim" style="font-size:12.5px">出处：书库 · ' + esc(n.sourceRef.chapter) + '</div>' : ''}
          ${(n.tags || []).length ? '<div class="note-tags">' + n.tags.map(t => '<span class="mini-tag">#' + esc(t) + '</span>').join('') + '</div>' : ''}
        </div>

        ${sugHTML ? `<section class="detail-sec sug-sec"><h4>💡 AI 建议的关联</h4>${sugHTML}</section>` : ''}

        ${(n.keyData || []).length ? `<section class="detail-sec"><h4>关键数据点</h4>
          <div class="data-grid">${n.keyData.map(d => {
            return '<div class="data-item" title="' + esc(d.desc || '') + '">'
              + '<div class="data-ind">' + esc(d.indicator || '数据') + '</div>'
              + '<div class="data-val">' + fmtVal(d.value) + '<span class="data-unit">' + esc(d.unit || '') + '</span></div>'
              + (d.year != null ? '<div class="data-year">' + d.year + '</div>' : '')
              + (d.desc ? '<div class="data-desc">' + esc(d.desc) + '</div>' : '')
              + '</div>';
          }).join('')}</div></section>` : ''}

        ${(n.quote.text || n.quote.chapter || n.quote.page) ? `<section class="detail-sec"><h4>原文定位</h4>
          <div class="quote-loc dim">${n.quote.chapter ? '章节：' + esc(n.quote.chapter) : ''}${n.quote.page ? '　页码：' + esc(n.quote.page) : ''}</div>
          ${n.quote.text ? '<blockquote>' + nl2br(n.quote.text) + '</blockquote>' : ''}
        </section>` : ''}

        ${n.thoughts ? '<section class="detail-sec"><h4>我的思考 / 联想</h4><p class="thoughts">' + nl2br(n.thoughts) + '</p></section>' : ''}

        <section class="detail-sec">
          <h4>因果链</h4>
          ${links.length ? outHTML + inHTML : '<p class="dim">暂无关联。编辑时可把这条笔记与其它笔记连起来。</p>'}
        </section>

        <section class="detail-sec">
          <h4>💬 追问 AI</h4>
          <p class="dim">基于本条笔记 + ${ctxCount - 1} 条关联 + ${(n.keyData || []).length} 个数据点提问。AI 回答只引用现有笔记，不会编造。</p>
          <button class="btn btn-outline" data-action="chat-open" data-id="${esc(n.id)}">💬 就这条笔记提问</button>
        </section>

        <div class="detail-actions">
          <button class="btn btn-primary" data-action="edit-note" data-id="${esc(n.id)}">编辑</button>
          <button class="btn btn-danger-outline" data-action="delete-note" data-id="${esc(n.id)}">删除</button>
        </div>
      </div>`;
  }

  function renderSuggestionRows(noteId) {
    let sug = [];
    try { sug = window.ShiyeAI.getSuggestions(noteId); } catch (e) { /* ignore */ }
    const pending = sug.filter(s => !s.done && s.toId && DB.getNote(s.toId));
    return pending.map(s => {
      const target = DB.getNote(s.toId);
      return `<div class="sug-row">
        <span class="sug-arrow">→</span>
        <span class="link-type type-${esc(s.type)}">${esc(s.type)}</span>
        <a class="link-target" data-action="open-note" data-id="${esc(s.toId)}">${esc(target ? target.title : '?')}</a>
        ${s.reason ? '<span class="dim link-note">' + esc(s.reason) + '</span>' : ''}
        <span class="sug-btns">
          <button class="btn btn-accept btn-sm" data-action="sug-accept" data-note="${esc(noteId)}" data-to="${esc(s.toId)}" data-type="${esc(s.type)}" data-reason="${esc(s.reason || '')}">接受</button>
          <button class="btn btn-ghost btn-sm" data-action="sug-ignore" data-note="${esc(noteId)}" data-to="${esc(s.toId)}">忽略</button>
        </span>
      </div>`;
    }).join('');
  }

  function renderEditorSugBox(noteId) {
    const rows = renderSuggestionRows(noteId);
    if (!rows) return '';
    return '<div class="sug-box"><div class="fld-head"><span>💡 AI 建议的关联</span></div>' + rows + '</div>';
  }

  function acceptSuggestion(noteId, toId, type, reason) {
    try {
      const sug = window.ShiyeAI.getSuggestions(noteId);
      const i = sug.findIndex(s => s.toId === toId);
      if (i >= 0) sug[i].done = true;
      window.ShiyeAI.setSuggestions(noteId, sug);
    } catch (e) { /* ignore */ }
    const exists = DB.getLinks().some(l => l.from === noteId && l.to === toId);
    if (!exists) DB.addLink(noteId, toId, type || '联想', reason || '');
  }

  function ignoreSuggestion(noteId, toId) {
    try {
      const sug = window.ShiyeAI.getSuggestions(noteId);
      const i = sug.findIndex(s => s.toId === toId);
      if (i >= 0) sug[i].done = true;
      window.ShiyeAI.setSuggestions(noteId, sug);
    } catch (e) { /* ignore */ }
  }

  // ---------- 编辑器 ----------
  let draftId = null;   // 正在编辑的笔记 id
  let isNew = false;

  // 重渲染编辑器前，把当前表单内容快照下来，避免「增删关联」时丢失未保存的输入
  function snapshotEditor(el) {
    const s = {};
    ['f-title', 'f-year', 'f-yearend', 'f-timelabel', 'f-chapter', 'f-page', 'f-quote',
     'f-thoughts', 'f-tags', 'f-book', 'f-book-title', 'f-book-author',
     'f-link-to', 'f-link-type', 'f-link-note', 'ai-raw'].forEach(id => {
      const f = el.querySelector('#' + id);
      if (f) s[id] = f.value;
    });
    s.datapoints = readDatapoints(el);
    return s;
  }

  function renderEditor(el, id, snap) {
    const isNewNote = id === 'new';
    const existing = !isNewNote ? DB.getNote(id) : null;
    if (!isNewNote && !existing) { renderList(el); return; }
    const n = existing || {
      // 未保存的新笔记重渲染时复用原草稿 id，避免已建立的关联悬空
      id: (isNewNote && draftId && !DB.getNote(draftId)) ? draftId : uid(),
      bookId: '', title: '', time: {}, quote: {}, keyData: [],
      thoughts: '', tags: [], createdAt: Date.now(),
    };
    if (snap) { // 恢复未保存的表单状态
      n.title = snap['f-title'] || '';
      n.time = { year: snap['f-year'], yearEnd: snap['f-yearend'], label: snap['f-timelabel'] || '' };
      n.quote = { chapter: snap['f-chapter'] || '', page: snap['f-page'] || '', text: snap['f-quote'] || '' };
      n.thoughts = snap['f-thoughts'] || '';
      n.tags = snap['f-tags'] || '';
      n.keyData = snap.datapoints || [];
    }
    draftId = n.id;
    isNew = isNewNote;

    const books = DB.getBooks();
    const others = DB.getNotes().filter(x => x.id !== n.id);
    const links = DB.getLinks().filter(l => l.from === n.id || l.to === n.id);
    const bookSel = snap && snap['f-book'] !== undefined ? snap['f-book'] : (n.bookId || '');

    el.innerHTML = `
      <div class="editor-page">
        <div class="editor-head">
          <button class="btn btn-ghost" data-action="cancel-edit">← 取消</button>
          <h2>${isNewNote ? '新笔记' : '编辑笔记'}</h2>
          <button class="btn btn-primary" data-action="save-note">保存</button>
        </div>

        <div class="ai-box">
          <div class="fld-head"><span>✨ AI 整理</span><span class="dim">粘贴原文/转述，或拍照识别；AI 生成草稿填入下方表单（不会自动保存）</span></div>
          <textarea id="ai-raw" rows="3" placeholder="粘贴书中原文片段或你的转述…">${esc(snap && snap['ai-raw'] ? snap['ai-raw'] : '')}</textarea>
          <div class="ai-actions">
            <button class="btn btn-outline btn-sm" data-action="ai-photo">📷 拍照识别</button>
            <input type="file" id="ai-photo-input" accept="image/*" style="display:none">
            <button class="btn btn-outline btn-sm" data-action="ai-locate">🔍 书库定位原文</button>
            <button class="btn btn-primary btn-sm" data-action="ai-organize">✨ 生成笔记草稿</button>
            <span class="dim" id="ai-status"></span>
          </div>
        </div>
        <div id="ai-suggest-box">${renderEditorSugBox(draftId || n.id)}</div>

        <div class="form-grid">
          <label class="fld fld-full">标题
            <input id="f-title" type="text" placeholder="一句话概括这条笔记" value="${esc(n.title)}">
          </label>

          <label class="fld">所属书
            <select id="f-book">
              <option value="">（未关联）</option>
              ${books.map(b => '<option value="' + esc(b.id) + '"' + (bookSel === b.id ? ' selected' : '') + '>《' + esc(b.title) + '》</option>').join('')}
              <option value="__new__"${bookSel === '__new__' ? ' selected' : ''}>＋ 新建书籍…</option>
            </select>
          </label>
          <div class="fld fld-half" id="f-book-new" style="display:none">
            <label>新书名<input id="f-book-title" type="text" placeholder="书名" value="${esc(snap ? snap['f-book-title'] || '' : '')}"></label>
            <label>作者<input id="f-book-author" type="text" placeholder="作者（可选）" value="${esc(snap ? snap['f-book-author'] || '' : '')}"></label>
          </div>

          <label class="fld">年代（起）
            <input id="f-year" type="number" placeholder="如 1989" value="${n.time.year != null ? n.time.year : ''}">
          </label>
          <label class="fld">年代（止，可选）
            <input id="f-yearend" type="number" placeholder="如 1992" value="${n.time.yearEnd != null ? n.time.yearEnd : ''}">
          </label>
          <label class="fld fld-half">时间标签
            <input id="f-timelabel" type="text" placeholder="如：1980年代后期 / 2024年9月" value="${esc(n.time.label || '')}">
          </label>

          <div class="fld fld-half">章节<input id="f-chapter" type="text" placeholder="如：第三章" value="${esc(n.quote.chapter || '')}"></div>
          <div class="fld fld-half">页码<input id="f-page" type="text" placeholder="如：p.87" value="${esc(n.quote.page || '')}"></div>
          <label class="fld fld-full">原文摘录
            <textarea id="f-quote" rows="3" placeholder="粘贴书中原文，方便日后核对">${esc(n.quote.text || '')}</textarea>
          </label>

          <div class="fld fld-full">
            <div class="fld-head"><span>关键数据点</span><button class="btn btn-ghost btn-sm" data-action="add-datapoint">＋ 添加</button></div>
            <div id="f-datapoints" class="datapoint-list">${datapointRows(n.keyData || [])}</div>
          </div>

          <label class="fld fld-full">我的思考 / 联想
            <textarea id="f-thoughts" rows="4" placeholder="记下你的想法、与中国情况的联想、待探究的问题…">${esc(n.thoughts || '')}</textarea>
          </label>

          <label class="fld fld-full">标签（用逗号分隔）
            <input id="f-tags" type="text" placeholder="如：银行, 泡沫, 待探究" value="${esc(Array.isArray(n.tags) ? n.tags.join(', ') : (n.tags || ''))}">
          </label>

          <div class="fld fld-full">
            <div class="fld-head"><span>因果链（已有）</span></div>
            <div class="link-list-editor">${links.length ? links.map(l => {
              const other = DB.getNote(l.from === n.id ? l.to : l.from);
              const dir = l.from === n.id ? 'out' : 'in';
              return `<div class="link-row ${dir}">
                ${dir === 'out'
                  ? '<span class="link-arrow">→</span><span class="link-type type-' + esc(l.type) + '">' + esc(l.type) + '</span><a class="link-target" data-action="open-note" data-id="' + esc(l.to) + '">' + esc(other ? other.title : '（已删除）') + '</a>'
                  : '<a class="link-target" data-action="open-note" data-id="' + esc(l.from) + '">' + esc(other ? other.title : '（已删除）') + '</a><span class="link-type type-' + esc(l.type) + '">' + esc(l.type) + '</span><span class="link-arrow">→</span><span class="dim">本条</span>'}
                ${l.note ? '<span class="dim link-note">' + esc(l.note) + '</span>' : ''}
                <button class="btn btn-ghost btn-sm" data-action="remove-link" data-id="${esc(l.id)}">✕</button>
              </div>`;
            }).join('') : '<p class="dim">还没有关联。在下方把本条笔记与其它笔记连成因果链。</p>'}</div>
          </div>

          <div class="fld fld-full link-add-box">
            <div class="fld-head"><span>新增关联</span></div>
            <div class="link-add-grid">
              <select id="f-link-to">
                <option value="">选择要关联的笔记…</option>
                ${others.map(o => '<option value="' + esc(o.id) + '"' + (snap && snap['f-link-to'] === o.id ? ' selected' : '') + '>' + esc(o.title) + '（' + esc(fmtTime(o)) + '）</option>').join('')}
              </select>
              <input id="f-link-type" list="link-types" placeholder="关系：导致/促进/反转/对比/联想…" value="${esc(snap ? snap['f-link-type'] || '' : '')}">
              <datalist id="link-types">
                <option value="导致"></option><option value="促进"></option><option value="循环"></option>
                <option value="反转"></option><option value="对比"></option><option value="联想"></option>
              </datalist>
              <input id="f-link-note" type="text" placeholder="备注（可选）" value="${esc(snap ? snap['f-link-note'] || '' : '')}">
              <button class="btn btn-outline" data-action="add-link">建立关联</button>
            </div>
          </div>
        </div>
      </div>`;

    const bs = el.querySelector('#f-book');
    const syncBookNew = () => {
      el.querySelector('#f-book-new').style.display = bs.value === '__new__' ? '' : 'none';
    };
    bs.addEventListener('change', syncBookNew);
    syncBookNew();
  }

  function datapointRows(dps) {
    return (dps || []).map((d, i) => `
      <div class="datapoint-row">
        <input type="text" placeholder="指标" class="dp-indicator" value="${esc(d.indicator || '')}">
        <input type="number" step="any" placeholder="数值" class="dp-value" value="${d.value != null ? d.value : ''}">
        <input type="text" placeholder="单位" class="dp-unit" value="${esc(d.unit || '')}">
        <input type="number" placeholder="年份" class="dp-year" value="${d.year != null ? d.year : ''}">
        <input type="text" placeholder="说明（可选）" class="dp-desc" value="${esc(d.desc || '')}">
        <button class="btn btn-ghost btn-sm" data-action="remove-datapoint" data-index="${i}">✕</button>
      </div>`).join('');
  }

  function readDatapoints(el) {
    const rows = Array.from(el.querySelectorAll('.datapoint-row'));
    return rows.map(r => ({
      indicator: r.querySelector('.dp-indicator').value,
      value: r.querySelector('.dp-value').value,
      unit: r.querySelector('.dp-unit').value,
      year: r.querySelector('.dp-year').value,
      desc: r.querySelector('.dp-desc').value,
    })).filter(d => d.indicator.trim() || (d.value != null && d.value !== ''));
  }

  function saveEditor(el) {
    let bookId = el.querySelector('#f-book').value;
    if (bookId === '__new__') {
      const t = el.querySelector('#f-book-title').value.trim();
      if (!t) { alert('请填写新书名'); return; }
      bookId = DB.addBook(t, el.querySelector('#f-book-author').value.trim()).id;
    }
    const note = {
      id: draftId,
      bookId,
      title: el.querySelector('#f-title').value,
      time: {
        year: el.querySelector('#f-year').value,
        yearEnd: el.querySelector('#f-yearend').value,
        label: el.querySelector('#f-timelabel').value,
      },
      quote: {
        chapter: el.querySelector('#f-chapter').value,
        page: el.querySelector('#f-page').value,
        text: el.querySelector('#f-quote').value,
      },
      keyData: readDatapoints(el),
      thoughts: el.querySelector('#f-thoughts').value,
      tags: el.querySelector('#f-tags').value,
    };
    const saved = DB.upsertNote(note);
    isNew = false;
    const AI = window.ShiyeAI;
    try { AI.clearSuggestions(saved.id); } catch (e) { /* ignore */ }
    // 自动关联建议（后台静默，失败不影响保存）
    if (AI.configured() && AI.autoLinkEnabled() && DB.getNotes().length <= 300) {
      AI.suggestLinks(saved).then(sugList => {
        const sug = (sugList || []).filter(s => s.toId && s.toId !== saved.id && DB.getNote(s.toId));
        if (sug.length) {
          AI.setSuggestions(saved.id, sug.map(s => ({ toId: s.toId, type: s.type, reason: s.reason, done: false })));
          // 建议是异步到达的：若当前正停在详情页，重渲染以显示建议
          if (location.hash === '#/note/' + saved.id) {
            renderDetail(document.getElementById('view'), saved.id);
          }
        }
      }).catch(() => { /* 静默 */ });
    }
    location.hash = '#/note/' + draftId;
  }

  function cancelEditor() {
    try { window.ShiyeAI.clearSuggestions(draftId); } catch (e) { /* ignore */ }
    // 若是新建且从未保存，清理指向该草稿的关联，避免悬空链接
    if (isNew) {
      const id = draftId;
      DB.getLinks().filter(l => l.from === id || l.to === id).forEach(l => DB.deleteLink(l.id));
      isNew = false;
      location.hash = '#/';
    } else {
      isNew = false;
      location.hash = '#/note/' + draftId;
    }
  }

  // ---------- 设置 / 数据管理 ----------
  function openSettings() {
    const root = document.getElementById('modal-root');
    const AI = window.ShiyeAI;
    root.innerHTML = `
      <div class="modal-backdrop" data-action="close-settings">
        <div class="modal" data-stop="1">
          <div class="modal-head"><h3>数据管理 & AI 设置</h3><button class="btn btn-ghost" data-action="close-settings">✕</button></div>
          <div class="modal-body">
            <div class="setting-block">
              <h4>AI 设置（DeepSeek）</h4>
              <label class="fld">API Key
                <input id="ai-key" type="password" placeholder="sk-..." value="${esc(AI.getKey())}">
              </label>
              <label class="fld">代理地址
                <input id="ai-worker" type="text" placeholder="https://你的代理.workers.dev" value="${esc(AI.getWorkerUrl())}">
              </label>
              <label class="check-row"><input type="checkbox" id="ai-autolink"${AI.autoLinkEnabled() ? ' checked' : ''}> 保存笔记后自动让 AI 建议关联</label>
              <div class="setting-save-row">
                <button class="btn btn-primary btn-sm" data-action="save-ai-settings">保存 AI 设置</button>
                <span class="dim" id="ai-settings-status"></span>
              </div>
              <p class="dim small">Key 只存在本机浏览器，请求经你自己的 Cloudflare Workers 代理转发给 DeepSeek，不上传任何第三方。导出备份不含 Key。</p>
            </div>
            <div class="setting-row">
              <div><b>导出备份</b><div class="dim">把全部笔记下载为一个 JSON 文件，建议定期备份。</div></div>
              <button class="btn btn-outline" data-action="export-data">导出 JSON</button>
            </div>
            <div class="setting-row">
              <div><b>导入备份</b><div class="dim">用备份文件覆盖当前数据（导入前请先导出备份）。</div></div>
              <button class="btn btn-outline" data-action="import-data">选择文件</button>
              <input type="file" id="import-file" accept="application/json,.json" style="display:none">
            </div>
            <div class="setting-row">
              <div><b>清空全部数据</b><div class="dim danger-text">删除所有书籍、笔记与因果链，不可恢复。</div></div>
              <button class="btn btn-danger-outline" data-action="clear-all">清空</button>
            </div>
            <hr>
            <div class="about">
              <p><b>拾页 · 读书笔记</b> —— 把书中的关键数据、年代、原文与你的思考连成一张网。</p>
              <p class="dim">数据仅保存在当前设备的浏览器中，不上传任何服务器。导出 JSON 即可备份或迁移。<br>
              在 iPhone/iPad Safari 中点「分享 → 添加到主屏幕」，即可像 App 一样使用。</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  function closeSettings() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function doExport() {
    const blob = new Blob([DB.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = '拾页备份-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  function doImport(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        if (!obj || !Array.isArray(obj.notes) || !Array.isArray(obj.books) || !Array.isArray(obj.links)) {
          throw new Error('文件格式不正确：缺少 books/notes/links 字段');
        }
        if (!confirm('导入将覆盖当前全部数据（现有 ' + DB.getNotes().length + ' 条笔记）。确定继续？')) return;
        DB.importJSON(r.result);
        alert('导入成功：' + obj.notes.length + ' 条笔记、' + obj.links.length + ' 条关联。');
        closeSettings();
        location.reload();
      } catch (e) {
        alert('导入失败：' + e.message);
      }
    };
    r.readAsText(file);
  }

  // ---------- 全局事件委托 ----------
  function attach() {
    document.addEventListener('click', onViewClick);
    document.addEventListener('change', onViewChange);
  }

  function onViewClick(e) {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    // 点击落在弹窗内容区（非按钮）时，不触发背景的关闭动作
    const stop = e.target.closest('[data-stop]');
    if (stop && stop.closest('[data-action]') === t) return;
    const a = t.dataset.action;
    const id = t.dataset.id;
    switch (a) {
      case 'open-note': location.hash = '#/note/' + id; break;
      case 'edit-note': location.hash = '#/note/' + id + '/edit'; break;
      case 'new-note': location.hash = '#/note/new'; break;
      case 'goto-list': location.hash = '#/'; break;
      case 'cancel-edit': cancelEditor(); break;
      case 'delete-note':
        if (confirm('确定删除这条笔记？其上的因果链关联会一并删除。')) {
          DB.deleteNote(id);
          location.hash = '#/';
        }
        break;
      case 'set-tag-filter':
        listState.tag = listState.tag === t.dataset.tag ? '' : t.dataset.tag;
        renderList(document.getElementById('view'));
        break;
      case 'load-seed':
        if (DB.seedIfEmpty()) { renderList(document.getElementById('view')); }
        break;
      case 'save-note': saveEditor(document.getElementById('view')); break;
      case 'add-datapoint': {
        const box = document.getElementById('f-datapoints');
        box.insertAdjacentHTML('beforeend', datapointRows([{}]));
        break;
      }
      case 'remove-datapoint': {
        const row = t.closest('.datapoint-row');
        if (row) row.remove();
        break;
      }
      case 'remove-link': {
        DB.deleteLink(id);
        const v = document.getElementById('view');
        renderEditor(v, isNew ? 'new' : draftId, snapshotEditor(v));
        break;
      }
      case 'add-link': {
        const sel = document.getElementById('f-link-to');
        const type = document.getElementById('f-link-type').value.trim();
        const note = document.getElementById('f-link-note').value.trim();
        if (!sel.value) { alert('请先选择要关联的笔记'); return; }
        if (!type) { alert('请填写关系类型，如：导致、对比、联想'); return; }
        DB.addLink(draftId, sel.value, type, note);
        const v = document.getElementById('view');
        renderEditor(v, isNew ? 'new' : draftId, snapshotEditor(v));
        break;
      }
      case 'toggle-drafts':
        listState.draftOnly = !listState.draftOnly;
        renderList(document.getElementById('view'));
        break;
      case 'accept-draft':
        DB.setNoteStatus(id, 'confirmed');
        if (location.hash.indexOf('/note/' + id) >= 0) renderDetail(document.getElementById('view'), id);
        else renderList(document.getElementById('view'));
        break;
      case 'sug-accept': {
        acceptSuggestion(t.dataset.note, t.dataset.to, t.dataset.type, t.dataset.reason);
        if (location.hash.indexOf('/note/') >= 0) {
          const v = document.getElementById('view');
          const hid = location.hash.split('/')[2];
          if (v.querySelector('.editor-page')) renderEditor(v, isNew ? 'new' : draftId, snapshotEditor(v));
          else renderDetail(v, hid);
        }
        break;
      }
      case 'sug-ignore': {
        ignoreSuggestion(t.dataset.note, t.dataset.to);
        if (location.hash.indexOf('/note/') >= 0) {
          const v = document.getElementById('view');
          const hid = location.hash.split('/')[2];
          if (v.querySelector('.editor-page')) renderEditor(v, isNew ? 'new' : draftId, snapshotEditor(v));
          else renderDetail(v, hid);
        }
        break;
      }
      case 'ai-photo': document.getElementById('ai-photo-input').click(); break;
      case 'ai-organize': aiOrganize(); break;
      case 'ai-locate': aiLocate(); break;
      case 'locate-pick': {
        const ch = document.getElementById('f-chapter');
        const qu = document.getElementById('f-quote');
        if (ch) ch.value = t.dataset.chapter || '';
        if (qu) qu.value = (t.dataset.excerpt || '').replace(/^…/, '').replace(/…$/, '');
        const res = document.getElementById('ai-locate-results');
        if (res) res.remove();
        aiStatus('已填入「章节」与「原文摘录」');
        break;
      }
      case 'save-ai-settings': saveAISettings(); break;
      case 'chat-open': openChat(id); break;
      case 'chat-close': closeChat(); break;
      case 'chat-send': sendChat(); break;
      case 'open-settings': openSettings(); break;
      case 'close-settings': closeSettings(); break;
      case 'export-data': doExport(); break;
      case 'import-data': document.getElementById('import-file').click(); break;
      case 'clear-all':
        if (confirm('确定清空全部数据？此操作不可恢复。建议先导出备份。')) {
          if (confirm('再确认一次：清空后所有笔记将消失。')) {
            DB.clearAll();
            listState.q = ''; listState.bookId = ''; listState.tag = '';
            closeSettings();
            location.hash = '#/';
          }
        }
        break;
      default:
        // 转发给书库页面处理
        if (window.ShiyeLibUI) window.ShiyeLibUI.handleClick(t);
    }
  }

  function showDrafts() {
    listState.draftOnly = true;
    location.hash = '#/';
    renderList(document.getElementById('view'));
  }

  // ---------- AI 整理 / 定位原文 ----------
  function aiStatus(msg, isErr) {
    const s = document.getElementById('ai-status');
    if (s) { s.textContent = msg || ''; s.style.color = isErr ? '#c0392b' : ''; }
  }

  async function aiOrganize() {
    const AI = window.ShiyeAI;
    const raw = document.getElementById('ai-raw').value.trim();
    if (!raw) { aiStatus('请先粘贴原文或拍照识别', true); return; }
    if (!AI.configured()) { alert('请先在「⚙ 数据 → AI 设置」里填好 API Key 与代理地址'); openSettings(); return; }
    aiStatus('AI 整理中…');
    const btn = document.querySelector('[data-action="ai-organize"]');
    if (btn) btn.disabled = true;
    try {
      const obj = await AI.organizeNote(raw);
      const v = document.getElementById('view');
      const base = snapshotEditor(v);
      if (obj.title) base['f-title'] = obj.title;
      if (obj.time) {
        base['f-year'] = obj.time.year != null ? obj.time.year : '';
        base['f-yearend'] = obj.time.yearEnd != null ? obj.time.yearEnd : '';
        base['f-timelabel'] = obj.time.label || '';
      }
      if (obj.quote) {
        base['f-chapter'] = obj.quote.chapter || '';
        base['f-page'] = obj.quote.page || '';
        base['f-quote'] = obj.quote.text || '';
      }
      if (obj.thoughts) base['f-thoughts'] = obj.thoughts;
      if (Array.isArray(obj.tags) && obj.tags.length) base['f-tags'] = obj.tags.join(', ');
      if (Array.isArray(obj.keyData) && obj.keyData.length) {
        base.datapoints = obj.keyData.map(k => ({
          indicator: k.indicator || '', value: k.value, unit: k.unit || '',
          year: k.year, desc: k.desc || '',
        }));
      }
      const sug = (obj.linkSuggestions || []).filter(s => s.toId && s.toId !== draftId && DB.getNote(s.toId));
      if (sug.length) {
        AI.setSuggestions(draftId, sug.map(s => ({ toId: s.toId, type: s.type || '联想', reason: s.reason || '', done: false })));
      }
      renderEditor(v, isNew ? 'new' : draftId, base);
      aiStatus('✅ 草稿已填入表单，请检查后保存');
    } catch (e) {
      aiStatus((e && e.message) || 'AI 调用失败', true);
      if (btn) btn.disabled = false;
    }
  }

  async function aiPhoto(file) {
    aiStatus('OCR 识别中…（首次使用需下载模型约 15MB，请耐心等待）');
    try {
      const text = await window.ShiyeAI.ocrImage(file);
      const ta = document.getElementById('ai-raw');
      if (ta) ta.value = text ? text : ta.value;
      aiStatus('✅ 识别完成，请核对文字后点「生成笔记草稿」');
    } catch (e) {
      aiStatus((e && e.message) || '识别失败', true);
    }
  }

  async function aiLocate() {
    const q = ((document.getElementById('f-quote') ? document.getElementById('f-quote').value : '')
      || document.getElementById('ai-raw').value || '').trim();
    if (!q) { aiStatus('先在「原文摘录」或上方输入框里放一些文字，再定位原文', true); return; }
    const old = document.getElementById('ai-locate-results');
    if (old) old.remove();
    aiStatus('在书库中搜索原文…');
    try {
      const hits = await window.ShiyeLibrary.searchAllBooks(q, 3);
      if (!hits.length) { aiStatus('书库里没有匹配段落（可到「书库」页导入电子书）', true); return; }
      let html = '<div class="locate-results" id="ai-locate-results"><div class="fld-head"><span>📍 书库中找到的原文</span></div>';
      hits.forEach(h => {
        html += '<div class="locate-item" data-action="locate-pick" data-chapter="' + esc(h.chapter) + '" data-excerpt="' + esc(h.excerpt) + '">'
          + '<b>' + esc(h.bookTitle) + ' · ' + esc(h.chapter) + '</b><p>' + esc(h.excerpt) + '</p></div>';
      });
      html += '</div>';
      const box = document.querySelector('.ai-box');
      box.insertAdjacentHTML('afterend', html);
      aiStatus('点击一段原文，自动填入「章节」与「原文摘录」');
    } catch (e) {
      aiStatus((e && e.message) || '搜索失败', true);
    }
  }

  // ---------- 追问聊天 ----------
  let chatNoteId = null;
  let chatStreaming = false;

  function openChat(noteId) {
    const n = DB.getNote(noteId);
    if (!n) return;
    const AI = window.ShiyeAI;
    if (!AI.configured()) { alert('请先在「⚙ 数据 → AI 设置」里填好 API Key 与代理地址'); openSettings(); return; }
    chatNoteId = noteId;
    chatStreaming = false;
    const msgs = AI.getChat(noteId);
    document.getElementById('modal-root').innerHTML = `
      <div class="modal-backdrop chat-backdrop" data-action="chat-close">
        <div class="chat-sheet" data-stop="1">
          <div class="chat-head">
            <b>💬 追问 · ${esc(n.title)}</b>
            <button class="btn btn-ghost btn-sm" data-action="chat-close">✕</button>
          </div>
          <div class="chat-hint dim">上下文 = 本条笔记 + 因果链关联 + 数据点。AI 只基于这些回答，不确定会直说，不会编造。</div>
          <div class="chat-msgs" id="chat-msgs">${renderChatMsgs(msgs)}</div>
          <div class="chat-input-row">
            <input id="chat-q" type="text" placeholder="就这条笔记提问，回车发送…">
            <button class="btn btn-primary btn-sm" data-action="chat-send">发送</button>
          </div>
        </div>
      </div>`;
    const input = document.getElementById('chat-q');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
    setTimeout(() => input.focus(), 60);
    scrollChat();
  }

  function renderChatMsgs(msgs) {
    if (!msgs.length) return '<div class="chat-empty dim">问点什么吧，比如「为什么银行收紧信贷会把正循环变成负循环？」</div>';
    return msgs.map(m =>
      '<div class="bubble ' + (m.role === 'user' ? 'bubble-user' : 'bubble-ai') + '">' + esc(m.content).replace(/\n/g, '<br>') + '</div>'
    ).join('');
  }

  function closeChat() {
    chatNoteId = null;
    chatStreaming = false;
    document.getElementById('modal-root').innerHTML = '';
  }

  function scrollChat() {
    const m = document.getElementById('chat-msgs');
    if (m) m.scrollTop = m.scrollHeight;
  }

  async function sendChat() {
    if (!chatNoteId || chatStreaming) return;
    const input = document.getElementById('chat-q');
    const q = (input.value || '').trim();
    if (!q) return;
    input.value = '';
    const AI = window.ShiyeAI;
    const msgs = AI.getChat(chatNoteId);
    msgs.push({ role: 'user', content: q });
    AI.setChat(chatNoteId, msgs);
    const box = document.getElementById('chat-msgs');
    box.insertAdjacentHTML('beforeend', '<div class="bubble bubble-user">' + esc(q).replace(/\n/g, '<br>') + '</div>');
    box.insertAdjacentHTML('beforeend', '<div class="bubble bubble-ai" id="chat-typing">…</div>');
    scrollChat();
    chatStreaming = true;
    let answer = '';
    try {
      answer = await AI.askChat(chatNoteId, q, (delta, full) => {
        const el = document.getElementById('chat-typing');
        if (el) { el.innerHTML = esc(full).replace(/\n/g, '<br>'); scrollChat(); }
      });
      const el = document.getElementById('chat-typing');
      if (el) el.removeAttribute('id');
      const stored = AI.getChat(chatNoteId);
      stored.push({ role: 'assistant', content: answer });
      AI.setChat(chatNoteId, stored);
    } catch (e) {
      const el = document.getElementById('chat-typing');
      if (el) {
        el.removeAttribute('id');
        el.innerHTML = '⚠ ' + esc((e && e.message) || 'AI 调用失败');
        el.classList.add('bubble-err');
      }
    }
    chatStreaming = false;
    scrollChat();
  }

  function saveAISettings() {
    const AI = window.ShiyeAI;
    AI.setKey(document.getElementById('ai-key').value);
    AI.setWorkerUrl(document.getElementById('ai-worker').value);
    AI.setAutoLink(document.getElementById('ai-autolink').checked);
    const s = document.getElementById('ai-settings-status');
    if (s) s.textContent = AI.configured() ? '✅ 已保存，AI 功能可用' : '已保存（Key 与代理地址都要填好才能用）';
  }

  function onViewChange(e) {
    if (e.target.id === 'import-file' && e.target.files && e.target.files[0]) {
      doImport(e.target.files[0]);
      e.target.value = '';
    }
    if (e.target.id === 'ai-photo-input' && e.target.files && e.target.files[0]) {
      aiPhoto(e.target.files[0]);
      e.target.value = '';
    }
    if (window.ShiyeLibUI) window.ShiyeLibUI.handleChange(e);
  }

  function uid() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  window.ShiyeUI = {
    attach, renderList, renderDetail, renderEditor, openSettings, showDrafts,
    esc, fmtVal, fmtTime, timeBadge, bookName, dataChipHTML, tagHTML,
  };
})();
