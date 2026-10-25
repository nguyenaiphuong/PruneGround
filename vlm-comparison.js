(() => {
  const root = document.querySelector('#vlm-comparison');
  if (!root) return;
  const plot = root.querySelector('#vlm-plot');
  const models = root.querySelector('#vlm-models');
  const detail = root.querySelector('#vlm-detail');
  const ns = 'http://www.w3.org/2000/svg';
  let data;
  let selected = 'qwen3b';
  let lastWidth = 0;
  const svgElement = (tag, attrs, text) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function select(id, announce = true) {
    selected = id;
    const model = data.models.find(m => m.id === id);
    root.dataset.selected = id;
    root.querySelectorAll('[data-model]').forEach(el => {
      el.classList.toggle('is-selected', el.dataset.model === id);
      if (el.matches('button, [role="button"]')) el.setAttribute('aria-pressed', String(el.dataset.model === id));
    });
    if (!announce) return;
    detail.replaceChildren();
    const heading = document.createElement('h4');
    heading.textContent = model.name + (model.ours ? ' · Ours' : '');
    const metrics = document.createElement('dl');
    for (const [name, value] of [['Target recall', model.recall.toFixed(1) + '%'], ['Time / VLM stage', model.runtime.toFixed(1) + 's'], ['Area retained', model.area.toFixed(1) + '%']]) {
      const item = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = name;
      const dd = document.createElement('dd');
      dd.textContent = value;
      item.append(dt, dd);
      metrics.append(item);
    }
    detail.append(heading, metrics);
  }
  function activateWithKeyboard(event, id) {
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      select(id);
    }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const current = data.models.findIndex(m => m.id === id);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? data.models.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + data.models.length) % data.models.length;
      const destination = event.currentTarget.closest('svg') ? plot.querySelectorAll('.vlm-point')[index] : models.children[index];
      destination.focus();
      select(data.models[index].id);
    }
  }
  function render() {
    const width = Math.max(260, Math.round(plot.clientWidth));
    if (width === lastWidth && plot.querySelector('svg')) return;
    lastWidth = width;
    const mobile = width < 600;
    const height = mobile ? 450 : 480;
    const left = mobile ? 48 : 70;
    const right = width - (mobile ? 30 : 65);
    const top = 60;
    const bottom = height - 80;
    const x = seconds => left + seconds / 14 * (right - left);
    const y = recall => bottom - (recall - 94) / 2 * (bottom - top);
    const svg = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-labelledby': 'vlm-chart-title vlm-chart-desc'});
    svg.append(svgElement('title', {id: 'vlm-chart-title'}, 'Target recall versus runtime per VLM stage'));
    svg.append(svgElement('desc', {id: 'vlm-chart-desc'}, 'Table 6. Each icon is one reported model result, not a time series. Left means faster; higher means better recall. Qwen 3B achieves 94.7 percent recall in 1.4 seconds. Gemini 3 Pro achieves 95.7 percent in 13.1 seconds. Recall axis spans 94 to 96 percent.'));
    svg.append(svgElement('text', {x: left, y: 25, class: 'vlm-axis-title'}, 'Target recall (%) ↑'));
    for (const tick of [94, 94.5, 95, 95.5, 96]) {
      svg.append(svgElement('line', {x1: left, y1: y(tick), x2: right, y2: y(tick), class: 'vlm-grid'}));
      svg.append(svgElement('text', {x: left - 12, y: y(tick) + 5, 'text-anchor': 'end', class: 'vlm-tick'}, String(tick)));
    }
    for (const tick of mobile ? [0, 4, 8, 12, 14] : [0, 2, 4, 6, 8, 10, 12, 14]) {
      svg.append(svgElement('text', {x: x(tick), y: bottom + 26, 'text-anchor': 'middle', class: 'vlm-tick'}, String(tick)));
    }
    svg.append(svgElement('path', {d: `M${left},${top} V${bottom} H${right}`, class: 'vlm-axis'}));
    svg.append(svgElement('text', {x: (left + right) / 2, y: height - 12, 'text-anchor': 'middle', class: 'vlm-axis-title'}, mobile ? 'Time / VLM stage (s) · faster ←' : 'Runtime per VLM stage (seconds) · faster ←'));
    for (const m of data.models) {
      const cx = x(m.runtime), cy = y(m.recall);
      const line = svgElement('line', {x1: left, y1: cy, x2: cx, y2: cy, stroke: m.color, class: 'vlm-guide', 'data-model': m.id, 'aria-hidden': 'true'});
      // Guides locate observations; they do not fabricate repeated measurements.
      line.setAttribute('stroke-dasharray', m.ours ? '7 4' : m.id === 'chatgpt' ? '3 5' : m.id === 'qwen72b' ? '9 5' : '2 4');
      svg.append(line);
      const point = svgElement('g', {class: 'vlm-point', 'data-model': m.id, 'data-runtime': m.runtime, 'data-recall': m.recall, 'data-area': m.area,
        tabindex: '0', role: 'button', 'aria-label': `${m.name}${m.ours ? ', Ours' : ''}: ${m.recall}% target recall, ${m.runtime} seconds per VLM stage, ${m.area}% area retained`, 'aria-describedby': 'vlm-detail', 'aria-pressed': String(m.id === selected)});
      point.append(svgElement('circle', {cx, cy, r: mobile ? 17 : 21, fill: '#fff', stroke: m.color, 'stroke-width': 2, class: 'vlm-marker'}));
      const logoSize = m.id === 'chatgpt' ? (mobile ? 56 : 68) : (mobile ? 27 : 34);
      const logoHeight = m.id === 'chatgpt' ? logoSize * 186 / 330 : logoSize;
      point.append(svgElement('image', {href: m.icon, x: cx - logoSize / 2, y: cy - logoHeight / 2, width: logoSize, height: logoHeight, 'aria-hidden': 'true', 'pointer-events': 'none'}));
      // Keep exact model/version identity in the accessible legend and inspector.
      if (!mobile || m.ours) point.append(svgElement('text', {x: cx + (mobile ? 23 : 28), y: cy + 5, class: 'vlm-point-label', fill: m.ours ? '#73599e' : m.color}, m.ours ? '3B · Ours' : m.variant));
      point.addEventListener('pointerenter', () => select(m.id));
      point.addEventListener('focus', () => select(m.id));
      point.addEventListener('click', () => select(m.id));
      point.addEventListener('keydown', e => activateWithKeyboard(e, m.id));
      svg.append(point);
    }
    plot.replaceChildren(svg);
    select(selected, false);
  }
  fetch('assets/table6-vlms.json').then(response => {
    if (!response.ok) throw new Error('Table 6 could not be loaded');
    return response.json();
  }).then(source => {
    data = source;
    for (const m of data.models) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.model = m.id;
      button.style.setProperty('--model-color', m.color);
      button.setAttribute('aria-label', `Inspect ${m.name}${m.ours ? ', Ours' : ''}`);
      button.setAttribute('aria-describedby', 'vlm-detail');
      button.title = m.name;
      const icon = document.createElement('span');
      icon.className = 'vlm-logo' + (m.id === 'chatgpt' ? ' vlm-logo-chatgpt' : '');
      const img = document.createElement('img');
      img.src = m.icon;
      img.alt = '';
      icon.append(img);
      const text = document.createElement('span');
      text.textContent = m.variant + (m.ours ? ' · Ours' : '');
      button.append(icon, text);
      button.addEventListener('click', () => select(m.id));
      button.addEventListener('focus', () => select(m.id));
      button.addEventListener('keydown', e => activateWithKeyboard(e, m.id));
      models.append(button);
    }
    render();
    select(selected);
    plot.setAttribute('aria-busy', 'false');
    new ResizeObserver(() => requestAnimationFrame(render)).observe(plot);
  }).catch(() => {
    plot.textContent = 'The chart could not load. All Table 6 values are available below.';
    plot.setAttribute('aria-busy', 'false');
    root.querySelector('.vlm-values').open = true;
  });
})();
