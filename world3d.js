/*
 * world3d.js — o mundinho 3D do Koa (Three.js, carregado de CDN).
 *
 * Uma ilha flutuante com um pé de eucalipto, laguinho, nuvens e folhas caindo.
 * O céu segue a hora do dia (dia, entardecer, noite com estrelas e vaga-lumes).
 * O coala 3D reage ao humor (data-mood do #stage) e o mundo CRESCE conforme
 * ele aprende: uma florzinha nova por coisa aprendida e borboletas a cada nível.
 *
 * Se o WebGL ou o Three.js não estiverem disponíveis (ex.: primeira visita
 * offline), este módulo não roda e o coala 2D (SVG) continua aparecendo.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const stage = document.getElementById('stage');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

if (stage && webglOK()) {
  try {
    start();
  } catch (e) {
    console.warn('Mundo 3D indisponível, usando o coala 2D.', e);
  }
}

function start() {
  // ---------------------------------------------------------------- base
  const holder = document.createElement('div');
  holder.className = 'world';
  stage.prepend(holder);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'O mundinho 3D do Koa');
  renderer.domElement.setAttribute('role', 'img');
  holder.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

  const mats = new Map();
  /** material low-poly reaproveitado */
  function mat(color, extra = {}) {
    const k = color + JSON.stringify(extra);
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0, flatShading: true }, extra)));
    return mats.get(k);
  }
  function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }
  const hash = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return s - Math.floor(s);
  };
  /** deixa uma geometria "torta" para parecer feita à mão (mesma posição = mesmo deslocamento) */
  function jitter(geo, amount, keepTop = false) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (keepTop && y > 0) continue;
      const h = hash(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
      p.setXYZ(i, x * (1 + (h - 0.5) * amount), y + (h - 0.5) * amount * 0.6, z * (1 + (hash(z, x, y) - 0.5) * amount));
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ---------------------------------------------------------------- céu
  const skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = smoothstep(-0.25, 0.75, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
    })
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xffffff, 45, 140);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a8f6a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // luz suave vinda da câmera, para o Koa nunca ficar escuro (principalmente à noite)
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  scene.add(fill, fill.target);

  const sunBall = mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false }), 40, 34, -70, false);
  scene.add(sunBall);

  // estrelas (noite)
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 400; i++) {
    const t = hash(i, 1, 2) * Math.PI * 2;
    const p = Math.acos(hash(i, 3, 4) * 0.9);
    starPos.push(120 * Math.sin(p) * Math.cos(t), 120 * Math.cos(p), 120 * Math.sin(p) * Math.sin(t));
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, fog: false, transparent: true }));
  scene.add(stars);

  // ---------------------------------------------------------------- ilha
  const world = new THREE.Group();
  scene.add(world);

  const grass = mesh(jitter(new THREE.CylinderGeometry(6, 5.7, 0.7, 30, 1), 0.06, true), mat('#8cc584'), 0, -0.35, 0);
  world.add(grass);
  const rock = mesh(jitter(new THREE.ConeGeometry(5.7, 5, 14, 3), 0.18, true), mat('#9b7653'), 0, -3.2, 0);
  rock.rotation.x = Math.PI;
  world.add(rock);
  const rock2 = mesh(jitter(new THREE.ConeGeometry(3.6, 3.2, 10, 2), 0.2, true), mat('#86664a'), 0.6, -6.8, 0.4);
  rock2.rotation.x = Math.PI;
  world.add(rock2);

  // laguinho
  const pondMat = new THREE.MeshStandardMaterial({ color: '#6fb7d8', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
  const pond = mesh(new THREE.CircleGeometry(1.35, 28), pondMat, 2.7, 0.02, 1.7, false);
  pond.rotation.x = -Math.PI / 2;
  world.add(pond);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = mesh(jitter(new THREE.DodecahedronGeometry(0.22 + hash(i, 5, 5) * 0.12, 0), 0.2), mat('#b9b4a8'), 2.7 + Math.cos(a) * 1.45, 0.05, 1.7 + Math.sin(a) * 1.45);
    world.add(s);
  }

  // pedrinhas e tufos de grama
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 9, 1) * Math.PI * 2;
    const r = 1.5 + hash(i, 2, 7) * 4.1;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - 2.7, z - 1.7) < 1.8) continue;
    if (i % 3 === 0) world.add(mesh(jitter(new THREE.DodecahedronGeometry(0.18 + hash(i, 1, 1) * 0.2, 0), 0.3), mat('#a7a296'), x, 0.05, z));
    else {
      const tuft = mesh(new THREE.ConeGeometry(0.12, 0.45, 4), mat('#6fae6a'), x, 0.2, z);
      tuft.rotation.z = (hash(i, 4, 4) - 0.5) * 0.5;
      world.add(tuft);
    }
  }

  // ---------------------------------------------------------------- eucalipto
  const tree = new THREE.Group();
  tree.position.set(-0.6, 0, -1.1);
  world.add(tree);
  const bark = mat('#cfc2b3');
  const trunk = mesh(jitter(new THREE.CylinderGeometry(0.32, 0.5, 4.6, 9, 4), 0.08), bark, 0, 2.3, 0);
  trunk.rotation.z = 0.04;
  tree.add(trunk);
  // galho onde o Koa senta
  const BRANCH_Y = 2.05;
  const branch = mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.6, 8), bark, 1.2, BRANCH_Y, 0.2);
  branch.rotation.z = Math.PI / 2 - 0.12;
  tree.add(branch);
  const branch2 = mesh(new THREE.CylinderGeometry(0.1, 0.17, 2, 7), bark, -0.9, 3.5, 0.1);
  branch2.rotation.z = -Math.PI / 2 + 0.6;
  tree.add(branch2);
  // copa
  const leafColors = ['#7fae8f', '#6a9c7e', '#8fbf9c', '#5f9174'];
  const crown = [
    [0, 5.3, 0, 1.7], [1.3, 4.8, 0.3, 1.25], [-1.3, 4.7, -0.2, 1.3], [0.4, 6.2, -0.3, 1.2],
    [-0.6, 5.6, 1.0, 1.1], [0.9, 5.4, -1.0, 1.15], [2.2, 4.3, 0.4, 0.8], [-1.9, 4.1, 0.3, 0.75],
  ];
  crown.forEach(([x, y, z, r], i) => {
    const m = mesh(jitter(new THREE.IcosahedronGeometry(r, 0), 0.15), mat(leafColors[i % leafColors.length]), x, y, z);
    m.rotation.set(hash(i, 1, 0) * 3, hash(i, 2, 0) * 3, 0);
    tree.add(m);
  });

  // ---------------------------------------------------------------- nuvens
  const clouds = new THREE.Group();
  scene.add(clouds);
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.95 });
  for (let c = 0; c < 6; c++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(hash(c, 3, 3) * 3);
    for (let i = 0; i < n; i++) {
      const s = mesh(new THREE.IcosahedronGeometry(0.9 + hash(c, i, 1) * 0.8, 0), cloudMat, i * 1.1 - n * 0.5, hash(c, i, 2) * 0.5, hash(c, i, 3) * 0.6, false);
      g.add(s);
    }
    const a = (c / 6) * Math.PI * 2;
    g.position.set(Math.cos(a) * (42 + c * 3), 12 + hash(c, 7, 7) * 8, Math.sin(a) * (42 + c * 3));
    g.scale.setScalar(2.2);
    g.userData.speed = 0.02 + hash(c, 8, 8) * 0.03;
    clouds.add(g);
  }

  // ---------------------------------------------------------------- o Koa 3D
  const fur = mat('#8e9aab', { flatShading: false, roughness: 1 });
  const furDark = mat('#76839a', { flatShading: false, roughness: 1 });
  const fluff = mat('#e3e7ec', { flatShading: false, roughness: 1 });
  const black = mat('#22262e', { flatShading: false, roughness: 0.3 });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const pinkMat = new THREE.MeshStandardMaterial({ color: '#f29aae', roughness: 1, transparent: true, opacity: 0.75 });
  const earIn = mat('#ecd3da', { flatShading: false, roughness: 1 });

  const sph = (r, seg = 20) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  const koala = new THREE.Group();
  // o Koa vive solto no mundo; começa sentado no galho
  const koalaHome = new THREE.Vector3(tree.position.x + 0.95, BRANCH_Y + 0.12, tree.position.z + 0.25);
  koala.position.copy(koalaHome);
  world.add(koala);

  const body = mesh(sph(0.5), fur, 0, 0.45, 0);
  body.scale.set(1, 1.12, 0.9);
  koala.add(body);
  const belly = mesh(sph(0.36), fluff, 0, 0.42, 0.3);
  belly.scale.set(1, 1.15, 0.5);
  koala.add(belly);
  for (const sx of [-1, 1]) {
    const arm = mesh(sph(0.15), furDark, sx * 0.36, 0.42, 0.3);
    arm.scale.set(1, 1.7, 1);
    arm.rotation.z = sx * 0.5;
    koala.add(arm);
    const leg = mesh(sph(0.17), furDark, sx * 0.3, 0.02, 0.28);
    leg.scale.set(1, 0.75, 1.35);
    koala.add(leg);
  }
  // folhinha nas patas
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.12, 0.18, 0, 0.42);
  leafShape.quadraticCurveTo(-0.12, 0.18, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#6fae84', side: THREE.DoubleSide, roughness: 0.8 });
  const pawLeaf = mesh(leafGeo, leafMat, 0.08, 0.3, 0.52);
  pawLeaf.rotation.set(-0.3, 0, -0.5);
  koala.add(pawLeaf);

  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.02);
  koala.add(head);
  const headBall = mesh(sph(0.52, 28), fur, 0, 0, 0);
  headBall.scale.set(1.13, 0.96, 0.95);
  head.add(headBall);
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sx * 0.56, 0.3, -0.02);
    head.add(ear);
    const outer = mesh(sph(0.3), fur, 0, 0, 0);
    outer.scale.set(1, 1, 0.55);
    ear.add(outer);
    const inner = mesh(sph(0.18), earIn, 0, -0.01, 0.09);
    inner.scale.set(1, 1, 0.35);
    ear.add(inner);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.35 + i * 0.16);
      const t = mesh(sph(0.075, 10), fluff, sx * -Math.cos(a) * 0.29, Math.sin(a) * 0.29 - 0.05, 0.04);
      ear.add(t);
    }
    ears.push(ear);
  }
  const eyes = [];
  const happyEyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.2, 0.06, 0.44);
    head.add(eye);
    const ball = mesh(sph(0.072, 14), black, 0, 0, 0, false);
    ball.scale.set(1, 1.2, 0.8);
    eye.add(ball);
    eye.add(mesh(sph(0.022, 8), white, 0.022, 0.03, 0.055, false));
    eyes.push(eye);
    const he = mesh(new THREE.TorusGeometry(0.06, 0.017, 6, 14, Math.PI), black, sx * 0.2, 0.04, 0.47, false);
    he.visible = false;
    happyEyes.push(he);
    head.add(he);
  }
  const brows = [];
  for (const sx of [-1, 1]) {
    const b = mesh(new THREE.CapsuleGeometry(0.018, 0.1, 3, 6), furDark, sx * 0.2, 0.2, 0.45, false);
    b.rotation.z = Math.PI / 2;
    b.visible = false;
    brows.push(b);
    head.add(b);
  }
  const nose = mesh(sph(0.16, 18), mat('#353a46', { flatShading: false, roughness: 0.35 }), 0, -0.08, 0.48);
  nose.scale.set(0.85, 1.15, 0.7);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ch = mesh(sph(0.08, 12), pinkMat, sx * 0.34, -0.1, 0.4, false);
    ch.scale.set(1, 0.6, 0.3);
    head.add(ch);
  }
  koala.traverse((o) => {
    if (o.isMesh) o.userData.isKoala = true;
  });

  // balõezinhos de pensamento
  const thinkMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  const thinkDots = [0.07, 0.1, 0.14].map((r, i) => {
    const d = mesh(sph(r, 12), thinkMat, 0.55 + i * 0.2, 1.75 + i * 0.22, 0.1, false);
    d.visible = false;
    koala.add(d);
    return d;
  });

  // sprites de emoji (corações, estrelas, "?")
  function emojiSprite(ch, size = 0.35) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(size, size, size);
    s.visible = false;
    return s;
  }
  const hearts = ['💚', '💖', '⭐', '✨'].map((e) => {
    const s = emojiSprite(e, 0.32);
    koala.add(s);
    return s;
  });
  const question = emojiSprite('❓', 0.42);
  question.position.set(0.6, 1.85, 0.2);
  koala.add(question);

  // ---------------------------------------------------------------- folhas caindo
  const falling = [];
  for (let i = 0; i < 10; i++) {
    const l = mesh(leafGeo, leafMat, 0, -50, 0, false);
    l.scale.setScalar(0.7);
    l.userData = { speed: 0.35 + hash(i, 1, 9) * 0.35, spin: 1 + hash(i, 2, 9) * 2, phase: hash(i, 3, 9) * 10 };
    resetLeaf(l, true);
    world.add(l);
    falling.push(l);
  }
  function resetLeaf(l, anyHeight) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 2.2;
    l.position.set(-0.6 + Math.cos(a) * r, anyHeight ? 0.5 + Math.random() * 4.5 : 4.5 + Math.random(), -1.1 + Math.sin(a) * r);
  }

  // ---------------------------------------------------------------- vaga-lumes (noite)
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(24 * 3).fill(0), 3));
  const fireflies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ color: '#fff3a0', size: 0.14, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  world.add(fireflies);

  // ---------------------------------------------------------------- mundo que cresce
  const flowerColors = ['#f29aae', '#f7d35c', '#ffffff', '#b99cf2', '#f5a35c', '#7cc6f2'];
  const flowers = [];
  const stemMat = mat('#5f9a5c');
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.32, 5);
  const petalGeo = new THREE.IcosahedronGeometry(0.1, 0);
  const centerGeo = new THREE.SphereGeometry(0.05, 8, 6);
  function flowerSpot(i) {
    // ângulo de ouro: espalha as flores sem amontoar, sempre no mesmo lugar
    for (let k = i; k < i + 400; k++) {
      const a = k * 2.39996;
      const r = 1.4 + ((k * 0.618) % 1) * 4.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - 2.7, z - 1.7) < 1.8) continue; // laguinho
      if (Math.hypot(x + 0.6, z + 1.1) < 1.0) continue; // tronco
      return [x, z];
    }
    return [0, 4];
  }
  function addFlower(i, animate) {
    const g = new THREE.Group();
    const [x, z] = flowerSpot(i * 3);
    g.position.set(x, 0, z);
    g.add(mesh(stemGeo, stemMat, 0, 0.16, 0, false));
    const pm = mat(flowerColors[i % flowerColors.length]);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      const petal = mesh(petalGeo, pm, Math.cos(a) * 0.08, 0.34, Math.sin(a) * 0.08, false);
      petal.scale.set(1, 0.4, 1);
      g.add(petal);
    }
    g.add(mesh(centerGeo, mat('#f7c948'), 0, 0.36, 0, false));
    g.scale.setScalar(animate ? 0.01 : 1);
    g.userData.grow = animate ? 0 : 1;
    g.rotation.y = hash(i, 0, 1) * 6;
    world.add(g);
    flowers.push(g);
  }

  const butterflies = [];
  const wingGeo = new THREE.CircleGeometry(0.13, 10, 0, Math.PI);
  function addButterfly(i) {
    const g = new THREE.Group();
    const wm = new THREE.MeshStandardMaterial({ color: flowerColors[(i + 2) % flowerColors.length], side: THREE.DoubleSide, roughness: 0.7 });
    const l = new THREE.Mesh(wingGeo, wm);
    const r = new THREE.Mesh(wingGeo, wm);
    l.rotation.z = Math.PI / 2;
    r.rotation.z = -Math.PI / 2;
    g.add(l, r);
    g.userData = { l, r, phase: i * 1.7, radius: 1.8 + i * 0.5, height: 0.9 + (i % 3) * 0.5 };
    world.add(g);
    butterflies.push(g);
  }

  let learnedCount = 0;
  function setGrowth(count, animate) {
    learnedCount = count;
    const nFlowers = Math.min(count, 90);
    while (flowers.length > nFlowers) world.remove(flowers.pop());
    while (flowers.length < nFlowers) addFlower(flowers.length, animate);
    const nBut = Math.min(6, Math.floor(count / 10));
    while (butterflies.length > nBut) world.remove(butterflies.pop());
    while (butterflies.length < nBut) addButterfly(butterflies.length);
  }
  window.addEventListener('koa:growth', (e) => setGrowth(Number(e.detail && e.detail.count) || 0, true));
  setGrowth(Number(stage.dataset.count) || 0, false);

  // ---------------------------------------------------------------- hora do dia
  const PHASES = {
    day: { top: '#79c2ee', bottom: '#e8f5ec', sun: '#fff6e5', sunI: 1.7, hemi: 0.95, fill: 0.35, fog: '#dcefe6', stars: 0, flies: 0, ball: '#fff1b8', ballY: 34 },
    sunset: { top: '#f0937a', bottom: '#ffe0b3', sun: '#ffc48a', sunI: 1.2, hemi: 0.75, fill: 0.55, fog: '#f7d2b4', stars: 0.25, flies: 0.4, ball: '#ffb36b', ballY: 8 },
    night: { top: '#0b1534', bottom: '#2c3f68', sun: '#9fb6ff', sunI: 0.6, hemi: 0.6, fill: 0.95, fog: '#26365c', stars: 1, flies: 1, ball: '#eef2ff', ballY: 30 },
  };
  let phase = null;
  let forcedPhase = null;
  function updatePhase() {
    const h = new Date().getHours();
    const p = forcedPhase || (h >= 7 && h < 17 ? 'day' : (h >= 17 && h < 19) || (h >= 5 && h < 7) ? 'sunset' : 'night');
    if (p === phase) return;
    phase = p;
    const P = PHASES[p];
    skyUniforms.top.value.set(P.top);
    skyUniforms.bottom.value.set(P.bottom);
    sun.color.set(P.sun);
    sun.intensity = P.sunI;
    hemi.intensity = P.hemi;
    fill.intensity = P.fill;
    scene.fog.color.set(P.fog);
    stars.material.opacity = P.stars;
    stars.visible = P.stars > 0;
    fireflies.visible = P.flies > 0;
    fireflies.material.opacity = 0.9 * P.flies;
    sunBall.material.color.set(P.ball);
    sunBall.position.y = P.ballY;
    sunBall.scale.setScalar(p === 'night' ? 0.7 : 1); // lua menor
  }
  updatePhase();
  setInterval(updatePhase, 60000);

  // ---------------------------------------------------------------- câmera e toque
  const target = new THREE.Vector3();
  const view = { theta: 0.35, phi: 1.2, radius: 8.5, theta0: 0.35, phi0: 1.2, radius0: 8.5 };
  let full = false;
  let lastInteract = 0;

  function frame() {
    // foca no Koa no palco pequeno; na tela cheia mostra a ilha inteira
    const kp = new THREE.Vector3();
    scene.updateMatrixWorld(true);
    koala.getWorldPosition(kp);
    if (full) {
      target.set(0, 1.6, 0);
      // celular em pé: a câmera se afasta para caber a ilha inteira
      view.radius0 = 14 + (camera.aspect < 1 ? (1 / camera.aspect - 1) * 14 : 0);
      view.phi0 = 1.2;
    } else {
      target.copy(kp).add(new THREE.Vector3(0, 0.55, 0));
      view.radius0 = stage.classList.contains('compact') ? 5.5 : 7.2;
      view.phi0 = 1.4;
    }
  }

  function placeCamera() {
    const { theta, phi, radius } = view;
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(target);
    fill.position.copy(camera.position);
    fill.target.position.copy(target);
  }

  const pointers = new Map();
  let downAt = null;
  let pinch0 = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (pointers.size === 2) pinch0 = pinchDist();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    lastInteract = performance.now();
    if (pointers.size === 2) {
      const d = pinchDist();
      if (pinch0 && full) view.radius = clamp(view.radius * (pinch0 / d), 6, 40);
      pinch0 = d;
      return;
    }
    view.theta -= dx * 0.008;
    view.phi = clamp(view.phi - dy * 0.006, 0.55, 1.55);
    if (!full) view.theta = clamp(view.theta, view.theta0 - 1.1, view.theta0 + 1.1);
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && performance.now() - downAt.t < 400) tap(e);
    downAt = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => {
    if (!full) return;
    e.preventDefault();
    view.radius = clamp(view.radius * (1 + e.deltaY * 0.001), 6, 40);
    lastInteract = performance.now();
  }, { passive: false });

  function pinchDist() {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const ray = new THREE.Raycaster();
  function tap(e) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(koala, true)[0];
    if (hit && window.KoaKoala) {
      window.KoaKoala.setMood('happy', 1800);
      if (navigator.vibrate) navigator.vibrate(15);
    }
  }

  // botões explorar / fechar
  const btnOpen = document.createElement('button');
  btnOpen.type = 'button';
  btnOpen.className = 'world-btn';
  btnOpen.setAttribute('aria-label', 'Explorar o mundo do Koa');
  btnOpen.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.className = 'world-close';
  btnClose.setAttribute('aria-label', 'Voltar para a conversa');
  btnClose.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const hint = document.createElement('p');
  hint.className = 'world-hint';
  hint.textContent = 'Arraste para girar · pinça para zoom · toque no Koa 🐨';
  stage.append(btnOpen, btnClose, hint);

  function setFull(on) {
    full = on;
    stage.classList.toggle('world-full', on);
    document.body.classList.toggle('world-open', on);
    resize();
    view.radius = view.radius0;
    view.phi = view.phi0;
    view.theta = view.theta0;
    (on ? btnClose : btnOpen).focus({ preventScroll: true });
  }
  btnOpen.addEventListener('click', () => setFull(true));
  btnClose.addEventListener('click', () => setFull(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && full) setFull(false);
  });

  // ---------------------------------------------------------------- tamanho
  function resize() {
    const w = Math.max(1, holder.clientWidth);
    const h = Math.max(1, holder.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    stage.classList.toggle('compact', h < 170);
    // no palco pequeno o Koa fica à esquerda, abrindo espaço para o balão
    if (full) camera.clearViewOffset();
    else camera.setViewOffset(w, h, Math.round(w * (w > 520 ? 0.2 : 0.24)), 0, w, h);
    camera.updateProjectionMatrix();
    frame();
  }
  new ResizeObserver(resize).observe(holder);

  // ---------------------------------------------------------------- humor
  let mood = stage.dataset.mood || 'idle';
  let moodAt = performance.now();
  new MutationObserver(() => {
    if (stage.dataset.mood !== mood) {
      mood = stage.dataset.mood;
      moodAt = performance.now();
    }
  }).observe(stage, { attributes: true, attributeFilter: ['data-mood'] });

  // ---------------------------------------------------------------- vida própria
  // Quando ninguém está conversando, o Koa desce da árvore, passeia, cheira flores,
  // bebe água no laguinho, olha o céu e tira sonecas (mais à noite). Quando a pessoa
  // volta a digitar, ele sobe de novo no galho para conversar.
  const zzz = emojiSprite('💤', 0.4);
  zzz.position.set(0.45, 1.5, 0.2);
  koala.add(zzz);
  const POND = new THREE.Vector3(2.7, 0, 1.7);
  const TRUNK = new THREE.Vector3(tree.position.x, 0, tree.position.z);
  const LANDING = new THREE.Vector3(0.75, 0, -0.25);

  function validSpot(x, z) {
    if (Math.hypot(x, z) > 4.9) return false;
    if (Math.hypot(x - POND.x, z - POND.z) < 1.85) return false;
    if (Math.hypot(x - TRUNK.x, z - TRUNK.z) < 0.85) return false;
    return true;
  }
  function pathOK(a, b) {
    for (let s = 0.1; s <= 1.001; s += 0.1) if (!validSpot(a.x + (b.x - a.x) * s, a.z + (b.z - a.z) * s)) return false;
    return true;
  }

  const life = { mode: 'branch', to: new THREE.Vector3(), from: new THREE.Vector3(), jumpT: 0, then: null, activity: null, timer: 6 + Math.random() * 6, heading: 0, faceCamera: true };
  let lastTalk = performance.now();
  const markTalk = () => (lastTalk = performance.now());
  const inputEl = document.getElementById('input');
  if (inputEl) {
    inputEl.addEventListener('focus', markTalk);
    inputEl.addEventListener('input', markTalk);
  }
  new MutationObserver(() => {
    if (stage.dataset.mood === 'thinking') markTalk();
  }).observe(stage, { attributes: true, attributeFilter: ['data-mood'] });

  function emitActivity(type, extra) {
    window.dispatchEvent(new CustomEvent('koa:activity', { detail: Object.assign({ type }, extra || {}) }));
  }
  function face(p) {
    life.heading = Math.atan2(p.x - koala.position.x, p.z - koala.position.z);
    life.faceCamera = false;
  }
  function jump(to, then) {
    life.mode = 'jump';
    life.from.copy(koala.position);
    life.to.copy(to);
    life.jumpT = 0;
    life.then = then;
    face(to);
  }
  function walkTo(p, then) {
    if (!pathOK(koala.position, p)) {
      // caminho bloqueado (lago ou tronco): contorna por um ponto no meio do caminho
      let best = null;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const r of [1.6, 2.6, 3.6]) {
          const w = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
          if (!validSpot(w.x, w.z) || !pathOK(koala.position, w) || !pathOK(w, p)) continue;
          const len = koala.position.distanceTo(w) + w.distanceTo(p);
          if (!best || len < best.len) best = { w, len };
        }
      }
      if (!best) return jump(p, then);
      return walkTo(best.w, () => walkTo(p, then));
    }
    life.mode = 'walk';
    life.to.set(p.x, 0, p.z);
    life.then = then;
    life.faceCamera = false;
  }
  function startDo(activity, time) {
    life.mode = 'do';
    life.activity = activity;
    life.timer = time;
  }
  function rest(sec) {
    life.mode = 'idle';
    life.activity = null;
    life.timer = sec;
    life.faceCamera = true;
  }
  function randomSpot() {
    for (let i = 0; i < 25; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 3.8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (validSpot(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
  function goHome(emit) {
    if (life.mode === 'branch' || life.mode === 'jump') return;
    life.activity = null;
    const up = () => jump(koalaHome, () => {
      life.mode = 'branch';
      life.faceCamera = true;
      life.timer = 10 + Math.random() * 10;
      if (emit) emitActivity('tree');
    });
    if (koala.position.distanceTo(LANDING) > 0.25) walkTo(LANDING, up);
    else up();
  }
  function chooseActivity() {
    if (life.mode === 'branch') return jump(LANDING, () => rest(0.8)); // desce da árvore
    const r = Math.random();
    if (phase === 'night' && r < 0.6) {
      const spot = new THREE.Vector3(TRUNK.x + 1.0, 0, TRUNK.z + 0.6);
      return walkTo(spot, () => {
        face(new THREE.Vector3(spot.x + 1, 0, spot.z + 1));
        startDo('nap', 30 + Math.random() * 30);
        emitActivity('nap');
      });
    }
    if (r < 0.32 && flowers.length) {
      const i = Math.floor(Math.random() * flowers.length);
      const fp = flowers[i].position;
      const dir = new THREE.Vector3(koala.position.x - fp.x, 0, koala.position.z - fp.z).normalize();
      const spot = new THREE.Vector3(fp.x + dir.x * 0.45, 0, fp.z + dir.z * 0.45);
      if (validSpot(spot.x, spot.z)) {
        return walkTo(spot, () => {
          face(fp);
          startDo('sniff', 3);
          emitActivity('flower', { factId: (window.KoaFactIds || [])[i] });
        });
      }
    }
    if (r < 0.55) {
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2;
        const spot = new THREE.Vector3(POND.x + Math.cos(a) * 1.95, 0, POND.z + Math.sin(a) * 1.95);
        if (!validSpot(spot.x, spot.z)) continue;
        return walkTo(spot, () => {
          face(POND);
          startDo('drink', 3.5);
          emitActivity('pond');
        });
      }
    }
    if (r < 0.68) {
      startDo('sky', 3.5);
      if (Math.random() < 0.4) emitActivity('sky');
      return;
    }
    if (r < 0.86) {
      const s = randomSpot();
      if (s) return walkTo(s, () => {
        rest(2 + Math.random() * 3);
        if (Math.random() < 0.3) emitActivity('wander');
      });
    }
    goHome(true);
  }

  const tmpV = new THREE.Vector3();
  function angleLerp(a, b, k) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  }
  /** move o Koa e devolve a altura base (galho ou chão) */
  function updateLife(dt, t, still) {
    const talking = performance.now() - lastTalk < 25000;
    if (still) {
      if (life.mode !== 'branch') {
        koala.position.copy(koalaHome);
        life.mode = 'branch';
        life.activity = null;
      }
    } else {
      if (talking && life.mode !== 'branch' && life.mode !== 'jump') goHome(false);
      if (life.mode === 'branch' || life.mode === 'idle') {
        if (!talking) life.timer -= dt;
        if (life.timer <= 0) chooseActivity();
      } else if (life.mode === 'do') {
        life.timer -= dt;
        if (life.timer <= 0) rest(1.5 + Math.random() * 3);
      } else if (life.mode === 'walk') {
        tmpV.set(life.to.x - koala.position.x, 0, life.to.z - koala.position.z);
        const dist = tmpV.length();
        if (dist < 0.05) {
          const cb = life.then;
          life.then = null;
          life.mode = 'idle';
          life.timer = 1;
          if (cb) cb();
        } else {
          life.heading = Math.atan2(tmpV.x, tmpV.z);
          koala.position.addScaledVector(tmpV.normalize(), Math.min(dist, dt * 0.9));
        }
      } else if (life.mode === 'jump') {
        life.jumpT += dt / 0.85;
        const s = Math.min(1, life.jumpT);
        koala.position.lerpVectors(life.from, life.to, s);
        koala.position.y += Math.sin(s * Math.PI) * 0.9;
        if (s >= 1) {
          koala.position.copy(life.to);
          const cb = life.then;
          life.then = null;
          if (cb) cb();
        }
      }
    }
    // para onde ele olha: andando, para o destino; parado, para a câmera
    const toCam = Math.atan2(camera.position.x - koala.position.x, camera.position.z - koala.position.z);
    const wantFace = life.mode === 'walk' || life.mode === 'jump' || life.mode === 'do' || (!life.faceCamera && life.mode !== 'branch') ? life.heading : toCam;
    koala.rotation.y = angleLerp(koala.rotation.y, wantFace, Math.min(1, dt * 5));
    if (life.mode === 'jump') return null;
    const ground = life.mode === 'branch' ? koalaHome.y : 0;
    return ground + (life.mode === 'walk' ? Math.abs(Math.sin(t * 11)) * 0.06 : 0);
  }

  // ---------------------------------------------------------------- loop
  stage.classList.add('has-world');
  resize();
  view.radius = view.radius0;
  view.phi = view.phi0;
  placeCamera();

  const clock = new THREE.Clock();
  let nextBlink = 2;
  const headRot = new THREE.Euler();
  const lerp = (a, b, k) => a + (b - a) * k;

  // qualidade automática: se o aparelho sofrer, baixa a resolução e tira as sombras
  let slowFrames = 0;
  let quality = 2;
  function adapt(rawDt) {
    if (quality === 0) return;
    slowFrames = rawDt > 0.034 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames < 40) return;
    slowFrames = 0;
    quality--;
    if (quality === 1) renderer.setPixelRatio(1);
    if (quality === 0) {
      renderer.shadowMap.enabled = false;
      scene.traverse((o) => o.material && (o.material.needsUpdate = true));
    }
    resize();
  }

  let lastFrame = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    // 30 fps bastam para um mundinho calmo e poupam bateria
    if (now - lastFrame < 31) return;
    lastFrame = now;
    const rawDt = clock.getDelta();
    adapt(rawDt);
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    const still = reduced.matches;
    const since = (performance.now() - moodAt) / 1000;
    const k = Math.min(1, dt * 6);

    // câmera: volta devagar para a posição padrão quando ninguém mexe
    if (performance.now() - lastInteract > 3500) {
      view.theta = lerp(view.theta, view.theta0 + (still || full ? 0 : Math.sin(t * 0.15) * 0.12), dt * 0.8);
      view.phi = lerp(view.phi, view.phi0, dt * 0.8);
      view.radius = lerp(view.radius, view.radius0, dt * 0.8);
    }
    if (full && !still && performance.now() - lastInteract > 3500) view.theta0 += dt * 0.08;
    placeCamera();

    // respiração e piscadas
    body.scale.y = 1.12 * (1 + (still ? 0 : Math.sin(t * 1.7) * 0.025));
    nextBlink -= dt;
    let blink = 1;
    if (nextBlink < 0) {
      blink = 0.12;
      if (nextBlink < -0.13) nextBlink = 2.5 + Math.random() * 3;
    }
    ears.forEach((ear, i) => (ear.rotation.z = still ? 0 : Math.sin(t * 2 + i) * 0.04 + (Math.sin(t * 0.7) > 0.97 ? (i ? -0.25 : 0.25) : 0)));

    // pose da cabeça por humor
    const target3 = { x: 0, y: Math.sin(t * 0.6) * 0.08, z: Math.sin(t * 0.9) * 0.03 };
    if (mood === 'thinking') Object.assign(target3, { x: -0.28, z: 0.08, y: 0.15 });
    if (mood === 'curious') Object.assign(target3, { z: 0.3, x: -0.05 });
    if (mood === 'confused') Object.assign(target3, { z: -0.28, y: -0.1 });
    // o que ele está fazendo sozinho muda a pose (se não estiver reagindo a alguém)
    const act = mood === 'idle' ? life.activity : null;
    if (act === 'sniff') Object.assign(target3, { x: 0.5 + Math.sin(t * 9) * 0.05, z: 0 });
    if (act === 'drink') Object.assign(target3, { x: 0.65 + Math.max(0, Math.sin(t * 4)) * 0.12, z: 0 });
    if (act === 'sky') Object.assign(target3, { x: -0.6, z: Math.sin(t * 0.8) * 0.15 });
    if (act === 'nap') Object.assign(target3, { x: 0.35, z: 0.25, y: 0 });
    headRot.set(lerp(head.rotation.x, target3.x, k), lerp(head.rotation.y, target3.y, k), lerp(head.rotation.z, target3.z, k));
    head.rotation.copy(headRot);

    const happy = mood === 'happy';
    eyes.forEach((e) => {
      e.visible = !happy;
      e.scale.y = act === 'nap' ? 0.1 : blink;
      e.position.y = lerp(e.position.y, mood === 'thinking' ? 0.1 : 0.06, k);
    });
    happyEyes.forEach((e) => (e.visible = happy));
    brows.forEach((b, i) => {
      b.visible = mood === 'curious' || mood === 'confused';
      b.position.y = 0.2 + (mood === 'curious' && i === 0 ? 0.05 : 0);
      b.rotation.z = Math.PI / 2 + (mood === 'confused' ? (i ? 0.35 : -0.35) : 0);
    });

    // pulinho de alegria
    const hop = happy && !still && since < 1.3 ? Math.abs(Math.sin(since * 8)) * 0.28 * (1 - since / 1.3) : 0;
    const baseY = updateLife(dt, t, still);
    if (baseY !== null) koala.position.y = baseY + hop;
    zzz.visible = act === 'nap';
    if (zzz.visible) {
      const p = (t * 0.4) % 1;
      zzz.position.set(0.45 + p * 0.2, 1.4 + p * 0.5, 0.2);
      zzz.material.opacity = 1 - p * 0.8;
    }
    // no palco pequeno a câmera acompanha o Koa aonde ele for
    if (!full) {
      tmpV.copy(koala.position).add(new THREE.Vector3(0, 0.55, 0));
      if (life.mode === 'jump') tmpV.y = target.y;
      target.lerp(tmpV, Math.min(1, dt * 2.2));
    }

    // corações / estrelas subindo
    hearts.forEach((s, i) => {
      s.visible = happy;
      if (!happy) return;
      const p = ((since * 0.6 + i * 0.25) % 1);
      s.position.set(Math.sin(i * 2.1) * 0.7, 1.4 + p * 1.1, 0.3);
      s.material.opacity = 1 - p;
    });
    question.visible = mood === 'confused' || mood === 'curious';
    if (question.visible) question.position.y = 1.85 + Math.sin(t * 3) * 0.05;
    thinkDots.forEach((d, i) => {
      d.visible = mood === 'thinking';
      d.scale.setScalar(0.8 + Math.max(0, Math.sin(t * 5 - i)) * 0.3);
    });

    // ambiente
    if (!still) {
      clouds.rotation.y += dt * 0.01;
      falling.forEach((l) => {
        const u = l.userData;
        l.position.y -= u.speed * dt;
        l.position.x += Math.sin(t + u.phase) * dt * 0.25;
        l.rotation.set(t * u.spin, t * u.spin * 0.7, Math.sin(t + u.phase));
        if (l.position.y < 0.05) resetLeaf(l, false);
      });
      pondMat.color.setHSL(0.55, 0.55, 0.62 + Math.sin(t * 1.3) * 0.03);
      butterflies.forEach((b) => {
        const u = b.userData;
        const a = t * 0.45 + u.phase;
        b.position.set(Math.cos(a) * u.radius, u.height + Math.sin(a * 2.3) * 0.3, Math.sin(a) * u.radius * 0.8);
        b.rotation.y = -a;
        const flap = Math.sin(t * 14 + u.phase) * 0.9;
        u.l.rotation.y = flap;
        u.r.rotation.y = -flap;
      });
      if (fireflies.visible) {
        const p = fireflies.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const a = t * 0.3 + i * 1.3;
          p.setXYZ(i, Math.cos(a + i) * (1.5 + (i % 5)), 0.6 + ((i * 0.37) % 2.5) + Math.sin(t + i) * 0.25, Math.sin(a * 0.8 + i) * (1.5 + (i % 4)));
        }
        p.needsUpdate = true;
      }
    }
    flowers.forEach((f) => {
      if (f.userData.grow < 1) {
        f.userData.grow = Math.min(1, f.userData.grow + dt * 1.5);
        const g = f.userData.grow;
        f.scale.setScalar(Math.max(0.01, g < 0.7 ? g * 1.6 : 1.12 - (g - 0.7) * 0.4));
      }
    });

    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);

  window.KoaWorld = {
    setGrowth,
    setFull,
    /** força 'day' | 'sunset' | 'night' (ou null para seguir o relógio) */
    setPhase(p) {
      forcedPhase = PHASES[p] ? p : null;
      phase = null;
      updatePhase();
    },
    get learned() { return learnedCount; },
    /** para depuração */
    get state() { return { view: { ...view }, cam: camera.position.toArray(), quality, full, life: { mode: life.mode, activity: life.activity, pos: koala.position.toArray().map((v) => +v.toFixed(2)) } }; },
    /** faz o Koa sair para passear agora (para testar) */
    wander() {
      lastTalk = -1e9;
      life.timer = 0;
    },
  };
}
