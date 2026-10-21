(() => {
  const wrap = document.querySelector('#pg-canvas-wrap');
  if (!wrap) return;

  const SCENES = {
    scene0011_00: {
      query: 'This is a single chair nearest the TV',
      target: 'Target: chair',
      reformulation: [
        'The chair is brown and worn out.',
        'The chair has a metal frame and is positioned near the TV.',
        'The chair is behind the TV.',
        'The chair is next to the TV.',
        'The chair is on the floor.',
        'The chair is under the TV.'
      ]
    },
    scene0025_00: {
      query: 'The sofa next to the door, closest to the cabinet',
      target: 'Target: sofa',
      reformulation: [
        'The sofa is black and next to the door.',
        'The sofa has a cushion and a remote control.',
        'The sofa is next to the door.',
        'The sofa is next to the cabinet.',
        'The sofa is next to the bookshelf.'
      ]
    },
    scene0050_01: {
      query: 'This is the big sofa chair near the large window',
      target: 'Target: sofa chair',
      reformulation: [
        'The sofa chair is brown leather and comfortable.',
        'The sofa chair has cushions and is positioned near the window.',
        'The sofa chair is in front of the window.',
        'The sofa chair is next to the wall.',
        'The sofa chair is behind the black coffee table.',
        'The sofa chair is above the rug.'
      ]
    }
  };

  const loading = document.querySelector('#pg-loading');
  const progress = document.querySelector('#pg-load-progress');
  const errorBox = document.querySelector('#pg-webgl-error');
  const sceneTabs = [...document.querySelectorAll('[data-pg-scene]')];
  const modeButtons = [...document.querySelectorAll('[data-pg-mode]')];
  const regionToggle = document.querySelector('#pg-region-toggle');
  const resetButton = document.querySelector('#pg-reset-view');
  const queryEl = document.querySelector('#pg-query');
  const targetEl = document.querySelector('#pg-target');
  const reformulationEl = document.querySelector('#pg-reformulation');
  const sceneIdEl = document.querySelector('#pg-scene-id');
  const fullFacesEl = document.querySelector('#pg-full-faces');
  const prunedFacesEl = document.querySelector('#pg-pruned-faces');
  const retentionEl = document.querySelector('#pg-retention');

  if (typeof THREE === 'undefined' || !THREE.PLYLoader || !THREE.OrbitControls) {
    loading?.classList.add('is-hidden');
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'The 3D viewer library could not be loaded. Check your connection and reload the page.';
    }
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    loading?.classList.add('is-hidden');
    if (errorBox) errorBox.hidden = false;
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  wrap.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, wrap.clientWidth / wrap.clientHeight, 0.01, 100);
  camera.up.set(0, 0, 1);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.2;
  controls.maxDistance = 60;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3f3448, 1.05));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.72);
  keyLight.position.set(5, -4, 8);
  scene.add(keyLight);

  const meshMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide
  });

  const loader = new THREE.PLYLoader();
  const content = new THREE.Group();
  scene.add(content);

  let activeScene = 'scene0011_00';
  let activeMode = 'full';
  let regionVisible = true;
  let fullMesh = null;
  let prunedMesh = null;
  let regionBox = null;
  let floorGrid = null;
  let fullBounds = null;
  let prunedBounds = null;
  let loadToken = 0;

  const number = new Intl.NumberFormat('en-US');

  function faceCount(geometry) {
    return Math.round((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3);
  }

  function disposeCurrent() {
    [fullMesh, prunedMesh].forEach((mesh) => {
      if (!mesh) return;
      content.remove(mesh);
      mesh.geometry.dispose();
    });
    if (regionBox) {
      content.remove(regionBox);
      regionBox.geometry.dispose();
      regionBox.material.dispose();
    }
    if (floorGrid) {
      content.remove(floorGrid);
      floorGrid.geometry.dispose();
      if (Array.isArray(floorGrid.material)) floorGrid.material.forEach((material) => material.dispose());
      else floorGrid.material.dispose();
    }
    fullMesh = null;
    prunedMesh = null;
    regionBox = null;
    floorGrid = null;
    fullBounds = null;
    prunedBounds = null;
  }

  function prepareGeometry(geometry) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function loadPly(url, label, token) {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (geometry) => resolve(prepareGeometry(geometry)),
        (event) => {
          if (token !== loadToken || !progress) return;
          const amount = event.total ? `${Math.round((event.loaded / event.total) * 100)}%` : `${(event.loaded / 1048576).toFixed(1)} MB`;
          progress.textContent = `${label}: ${amount}`;
        },
        reject
      );
    });
  }

  function makeRegionBox(bounds) {
    const helper = new THREE.Box3Helper(bounds.clone(), 0xc77bef);
    helper.material.transparent = true;
    helper.material.opacity = .95;
    helper.material.depthTest = false;
    helper.renderOrder = 5;
    return helper;
  }

  function makeGrid(bounds) {
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const span = Math.max(size.x, size.y) * 1.12;
    const grid = new THREE.GridHelper(span, 14, 0x8f739f, 0x51465a);
    grid.rotation.x = Math.PI / 2;
    grid.position.copy(bounds.getCenter(new THREE.Vector3()));
    grid.position.z = bounds.min.z - Math.max(size.z * .012, .01);
    grid.material.transparent = true;
    grid.material.opacity = .28;
    return grid;
  }

  function frameBounds(bounds, mode = 'full') {
    if (!bounds) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length(), .5);
    const distance = radius * (mode === 'pruned' ? .9 : .82);

    controls.target.copy(center);
    camera.position.set(
      center.x + distance * .83,
      center.y - distance * .92,
      center.z + distance * .72
    );
    camera.near = Math.max(radius / 500, .005);
    camera.far = Math.max(radius * 20, 50);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(radius * .06, .12);
    controls.maxDistance = Math.max(radius * 3.5, 8);
    controls.update();
  }

  function setMode(mode, reframe = true) {
    activeMode = mode;
    if (fullMesh) fullMesh.visible = mode === 'full';
    if (prunedMesh) prunedMesh.visible = mode === 'pruned';
    if (regionBox) regionBox.visible = regionVisible;
    modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.pgMode === mode));
    if (reframe) frameBounds(mode === 'pruned' ? prunedBounds : fullBounds, mode);
  }

  function updateInfo(id) {
    const data = SCENES[id];
    if (!data) return;
    if (queryEl) queryEl.textContent = `“${data.query}”`;
    if (targetEl) targetEl.textContent = data.target;
    if (sceneIdEl) sceneIdEl.textContent = id;
    if (reformulationEl) {
      reformulationEl.replaceChildren(...data.reformulation.map((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        return item;
      }));
    }
  }

  async function loadScene(id) {
    const token = ++loadToken;
    activeScene = id;
    updateInfo(id);
    sceneTabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.pgScene === id)));
    loading?.classList.remove('is-hidden');
    if (progress) progress.textContent = 'Preparing mesh';
    if (errorBox) errorBox.hidden = true;
    if (fullFacesEl) fullFacesEl.textContent = '—';
    if (prunedFacesEl) prunedFacesEl.textContent = '—';
    if (retentionEl) retentionEl.textContent = '—';

    try {
      const root = `assets/3d/${id}`;
      const [fullGeometry, prunedGeometry] = await Promise.all([
        loadPly(`${root}/full.ply`, 'Full scene', token),
        loadPly(`${root}/pruned.ply`, 'Pruned scene', token)
      ]);

      if (token !== loadToken) {
        fullGeometry.dispose();
        prunedGeometry.dispose();
        return;
      }

      disposeCurrent();
      fullBounds = fullGeometry.boundingBox.clone();
      prunedBounds = prunedGeometry.boundingBox.clone();
      fullMesh = new THREE.Mesh(fullGeometry, meshMaterial);
      prunedMesh = new THREE.Mesh(prunedGeometry, meshMaterial);
      regionBox = makeRegionBox(prunedBounds);
      floorGrid = makeGrid(fullBounds);
      content.add(fullMesh, prunedMesh, floorGrid, regionBox);

      const fullFaces = faceCount(fullGeometry);
      const prunedFaces = faceCount(prunedGeometry);
      if (fullFacesEl) fullFacesEl.textContent = number.format(fullFaces);
      if (prunedFacesEl) prunedFacesEl.textContent = number.format(prunedFaces);
      if (retentionEl) retentionEl.textContent = `${((prunedFaces / fullFaces) * 100).toFixed(1)}%`;

      setMode(activeMode, true);
      loading?.classList.add('is-hidden');
    } catch (error) {
      if (token !== loadToken) return;
      loading?.classList.add('is-hidden');
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = 'Could not load this 3D scene. Reload the page or try again on a stable connection.';
      }
    }
  }

  sceneTabs.forEach((tab) => {
    tab.addEventListener('click', () => loadScene(tab.dataset.pgScene));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const current = sceneTabs.indexOf(tab);
      const next = sceneTabs[(current + offset + sceneTabs.length) % sceneTabs.length];
      next.focus();
      next.click();
    });
  });

  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.pgMode)));

  regionToggle?.addEventListener('click', () => {
    regionVisible = !regionVisible;
    regionToggle.setAttribute('aria-pressed', String(regionVisible));
    regionToggle.textContent = regionVisible ? 'Region on' : 'Region off';
    if (regionBox) regionBox.visible = regionVisible;
  });

  resetButton?.addEventListener('click', () => frameBounds(activeMode === 'pruned' ? prunedBounds : fullBounds, activeMode));

  const resize = () => {
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap);
  else window.addEventListener('resize', resize, { passive: true });

  let running = true;
  const animate = () => {
    if (!running) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !running) {
      running = true;
      animate();
    } else if (document.hidden) {
      running = false;
    }
  });

  animate();
  loadScene(activeScene);
})();
