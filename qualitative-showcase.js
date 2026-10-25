(() => {
  const root = document.getElementById('qualitative');
  if (!root) return;
  const $ = id => document.getElementById(id);
  // Exact figure transcriptions. No generated geometry, masks or metrics.
  const cases = {
    chair: {
      title: 'Chair · Spatial Relations', name: 'Chair',
      original: 'This is a brown chair against the wall under the board, close to the table.',
      preserved: ['The chair is against the wall.', 'The chair is under the board.', 'The chair is close to the table.'],
      added: ['The chair has a bookshelf on its left.'],
      comparison: 'The reformulation does not explicitly repeat “brown”.'
    },
    desk: {
      title: 'Desk · Visual Attribute Enrichment', name: 'Desk',
      original: 'Of the two desk, choose the bigger one.',
      preserved: [],
      added: ['The desk is long and yellow.', 'The desk is near a chair.', 'The desk has two monitors on it.'],
      comparison: 'The reformulation does not explicitly restate “the bigger one”.'
    },
    cabinet: {
      title: 'Kitchen Cabinet · Anchor-Based Grounding', name: 'Kitchen Cabinet',
      original: 'Find the kitchen cabinets that are over the refrigerator.',
      preserved: ['The kitchen cabinet is above the refrigerator.'],
      added: ['The kitchen cabinet is wooden.', 'The kitchen cabinet has another one on the right.'],
      comparison: ''
    }
  };
  const keys = Object.keys(cases);
  const stages = ['Original Scene', 'Language-Guided Spatial Pruning', 'Multi-view-Conditioned Description Reformulation', 'Final Grounding Results'];
  const stageLabels = ['Original Scene', 'LGSP · Spatial Pruning', 'MCDR · Reformulation', 'Final Grounding Results'];
  const state = { case: 'chair', stage: 0 };
  const stage = $('qual-stage');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let revision = 0;
  let transition;

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function picture(kind, caption) {
    const figure = element('figure', 'qual-picture');
    const image = element('img');
    image.src = `assets/images/qualitative/${state.case}-${kind}.png`;
    image.alt = `${cases[state.case].name}: ${caption}, extracted from the paper’s qualitative figure`;
    image.decoding = 'async';
    const button = element('button', 'qual-image-button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `Enlarge ${cases[state.case].name}: ${caption}`);
    button.append(image);
    figure.append(button, element('figcaption', '', caption));
    return figure;
  }
  function original(compact = false) {
    const box = element('div', compact ? 'qual-query qual-query-compact' : 'qual-query');
    box.append(element('p', 'mini-kicker', 'Original description'), element('blockquote', '', `“${cases[state.case].original}”`));
    return box;
  }
  function legend(items) {
    const el = element('div', 'qual-legend');
    items.forEach(([style, text]) => {
      const item = element('span');
      item.append(element('i', style), document.createTextNode(text));
      el.append(item);
    });
    return el;
  }
  function render() {
    const data = cases[state.case];
    const content = element('div', `qual-slide qual-slide-${state.stage}`);
    if (state.stage === 0) {
      const text = element('div', 'qual-intro');
      text.append(element('p', 'qual-eyebrow', '01 / The language query'), original());
      content.append(text, picture('full', 'Full reconstructed scene'));
    } else if (state.stage === 1) {
      const top = element('div', 'qual-slide-heading');
      top.append(element('p', 'qual-eyebrow', '02 / Narrow the search'), element('h4', '', 'LGSP — Focus on the language-relevant spatial region'));
      const comparison = element('div', 'qual-comparison qual-pruning');
      const after = picture('pruned', 'Pruned scene');
      const before = element('img', 'qual-before-image');
      before.src = `assets/images/qualitative/${state.case}-full.png`;
      before.alt = '';
      before.setAttribute('aria-hidden', 'true');
      after.append(before);
      comparison.append(picture('full', 'Full input scene'), element('span', 'qual-flow-arrow', '→'), after);
      content.append(top, comparison, original(true));
    } else if (state.stage === 2) {
      const visual = element('div', 'qual-mcdr-visual');
      visual.append(picture('pruned', 'Pruned scene'), original(true));
      const text = element('div', 'qual-reformulation');
      text.append(element('p', 'qual-eyebrow', '03 / MCDR'), element('h4', '', 'Multi-view-Conditioned Description Reformulation'));
      text.append(legend([['qual-purple', 'Preserved / restructured'], ['qual-green', 'Visual / spatial addition']]));
      const list = element('ul', 'qual-statements');
      [...data.preserved.map(text => [text, 'preserved']), ...data.added.map(text => [text, 'added'])].forEach(([line, type], index) => {
        const item = element('li', 'qual-' + type, line);
        item.dataset.kind = type;
        item.setAttribute('aria-label', `${type === 'preserved' ? 'Preserved or restructured' : 'Visual or spatial addition'}: ${line}`);
        item.style.setProperty('--reveal-order', index);
        list.append(item);
      });
      text.append(list);
      if (data.comparison) text.append(element('p', 'qual-comparison-note', data.comparison));
      content.append(visual, text);
    } else {
      const top = element('div', 'qual-slide-heading');
      top.append(element('p', 'qual-eyebrow', '04 / Compare the grounding'), element('h4', '', 'Prediction & ground truth'));
      top.append(legend([['qual-orange', 'Prediction'], ['qual-box-green', 'Ground truth']]));
      const comparison = element('div', 'qual-comparison');
      comparison.append(picture('prediction', 'Prediction on the pruned scene'), picture('ground-truth', 'Ground truth in the full scene'));
      content.append(top, comparison);
    }
    stage.replaceChildren(content);
    root.dataset.case = state.case;
    root.dataset.stage = state.stage;
    $('qual-case-label').textContent = data.title;
    $('qual-stage-label').textContent = `0${state.stage + 1} / 04 · ${stageLabels[state.stage]}`;
    root.querySelectorAll('[data-qual-case]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.qualCase === state.case)));
    const cards = root.querySelector('.qual-cases');
    const selected = cards.querySelector('[aria-pressed="true"]');
    const cardRect = selected.getBoundingClientRect();
    const stripRect = cards.getBoundingClientRect();
    if (cards.scrollWidth > cards.clientWidth && (cardRect.left < stripRect.left || cardRect.right > stripRect.right)) {
      cards.scrollTo({left: cards.scrollLeft + cardRect.left - stripRect.left - 2, behavior: reduced.matches ? 'instant' : 'smooth'});
    }
    root.querySelectorAll('[data-qual-stage]').forEach(button => {
      if (Number(button.dataset.qualStage) === state.stage) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('qual-prev').disabled = state.stage === 0;
    $('qual-next').textContent = state.stage < 3 ? 'Next →' : `Next case: ${cases[keys[(keys.indexOf(state.case) + 1) % keys.length]].name} →`;
    $('qual-status').textContent = `${data.name}. Stage ${state.stage + 1} of 4: ${stages[state.stage]}.`;
  }
  async function go(caseKey, index) {
    if (caseKey === state.case && index === state.stage) return;
    state.case = caseKey;
    state.stage = Math.max(0, Math.min(3, index));
    const token = ++revision;
    transition?.cancel();
    if (!reduced.matches) {
      transition = stage.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-6px)' }], { duration: 90, fill: 'forwards' });
      await transition.finished.catch(() => {});
      if (token !== revision) return;
    }
    transition?.cancel();
    render();
    if (!reduced.matches) {
      transition = stage.animate([{ opacity: 0, transform: 'translateX(8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 230, easing: 'ease-out' });
    }
  }
  function next() {
    if (state.stage < 3) go(state.case, state.stage + 1);
    else go(keys[(keys.indexOf(state.case) + 1) % keys.length], 0);
  }
  root.querySelectorAll('[data-qual-case]').forEach(button => button.addEventListener('click', () => go(button.dataset.qualCase, 0)));
  root.querySelectorAll('[data-qual-stage]').forEach(button => button.addEventListener('click', () => go(state.case, Number(button.dataset.qualStage))));
  $('qual-prev').addEventListener('click', () => go(state.case, state.stage - 1));
  $('qual-next').addEventListener('click', next);
  stage.addEventListener('click', event => {
    const image = event.target.closest('.qual-image-button')?.querySelector('img');
    if (!image) return;
    const dialog = $('lightbox');
    $('lightbox-image').src = image.src;
    $('lightbox-image').alt = image.alt;
    dialog.showModal();
  });
  root.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input, textarea, select, [contenteditable]')) return;
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') go(state.case, state.stage - 1);
    if (event.key === 'Home') go(state.case, 0);
    if (event.key === 'End') go(state.case, 3);
  });
  reduced.addEventListener('change', () => { if (reduced.matches) transition?.finish(); });
  render();
})();
