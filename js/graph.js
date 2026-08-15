/* 拾页 · 因果链图（ECharts 关系图：笔记为节点，关联为带类型的箭头） */
(function () {
  'use strict';
  const DB = window.ShiyeDB;
  const U = window.ShiyeUI;
  let chart = null;

  const EDGE_COLORS = {
    '导致': '#c0392b', '促进': '#e67e22', '循环': '#d4a017',
    '反转': '#8e44ad', '对比': '#1d6fa5', '联想': '#1e8e5a',
  };
  const FALLBACK_EDGE = '#8a7f6f';

  function edgeColor(type) { return EDGE_COLORS[type] || FALLBACK_EDGE; }

  function yearColor(y) {
    if (y == null) return '#9ca3af';
    if (y < 1990) return '#b03a2e';   // 日本泡沫期：朱砂红
    if (y <= 2000) return '#b45309';  // 泡沫破裂：琥珀
    return '#1d6fa5';                 // 中国近年：靛蓝
  }

  function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function render(el) {
    if (chart) { chart.dispose(); chart = null; }
    if (!window.echarts) {
      el.innerHTML = '<div class="empty-state"><p>图表组件未能加载，请检查网络后刷新。</p></div>';
      return;
    }

    const notes = DB.getNotes();
    const links = DB.getLinks();
    if (!notes.length) {
      el.innerHTML = '<div class="empty-state"><p>暂无笔记</p></div>';
      return;
    }

    const deg = {};
    links.forEach(l => { deg[l.from] = (deg[l.from] || 0) + 1; deg[l.to] = (deg[l.to] || 0) + 1; });

    const nodes = notes.map(n => ({
      id: n.id,
      name: trunc(n.title, 12),
      fullName: n.title,
      symbolSize: 30 + Math.min((deg[n.id] || 0) * 7, 28),
      itemStyle: { color: yearColor(n.time && n.time.year), borderColor: '#fffdf8', borderWidth: 2 },
      label: { show: true, fontSize: 11, color: '#3a332b', position: 'bottom', distance: 6 },
    }));

    const edges = links
      .filter(l => DB.getNote(l.from) && DB.getNote(l.to))
      .map(l => ({
        source: l.from, target: l.to,
        type: l.type, note: l.note,
        lineStyle: { color: edgeColor(l.type), width: 1.8, curveness: 0.16, opacity: 0.9 },
        label: { show: true, formatter: l.type, fontSize: 10, color: edgeColor(l.type) },
      }));

    // 图例（关系类型统计）
    const typeCount = {};
    edges.forEach(e => { typeCount[e.type] = (typeCount[e.type] || 0) + 1; });
    const legend = Object.keys(typeCount).map(t =>
      `<span class="graph-legend-item"><i style="background:${edgeColor(t)}"></i>${U.esc(t)} × ${typeCount[t]}</span>`).join('');

    el.innerHTML = `
      <div class="graph-view">
        <div class="view-head">
          <h2>因果链图</h2>
          <p class="dim">笔记与笔记之间的逻辑关系。拖动节点调整布局，滚轮/双指缩放，点击节点查看笔记。</p>
        </div>
        ${edges.length ? `<div class="graph-legend">${legend}</div>
        <div class="graph-legend dim"><span class="graph-legend-item"><i style="background:#b03a2e"></i>日本泡沫期（1980s）</span><span class="graph-legend-item"><i style="background:#b45309"></i>泡沫破裂（1990s）</span><span class="graph-legend-item"><i style="background:#1d6fa5"></i>中国近年</span></div>` : ''}
        <div id="graph-main" class="chart-box graph-box"></div>
        ${!edges.length ? '<div class="empty-state"><p>还没有因果链关联。</p><p class="dim">打开任意笔记 → 编辑 → 在「新增关联」里选择另一条笔记并填上关系类型（如：导致、对比、联想）。</p></div>' : ''}
      </div>`;

    if (!edges.length) return;

    chart = echarts.init(el.querySelector('#graph-main'));
    chart.setOption({
      backgroundColor: 'transparent',
      animationDuration: 600,
      legend: { show: false },
      tooltip: {
        backgroundColor: '#fffdf8', borderColor: '#e2d6bd', textStyle: { color: '#2b2620', fontSize: 12 },
        formatter: (p) => {
          if (p.dataType === 'node') {
            const n = DB.getNote(p.data.id);
            if (!n) return p.data.fullName;
            return '<b>' + U.esc(n.title) + '</b><br>' + U.esc(U.fmtTime(n))
              + ((n.tags || []).length ? '<br>' + U.esc(n.tags.map(t => '#' + t).join(' ')) : '')
              + (n.thoughts ? '<br><span style="color:#8a7f6f">' + U.esc(trunc(n.thoughts, 60)) + '</span>' : '');
          }
          if (p.dataType === 'edge') {
            const f = DB.getNote(p.data.source), t = DB.getNote(p.data.target);
            return U.esc((f ? f.title : '?') + ' —' + p.data.type + '→ ' + (t ? t.title : '?'))
              + (p.data.note ? '<br><span style="color:#8a7f6f">' + U.esc(p.data.note) + '</span>' : '');
          }
          return '';
        },
      },
      series: [{
        type: 'graph',
        layout: 'force',
        data: nodes,
        links: edges,
        roam: true,
        draggable: true,
        label: { show: true },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
        force: { repulsion: 420, edgeLength: [120, 220], gravity: 0.06, friction: 0.35 },
        emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
      }],
    });

    chart.on('click', (params) => {
      if (params.dataType === 'node' && params.data && params.data.id) {
        location.hash = '#/note/' + params.data.id;
      }
    });

    if (chart._resizeHandler) window.removeEventListener('resize', chart._resizeHandler);
    chart._resizeHandler = () => chart && chart.resize();
    window.addEventListener('resize', chart._resizeHandler);
  }

  window.ShiyeGraph = { render };
})();
