/* 拾页 · 时间轴视图 */
(function () {
  'use strict';
  const DB = window.ShiyeDB;
  const U = window.ShiyeUI;

  function render(el) {
    const notes = DB.getNotes();
    const withYear = notes.filter(n => n.time && n.time.year != null);
    const withoutYear = notes.filter(n => !(n.time && n.time.year != null));

    const byYear = {};
    withYear.forEach(n => { (byYear[n.time.year] = byYear[n.time.year] || []).push(n); });
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);

    const card = (n) => {
      const b = U.bookName(n);
      const chips = (n.keyData || []).slice(0, 4).map(d => U.dataChipHTML(d)).join('');
      return `
        <article class="tl-card note-card" data-action="open-note" data-id="${U.esc(n.id)}">
          <div class="note-card-top">
            <span class="time-badge">${U.esc(U.timeBadge(n))}</span>
            <h3 class="note-title">${U.esc(n.title)}</h3>
          </div>
          <div class="note-meta">
            ${b ? '<span class="book-name">《' + U.esc(b) + '》</span>' : ''}
            ${n.time && n.time.label ? '<span class="dim">' + U.esc(n.time.label) + '</span>' : ''}
            <span class="note-tags">${(n.tags || []).map(t => '<span class="mini-tag">#' + U.esc(t) + '</span>').join('')}</span>
          </div>
          ${chips ? '<div class="note-chips">' + chips + '</div>' : ''}
          ${n.thoughts ? '<p class="note-snippet">' + U.esc(n.thoughts.slice(0, 90)) + (n.thoughts.length > 90 ? '…' : '') + '</p>' : ''}
        </article>`;
    };

    const rows = years.map(y => `
      <div class="tl-row">
        <div class="tl-year">${y}</div>
        <div class="tl-rail"><span class="tl-dot"></span></div>
        <div class="tl-cards">${byYear[y].map(card).join('')}</div>
      </div>`).join('');

    el.innerHTML = `
      <div class="timeline-view">
        <div class="view-head">
          <h2>时间轴</h2>
          <p class="dim">按年代铺开你的笔记：看事件如何一步一步发生。</p>
        </div>
        ${withoutYear.length ? `
        <div class="tl-noyear">
          <div class="fld-head"><span>未标注时间</span></div>
          ${withoutYear.map(card).join('')}
        </div>` : ''}
        ${rows ? '<div class="timeline">' + rows + '</div>' : '<div class="empty-state"><p>暂无笔记</p></div>'}
      </div>`;
  }

  window.ShiyeTimeline = { render };
})();
