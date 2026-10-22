(() => {
  const $ = (id) => document.getElementById(id);
  const wrap = $('pg-canvas-wrap');
  if (!wrap) return;

  const SCENES = {
    scene0011_00: {
      name: 'Chair near TV', query: 'This is a single chair nearest the TV',
      axisAlignment: [-0.996195, 0.087156, 0, 3.881280, -0.087156, -0.996195, 0, 4.119080, 0, 0, 1, -0.071016, 0, 0, 0, 1],
      referenceTarget: 4, predictedBox: null
    },
    scene0025_00: {
      name: 'Sofa by door', query: 'The sofa next to the door, closest to the cabinet',
      axisAlignment: [0.707107, 0.707107, 0, -4.050430, -0.707107, 0.707107, 0, -0.052607, 0, 0, 1, -0.049991, 0, 0, 0, 1],
      referenceTarget: null, predictedBox: null
    },
    scene0050_01: {
      name: 'Sofa chair', query: 'This is the big sofa chair near the large window',
      axisAlignment: [-0.061049, 0.998135, 0, -2.161000, -0.998135, -0.061049, 0, 2.144810, 0, 0, 1, -0.153264, 0, 0, 0, 1],
      referenceTarget: null, predictedBox: null
    }
  };
  const QUERIES = {
    tv: { id: 4, anchor: 18, letter: 'A', name: 'Chair nearest the TV', anchorName: 'TV', color: 0xff7970 },
    door: { id: 9, anchor: 30, letter: 'B', name: 'Chair nearest the doorway', anchorName: 'Doorway', color: 0x6ce3b5 }
  };
  const STAGES = ['full', 'pruned', 'reformulated', 'target'];
  const state = { step: 'why', query: 'tv', stage: 'full', scene: 'scene0011_00', top: false };
  const stepButtons = [...document.querySelectorAll('[data-pg-step]')];
  const queryButtons = [...document.querySelectorAll('[data-pg-query]')];
  const stageButtons = [...document.querySelectorAll('[data-pg-stage]')];
  const number = new Intl.NumberFormat('en-US');

  function showError(message, retry) {
    $('pg-loading').classList.add('is-hidden');
    const box = $('pg-webgl-error');
    box.replaceChildren();
    const text = document.createElement('p');
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Try again';
    button.addEventListener('click', retry);
    box.append(text, button);
    box.hidden = false;
  }

  if (typeof THREE === 'undefined' || !THREE.PLYLoader || !THREE.OrbitControls) {
    showError('The 3D library could not be loaded. Check your connection and reload.', () => location.reload());
    return;
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    showError('The browser could not start WebGL: ' + error.message, () => location.reload());
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  wrap.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, wrap.clientWidth / wrap.clientHeight, 0.01, 100);
  camera.up.set(0, 0, 1);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.screenSpacePanning = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3f3448, 1.05));
  const light = new THREE.DirectionalLight(0xffffff, 0.72);
  light.position.set(5, -4, 8);
  scene.add(light);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const content = new THREE.Group();
  const annotations = new THREE.Group();
  scene.add(content, annotations);
  const loader = new THREE.PLYLoader();
  const cache = new Map();
  let active = null;
  let loadToken = 0;
  let labels = [];

  const faceCount = (g) => Math.round((g.index ? g.index.count : g.attributes.position.count) / 3);
  const boundsOf = (object) => new THREE.Box3(new THREE.Vector3(...object.min), new THREE.Vector3(...object.max));

  async function readJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load ' + url + ' (' + response.status + ')');
    return response.json();
  }

  function loadPly(url, alignment, id) {
    return new Promise((resolve, reject) => loader.load(url, (geometry) => {
      if (alignment) geometry.applyMatrix4(new THREE.Matrix4().set(...alignment));
      // PLY RGB bytes are sRGB; r128 materials work in linear color space.
      const colors = geometry.attributes.color;
      if (colors) {
        const color = new THREE.Color();
        for (let i = 0; i < colors.count; i++) {
          color.fromBufferAttribute(colors, i).convertSRGBToLinear();
          colors.setXYZ(i, color.r, color.g, color.b);
        }
      }
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      resolve(geometry);
    }, (event) => {
      if (state.scene !== id || active) return;
      const amount = event.total ? Math.round(event.loaded / event.total * 100) + '%' : (event.loaded / 1048576).toFixed(1) + ' MB';
      $('pg-load-progress').textContent = (url.includes('pruned') ? 'Pruned region' : 'Full room') + ' · ' + amount;
    }, reject));
  }

  function sceneData(id) {
    if (!cache.has(id)) {
      const root = 'assets/3d/' + id;
      const pending = Promise.allSettled([
        loadPly(root + '/full.ply', SCENES[id].axisAlignment, id),
        loadPly(root + '/pruned.ply', null, id),
        readJSON(root + '/reformulation.json'),
        id === 'scene0011_00' ? readJSON(root + '/reference-targets.json') : Promise.resolve(null)
      ]).then((results) => {
        const failure = results.find((result) => result.status === 'rejected');
        if (failure) {
          results.slice(0, 2).forEach((result) => { if (result.status === 'fulfilled') result.value.dispose(); });
          cache.delete(id);
          throw failure.reason;
        }
        const [full, pruned, reformulation, reference] = results.map((result) => result.value);
        return { full, pruned, reformulation, reference, colors: full.attributes.color.array.slice() };
      });
      cache.set(id, pending);
    }
    return cache.get(id);
  }

  async function loadScene(id) {
    const token = ++loadToken;
    state.scene = id;
    active = null;
    content.clear();
    clearAnnotations();
    $('pg-webgl-error').hidden = true;
    $('pg-loading').classList.remove('is-hidden');
    $('pg-load-progress').textContent = 'Preparing mesh';
    $('pg-reformulation').replaceChildren();
    $('pg-target').textContent = 'Loading description…';
    wrap.setAttribute('aria-busy', 'true');
    syncUI();
    try {
      const data = await sceneData(id);
      if (token !== loadToken) return;
      active = data;
      active.fullMesh = new THREE.Mesh(data.full, material);
      active.prunedMesh = new THREE.Mesh(data.pruned, material);
      content.add(active.fullMesh, active.prunedMesh);
      renderState(true);
      $('pg-loading').classList.add('is-hidden');
    } catch (error) {
      if (token !== loadToken) return;
      showError('This scene could not be loaded. Check your connection and try again.', () => loadScene(state.scene));
      console.error('PruneGround scene load:', error);
    } finally {
      if (token === loadToken) wrap.setAttribute('aria-busy', 'false');
    }
  }

  function syncUI() {
    const why = state.step === 'why';
    const query = QUERIES[state.query];
    const definition = SCENES[state.scene];
    const hasReference = definition.referenceTarget !== null;
    const hasPrediction = Boolean(definition.predictedBox);
    const full = why || state.stage === 'full';
    $('pg-explorer').dataset.step = state.step;
    $('pg-explorer').dataset.stage = state.stage;
    $('pg-explorer').dataset.query = state.query;
    stepButtons.forEach((button) => {
      const selected = button.dataset.pgStep === state.step;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    queryButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.pgQuery === state.query)));
    stageButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.pgStage === state.stage)));
    $('pg-story-panel').setAttribute('aria-labelledby', 'pg-tab-' + state.step);
    $('pg-query-choices').hidden = !why;
    $('pg-pipeline-controls').hidden = why;
    $('pg-why-info').hidden = !why;
    $('pg-how-info').hidden = why;
    $('pg-scene-select').value = state.scene;
    $('pg-room-label').textContent = 'Room · ' + state.scene;
    $('pg-story-title').textContent = why ? 'Same room. Different descriptions.' : 'From full scene to target grounding.';
    $('pg-story-subtitle').textContent = why
      ? 'Several chairs look alike. Choose a description to see which one its spatial relationship identifies.'
      : 'Follow the released meshes and language outputs, one stage at a time.';
    $('pg-choice-title').textContent = query.letter + ' · ' + query.name;
    $('pg-choice-explanation').textContent = state.query === 'tv'
      ? 'The TV anchors this description to one end of the table. Switch to the doorway description and the target moves to the opposite end.'
      : 'The doorway anchors this description to the other end of the table. The room stays the same; the spatial relationship changes which chair you mean.';
    $('pg-continue-note').textContent = state.query === 'tv'
      ? 'Continue with the released “chair nearest the TV” example.'
      : 'The next step switches to the TV query in this same room, because only that query has released pipeline outputs.';
    $('pg-transition-note').textContent = state.scene !== 'scene0011_00'
      ? 'Different room · ' + definition.name + '. This is a separate released example, not an output for either chair description in Step 1.'
      : state.query === 'door'
        ? 'Same room, different query · You selected the doorway chair. We now follow the released “chair nearest the TV” example; the doorway query has no released pruning result.'
        : 'Same room, same target · Continue with the released “chair nearest the TV” example.';
    $('pg-query').textContent = '“' + (active?.reformulation.original_description || definition.query) + '”';

    const descriptions = {
      full: ['Released input', 'Start with the full room', 'The original description must distinguish its target from the other objects in this full ScanNet mesh.'],
      pruned: ['LGSP · released mesh', 'Keep the language-relevant region', 'Compare this retained mesh with the full room. The purple outline shows the extent of the released pruned geometry, not a target prediction.'],
      reformulated: ['MCDR · released text', 'Add local visual context', 'Local views produce target properties and target–anchor statements. The retained 3D region stays in view while you inspect the released text.'],
      target: hasPrediction
        ? ['Released prediction', 'The predicted target', 'This box comes from the supplied downstream grounding result.']
        : hasReference
          ? ['Reference only', 'The target to be grounded', 'The reference chair is inside the retained region. Its box comes from ScanNet instance labels; a downstream model prediction has not been released for this example.']
          : ['Prediction not released', 'Grounding output is not available yet', 'The released example ends at pruning and reformulation. The viewer keeps the pruned region visible; no predicted object box is drawn.']
    };
    const [badge, title, description] = descriptions[state.stage];
    $('pg-stage-badge').textContent = badge;
    $('pg-stage-title').textContent = title;
    $('pg-stage-description').textContent = description;
    $('pg-reformulation-panel').hidden = why || state.stage !== 'reformulated';
    $('pg-grounding-note').hidden = why || state.stage !== 'target' || hasPrediction;
    $('pg-grounding-detail').textContent = hasReference
      ? 'The outlined chair is a ScanNet reference annotation, not a PruneGround prediction.'
      : 'No target reference annotation is bundled for this scene either. The purple outline remains the extent of the retained mesh.';
    $('pg-next-stage').hidden = state.stage === 'target';
    $('pg-next-stage').textContent = ({ full: 'Show pruned region →', pruned: 'See reformulated description →', reformulated: 'Inspect target availability →', target: '' })[state.stage];
    $('pg-view-label').textContent = why ? 'Full room · reference highlights' : full ? 'Full room · original mesh' : state.stage === 'target' && hasReference ? 'Pruned region · reference target' : 'Pruned region · released mesh';
    $('pg-top-view').setAttribute('aria-pressed', String(state.top));
    $('pg-top-view').textContent = state.top ? 'Perspective view' : 'Top view';
    $('pg-scene-id').textContent = state.scene;
    $('pg-full-faces').textContent = active ? number.format(faceCount(active.full)) : '—';
    $('pg-pruned-faces').textContent = active ? number.format(faceCount(active.pruned)) : '—';
    $('pg-retention').textContent = active ? (faceCount(active.pruned) / faceCount(active.full) * 100).toFixed(1) + '%' : '—';
    wrap.setAttribute('aria-label', why
      ? 'Interactive ScanNet room. ' + query.name + ', chair ' + query.letter + ', is highlighted using reference annotations.'
      : definition.name + '. ' + title + '. ' + description);
    updateLegend(why ? [['chair-a', 'A · chair near TV'], ['chair-b', 'B · chair near doorway']]
      : full ? [['mesh', 'Full ScanNet scene']]
      : state.stage === 'target' && hasPrediction ? [['prediction', 'Predicted target box']]
      : state.stage === 'target' && hasReference ? [['chair-a', 'Reference target · not a prediction']]
      : [['region', 'Extent of retained mesh']]);
    if (active) buildReformulations(active.reformulation);
  }

  function updateLegend(items) {
    $('pg-legend').replaceChildren(...items.map(([type, text]) => {
      const span = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.className = 'legend-' + type;
      span.append(swatch, text);
      return span;
    }));
  }

  function buildReformulations(data) {
    $('pg-target').textContent = 'Target: ' + data.target;
    const groups = [
      ['Target properties', data.target_properties],
      ['Visual additions', data.augmented_target_properties],
      ['Target–anchor relations', data.utterances],
      ['Additional relations', data.augmented_utterances]
    ];
    $('pg-reformulation').replaceChildren(...groups.filter(([, lines]) => lines?.length).map(([name, lines]) => {
      const group = document.createElement('div');
      const title = document.createElement('h5');
      title.textContent = name;
      const list = document.createElement('ul');
      lines.forEach((line) => { const item = document.createElement('li'); item.textContent = line; list.append(item); });
      group.append(title, list);
      return group;
    }));
  }

  function clearAnnotations() {
    annotations.children.forEach((object) => { object.geometry?.dispose(); object.material?.dispose(); });
    annotations.clear();
    $('pg-object-labels').replaceChildren();
    labels = [];
  }

  function addBox(bounds, color, opacity = 1, fill = false) {
    const box = new THREE.Box3Helper(bounds.clone(), color);
    box.material.transparent = true;
    box.material.opacity = opacity;
    box.material.depthTest = false;
    box.material.depthWrite = false;
    box.renderOrder = 5;
    annotations.add(box);
    if (fill) {
      const size = bounds.getSize(new THREE.Vector3());
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .12, depthWrite: false, depthTest: false }));
      mesh.position.copy(bounds.getCenter(new THREE.Vector3()));
      mesh.renderOrder = 4;
      annotations.add(mesh);
    }
  }

  function addLabel(bounds, text, kind) {
    const label = document.createElement('span');
    label.className = 'pg-object-label ' + kind;
    label.textContent = text;
    $('pg-object-labels').append(label);
    const position = bounds.getCenter(new THREE.Vector3());
    position.z = bounds.max.z + .18;
    labels.push({ element: label, position });
  }

  function tintObject(object, color) {
    const tint = new THREE.Color(color).convertSRGBToLinear();
    const attribute = active.full.attributes.color;
    for (const [start, end] of object.vertexRanges) for (let i = start; i <= end; i++) attribute.setXYZ(i, tint.r, tint.g, tint.b);
    attribute.needsUpdate = true;
  }

  function renderState(reframe = false) {
    syncUI();
    if (!active) return;
    const full = state.step === 'why' || state.stage === 'full';
    active.fullMesh.visible = full;
    active.prunedMesh.visible = !full;
    active.full.attributes.color.array.set(active.colors);
    active.full.attributes.color.needsUpdate = true;
    clearAnnotations();
    if (state.step === 'why' && active.reference) {
      Object.entries(QUERIES).forEach(([key, query]) => {
        const object = active.reference.objects[query.id];
        const selected = key === state.query;
        addBox(boundsOf(object), query.color, selected ? 1 : .45, selected);
        addLabel(boundsOf(object), query.letter + (selected ? ' · Selected chair' : ''), 'chair-' + key + (selected ? ' selected' : ''));
        if (selected) tintObject(object, query.color);
      });
      const query = QUERIES[state.query];
      const anchor = boundsOf(active.reference.objects[query.anchor]);
      addBox(anchor, 0xf4ce83, .65);
      addLabel(anchor, query.anchorName, 'anchor');
    } else if (!full) {
      const definition = SCENES[state.scene];
      if (state.stage === 'target' && definition.predictedBox) {
        // Only render a prediction if an actual downstream result is supplied.
        const bounds = boundsOf(definition.predictedBox);
        addBox(bounds, 0x6ce3b5, 1, true);
        addLabel(bounds, 'Predicted target', 'chair-door selected');
      } else if (state.stage === 'target' && active.reference && definition.referenceTarget !== null) {
        const bounds = boundsOf(active.reference.objects[definition.referenceTarget]);
        addBox(bounds, QUERIES.tv.color, 1, true);
        addLabel(bounds, 'Reference chair · not a prediction', 'chair-tv selected');
      } else {
        addBox(active.pruned.boundingBox, 0xc77bef, .9);
      }
    }
    if (reframe) frameView();
  }

  function frameView() {
    if (!active) return;
    const full = state.step === 'why' || state.stage === 'full';
    const bounds = full ? active.full.boundingBox : active.pruned.boundingBox;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length(), .5);
    camera.up.set(0, 0, 1);
    controls.target.copy(center);
    if (state.top) {
      // Slight y offset avoids the Z-up pole singularity in OrbitControls.
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const distance = Math.max(size.y / 2 / tangent, size.x / 2 / tangent / camera.aspect) * 1.2 + size.z / 2;
      camera.position.set(center.x, center.y - distance * .0001, center.z + distance);
    } else {
      const distance = radius * (full ? .68 : .9) * Math.max(1, .9 / camera.aspect);
      camera.position.set(center.x - distance * .66, center.y - distance * .5, center.z + distance * .95);
    }
    camera.near = Math.max(radius / 500, .005);
    camera.far = Math.max(radius * 30, 100);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(radius * .06, .12);
    controls.maxDistance = Math.max(radius * 4, 12);
    controls.update();
  }

  function setStep(step) {
    if (state.step === step) return;
    const wasFull = state.step === 'why' || state.stage === 'full';
    state.step = step;
    state.stage = 'full';
    // The main story starts in the same room; other examples are opt-in.
    if (state.scene !== 'scene0011_00') loadScene('scene0011_00');
    else renderState(!wasFull);
  }

  function setStage(stage) {
    const wasFull = state.stage === 'full';
    state.stage = stage;
    renderState(wasFull !== (stage === 'full'));
  }

  stepButtons.forEach((button, index) => {
    button.addEventListener('click', () => setStep(button.dataset.pgStep));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + 1) % 2;
      stepButtons[next].focus();
      stepButtons[next].click();
    });
  });
  queryButtons.forEach((button) => button.addEventListener('click', () => {
    state.query = button.dataset.pgQuery;
    renderState();
  }));
  stageButtons.forEach((button) => button.addEventListener('click', () => setStage(button.dataset.pgStage)));
  $('pg-continue').addEventListener('click', () => { setStep('how'); $('pg-tab-how').focus({ preventScroll: true }); });
  $('pg-next-stage').addEventListener('click', () => {
    const next = STAGES[STAGES.indexOf(state.stage) + 1];
    if (next) { setStage(next); stageButtons[STAGES.indexOf(next)].focus({ preventScroll: true }); }
  });
  $('pg-scene-select').addEventListener('change', (event) => {
    state.stage = 'full';
    loadScene(event.target.value);
  });
  $('pg-top-view').addEventListener('click', () => { state.top = !state.top; syncUI(); frameView(); });
  $('pg-reset-view').addEventListener('click', () => { state.top = false; syncUI(); frameView(); });
  controls.addEventListener('start', () => {
    if (state.top) { state.top = false; syncUI(); }
  });

  const resize = () => {
    if (!wrap.clientWidth || !wrap.clientHeight) return;
    renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
  };
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap);
  else window.addEventListener('resize', resize, { passive: true });

  const projection = new THREE.Vector3();
  function render() {
    controls.update();
    renderer.render(scene, camera);
    labels.forEach(({ element, position }) => {
      projection.copy(position).project(camera);
      const visible = projection.z > -1 && projection.z < 1 && Math.abs(projection.x) < .96 && Math.abs(projection.y) < .96;
      element.hidden = !visible;
      if (visible) {
        element.style.left = (projection.x + 1) / 2 * wrap.clientWidth + 'px';
        element.style.top = (1 - projection.y) / 2 * wrap.clientHeight + 'px';
      }
    });
  }
  renderer.setAnimationLoop(render);
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : render));
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showError('The browser interrupted the 3D view. Reload to restore it.', () => location.reload());
  });
  loadScene(state.scene);
})();
