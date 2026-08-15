/* 拾页 · 书籍管理主页：书架 / 新建书籍 / 导入电子书 / 拆书 / 研读包 */
(function () {
  'use strict';
  const DB = window.ShiyeDB;
  const LIB = window.ShiyeLibrary;
  const U = window.ShiyeUI;
  const esc = U.esc;

  async function render(el) {
    const dbBooks = DB.getBooks();
    let libs = [];
    try { libs = await LIB.listBooks(); } catch (e) { /* ignore */ }
    const task = LIB.getTask();
    const running = LIB.taskRunning();
    const draftN = DB.draftCount();
    const packInstalled = dbBooks.some(b => (b.title || '').replace(/\s/g, '') === '日本大衰退');

    const cards = dbBooks.map(b => {
      const lib = libs.find(x => x.id === b.id);
      const notes = DB.getNotes().filter(n => n.bookId === b.id);
      const drafts = notes.filter(n => n.status === 'draft').length;
      const chars = lib ? LIB.bookChars(lib) : 0;
      return `
      <article class="lib-card book-card">
        <div class="book-card-head">
          <span class="book-cover">${esc((b.title || '书')[0])}</span>
          <div class="book-card-title">
            <h3>《${esc(b.title)}》</h3>
            ${b.author ? '<div class="dim">' + esc(b.author) + '</div>' : ''}
            <div class="book-badges">
              ${lib ? '<span class="fmt-badge">' + esc((lib.format || '').toUpperCase()) + '</span><span class="dim">' + (lib.chapters || []).length + ' 章 · ' + chars.toLocaleString('zh-CN') + ' 字</span>' : '<span class="dim">未导入全文（可拍照识别或直接记笔记）</span>'}
            </div>
          </div>
        </div>
        <div class="book-stats dim">笔记 ${notes.length}${drafts ? ' · 草稿 ' + drafts : ''}</div>
        <div class="lib-actions">
          <button class="btn btn-primary btn-sm" data-action="open-book" data-book="${esc(b.id)}">📖 打开笔记</button>
          ${lib ? '<button class="btn btn-outline btn-sm" data-action="lib-deconstruct" data-book="' + esc(b.id) + '">🤖 拆书</button>' : ''}
          <button class="btn btn-ghost btn-sm" data-action="lib-delete" data-book="${esc(b.id)}">🗑 删除</button>
        </div>
      </article>`;
    }).join('');

    el.innerHTML = `
      <div class="library-view">
        <div class="view-head">
          <h2>📚 书籍</h2>
          <p class="dim">每本书一个研读空间：笔记、拆书、原文定位都在书里进行。</p>
        </div>

        <div class="lib-toolbar">
          <button class="btn btn-outline" data-action="new-book">＋ 新建书籍</button>
          <button class="btn btn-primary" data-action="lib-upload">📥 导入电子书（EPUB/PDF/TXT/MD）</button>
          <input type="file" id="lib-file" accept=".epub,.pdf,.txt,.md,application/epub+zip,application/pdf,text/plain,text/markdown" style="display:none">
          ${packInstalled ? '' : '<button class="btn btn-accept" data-action="install-pack">＋ 载入《日本大衰退》研读包</button>'}
          <span class="dim" id="lib-status"></span>
        </div>

        <div id="new-book-box"></div>

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

        ${cards ? '<div class="lib-list">' + cards + '</div>' : `
        <div class="empty-state">
          <div class="empty-glyph">📖</div>
          <p>书架上还没有书。</p>
          <p class="dim">新建一本书开始记笔记，或导入电子书让 AI 帮你拆解。</p>
        </div>`}
      </div>`;
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

  function libStatus(msg, isErr) {
    const s = document.getElementById('lib-status');
    if (s) { s.textContent = msg || ''; s.style.color = isErr ? '#c0392b' : ''; }
  }

  function openNewBookForm() {
    const box = document.getElementById('new-book-box');
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="new-book-form">
        <input id="nb-title" type="text" placeholder="书名">
        <input id="nb-author" type="text" placeholder="作者（可选）">
        <button class="btn btn-primary btn-sm" data-action="create-book">创建</button>
        <button class="btn btn-ghost btn-sm" data-action="close-book-form">取消</button>
      </div>`;
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
    if (!AI.configured()) { alert('请先在「⚙ 数据 → AI 设置」里填好 DeepSeek API Key'); U.openSettings(); return; }
    const book = await LIB.getBook(bookId);
    if (!book) { libStatus('这本书还没有导入全文，先「导入电子书」或拍照记录', true); return; }
    const chunks = LIB.buildChunks(book);
    if (!chunks.length) { alert('这本书里没有可拆解的文本'); return; }
    const est = Math.ceil(chunks.length * 25 / 60);
    if (!confirm('《' + book.title + '》将切成 ' + chunks.length + ' 段调用 AI 拆解（预计 ' + est + ' 分钟左右，可中途停止、之后继续）。生成的笔记全部以草稿态进入审阅队列。开始？')) return;
    render(document.getElementById('view'));
    try {
      const r = await LIB.startDeconstruct(bookId, () => {
        render(document.getElementById('view'));
      });
      libStatus('✅ 拆书完成，生成 ' + r.created + ' 条草稿');
      render(document.getElementById('view'));
    } catch (e) {
      libStatus((e && e.message) || '拆书失败（可点「继续」接着来）', true);
      render(document.getElementById('view'));
    }
  }

  function handleClick(t) {
    const a = t.dataset.action;
    const id = t.dataset.book;
    switch (a) {
      case 'open-book': location.hash = '#/book/' + id; break;
      case 'new-book': openNewBookForm(); break;
      case 'close-book-form': document.getElementById('new-book-box').innerHTML = ''; break;
      case 'create-book': {
        const title = document.getElementById('nb-title').value.trim();
        if (!title) { alert('请填写书名'); return; }
        DB.addBook(title, document.getElementById('nb-author').value.trim());
        render(document.getElementById('view'));
        break;
      }
      case 'install-pack': {
        const r = DB.installContentPack();
        alert(r.added > 0 ? '已载入研读包：新增 ' + r.added + ' 条结构化笔记与因果链' : '研读包已存在');
        render(document.getElementById('view'));
        break;
      }
      case 'lib-upload': document.getElementById('lib-file').click(); break;
      case 'lib-deconstruct': doDeconstruct(id); break;
      case 'lib-cancel':
        LIB.cancelTask();
        libStatus('已停止（已生成的草稿保留，可点「继续」接着拆）');
        render(document.getElementById('view'));
        break;
      case 'lib-resume': doDeconstruct(id); break;
      case 'lib-delete': {
        const b = DB.getBook(id);
        if (!b) return;
        const n = DB.getNotes().filter(x => x.bookId === id).length;
        if (confirm('确定删除《' + b.title + '》？' + (n ? '书中的 ' + n + ' 条笔记与因果链会一并删除，' : '') + '此操作不可恢复。')) {
          LIB.removeBookFully(id).then(() => {
            libStatus('已删除《' + b.title + '》');
            render(document.getElementById('view'));
          });
        }
        break;
      }
      case 'goto-drafts': U.showDrafts(); break;
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
