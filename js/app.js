/* 拾页 · 应用入口：路由 + 启动 */
(function () {
  'use strict';

  function route() {
    const view = document.getElementById('view');
    const hash = (location.hash || '#/').replace(/^#\/?/, '');
    setActiveNav();
    if (!hash) {
      window.ShiyeLibUI.render(view);
    } else if (hash === 'notes') {
      window.ShiyeUI.setBookFilter('');
      window.ShiyeUI.renderList(view);
    } else if (hash.indexOf('book/') === 0) {
      window.ShiyeUI.setBookFilter(hash.split('/')[1]);
      window.ShiyeUI.renderList(view);
    } else if (hash === 'timeline') {
      window.ShiyeTimeline.render(view);
    } else if (hash === 'chart') {
      window.ShiyeChart.render(view);
    } else if (hash === 'graph') {
      window.ShiyeGraph.render(view);
    } else if (hash.indexOf('note/') === 0) {
      const parts = hash.split('/'); // ['note', id, 'edit'?]
      const id = parts[1];
      if (parts[2] === 'edit' || id === 'new') window.ShiyeUI.renderEditor(view, id);
      else window.ShiyeUI.renderDetail(view, id);
    } else {
      window.ShiyeLibUI.render(view);
    }
    window.scrollTo(0, 0);
  }

  function setActiveNav() {
    const hash = location.hash || '#/';
    let key = 'books';
    if (hash === '#/notes') key = 'notes';
    else if (hash === '#/timeline') key = 'timeline';
    else if (hash === '#/chart') key = 'chart';
    else if (hash === '#/graph') key = 'graph';
    document.querySelectorAll('.nav-tab').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === key);
    });
  }

  function boot() {
    window.ShiyeDB.seedIfEmpty();
    window.ShiyeUI.attach();
    if (!window.ShiyeDB.storageOK()) {
      document.getElementById('storage-warning').hidden = false;
    }
    window.addEventListener('hashchange', route);
    route();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* 忽略 */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
