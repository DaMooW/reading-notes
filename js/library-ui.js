/* 拾页 · 书库页面：上传电子书 / 拆书 / 审阅队列 */
(function () {
  'use strict';
  const DB = window.ShiyeDB;
  const LIB = window.ShiyeLibrary;
  const U = window.ShiyeUI;
  const esc = U.esc;

  async function render(el) {
    let books = [];
    try { books = await LIB.listBooks(); } catch (e) { /* ignore */ }
    const task = LIB.getTask();
    const draftN = DB.draftCount();
    const running = LIB.taskRunning();

    el.innerHTML = `
      <div class="library-view">
        <div class="view-head">
          <h2>📚 书库</h2>
          <p class="dim">把电子书（EPUB / PDF / TXT / MD）导入这里，AI 可以整本拆解成笔记草稿，也可以在任何笔记里定位原文。</p>
        </div>

        <div class="lib-toolbar">
          <button class="btn btn-primary" data-action="lib-upload">📥 导入电子书</button>
          <input type="file" id="lib-file" accept=".epub,.pdf,.txt,.md,application/epub+zip,application/pdf,text/plain,text/markdown" style="display:none">
          <span class="dim" id="lib-status"></span>
        </div>

        ${draftN ? `
        <div class="lib-review-banner">
          <span>🧾 有 ${draftN} 条 AI 生成的笔记草稿待审阅</span>
          <button class="btn btn-accept btn-sm" data-action="goto-drafts">去审阅 →</button>
        </div>` : ''}

        ${running && task ? renderProgress(task) : ''}
        ${!running && task && task.done < task.total ? `
        <div class="lib-resume">
          <span class="dim">上次拆书《${esc(task.bookTitle)}》进行到 ${task.done}/${task.total}${task.lastError ? '（中断：' + esc(task.lastError) + '）' : ''}</span>
          <button class="btn btn-outline btn-sm" data-action="lib-resume" data-book="${esc(task.bookId)}">▶ 继续</button>
        </div>` : ''}

        ${books.length ? '<div class="lib-list">' + books.map(bookCard).join('') + '</div>' : `
        <div class="empty-state">
          <div class="empty-glyph">📖</div>
          <p>书库还是空的。导入一本电子书试试。</p>
          <p class="dim">导入后点「拆书」，AI 会逐章生成笔记草稿，你逐条审阅采纳入库。</p>
        </div>`}
      </div>`;
  }

  function bookCard(b) {
    const chars = LIB.bookChars(b);
    const task = LIB.getTask();
    const isThisTask = task && task.bookId === b.id;
    return `
      <article class="lib-card">
        <div class="lib-card-head">
          <span class="fmt-badge">${esc((b.format || '').toUpperCase())}</span>
          <h3>${esc(b.title)}</h3>
          ${b.author ? '<span class="dim">' + esc(b.author) + '</span>' : ''}
        </div>
        <div class="lib-meta dim">${(b.chapters || []).length} 章 · ${chars.toLocaleString('zh-CN')} 字 · ${fmtSize(b.size)}</div>
        ${isThisTask && task.done < task.total ? renderProgress(task) : ''}
        <div class="lib-actions">
          <button class="btn btn-outline btn-sm" data-action="lib-deconstruct" data-book="${esc(b.id)}">🤖 拆书</button>
          <button class="btn btn-ghost btn-sm" data-action="lib-delete" data-book="${esc(b.id)}">🗑 删除</button>
        </div>
      </article>`;
  }

  function renderProgress(task) {
    const pct = task.total ? Math.round(task.done / task.total * 100) : 0;
    return `
      <div class="lib-progress">
        <div class="lib-progress-bar"><i style="width:${pct}%"></i></div>
        <div class="dim">拆书《${esc(task.bookTitle)}》 ${task.done}/${task.total} 段 · 已生成 ${task.created} 条草稿${task.running ? ' · 进行中…' : ''}</div>
        ${task.running ? '<button class="btn btn-ghost btn-sm" data-action="lib-cancel">⏹ 停止</button>' : ''}
      </div>`;
  }

  function fmtSize(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function libStatus(msg, isErr) {
    const s = document.getElementById('lib-status');
    if (s) { s.textContent = msg || ''; s.style.color = isErr ? '#c0392b' : ''; }
  }

  async function doUpload(file) {
    if (!window.ShiyeParse) { libStatus('解析模块未加载', true); return; }
    libStatus('解析中…（大文件请耐心等待）');
    try {
      const book = await LIB.importFile(file, (p) => {
        if (p && p.page) libStatus('解析 PDF 中… 第 ' + p.page + ' / ' + p.totalPages + ' 页');
      });
      libStatus('✅ 已导入《' + book.title + '》，共 ' + book.chapters.length + ' 章');
      render(document.getElementById('view'));
    } catch (e) {
      libStatus((e && e.message) || '导入失败', true);
    }
  }

  async function doDeconstruct(bookId) {
    const AI = window.ShiyeAI;
    if (!AI.configured()) { alert('请先在「⚙ 数据 → AI 设置」里填好 API Key 与代理地址'); U.openSettings(); return; }
    const book = await LIB.getBook(bookId);
    if (!book) return;
    const chunks = LIB.buildChunks(book);
    if (!chunks.length) { alert('这本书里没有可拆解的文本'); return; }
    const est = Math.ceil(chunks.length * 25 / 60);
    if (!confirm('《' + book.title + '》将切成 ' + chunks.length + ' 段调用 AI 拆解（预计 ' + est + ' 分钟左右，可中途停止、之后继续）。生成的笔记全部以草稿态进入审阅队列。开始？')) return;
    render(document.getElementById('view'));
    try {
      const r = await LIB.startDeconstruct(bookId, (p) => {
        // 节流刷新：每完成一段刷新进度
        render(document.getElementById('view'));
      });
      libStatus('✅ 拆书完成，生成 ' + r.created + ' 条草稿，去审阅队列看看吧');
      render(document.getElementById('view'));
    } catch (e) {
      libStatus((e && e.message) || '拆书失败（可点「继续」接着来）', true);
      render(document.getElementById('view'));
    }
  }

  // 事件委托（由 app.js 调用的统一入口）
  function handleClick(t) {
    const a = t.dataset.action;
    const id = t.dataset.book;
    switch (a) {
      case 'lib-upload': document.getElementById('lib-file').click(); break;
      case 'lib-deconstruct': doDeconstruct(id); break;
      case 'lib-cancel':
        LIB.cancelTask();
        libStatus('已停止（已生成的草稿保留，可点「继续」接着拆）');
        render(document.getElementById('view'));
        break;
      case 'lib-resume': doDeconstruct(id); break;
      case 'lib-delete':
        if (confirm('从书库删除这本书？已生成的笔记草稿不受影响。')) {
          LIB.deleteBook(id).then(() => render(document.getElementById('view')));
        }
        break;
      case 'goto-drafts':
        U.showDrafts();
        break;
    }
  }

  function handleChange(e) {
    if (e.target.id === 'lib-file' && e.target.files && e.target.files[0]) {
      doUpload(e.target.files[0]);
      e.target.value = '';
    }
  }

  window.ShiyeLibUI = { render, handleClick, handleChange };
})();
