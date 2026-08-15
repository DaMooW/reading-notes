/* 拾页 · 数据对比图（ECharts 折线：x=年代，y=数值，按指标分系列） */
(function () {
  'use strict';
  const DB = window.ShiyeDB;
  const U = window.ShiyeUI;
  let chart = null;

  function render(el) {
    if (chart) { chart.dispose(); chart = null; }
    if (!window.echarts) {
      el.innerHTML = '<div class="empty-state"><p>图表组件未能加载，请检查网络后刷新。</p></div>';
      return;
    }

    const pts = [];
    DB.getNotes().forEach(n => (n.keyData || []).forEach(d => {
      if (d.value == null || d.year == null) return;
      pts.push({
        indicator: (d.indicator || '未命名指标').trim(),
        value: d.value, unit: d.unit || '', year: d.year,
        desc: d.desc || '', noteId: n.id, noteTitle: n.title,
      });
    }));
    const groups = {};
    pts.forEach(p => { (groups[p.indicator] = groups[p.indicator] || []).push(p); });
    const indicators = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh'));

    el.innerHTML = `
      <div class="chart-view">
        <div class="view-head">
          <h2>数据对比图</h2>
          <p class="dim">来自笔记「关键数据点」的数值，按指标画线；点图例可显示/隐藏某个指标。点数据点可回到笔记。</p>
        </div>
        ${pts.length ? '<div id="chart-main" class="chart-box"></div>' : ''}
        ${pts.length ? '<p class="dim chart-hint">提示：不同指标单位不同（点、%、万亿日元…），对比时优先选择量纲相近的指标。</p>' : ''}
        ${!pts.length ? `
          <div class="empty-state">
            <div class="empty-glyph">∿</div>
            <p>还没有可绘制的数据点。</p>
            <p class="dim">在任意笔记的「关键数据点」里填上<b>指标、数值、年份</b>，这里就会自动画出曲线。</p>
            <button class="btn btn-primary" data-action="new-note">＋ 新笔记</button>
          </div>` : ''}
      </div>`;

    if (!pts.length) return;

    const series = indicators.map(ind => ({
      name: ind,
      type: 'line',
      symbolSize: 10,
      lineStyle: { width: 2.5 },
      emphasis: { focus: 'series' },
      data: groups[ind].sort((a, b) => a.year - b.year).map(p => ({
        value: [p.year, p.value],
        unit: p.unit, desc: p.desc, noteId: p.noteId, noteTitle: p.noteTitle,
      })),
    }));

    chart = echarts.init(el.querySelector('#chart-main'));
    chart.setOption({
      backgroundColor: 'transparent',
      color: ['#b03a2e', '#1d6fa5', '#1e8e5a', '#b45309', '#8e44ad', '#0f766e', '#c2410c', '#475569'],
      animationDuration: 400,
      legend: { type: 'scroll', top: 4, textStyle: { color: '#5c5346', fontSize: 12 } },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fffdf8', borderColor: '#e2d6bd', textStyle: { color: '#2b2620', fontSize: 12 },
        formatter: (p) => {
          const d = p.data;
          const line1 = '<b>' + U.esc(p.seriesName) + '</b>';
          const line2 = d.value[0] + ' 年：<b>' + U.fmtVal(d.value[1]) + '</b> ' + U.esc(d.unit || '');
          const line3 = U.esc(d.noteTitle || '');
          const line4 = d.desc ? U.esc(d.desc) : '';
          return [line1, line2, line3, line4].filter(Boolean).join('<br>');
        },
      },
      grid: { left: 64, right: 28, top: 56, bottom: 44 },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { formatter: (v) => v + '年', color: '#8a7f6f' },
        axisLine: { lineStyle: { color: '#cbbfa4' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#8a7f6f' },
        axisLine: { lineStyle: { color: '#cbbfa4' } },
        splitLine: { lineStyle: { color: '#eee4cd', type: 'dashed' } },
      },
      series,
    });

    chart.on('click', (params) => {
      if (params.componentType === 'series' && params.data && params.data.noteId) {
        location.hash = '#/note/' + params.data.noteId;
      }
    });

    // 响应窗口大小变化
    if (chart._resizeHandler) window.removeEventListener('resize', chart._resizeHandler);
    chart._resizeHandler = () => chart && chart.resize();
    window.addEventListener('resize', chart._resizeHandler);
  }

  window.ShiyeChart = { render };
})();
