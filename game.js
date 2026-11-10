/* Voxel Frontier — мини-песочница в духе Dual Universe.
   Работает офлайн: откройте index.html двойным кликом. */
(() => {
'use strict';

// ============================================================
//  Утилиты
// ============================================================
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const keyOf = (x, y, z) => x + ',' + y + ',' + z;
const approach = (cur, target, delta) =>
  cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
//  DOM
// ============================================================
const canvas = $('game');
const overlay = $('overlay');
const playBtn = $('playBtn');
const resetBtn = $('resetBtn');
const hotbarEl = $('hotbar');
const crystalEl = $('crystalCount');
const blockEl = $('blockCount');
const modeEl = $('modeLabel');
const promptEl = $('prompt');
const toastEl = $('toast');
const inventoryEl = $('inventory');
const invGridEl = $('invGrid');
const invCloseEl = $('invClose');
const invSelectedEl = $('invSelected');

// ============================================================
//  Блоки
// ============================================================
const TYPES = {
  grass:   { name: 'Трава',     color: 0x4c9a42 },
  dirt:    { name: 'Земля',     color: 0x7d5a41 },
  stone:   { name: 'Камень',    color: 0x87909c },
  metal:   { name: 'Металл',    color: 0x7f94aa },
  pad:     { name: 'Плита',     color: 0x46566a },
  gold:    { name: 'Золото',    color: 0xffc63c },
  glass:   { name: 'Стекло',    color: 0x66ccee, opacity: 0.42 },
  crystal: { name: 'Кристалл',  color: 0x2ee6b0, emissive: 0x0f9c72, emissiveIntensity: 0.7 },
  hull:    { name: 'Корпус',    color: 0x56687d },
  engine:  { name: 'Двигатель', color: 0xff8a3d, emissive: 0xff4d00, emissiveIntensity: 0.6 },
  accent:  { name: 'Акцент',    color: 0x00d5ff, emissive: 0x00a6cc, emissiveIntensity: 0.7 },
  wood:    { name: 'Дерево',    color: 0x6b4a2f },
  leaves:  { name: 'Листва',    color: 0x3f8f3a },
};
const HOTBAR = ['grass', 'stone', 'metal', 'gold', 'glass', 'crystal'];
const INVENTORY_ORDER = [
  'grass', 'dirt', 'stone', 'wood', 'leaves',
  'metal', 'gold', 'glass', 'crystal', 'pad',
  'hull', 'engine', 'accent',
];
const START_INVENTORY = {
  grass: 128, dirt: 128, stone: 128,
  metal: 128, gold: 64, glass: 64, crystal: 32,
};
const inventory = Object.create(null);
function initInventory() {
  for (const id of Object.keys(TYPES)) inventory[id] = 0;
  Object.assign(inventory, START_INVENTORY);
}
initInventory();

const BOX = new THREE.BoxGeometry(1, 1, 1);
const toLin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

// ============================================================
//  Процедурные текстуры блоков (атлас: верх / бок / низ)
// ============================================================
const TILE = 16;
const ATLAS_TILES = 4;

const PALETTE = {
  grass:   { base: 0x4f9c43, dark: 0x39702f, light: 0x6fbe59, dirt: 0x6b4c34 },
  dirt:    { base: 0x6b4c34, dark: 0x523826, light: 0x84613f },
  stone:   { base: 0x89929d, dark: 0x6a737f, light: 0xa2abb6 },
  metal:   { base: 0x7f94aa, dark: 0x5b6e82, light: 0xacbfd2 },
  pad:     { base: 0x46566a, dark: 0x334254, light: 0x5c6f85 },
  gold:    { base: 0xe8b52e, dark: 0xb28419, light: 0xffda6a },
  glass:   { base: 0x9fdcf0, dark: 0x5da4be, light: 0xeafcff },
  crystal: { base: 0x2ee6b0, dark: 0x148f6d, light: 0x9dffe0 },
  hull:    { base: 0x56687d, dark: 0x3d4d60, light: 0x74889f },
  engine:  { base: 0xff8a3d, dark: 0x8f330a, light: 0xffc46a },
  accent:  { base: 0x00d5ff, dark: 0x007d9c, light: 0xc6f8ff },
  wood:    { base: 0x6b4a2f, dark: 0x4a301c, light: 0x8a623d },
  leaves:  { base: 0x3f8f3a, dark: 0x2b6b2a, light: 0x5fb84f },
};

function rgbStr(r, g, b) {
  return 'rgb(' + clamp(Math.round(r), 0, 255) + ',' +
    clamp(Math.round(g), 0, 255) + ',' + clamp(Math.round(b), 0, 255) + ')';
}

function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return rgbStr(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function fillNoise(ctx, ox, oy, base, rng, amt) {
  const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const k = 1 + (rng() * 2 - 1) * amt;
      ctx.fillStyle = rgbStr(r * k, g * k, b * k);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function borderShade(ctx, ox, oy, alpha) {
  ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
  ctx.fillRect(ox, oy, TILE, 1);
  ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
  ctx.fillRect(ox, oy, 1, TILE);
  ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
}

function drawGrassTop(ctx, ox, oy, rng) {
  const p = PALETTE.grass;
  fillNoise(ctx, ox, oy, p.base, rng, 0.09);
  for (let i = 0; i < 5; i++) {
    px(ctx, ox + 1 + Math.floor(rng() * 14), oy + 1 + Math.floor(rng() * 14),
      mixHex(p.base, rng() < 0.5 ? p.light : p.dark, 0.45));
  }
  if (rng() < 0.3) {
    px(ctx, ox + 2 + Math.floor(rng() * 12), oy + 2 + Math.floor(rng() * 12),
      mixHex(p.base, p.light, 0.45));
  }
  borderShade(ctx, ox, oy, 0.10);
}

function drawGrassSide(ctx, ox, oy, rng) {
  const p = PALETTE.grass;
  fillNoise(ctx, ox, oy, p.dirt, rng, 0.10);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + Math.floor(rng() * 3);
    for (let y = 0; y < h; y++) {
      px(ctx, ox + x, oy + y,
        mixHex(p.base, rng() < 0.5 ? p.light : p.dark, 0.35 + rng() * 0.4));
    }
  }
  borderShade(ctx, ox, oy, 0.14);
}

function drawDirt(ctx, ox, oy, rng) {
  const p = PALETTE.dirt;
  fillNoise(ctx, ox, oy, p.base, rng, 0.11);
  for (let i = 0; i < 3; i++) {
    px(ctx, ox + 2 + Math.floor(rng() * 12), oy + 2 + Math.floor(rng() * 12),
      mixHex(p.dark, p.light, rng() * 0.4));
  }
  borderShade(ctx, ox, oy, 0.13);
}

function drawStone(ctx, ox, oy, rng) {
  const p = PALETTE.stone;
  fillNoise(ctx, ox, oy, p.base, rng, 0.10);
  for (let c = 0; c < 2; c++) {
    let x = 2 + Math.floor(rng() * 11);
    let y = 2 + Math.floor(rng() * 11);
    for (let s = 0; s < 4; s++) {
      px(ctx, ox + x, oy + y, mixHex(p.dark, p.base, 0.25));
      x = clamp(x + (rng() < 0.5 ? 1 : -1), 2, 13);
      y = clamp(y + (rng() < 0.75 ? 1 : 0), 2, 13);
    }
  }
  borderShade(ctx, ox, oy, 0.12);
}

function drawMetal(ctx, ox, oy, rng) {
  const p = PALETTE.metal;
  fillNoise(ctx, ox, oy, p.base, rng, 0.06);
  ctx.fillStyle = mixHex(p.dark, p.base, 0.2);
  ctx.fillRect(ox + 1, oy + 5, TILE - 2, 1);
  ctx.fillRect(ox + 1, oy + 11, TILE - 2, 1);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
    px(ctx, ox + x, oy + y, mixHex(p.light, 0xffffff, 0.35));
  }
  borderShade(ctx, ox, oy, 0.16);
}

function drawGold(ctx, ox, oy, rng) {
  const p = PALETTE.gold;
  fillNoise(ctx, ox, oy, p.base, rng, 0.08);
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(rng() * 9);
    const y = 2 + Math.floor(rng() * 8);
    for (let s = 0; s < 4; s++) {
      px(ctx, ox + x + s, oy + y + s, mixHex(p.light, 0xffffff, 0.25));
    }
  }
  borderShade(ctx, ox, oy, 0.15);
}

function drawGlass(ctx, ox, oy, rng) {
  const p = PALETTE.glass;
  fillNoise(ctx, ox, oy, p.base, rng, 0.04);
  for (let i = 0; i < 10; i++) {
    px(ctx, ox + 3 + i, oy + 12 - i, mixHex(p.light, 0xffffff, 0.5));
    if (i % 3 === 0) px(ctx, ox + 4 + i, oy + 12 - i, mixHex(p.light, 0xffffff, 0.2));
  }
  borderShade(ctx, ox, oy, 0.22);
}

function drawCrystal(ctx, ox, oy, rng) {
  const p = PALETTE.crystal;
  fillNoise(ctx, ox, oy, p.base, rng, 0.10);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(ox + 8, oy + 1);
  ctx.lineTo(ox + 15, oy + 14);
  ctx.lineTo(ox + 1, oy + 14);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    px(ctx, ox + 8 - i, oy + 4 + i, mixHex(p.light, 0xffffff, 0.35));
  }
  for (let i = 0; i < 5; i++) {
    px(ctx, ox + 9 + i, oy + 9 + Math.floor(i / 2), mixHex(p.dark, p.base, 0.3));
  }
  borderShade(ctx, ox, oy, 0.18);
}

function drawPadTop(ctx, ox, oy, rng) {
  const p = PALETTE.pad;
  fillNoise(ctx, ox, oy, p.base, rng, 0.05);
  ctx.fillStyle = mixHex(p.dark, p.base, 0.15);
  ctx.fillRect(ox, oy + 8, TILE, 1);
  ctx.fillRect(ox + 8, oy, 1, TILE);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
    px(ctx, ox + x, oy + y, mixHex(p.light, 0xffffff, 0.15));
  }
  borderShade(ctx, ox, oy, 0.18);
}

function drawPadSide(ctx, ox, oy, rng) {
  const p = PALETTE.pad;
  fillNoise(ctx, ox, oy, p.base, rng, 0.05);
  ctx.fillStyle = mixHex(p.dark, p.base, 0.15);
  ctx.fillRect(ox + 1, oy + 8, TILE - 2, 1);
  borderShade(ctx, ox, oy, 0.18);
}

function drawHull(ctx, ox, oy, rng) {
  const p = PALETTE.hull;
  fillNoise(ctx, ox, oy, p.base, rng, 0.06);
  ctx.fillStyle = mixHex(p.dark, p.base, 0.2);
  ctx.fillRect(ox + 1, oy + 6, TILE - 2, 1);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
    px(ctx, ox + x, oy + y, mixHex(p.light, 0xffffff, 0.2));
  }
  borderShade(ctx, ox, oy, 0.16);
}

function drawEngine(ctx, ox, oy) {
  const p = PALETTE.engine;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 10.5;
      const t = clamp(1 - d, 0, 1);
      ctx.fillStyle = mixHex(p.dark, p.light, t * t * 1.05);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  borderShade(ctx, ox, oy, 0.3);
}

function drawAccent(ctx, ox, oy, rng) {
  const p = PALETTE.accent;
  fillNoise(ctx, ox, oy, p.base, rng, 0.05);
  ctx.fillStyle = mixHex(p.light, 0xffffff, 0.4);
  ctx.fillRect(ox + 1, oy + 7, TILE - 2, 2);
  borderShade(ctx, ox, oy, 0.25);
}

function drawWoodTop(ctx, ox, oy, rng) {
  const p = PALETTE.wood;
  fillNoise(ctx, ox, oy, p.base, rng, 0.07);
  ctx.strokeStyle = mixHex(p.dark, p.base, 0.3);
  ctx.lineWidth = 1;
  for (let r = 2; r <= 7; r += 2) {
    ctx.beginPath();
    ctx.arc(ox + 8, oy + 8, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  px(ctx, ox + 8, oy + 8, mixHex(p.dark, 0x000000, 0.2));
  borderShade(ctx, ox, oy, 0.15);
}

function drawWoodSide(ctx, ox, oy, rng) {
  const p = PALETTE.wood;
  fillNoise(ctx, ox, oy, p.base, rng, 0.08);
  for (let x = 1; x < TILE; x += 3) {
    const y0 = Math.floor(rng() * 4);
    const h = 8 + Math.floor(rng() * 7);
    for (let y = y0; y < y0 + h && y < TILE; y++) {
      px(ctx, ox + x, oy + y, mixHex(p.dark, p.base, 0.3 + rng() * 0.3));
    }
  }
  borderShade(ctx, ox, oy, 0.18);
}

function drawLeaves(ctx, ox, oy, rng) {
  const p = PALETTE.leaves;
  fillNoise(ctx, ox, oy, p.base, rng, 0.14);
  for (let i = 0; i < 18; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 1 + Math.floor(rng() * 14);
    px(ctx, ox + x, oy + y, mixHex(p.base, rng() < 0.5 ? p.light : p.dark, 0.55));
  }
  for (let i = 0; i < 6; i++) {
    const x = 2 + Math.floor(rng() * 12);
    const y = 2 + Math.floor(rng() * 12);
    px(ctx, ox + x, oy + y, mixHex(p.light, 0xffffff, 0.2));
    px(ctx, ox + x + 1, oy + y, mixHex(p.dark, p.base, 0.2));
  }
  borderShade(ctx, ox, oy, 0.12);
}

function drawTiles(ctx, type, rng) {
  const three = (fn) => {
    for (let i = 0; i < 3; i++) fn(ctx, i * TILE, 0, rng);
  };
  switch (type) {
    case 'grass':
      drawGrassTop(ctx, 0, 0, rng);
      drawGrassSide(ctx, TILE, 0, rng);
      drawDirt(ctx, TILE * 2, 0, rng);
      break;
    case 'dirt': three(drawDirt); break;
    case 'stone': three(drawStone); break;
    case 'metal': three(drawMetal); break;
    case 'gold': three(drawGold); break;
    case 'glass': three(drawGlass); break;
    case 'crystal': three(drawCrystal); break;
    case 'pad':
      drawPadTop(ctx, 0, 0, rng);
      drawPadSide(ctx, TILE, 0, rng);
      drawPadSide(ctx, TILE * 2, 0, rng);
      break;
    case 'hull': three(drawHull); break;
    case 'engine':
      for (let i = 0; i < 3; i++) drawEngine(ctx, i * TILE, 0);
      break;
    case 'accent': three(drawAccent); break;
    case 'wood':
      drawWoodTop(ctx, 0, 0, rng);
      drawWoodSide(ctx, TILE, 0, rng);
      drawWoodTop(ctx, TILE * 2, 0, rng);
      break;
    case 'leaves': three(drawLeaves); break;
  }
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeBlockTexture(type) {
  const c = document.createElement('canvas');
  c.width = TILE * ATLAS_TILES;
  c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rng = mulberry32(hashStr(type) ^ 0x9e3779b9);
  drawTiles(ctx, type, rng);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

// UV-разметка: верхняя грань — тайл 0, боковые — 1, нижняя — 2
function makeBlockGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv;
  const faceTiles = [1, 1, 0, 2, 1, 1]; // +x, -x, +y, -y, +z, -z
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setX(idx, (faceTiles[f] + uv.getX(idx)) / ATLAS_TILES);
    }
  }
  uv.needsUpdate = true;
  return g;
}
const BLOCK_GEO = makeBlockGeometry();

const SHINY = {
  metal:  { specular: 0x9db8d4, shininess: 46 },
  gold:   { specular: 0xffe08a, shininess: 64 },
  glass:  { specular: 0xc8f2ff, shininess: 120 },
  hull:   { specular: 0x7e9cbc, shininess: 34 },
  pad:    { specular: 0x6f8aa8, shininess: 26 },
  accent: { specular: 0x8ff4ff, shininess: 90 },
};

const MATS = {};
for (const id of Object.keys(TYPES)) {
  const t = TYPES[id];
  const tex = makeBlockTexture(id);
  const params = {
    map: tex,
    color: 0xffffff,
    transparent: t.opacity !== undefined,
    opacity: t.opacity !== undefined ? t.opacity : 1,
  };
  if (t.emissive !== undefined) {
    params.emissive = 0xffffff;
    params.emissiveMap = tex;
    params.emissiveIntensity = t.emissiveIntensity !== undefined ? t.emissiveIntensity : 1;
  }
  if (id !== 'glass' && id !== 'crystal' && id !== 'engine' && id !== 'accent') {
    params.bumpMap = tex;
    params.bumpScale = 0.025;
  }
  if (SHINY[id]) {
    params.specular = toLin(SHINY[id].specular);
    params.shininess = SHINY[id].shininess;
    MATS[id] = new THREE.MeshPhongMaterial(params);
  } else {
    MATS[id] = new THREE.MeshLambertMaterial(params);
  }
}

// ============================================================
//  Сцена
// ============================================================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(toLin(0x9fc7d9), 85, 230);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.rotation.order = 'YXZ';

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(600, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x0a1c44) },
      midColor: { value: new THREE.Color(0x3f7fbe) },
      botColor: { value: new THREE.Color(0x9fc7d9) },
      horizonColor: { value: new THREE.Color(0xffd39a) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 botColor;
      uniform vec3 horizonColor;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0
          ? mix(midColor, topColor, pow(h, 0.6))
          : mix(midColor, botColor, pow(-h, 0.5));
        float band = exp(-abs(h) * 16.0);
        c = mix(c, horizonColor, band * 0.42);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  })
);
sky.frustumCulled = false;
scene.add(sky);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(16, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff2b8, fog: false })
);
sun.position.set(220, 140, -320);
scene.add(sun);

// ---------- Ореол солнца и свечения ----------
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();

const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex,
  color: 0xffe3a0,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
}));
sunGlow.scale.set(95, 95, 1);
sunGlow.position.copy(sun.position);
scene.add(sunGlow);

const crystalGlows = new Map();
function addCrystalGlow(x, y, z) {
  const k = keyOf(x, y, z);
  if (crystalGlows.has(k)) return;
  const mat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0x54ffcf,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.position.set(x + 0.5, y + 0.5, z + 0.5);
  sp.scale.set(1.6, 1.6, 1);
  scene.add(sp);
  crystalGlows.set(k, sp);
}
function removeCrystalGlow(k) {
  const sp = crystalGlows.get(k);
  if (!sp) return;
  scene.remove(sp);
  sp.material.dispose();
  crystalGlows.delete(k);
}

const hemi = new THREE.HemisphereLight(0xd8ecff, 0x22303c, 0.75);
scene.add(hemi);

const dirLight = new THREE.DirectionalLight(0xfff1d0, 0.9);
dirLight.position.set(60, 110, 40);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -55;
dirLight.shadow.camera.right = 55;
dirLight.shadow.camera.top = 55;
dirLight.shadow.camera.bottom = -55;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 300;
scene.add(dirLight);
scene.add(dirLight.target);

const fillLight = new THREE.DirectionalLight(0x88bbff, 0.35);
fillLight.position.set(-70, 45, -90);
scene.add(fillLight);

// ---------- Вода ----------
function makeWaterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1d5b78';
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(424242);
  for (let i = 0; i < 70; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const len = 8 + rng() * 30;
    ctx.strokeStyle = 'rgba(130,210,235,' + (0.05 + rng() * 0.09).toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + (rng() * 2 - 1) * 3, x + len, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}
const waterTex = makeWaterTexture();
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800),
  new THREE.MeshPhongMaterial({
    map: waterTex,
    bumpMap: waterTex,
    bumpScale: 0.1,
    specular: toLin(0x4f8fa8),
    shininess: 60,
  })
);
water.rotation.x = -Math.PI / 2;
water.position.y = -2.6;
water.receiveShadow = true;
scene.add(water);

// Дальние острова убраны: на горизонте остаётся чистое море без парящих силуэтов.

// ---------- Облака ----------
function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const rng = mulberry32(20261111);
  ctx.clearRect(0, 0, 256, 256);
  // мягкая основа облака
  const base = ctx.createRadialGradient(128, 136, 10, 128, 136, 104);
  base.addColorStop(0, 'rgba(255,255,255,0.46)');
  base.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  base.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // округлые пушистые клубы
  for (let i = 0; i < 34; i++) {
    const x = 58 + rng() * 140;
    const y = 82 + rng() * 92;
    const r = 10 + rng() * 28;
    const a = 0.14 + rng() * 0.22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(255,255,255,' + (a * 0.6).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Растворяем края, чтобы не было видно прямоугольник спрайта
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(128, 128, 20, 128, 128, 124);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.72, 'rgba(0,0,0,0.95)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

const cloudTex = makeCloudTexture();
const cloudMat = new THREE.SpriteMaterial({
  map: cloudTex,
  color: 0xffffff,
  transparent: true,
  opacity: 0.84,
  depthWrite: false,
  fog: true,
});
const clouds = [];
{
  const rng = mulberry32(90210);
  for (let c = 0; c < 9; c++) {
    const cloud = {
      speed: 0.35 + rng() * 0.7,
      sprites: [],
    };
    const cx = (rng() * 2 - 1) * 95;
    const cy = 34 + rng() * 14;
    const cz = (rng() * 2 - 1) * 95;
    const puffs = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < puffs; i++) {
      const sp = new THREE.Sprite(cloudMat);
      const sx = 18 + rng() * 28;
      const sy = sx * (0.42 + rng() * 0.18);
      sp.scale.set(sx, sy, 1);
      sp.position.set(
        cx + (rng() * 2 - 1) * 16,
        cy + (rng() * 2 - 1) * 2.4,
        cz + (rng() * 2 - 1) * 9
      );
      scene.add(sp);
      cloud.sprites.push(sp);
    }
    clouds.push(cloud);
  }
}
function updateClouds(dt) {
  for (const c of clouds) {
    for (const sp of c.sprites) {
      sp.position.x += c.speed * dt;
      if (sp.position.x > 130) sp.position.x = -130;
    }
  }
}
updateClouds(0);

// ---------- Пылинки в воздухе ----------
const DUST_COUNT = 240;
const dustPositions = new Float32Array(DUST_COUNT * 3);
const dustVel = new Float32Array(DUST_COUNT * 3);
{
  const rng = mulberry32(1337);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (rng() * 2 - 1) * 30;
    dustPositions[i * 3 + 1] = rng() * 22;
    dustPositions[i * 3 + 2] = (rng() * 2 - 1) * 30;
    dustVel[i * 3] = (rng() * 2 - 1) * 0.25;
    dustVel[i * 3 + 1] = 0.05 + rng() * 0.2;
    dustVel[i * 3 + 2] = (rng() * 2 - 1) * 0.25;
  }
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  map: glowTex,
  color: toLin(0xaad8ff),
  size: 0.09,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
dust.frustumCulled = false;
scene.add(dust);

function updateDust(dt) {
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  for (let i = 0; i < DUST_COUNT; i++) {
    let x = dustPositions[i * 3] + dustVel[i * 3] * dt;
    let y = dustPositions[i * 3 + 1] + dustVel[i * 3 + 1] * dt;
    let z = dustPositions[i * 3 + 2] + dustVel[i * 3 + 2] * dt;
    if (x - cx > 32) x -= 64; else if (cx - x > 32) x += 64;
    if (z - cz > 32) z -= 64; else if (cz - z > 32) z += 64;
    if (y - cy > 18) y -= 36; else if (cy - y > 18) y += 36;
    dustPositions[i * 3] = x;
    dustPositions[i * 3 + 1] = y;
    dustPositions[i * 3 + 2] = z;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// ---------- Частицы от блоков ----------
const BURST_COUNT = 160;
const burstPositions = new Float32Array(BURST_COUNT * 3);
const burstColors = new Float32Array(BURST_COUNT * 3);
const burstVelocities = new Float32Array(BURST_COUNT * 3);
const burstLife = new Float32Array(BURST_COUNT);
for (let i = 0; i < BURST_COUNT; i++) burstPositions[i * 3 + 1] = -9999;
const burstGeo = new THREE.BufferGeometry();
burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
burstGeo.setAttribute('color', new THREE.BufferAttribute(burstColors, 3));
const burst = new THREE.Points(burstGeo, new THREE.PointsMaterial({
  map: glowTex,
  vertexColors: true,
  size: 0.16,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
burst.frustumCulled = false;
scene.add(burst);
let burstCursor = 0;

function spawnBurst(x, y, z, colorHex, count) {
  const col = new THREE.Color(colorHex).convertSRGBToLinear();
  for (let n = 0; n < count; n++) {
    const i = burstCursor;
    burstCursor = (burstCursor + 1) % BURST_COUNT;
    burstPositions[i * 3] = x + (Math.random() - 0.5) * 0.7;
    burstPositions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.7;
    burstPositions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.7;
    burstVelocities[i * 3] = (Math.random() - 0.5) * 3.2;
    burstVelocities[i * 3 + 1] = 1.2 + Math.random() * 2.6;
    burstVelocities[i * 3 + 2] = (Math.random() - 0.5) * 3.2;
    burstLife[i] = 0.45 + Math.random() * 0.35;
    burstColors[i * 3] = col.r;
    burstColors[i * 3 + 1] = col.g;
    burstColors[i * 3 + 2] = col.b;
  }
  burstGeo.attributes.position.needsUpdate = true;
  burstGeo.attributes.color.needsUpdate = true;
}

function updateBurst(dt) {
  let changed = false;
  for (let i = 0; i < BURST_COUNT; i++) {
    if (burstLife[i] <= 0) continue;
    burstLife[i] -= dt;
    if (burstLife[i] <= 0) {
      burstPositions[i * 3 + 1] = -9999;
      changed = true;
      continue;
    }
    burstVelocities[i * 3 + 1] -= 13 * dt;
    burstPositions[i * 3] += burstVelocities[i * 3] * dt;
    burstPositions[i * 3 + 1] += burstVelocities[i * 3 + 1] * dt;
    burstPositions[i * 3 + 2] += burstVelocities[i * 3 + 2] * dt;
    changed = true;
  }
  if (changed) burstGeo.attributes.position.needsUpdate = true;
}

// ============================================================
//  Воксельный мир
// ============================================================
const world = new Map();       // "x,y,z" -> тип
const byType = {};             // тип -> [{x,y,z}]
for (const id of Object.keys(TYPES)) byType[id] = [];
const index = new Map();       // "x,y,z" -> { type, i }
const typeMeshes = {};         // тип -> InstancedMesh
const worldMeshes = [];        // для raycast
const dirtyTypes = new Set();

function addVoxel(x, y, z, type, silent) {
  const k = keyOf(x, y, z);
  if (world.has(k)) return false;
  world.set(k, type);
  const arr = byType[type];
  arr.push({ x, y, z });
  index.set(k, { type, i: arr.length - 1 });
  if (!silent) dirtyTypes.add(type);
  return true;
}

function removeVoxelAt(x, y, z, silent) {
  const k = keyOf(x, y, z);
  const rec = index.get(k);
  if (!rec) return false;
  const arr = byType[rec.type];
  const last = arr.pop();
  if (rec.i < arr.length) {
    arr[rec.i] = last;
    index.set(keyOf(last.x, last.y, last.z), { type: rec.type, i: rec.i });
  }
  index.delete(k);
  world.delete(k);
  if (!silent) dirtyTypes.add(rec.type);
  return true;
}

function rebuildType(type) {
  const old = typeMeshes[type];
  if (old) {
    scene.remove(old);
    if (old.dispose) old.dispose();
    delete typeMeshes[type];
  }
  const arr = byType[type];
  if (!arr.length) return;

  const mesh = new THREE.InstancedMesh(BLOCK_GEO, MATS[type], arr.length);
  const m = new THREE.Matrix4();
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    m.makeTranslation(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = type !== 'glass';
  mesh.receiveShadow = true;
  mesh.userData.type = type;
  typeMeshes[type] = mesh;
  scene.add(mesh);
}

function refreshWorldMeshes() {
  worldMeshes.length = 0;
  for (const m of Object.values(typeMeshes)) worldMeshes.push(m);
}

function rebuildAll() {
  for (const id of Object.keys(TYPES)) rebuildType(id);
  refreshWorldMeshes();
}

// ============================================================
//  Генерация мира
// ============================================================
const naturalCrystals = new Set();

function heightAt(x, z) {
  let h = 4
    + 2.4 * Math.sin(x * 0.16) * Math.cos(z * 0.14)
    + 1.6 * Math.sin(x * 0.06 + z * 0.09)
    + 0.9 * Math.sin(x * 0.31 + 1.7) * Math.sin(z * 0.27 + 0.4);
  const d = Math.hypot(x, z);
  const t = clamp(1 - (d - 14) / 6, 0, 1); // ровная площадка в центре
  h = h * (1 - t) + 4 * t;
  return Math.floor(h);
}

function addTree(x, z, rng) {
  const ground = heightAt(x, z);
  if (world.get(keyOf(x, ground, z)) !== 'grass') return false;
  const baseY = ground + 1;
  const trunkH = 3 + Math.floor(rng() * 2);
  for (let y = 0; y < trunkH + 2; y++) {
    if (world.has(keyOf(x, baseY + y, z))) return false;
  }
  for (let dy = 0; dy < trunkH; dy++) {
    addVoxel(x, baseY + dy, z, 'wood', true);
  }
  const top = baseY + trunkH;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
        if (dist > 3) continue;
        addVoxel(x + dx, top + dy, z + dz, 'leaves', true);
      }
    }
  }
  addVoxel(x, top + 2, z, 'leaves', true);
  return true;
}

function generateWorld() {
  // Поверхность планеты
  for (let x = -32; x < 32; x++) {
    for (let z = -32; z < 32; z++) {
      const h = heightAt(x, z);
      for (let y = h; y >= h - 2; y--) {
        addVoxel(x, y, z, y === h ? 'grass' : (y === h - 1 ? 'dirt' : 'stone'), true);
      }
    }
  }

  // Стартовая площадка
  for (let x = -4; x <= 4; x++) {
    for (let z = 4; z <= 14; z++) {
      removeVoxelAt(x, 4, z, true);
      addVoxel(x, 4, z, 'pad', true);
    }
  }
  for (const [x, z] of [[-4, 4], [4, 4], [-4, 14], [4, 14]]) {
    removeVoxelAt(x, 4, z, true);
    addVoxel(x, 4, z, 'accent', true);
  }

  // Деревья
  const treeRng = mulberry32(777001);
  let trees = 0;
  let treeAttempts = 0;
  while (trees < 14 && treeAttempts < 400) {
    treeAttempts++;
    const x = Math.floor((treeRng() * 2 - 1) * 29);
    const z = Math.floor((treeRng() * 2 - 1) * 29);
    const d = Math.hypot(x, z);
    if (d < 15 || d > 29) continue;
    if (x >= -5 && x <= 5 && z >= 2 && z <= 16) continue;
    if (Math.hypot(x, z - 12) < 8) continue;
    if (addTree(x, z, treeRng)) trees++;
  }

  // Кристаллы на поверхности
  const rng = mulberry32(20261110);
  let attempts = 0;
  let placed = 0;
  while (placed < 40 && attempts < 800) {
    attempts++;
    const x = Math.floor((rng() * 2 - 1) * 29);
    const z = Math.floor((rng() * 2 - 1) * 29);
    const d = Math.hypot(x, z);
    if (d < 16 || d > 30) continue;
    const y = heightAt(x, z) + 1;
    const k = keyOf(x, y, z);
    if (world.has(k)) continue;
    if (addVoxel(x, y, z, 'crystal', true)) {
      naturalCrystals.add(k);
      placed++;
    }
  }
}

// ============================================================
//  Корабль
// ============================================================
const ship = new THREE.Group();
ship.rotation.order = 'YXZ';
const engineGlows = [];
const engineCores = [];

function buildShip() {
  const vox = new Map();
  const SHIP_VOXEL = 0.5;      // корабль собран из вокселей 0,5 м
  const LIFT = 1;              // приподнимаем корпус над шасси

  const putRaw = (x, y, z, t) => vox.set(keyOf(x, y, z), { x, y, z, t });
  const put = (x, y, z, t) => putRaw(x, y + LIFT, z, t);
  const box = (x0, x1, y0, y1, z0, z1, t) => {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    for (let x = xa; x <= xb; x++)
      for (let y = ya; y <= yb; y++)
        for (let z = za; z <= zb; z++) put(x, y, z, t);
  };
  const gearPut = (x, y, z, t) => putRaw(x, y, z, t);
  const gearBox = (x0, x1, y0, y1, z0, z1, t) => {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    for (let x = xa; x <= xb; x++)
      for (let y = ya; y <= yb; y++)
        for (let z = za; z <= zb; z++) gearPut(x, y, z, t);
  };

  // ---- Корпус ----
  box(-1, 1, 1, 1, -5, 4, 'metal');       // металлическое брюхо
  box(-2, 2, 2, 2, -6, 5, 'hull');        // нижний корпус
  box(-2, 2, 3, 3, -6, 4, 'metal');       // верхняя палуба
  // Ступенчатый нос
  box(-2, 2, 1, 2, -7, -7, 'hull');
  box(-1, 1, 1, 2, -8, -8, 'hull');
  box(-1, 1, 1, 1, -9, -9, 'hull');
  put(0, 1, -10, 'hull');
  put(0, 2, -8, 'accent');                // носовой огонь
  put(-1, 2, -8, 'gold');
  put(1, 2, -8, 'gold');
  // ---- Кабина ----
  box(-2, 2, 3, 3, -7, -7, 'metal');      // опора лобового стекла
  box(-2, 2, 4, 4, -6, -3, 'metal');      // основание фонаря
  box(-2, 2, 5, 5, -6, -3, 'glass');      // стекло
  box(-1, 1, 4, 5, -7, -7, 'glass');      // лобовое стекло
  box(-1, 1, 6, 6, -5, -3, 'metal');      // крыша
  put(-2, 4, -7, 'metal');                // передние стойки
  put(2, 4, -7, 'metal');
  put(-2, 5, -7, 'metal');
  put(2, 5, -7, 'metal');
  put(-2, 5, -6, 'metal');                // боковые стойки
  put(2, 5, -6, 'metal');
  put(-2, 5, -3, 'metal');
  put(2, 5, -3, 'metal');
  put(-2, 4, -4, 'gold');                 // золотая окантовка
  put(2, 4, -4, 'gold');
  // ---- Дорсальный гребень ----
  box(-1, 1, 4, 4, -2, 4, 'hull');
  box(-1, 1, 5, 5, 0, 4, 'metal');
  box(0, 0, 6, 6, 1, 3, 'gold');
  // ---- Хвостовой киль ----
  box(-1, 1, 4, 6, 5, 6, 'hull');
  box(-1, 1, 5, 7, 7, 7, 'hull');
  put(0, 7, 6, 'gold');
  put(0, 8, 7, 'accent');
  // ---- Горизонтальные стабилизаторы ----
  box(-3, 3, 4, 4, 7, 8, 'metal');
  box(-2, 2, 4, 4, 9, 9, 'metal');
  put(-3, 4, 8, 'accent');
  put(3, 4, 8, 'accent');
  // ---- Задняя переборка ----
  box(-2, 2, 1, 3, 5, 5, 'hull');
  put(0, 2, 5, 'gold');
  // ---- Крылья ----
  for (const s of [-1, 1]) {
    box(s * 3, s * 3, 2, 3, -2, 5, 'hull');   // корневая часть
    box(s * 4, s * 4, 2, 2, -3, 5, 'hull');
    box(s * 5, s * 5, 2, 2, -2, 5, 'hull');
    box(s * 6, s * 6, 2, 2, -1, 5, 'hull');
    box(s * 7, s * 7, 2, 2, 0, 5, 'hull');
    box(s * 8, s * 8, 2, 2, 1, 5, 'metal');   // законцовка
    box(s * 8, s * 8, 3, 4, 3, 4, 'hull');    // винглет
    put(s * 8, 4, 3, 'accent');               // огонь на винглете
    for (let z = 1; z <= 4; z++) put(s * 6, 2, z, 'gold'); // золотая полоса
    put(s * 8, 2, 1, 'accent');               // огни на законцовке
    put(s * 8, 2, 5, 'accent');
  }
  // ---- Гондолы двигателей ----
  for (const s of [-1, 1]) {
    box(s * 4, s * 6, 1, 3, 4, 8, 'hull');    // корпус гондолы
    box(s * 4, s * 6, 1, 3, 4, 4, 'metal');   // воздухозаборник
    box(s * 4, s * 6, 1, 3, 8, 8, 'metal');   // сопло
    put(s * 4, 3, 8, 'gold');                 // золотая окантовка
    put(s * 6, 3, 8, 'gold');
  }
  // ---- Шасси ----
  for (const s of [-1, 1]) {
    gearPut(s * 2, 0, -4, 'metal');
    gearPut(s * 2, 1, -4, 'metal');
    gearPut(s * 2, 0, 3, 'metal');
    gearPut(s * 2, 1, 3, 'metal');
    gearBox(s * 2, s * 3, 0, 0, -5, -4, 'metal');
    gearBox(s * 2, s * 3, 0, 0, 3, 4, 'metal');
    gearPut(s * 3, 0, -5, 'accent');          // огни на башмаках
    gearPut(s * 3, 0, 4, 'accent');
  }

  const groups = {};
  for (const v of vox.values()) (groups[v.t] || (groups[v.t] = [])).push(v);

  const shipGlassMat = new THREE.MeshPhongMaterial({
    map: MATS.glass.map,
    color: toLin(0x7fd8f0),
    specular: toLin(0xd8f8ff),
    shininess: 110,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const scl = new THREE.Vector3(SHIP_VOXEL, SHIP_VOXEL, SHIP_VOXEL);
  for (const t of Object.keys(groups)) {
    const arr = groups[t];
    const mat = t === 'glass' ? shipGlassMat : MATS[t];
    const mesh = new THREE.InstancedMesh(BLOCK_GEO, mat, arr.length);
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      p.set((b.x + 0.5) * SHIP_VOXEL, (b.y + 0.5) * SHIP_VOXEL, (b.z + 0.5) * SHIP_VOXEL);
      m.compose(p, q, scl);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ship.add(mesh);
  }

  // ---- Круглые сопла: тёмное кольцо + светящийся диск + ореол ----
  const ringGeo = new THREE.TorusGeometry(0.55, 0.12, 8, 24);
  const coreGeo = new THREE.CircleGeometry(0.44, 24);
  const ringMat = new THREE.MeshPhongMaterial({
    color: toLin(0x2c333c),
    specular: toLin(0x9bb4c9),
    shininess: 60,
  });
  for (const side of [-1, 1]) {
    const x = side * 2.75;
    const y = 1.25;
    const z = 4.56;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, y, z);
    ring.castShadow = true;
    ship.add(ring);

    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xff9a4d,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    core.position.set(x, y, z + 0.06);
    core.userData.baseScale = 1;
    ship.add(core);
    engineCores.push(core);

    const mat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xff8a4a,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z + 0.16);
    sp.scale.set(1.6, 1.6, 1);
    sp.userData.baseScale = 1.6;
    ship.add(sp);
    engineGlows.push(sp);
  }

  ship.position.set(0, 5.0, 12);
  ship.rotation.y = 0.9;
  scene.add(ship);
}


// ============================================================
//  Мелкая растительность (декор)
// ============================================================
function makeGrassBladeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 32, 32);
  const rng = mulberry32(4242);
  for (let i = 0; i < 14; i++) {
    const x = 4 + rng() * 24;
    const h = 12 + rng() * 18;
    const g = 120 + Math.floor(rng() * 80);
    ctx.strokeStyle = 'rgb(' + Math.floor(g * 0.45) + ',' + g + ',' + Math.floor(g * 0.4) + ')';
    ctx.lineWidth = 1 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.quadraticCurveTo(x + (rng() - 0.5) * 8, 32 - h * 0.5, x + (rng() - 0.5) * 12, 32 - h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeFlowerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 32, 32);
  ctx.strokeStyle = '#3f8f3a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(16, 32);
  ctx.quadraticCurveTo(15, 22, 16, 14);
  ctx.stroke();
  const colors = ['#ffe36b', '#ffffff', '#8fd7ff'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.arc(16 + Math.cos(a) * 4, 12 + Math.sin(a) * 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffb43d';
  ctx.beginPath();
  ctx.arc(16, 12, 2.5, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeCrossGeometry(w, h) {
  const g = new THREE.BufferGeometry();
  const hw = w / 2;
  const verts = new Float32Array([
    -hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, h, 0,
    0, 0, -hw, 0, 0, hw, 0, h, hw, 0, h, -hw,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}

function scatterDecor() {
  const rng = mulberry32(8800);
  const grassSpots = [];
  const flowerSpots = [];
  for (let i = 0; i < 3000 && (grassSpots.length < 650 || flowerSpots.length < 110); i++) {
    const x = Math.floor((rng() * 2 - 1) * 31);
    const z = Math.floor((rng() * 2 - 1) * 31);
    const h = heightAt(x, z);
    if (world.get(keyOf(x, h, z)) !== 'grass') continue;
    if (world.has(keyOf(x, h + 1, z))) continue;
    if (x >= -5 && x <= 5 && z >= 2 && z <= 16) continue;
    const spot = {
      x: x + 0.18 + rng() * 0.64,
      y: h + 1,
      z: z + 0.18 + rng() * 0.64,
      s: 0.55 + rng() * 0.6,
      r: rng() * Math.PI,
    };
    if (flowerSpots.length < 110 && rng() < 0.18) flowerSpots.push(spot);
    else if (grassSpots.length < 650) grassSpots.push(spot);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const grassMesh = new THREE.InstancedMesh(
    makeCrossGeometry(0.7, 0.7),
    new THREE.MeshLambertMaterial({
      map: makeGrassBladeTexture(),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    }),
    grassSpots.length
  );
  grassSpots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    pos.set(p.x, p.y, p.z);
    scale.set(p.s, p.s, p.s);
    m.compose(pos, q, scale);
    grassMesh.setMatrixAt(i, m);
  });
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.receiveShadow = true;
  grassMesh.frustumCulled = false;
  scene.add(grassMesh);

  const flowerMesh = new THREE.InstancedMesh(
    makeCrossGeometry(0.45, 0.55),
    new THREE.MeshLambertMaterial({
      map: makeFlowerTexture(),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    }),
    flowerSpots.length
  );
  flowerSpots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    pos.set(p.x, p.y, p.z);
    scale.set(p.s, p.s, p.s);
    m.compose(pos, q, scale);
    flowerMesh.setMatrixAt(i, m);
  });
  flowerMesh.instanceMatrix.needsUpdate = true;
  flowerMesh.receiveShadow = true;
  flowerMesh.frustumCulled = false;
  scene.add(flowerMesh);
}

// ============================================================
//  Состояние игрока
// ============================================================
const SAVE_KEY = 'voxel-frontier-v1';
const SAVE_BACKUP_KEY = SAVE_KEY + '-backup';
const URL_FLAGS = new URLSearchParams(location.search);
// В тестовом режиме (?debug&fresh / ?nosave) никогда не трогаем сохранение игрока
const NO_SAVE = URL_FLAGS.has('fresh') || URL_FLAGS.has('nosave');
const SPAWN = new THREE.Vector3(0.5, 5, -3);
const playerPos = SPAWN.clone();
const playerVel = new THREE.Vector3();
const shipVel = new THREE.Vector3();
const remoteShipTarget = { active: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

let mode = 'walk';            // 'walk' | 'ship'
let playing = false;
let started = false;
let yaw = Math.PI;
let pitch = -0.05;
let crystals = 0;
let selectedType = 'metal';
let inventoryOpen = false;
let saveDirty = false;
let hlTimer = 0;
let toastTimer = 0;

// Колбэки кооперативного клиента (net.js). В одиночной игре остаются null.
const netHooks = { onEdit: null };

const keys = Object.create(null);

// ============================================================
//  Ввод
// ============================================================
window.addEventListener('keydown', (e) => {
  if (inventoryOpen) {
    if (e.code === 'KeyI' || e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      closeInventory();
    }
    return;
  }
  keys[e.code] = true;
  if (!playing) return;
  if (e.code === 'KeyI' || e.code === 'KeyE') {
    e.preventDefault();
    openInventory();
    return;
  }
  if (e.code === 'Escape' && !document.pointerLockElement) {
    playing = false;
    overlay.classList.remove('hidden');
    playBtn.textContent = '▶ Продолжить';
    saveGame();
    return;
  }
  if (e.code === 'KeyF' && !e.repeat) toggleShip();
  if (e.code === 'Space') e.preventDefault();
  if (e.code.indexOf('Digit') === 0) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= HOTBAR.length) selectType(HOTBAR[n - 1]);
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

document.addEventListener('mousemove', (e) => {
  if (!playing || inventoryOpen) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = clamp(pitch, -1.45, 1.45);
});

canvas.addEventListener('mousedown', (e) => {
  if (!playing || inventoryOpen) return;
  if (e.button === 0 && mode === 'walk') placeBlock();
  if (e.button === 2 && mode === 'walk') removeBlock();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('wheel', (e) => {
  if (!playing || inventoryOpen) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  const i = HOTBAR.indexOf(selectedType);
  selectType(HOTBAR[(i + dir + HOTBAR.length) % HOTBAR.length]);
}, { passive: true });

function requestLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (err) { /* игнорируем */ }
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    started = true;
    playing = true;
    overlay.classList.add('hidden');
    playBtn.textContent = '▶ Продолжить';
  } else if (started && !inventoryOpen) {
    playing = false;
    overlay.classList.remove('hidden');
    playBtn.textContent = '▶ Продолжить';
    saveGame();
  }
});

document.addEventListener('pointerlockerror', () => {
  toast('Курсор не захвачен — играем с обычной мышью');
});

function enterPlay() {
  started = true;
  playing = true;
  overlay.classList.add('hidden');
  playBtn.textContent = '▶ Продолжить';
  requestLock();
}

playBtn.addEventListener('click', enterPlay);
resetBtn.addEventListener('click', () => {
  if (confirm('Удалить все постройки и начать заново?')) {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(SAVE_BACKUP_KEY);
    } catch (e) { /* нет доступа */ }
    location.reload();
  }
});

function selectType(id) {
  selectedType = id;
  const slots = hotbarEl.children;
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.toggle('sel', slots[i].dataset.type === id);
  }
  updateInventoryUI();
}

const iconCache = Object.create(null);
function blockIconURL(id) {
  if (iconCache[id]) return iconCache[id];
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const src = MATS[id] && MATS[id].map && MATS[id].map.image;
  if (src) {
    ctx.drawImage(src, TILE, 0, TILE, TILE, 0, 0, TILE, TILE);
  } else {
    const color = '#' + TYPES[id].color.toString(16).padStart(6, '0');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, TILE, TILE);
  }
  iconCache[id] = c.toDataURL();
  return iconCache[id];
}

function updateHotbarCounts() {
  const slots = hotbarEl.children;
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i].dataset.type;
    const n = inventory[id] || 0;
    const countEl = slots[i].querySelector('.slot-count');
    if (countEl) countEl.textContent = n;
    slots[i].classList.toggle('empty', n <= 0);
  }
}

function buildInventory() {
  invGridEl.innerHTML = '';
  for (const id of INVENTORY_ORDER) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot' + (id === selectedType ? ' sel' : '') +
      ((inventory[id] || 0) <= 0 ? ' empty' : '');
    slot.dataset.type = id;
    slot.innerHTML =
      '<span class="inv-icon" style="background-image:url(' + blockIconURL(id) + ')"></span>' +
      '<span class="inv-name">' + TYPES[id].name + '</span>' +
      '<span class="inv-count">' + (inventory[id] || 0) + '</span>';
    invGridEl.appendChild(slot);
  }
}

function updateInventoryUI() {
  if (!invGridEl) return;
  const slots = invGridEl.children;
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i].dataset.type;
    const n = inventory[id] || 0;
    slots[i].classList.toggle('sel', id === selectedType);
    slots[i].classList.toggle('empty', n <= 0);
    const countEl = slots[i].querySelector('.inv-count');
    if (countEl) countEl.textContent = n;
  }
  if (invSelectedEl) {
    invSelectedEl.textContent = 'Выбрано: ' + (TYPES[selectedType] ? TYPES[selectedType].name : selectedType);
  }
  updateHotbarCounts();
}

function openInventory() {
  if (!playing || inventoryOpen) return;
  inventoryOpen = true;
  inventoryEl.classList.add('open');
  document.exitPointerLock();
  updateInventoryUI();
}

function closeInventory() {
  if (!inventoryOpen) return;
  inventoryOpen = false;
  inventoryEl.classList.remove('open');
  if (playing) requestLock();
}

invCloseEl.addEventListener('click', closeInventory);
invGridEl.addEventListener('click', (e) => {
  const slot = e.target.closest('.inv-slot');
  if (!slot) return;
  const id = slot.dataset.type;
  if (!TYPES[id]) return;
  selectType(id);
  closeInventory();
});

function buildHotbar() {
  HOTBAR.forEach((id, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (id === selectedType ? ' sel' : '');
    slot.dataset.type = id;
    const color = '#' + TYPES[id].color.toString(16).padStart(6, '0');
    slot.innerHTML =
      '<span class="key">' + (i + 1) + '</span>' +
      '<span class="swatch" style="background-color:' + color +
        ';background-image:url(' + blockIconURL(id) +
        ');background-size:cover;image-rendering:pixelated"></span>' +
      '<span class="name">' + TYPES[id].name + '</span>' +
      '<span class="slot-count">' + (inventory[id] || 0) + '</span>';
    hotbarEl.appendChild(slot);
  });
}

// ============================================================
//  Физика игрока
// ============================================================
function collides(px, py, pz) {
  const r = 0.32;
  const h = 1.75;
  const x0 = Math.floor(px - r), x1 = Math.floor(px + r);
  const y0 = Math.floor(py + 0.001), y1 = Math.floor(py + h);
  const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        if (world.has(keyOf(x, y, z))) return true;
  return false;
}

function moveWithCollisions(dt) {
  const speed = Math.max(
    Math.abs(playerVel.x),
    Math.abs(playerVel.y),
    Math.abs(playerVel.z)
  );
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
  const sx = (playerVel.x * dt) / steps;
  const sy = (playerVel.y * dt) / steps;
  const sz = (playerVel.z * dt) / steps;

  for (let s = 0; s < steps; s++) {
    if (sx !== 0) {
      const nx = playerPos.x + sx;
      if (!collides(nx, playerPos.y, playerPos.z)) playerPos.x = nx;
      else if (!collides(nx, playerPos.y + 1.02, playerPos.z) &&
               !collides(playerPos.x, playerPos.y + 1.02, playerPos.z)) {
        playerPos.y += 1.02;
        playerPos.x = nx;
      } else playerVel.x = 0;
    }
    if (sz !== 0) {
      const nz = playerPos.z + sz;
      if (!collides(playerPos.x, playerPos.y, nz)) playerPos.z = nz;
      else if (!collides(playerPos.x, playerPos.y + 1.02, nz) &&
               !collides(playerPos.x, playerPos.y + 1.02, playerPos.z)) {
        playerPos.y += 1.02;
        playerPos.z = nz;
      } else playerVel.z = 0;
    }
    if (sy !== 0) {
      const ny = playerPos.y + sy;
      if (!collides(playerPos.x, ny, playerPos.z)) playerPos.y = ny;
      else playerVel.y = 0;
    }
  }
}

function updateWalk(dt) {
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  let ix = 0, iz = 0;
  if (keys['KeyW']) iz += 1;
  if (keys['KeyS']) iz -= 1;
  if (keys['KeyD']) ix += 1;
  if (keys['KeyA']) ix -= 1;

  const dir = new THREE.Vector3().addScaledVector(f, iz).addScaledVector(r, ix);
  if (dir.lengthSq() > 0) dir.normalize();

  const grounded = collides(playerPos.x, playerPos.y - 0.06, playerPos.z);
  const sprint = !!(keys['ShiftLeft'] || keys['ShiftRight']);
  const speed = sprint && grounded ? 8.4 : 5.4;
  const accel = (grounded ? 46 : 16) * dt;
  playerVel.x = approach(playerVel.x, dir.x * speed, accel);
  playerVel.z = approach(playerVel.z, dir.z * speed, accel);

  if (keys['Space']) {
    playerVel.y = Math.min(playerVel.y + 38 * dt, 7.6);
  }
  if (sprint && !grounded) {
    playerVel.y = Math.max(playerVel.y - 30 * dt, -8);
  }
  playerVel.y -= 23 * dt;
  playerVel.y = Math.max(playerVel.y, -30);

  moveWithCollisions(dt);

  if (playerPos.y < -9) {
    playerPos.copy(SPAWN);
    playerVel.set(0, 0, 0);
    toast('Вас вынесло в открытый космос — возврат на базу');
  }
}

function updateCrystals() {
  const cx = playerPos.x;
  const cy = playerPos.y + 0.9;
  const cz = playerPos.z;
  const arr = byType.crystal;
  for (let i = arr.length - 1; i >= 0; i--) {
    const b = arr[i];
    const k = keyOf(b.x, b.y, b.z);
    if (!naturalCrystals.has(k)) continue;
    const dx = b.x + 0.5 - cx;
    const dy = b.y + 0.5 - cy;
    const dz = b.z + 0.5 - cz;
    if (dx * dx + dy * dy + dz * dz < 4.4) {
      naturalCrystals.delete(k);
      removeCrystalGlow(k);
      removeVoxelAt(b.x, b.y, b.z);
      edits.set(k, null);
      if (netHooks.onEdit) netHooks.onEdit(k, null);
      crystals++;
      inventory.crystal = (inventory.crystal || 0) + 1;
      spawnBurst(b.x + 0.5, b.y + 0.5, b.z + 0.5, TYPES.crystal.color, 18);
      updateHud();
      saveDirty = true;
      toast('+1 ◆ Кристалл');
    }
  }
}

// ============================================================
//  Полёт на корабле
// ============================================================
function updateShip(dt) {
  const cp = Math.cos(pitch);
  const fwd = new THREE.Vector3(
    -Math.sin(yaw) * cp,
    Math.sin(pitch),
    -Math.cos(yaw) * cp
  );
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const acc = new THREE.Vector3();
  if (keys['KeyW']) acc.add(fwd);
  if (keys['KeyS']) acc.addScaledVector(fwd, -1);
  if (keys['KeyD']) acc.add(right);
  if (keys['KeyA']) acc.addScaledVector(right, -1);
  if (keys['Space']) acc.y += 1;
  if (keys['ShiftLeft'] || keys['ShiftRight']) acc.y -= 1;

  if (acc.lengthSq() > 0) acc.normalize().multiplyScalar(34);
  shipVel.addScaledVector(acc, dt);
  shipVel.multiplyScalar(Math.exp(-1.6 * dt));
  if (shipVel.length() > 30) shipVel.setLength(30);
  ship.position.addScaledVector(shipVel, dt);
  ship.position.y = Math.max(ship.position.y, -2.5);
  ship.rotation.x = pitch * 0.5;
  ship.rotation.y = yaw;
}

function updateShipCamera() {
  const cp = Math.cos(pitch);
  const fwd = new THREE.Vector3(
    -Math.sin(yaw) * cp,
    Math.sin(pitch),
    -Math.cos(yaw) * cp
  );
  camera.position.copy(ship.position).addScaledVector(fwd, -10);
  camera.position.y += 3.4;
  camera.position.y = Math.max(camera.position.y, -3.5);
  const look = ship.position.clone().addScaledVector(fwd, 5);
  look.y += 1.4;
  camera.lookAt(look);
}

function toggleShip() {
  if (mode === 'walk') {
    if (playerPos.distanceTo(ship.position) > 8.5) return;
    mode = 'ship';
    shipVel.set(0, 0, 0);
    yaw = ship.rotation.y;
    pitch = 0;
    toast('Корабль активирован · W/S — тяга · F — выйти');
  } else {
    mode = 'walk';
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(6);
    const exit = ship.position.clone().add(back);
    exit.y += 1.2;
    for (let i = 0; i < 20 && collides(exit.x, exit.y, exit.z); i++) exit.y += 1;
    playerPos.copy(exit);
    playerVel.set(0, 0, 0);
    toast('Вы покинули корабль');
  }
  updateHud();
  saveDirty = true;
}

// ============================================================
//  Строительство
// ============================================================
const blockAnims = new Map();
const raycaster = new THREE.Raycaster();
raycaster.far = 8;
const CENTER = new THREE.Vector2(0, 0);

function castTarget() {
  raycaster.setFromCamera(CENTER, camera);
  const hits = raycaster.intersectObjects(worldMeshes, false);
  if (!hits.length) return null;
  const hit = hits[0];
  const type = hit.object.userData.type;
  const b = byType[type][hit.instanceId];
  if (!b) return null;
  return {
    block: b,
    normal: hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0),
  };
}

function playerOverlapsBlock(x, y, z) {
  const r = 0.34;
  const h = 1.75;
  return (
    playerPos.x + r > x && playerPos.x - r < x + 1 &&
    playerPos.y + h > y && playerPos.y < y + 1 &&
    playerPos.z + r > z && playerPos.z - r < z + 1
  );
}

function placeBlock() {
  const t = castTarget();
  if (!t) return;
  const have = inventory[selectedType] || 0;
  if (have <= 0) {
    toast('Нет блоков: ' + TYPES[selectedType].name);
    return;
  }
  const n = t.normal;
  const x = t.block.x + Math.round(n.x);
  const y = t.block.y + Math.round(n.y);
  const z = t.block.z + Math.round(n.z);
  if (Math.abs(x) > 60 || Math.abs(z) > 60 || y < -8 || y > 44) return;
  if (world.has(keyOf(x, y, z))) return;
  if (playerOverlapsBlock(x, y, z)) return;
  addVoxel(x, y, z, selectedType);
  inventory[selectedType] = have - 1;
  const k = keyOf(x, y, z);
  edits.set(k, selectedType);
  if (netHooks.onEdit) netHooks.onEdit(k, selectedType);
  blockAnims.set(k, { start: performance.now() });
  naturalCrystals.delete(k);
  removeCrystalGlow(k);
  spawnBurst(x + 0.5, y + 0.5, z + 0.5, TYPES[selectedType].color, 7);
  updateHud();
  saveDirty = true;
}

function removeBlock() {
  const t = castTarget();
  if (!t) return;
  const k = keyOf(t.block.x, t.block.y, t.block.z);
  const type = world.get(k) || selectedType;
  removeVoxelAt(t.block.x, t.block.y, t.block.z);
  if (TYPES[type]) inventory[type] = (inventory[type] || 0) + 1;
  edits.set(k, null);
  if (netHooks.onEdit) netHooks.onEdit(k, null);
  naturalCrystals.delete(k);
  removeCrystalGlow(k);
  spawnBurst(t.block.x + 0.5, t.block.y + 0.5, t.block.z + 0.5, TYPES[type].color, 14);
  updateHud();
  saveDirty = true;
}

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x8ffcff, transparent: true, opacity: 0.95 })
);
highlight.visible = false;
scene.add(highlight);

function updateHighlight() {
  if (!playing || inventoryOpen || mode !== 'walk') {
    highlight.visible = false;
    return;
  }
  const t = castTarget();
  if (!t) {
    highlight.visible = false;
    return;
  }
  highlight.position.set(t.block.x + 0.5, t.block.y + 0.5, t.block.z + 0.5);
  highlight.visible = true;
}

// ============================================================
//  HUD
// ============================================================
function updateHud() {
  crystalEl.textContent = crystals;
  let placed = 0;
  for (const v of edits.values()) if (v) placed++;
  blockEl.textContent = placed;
  modeEl.textContent = mode === 'ship' ? 'Корабль' : 'Пешком';
  updateInventoryUI();
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function updatePrompt() {
  if (!playing || inventoryOpen) {
    promptEl.classList.remove('show');
    return;
  }
  if (mode === 'ship') {
    promptEl.textContent = 'F — покинуть корабль';
    promptEl.classList.add('show');
    return;
  }
  const near = playerPos.distanceTo(ship.position) < 8.5;
  promptEl.textContent = 'F — сесть в корабль';
  promptEl.classList.toggle('show', near);
}

// ============================================================
//  Сохранение
// ============================================================
const edits = new Map(); // "x,y,z" -> тип | null (удалён)

function saveGame() {
  if (NO_SAVE) { saveDirty = false; return; }
  try {
    const data = {
      v: 1,
      edits: Array.from(edits.entries()),
      crystals,
      inventory: Object.assign({}, inventory),
      player: [playerPos.x, playerPos.y, playerPos.z],
      yaw,
      pitch,
      ship: [ship.position.x, ship.position.y, ship.position.z],
      shipYaw: ship.rotation.y,
    };
    const json = JSON.stringify(data);
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev && prev !== json) localStorage.setItem(SAVE_BACKUP_KEY, prev);
    localStorage.setItem(SAVE_KEY, json);
    saveDirty = false;
  } catch (e) { /* хранилище недоступно — играем без сохранения */ }
}

function loadGame() {
  let data = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { data = null; }
  if (!data || data.v !== 1) return;

  for (const entry of data.edits || []) {
    const k = entry[0];
    const t = entry[1];
    const p = String(k).split(',');
    const x = parseInt(p[0], 10);
    const y = parseInt(p[1], 10);
    const z = parseInt(p[2], 10);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    removeVoxelAt(x, y, z, true);
    if (t) addVoxel(x, y, z, t, true);
    else naturalCrystals.delete(k);
    edits.set(k, t);
  }
  if (typeof data.crystals === 'number') crystals = data.crystals;
  if (data.inventory && typeof data.inventory === 'object') {
    for (const id of Object.keys(TYPES)) {
      if (typeof data.inventory[id] === 'number') {
        inventory[id] = Math.max(0, Math.floor(data.inventory[id]));
      }
    }
  }
  if (Array.isArray(data.player) && data.player.length === 3) {
    playerPos.fromArray(data.player);
  }
  if (typeof data.yaw === 'number') yaw = data.yaw;
  if (typeof data.pitch === 'number') pitch = clamp(data.pitch, -1.45, 1.45);
  if (Array.isArray(data.ship) && data.ship.length === 3) {
    ship.position.fromArray(data.ship);
    // Старое сохранение ставило корабль в 5.3 — опускаем шасси на плиту
    if (Math.abs(ship.position.x) < 0.01 &&
        Math.abs(ship.position.z - 12) < 0.01 &&
        Math.abs(ship.position.y - 5.3) < 0.02) {
      ship.position.y = 5.0;
    }
  }
  if (typeof data.shipYaw === 'number') ship.rotation.y = data.shipYaw;
}

// ============================================================
//  Инициализация и цикл
// ============================================================
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

generateWorld();
buildShip();
if (location.search.indexOf('fresh') === -1) loadGame();
scatterDecor();
for (const k of naturalCrystals) {
  const p = k.split(',').map(Number);
  addCrystalGlow(p[0], p[1], p[2]);
}
rebuildAll();
buildHotbar();
buildInventory();
updateHud();

setInterval(() => { if (saveDirty) saveGame(); }, 4000);
window.addEventListener('beforeunload', () => { if (saveDirty) saveGame(); });

function updateGlows(t) {
  let i = 0;
  for (const sp of crystalGlows.values()) {
    const p = Math.sin(t * 2.1 + i * 1.7);
    sp.material.opacity = 0.26 + p * 0.09;
    const s = 1.55 + p * 0.16;
    sp.scale.set(s, s, 1);
    i++;
  }
  const thrust = mode === 'ship'
    ? 0.3 + (keys['KeyW'] ? 0.7 : 0) + (keys['Space'] ? 0.3 : 0) + (keys['KeyS'] ? 0.2 : 0)
    : 0;
  for (let j = 0; j < engineGlows.length; j++) {
    const sp = engineGlows[j];
    const base = sp.userData.baseScale || 1.2;
    const flicker = 0.9 + 0.1 * Math.sin(t * 11 + j * 2.1);
    sp.material.opacity = (0.02 + thrust * 0.55) * flicker;
    const s = base * (0.55 + thrust * 0.6);
    sp.scale.set(s, s, 1);
  }
  for (let j = 0; j < engineCores.length; j++) {
    const core = engineCores[j];
    const pulse = 0.88 + 0.12 * Math.sin(t * 9 + j * 1.7);
    core.material.opacity = (0.68 + thrust * 0.3) * pulse;
    const s = 1 + thrust * 0.3;
    core.scale.set(s, s, 1);
  }
  // Живые материалы: кристаллы дышат, двигатели мерцают, акцент пульсирует
  if (MATS.crystal) MATS.crystal.emissiveIntensity = 0.55 + 0.22 * Math.sin(t * 2.2);
  if (MATS.engine) MATS.engine.emissiveIntensity = 0.4 + 0.28 * (0.5 + 0.5 * Math.sin(t * 7.5));
  if (MATS.accent) MATS.accent.emissiveIntensity = 0.52 + 0.18 * Math.sin(t * 3.4);
}

const animMat4 = new THREE.Matrix4();
const animQuat = new THREE.Quaternion();
const animPos = new THREE.Vector3();
const animScale = new THREE.Vector3();

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function updateBlockAnims(now) {
  if (!blockAnims.size) return;
  const touched = new Set();
  for (const [k, a] of blockAnims) {
    const rec = index.get(k);
    if (!rec) {
      blockAnims.delete(k);
      continue;
    }
    const mesh = typeMeshes[rec.type];
    if (!mesh) {
      blockAnims.delete(k);
      continue;
    }
    const p = clamp((now - a.start) / 300, 0, 1);
    const s = Math.max(0.02, easeOutBack(p));
    const parts = k.split(',');
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    const yOff = (1 - p) * -0.3;
    animPos.set(x + 0.5, y + 0.5 + yOff, z + 0.5);
    animScale.set(s, s, s);
    animMat4.compose(animPos, animQuat, animScale);
    mesh.setMatrixAt(rec.i, animMat4);
    touched.add(mesh);
    if (p >= 1) {
      animMat4.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
      mesh.setMatrixAt(rec.i, animMat4);
      blockAnims.delete(k);
    }
  }
  for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
}

let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (playing && !inventoryOpen) {
    if (mode === 'walk') {
      updateWalk(dt);
      updateCrystals();
    } else {
      updateShip(dt);
    }
  }

  if (dirtyTypes.size) {
    for (const t of dirtyTypes) rebuildType(t);
    dirtyTypes.clear();
    refreshWorldMeshes();
  }
  updateBlockAnims(now);
  updateRemoteShip(dt);
  updateRemoteAvatars(dt);

  hlTimer += dt;
  if (hlTimer > 0.09) {
    hlTimer = 0;
    updateHighlight();
  }

  if (mode === 'walk') {
    camera.position.set(playerPos.x, playerPos.y + 1.62, playerPos.z);
    camera.rotation.set(pitch, yaw, 0);
  } else {
    updateShipCamera();
  }

  sky.position.copy(camera.position);
  const time = now * 0.001;
  waterTex.offset.x += dt * 0.003;
  waterTex.offset.y += dt * 0.0016;
  updateClouds(dt);
  updateDust(dt);
  updateBurst(dt);
  updateGlows(time);
  updatePrompt();
  renderer.render(scene, camera);
}

camera.position.set(playerPos.x, playerPos.y + 1.62, playerPos.z);
camera.rotation.set(pitch, yaw, 0);
requestAnimationFrame(animate);

// ============================================================
//  Кооператив: удалённые игроки и мост для net.js
// ============================================================
const remotePlayers = new Map();
const remoteGroup = new THREE.Group();
scene.add(remoteGroup);

function makeNameSprite(name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(4, 12, 22, 0.72)';
  ctx.strokeStyle = 'rgba(95, 242, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(2, 2, 252, 60, 14);
  else ctx.rect(2, 2, 252, 60);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eaffff';
  ctx.fillText(String(name).slice(0, 22), 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.5, 0.62, 1);
  return sprite;
}

function makeRemoteAvatar(id, name) {
  const group = new THREE.Group();
  const hue = (hashStr(id) % 360) / 360;
  const suitColor = new THREE.Color().setHSL(hue, 0.62, 0.52);
  const suit = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.55, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.82, 0.36), suit);
  body.position.y = 0.92;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xdfe9f2, roughness: 0.6, metalness: 0.05 })
  );
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.16, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x5ff2ff, emissive: 0x2bb7c9, emissiveIntensity: 0.8, roughness: 0.25 })
  );
  visor.position.set(0, 1.57, 0.19);
  group.add(visor);

  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.52, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x27384a, roughness: 0.7, metalness: 0.2 })
  );
  pack.position.set(0, 1.0, -0.26);
  pack.castShadow = true;
  group.add(pack);

  const label = makeNameSprite(name);
  label.position.y = 2.12;
  group.add(label);

  return {
    id,
    group,
    label,
    target: new THREE.Vector3(),
    lastSeen: performance.now(),
  };
}

function disposeRemoteAvatar(rec) {
  remoteGroup.remove(rec.group);
  rec.group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });
}

function updateRemotePlayers(list, selfId) {
  const seen = new Set();
  for (const p of list) {
    if (!p || p.id === selfId) continue;
    seen.add(p.id);
    let rec = remotePlayers.get(p.id);
    if (!rec) {
      rec = makeRemoteAvatar(p.id, p.name || 'Пилот');
      remotePlayers.set(p.id, rec);
      remoteGroup.add(rec.group);
      rec.target.set(p.x, p.y, p.z);
      rec.group.position.copy(rec.target);
    }
    rec.target.set(
      Number.isFinite(p.x) ? p.x : rec.target.x,
      Number.isFinite(p.y) ? p.y : rec.target.y,
      Number.isFinite(p.z) ? p.z : rec.target.z
    );
    rec.group.rotation.y = Number.isFinite(p.yaw) ? p.yaw : rec.group.rotation.y;
    rec.group.visible = p.mode !== 'ship';
    rec.lastSeen = performance.now();
  }
  for (const [id, rec] of remotePlayers) {
    if (!seen.has(id)) {
      disposeRemoteAvatar(rec);
      remotePlayers.delete(id);
    }
  }
}

function updateRemoteAvatars(dt) {
  if (!remotePlayers.size) return;
  const k = 1 - Math.exp(-14 * dt);
  for (const rec of remotePlayers.values()) {
    rec.group.position.lerp(rec.target, k);
    if (rec.group.position.distanceToSquared(rec.target) > 400) {
      rec.group.position.copy(rec.target);
    }
  }
}

function applyRemoteShip(s) {
  if (!s || mode === 'ship') return;
  if (![s.x, s.y, s.z, s.yaw].every(Number.isFinite)) return;
  remoteShipTarget.active = true;
  remoteShipTarget.x = s.x;
  remoteShipTarget.y = s.y;
  remoteShipTarget.z = s.z;
  remoteShipTarget.yaw = s.yaw;
  remoteShipTarget.pitch = Number.isFinite(s.pitch) ? s.pitch : 0;
}

function updateRemoteShip(dt) {
  if (!remoteShipTarget.active || mode === 'ship') return;
  const k = 1 - Math.exp(-10 * dt);
  ship.position.x += (remoteShipTarget.x - ship.position.x) * k;
  ship.position.y += (remoteShipTarget.y - ship.position.y) * k;
  ship.position.z += (remoteShipTarget.z - ship.position.z) * k;
  let dy = remoteShipTarget.yaw - ship.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  ship.rotation.y += dy * k;
  ship.rotation.x += (remoteShipTarget.pitch * 0.5 - ship.rotation.x) * k;
}

function applyRemoteEdit(k, type, silent) {
  const parts = String(k).split(',');
  if (parts.length !== 3) return;
  const x = parseInt(parts[0], 10);
  const y = parseInt(parts[1], 10);
  const z = parseInt(parts[2], 10);
  if (![x, y, z].every(Number.isFinite)) return;
  removeVoxelAt(x, y, z);
  if (type && TYPES[type]) {
    addVoxel(x, y, z, type);
    blockAnims.set(k, { start: performance.now() });
  }
  edits.set(k, type && TYPES[type] ? type : null);
  naturalCrystals.delete(k);
  removeCrystalGlow(k);
  if (!silent) updateHud();
}

function applyRemoteEdits(list) {
  for (const entry of list || []) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    applyRemoteEdit(entry[0], entry[1], true);
  }
  if (list && list.length) {
    rebuildAll();
    updateHud();
  }
}

window.VFNetBridge = {
  setHooks(hooks) {
    if (!hooks) return;
    netHooks.onEdit = typeof hooks.onEdit === 'function' ? hooks.onEdit : null;
  },
  localState() {
    return {
      x: playerPos.x, y: playerPos.y, z: playerPos.z,
      yaw, pitch, mode, playing,
      ship: {
        x: ship.position.x, y: ship.position.y, z: ship.position.z,
        yaw: ship.rotation.y, pitch,
      },
    };
  },
  updatePlayers(list, selfId) { updateRemotePlayers(list, selfId); },
  applyEdit(k, type) { applyRemoteEdit(k, type); },
  applyEdits(list) { applyRemoteEdits(list); },
  applyShip(s) { applyRemoteShip(s); },
  remoteSnapshot() {
    return Array.from(remotePlayers.values()).map((rec) => ({
      id: rec.id,
      x: rec.target.x, y: rec.target.y, z: rec.target.z,
      visible: rec.group.visible,
    }));
  },
};

// ============================================================
//  Отладочный режим (?debug) — для автотестов
// ============================================================
if (location.search.indexOf('debug') !== -1) {
  window.__vf = {
    start() {
      started = true;
      playing = true;
      overlay.classList.add('hidden');
    },
    state() {
      return {
        mode,
        playing,
        player: [playerPos.x, playerPos.y, playerPos.z],
        ship: [ship.position.x, ship.position.y, ship.position.z],
        yaw,
        pitch,
        crystals,
        inventory: Object.assign({}, inventory),
        inventoryOpen,
        noSave: NO_SAVE,
        placed: Array.from(edits.values()).filter(Boolean).length,
        worldBlocks: world.size,
        crystalBlocks: byType.crystal.length,
        remotePlayers: remotePlayers.size,
        keysDown: Object.keys(keys).filter((k) => keys[k]),
      };
    },
    net() { return window.VFNet ? window.VFNet.snapshot() : null; },
    setShip(x, y, z, shipYaw) {
      ship.position.set(x, y, z);
      if (Number.isFinite(shipYaw)) ship.rotation.y = shipYaw;
    },
    step(seconds) {
      const total = clamp(Number(seconds) || 0.1, 0.001, 1);
      const steps = Math.max(1, Math.ceil(total / 0.016));
      const dt = total / steps;
      for (let i = 0; i < steps; i++) {
        if (playing && !inventoryOpen) {
          if (mode === 'walk') {
            updateWalk(dt);
            updateCrystals();
          } else {
            updateShip(dt);
          }
        }
        if (dirtyTypes.size) {
          for (const t of dirtyTypes) rebuildType(t);
          dirtyTypes.clear();
          refreshWorldMeshes();
        }
        updateBlockAnims(performance.now());
        updateRemoteShip(dt);
        updateRemoteAvatars(dt);
      }
      if (mode === 'walk') {
        camera.position.set(playerPos.x, playerPos.y + 1.62, playerPos.z);
        camera.rotation.set(pitch, yaw, 0);
      } else {
        updateShipCamera();
      }
      camera.updateMatrixWorld(true);
      updateHighlight();
      updateHud();
      renderer.render(scene, camera);
      return window.__vf.state();
    },
    target() {
      const t = castTarget();
      return t ? {
        x: t.block.x, y: t.block.y, z: t.block.z,
        nx: t.normal.x, ny: t.normal.y, nz: t.normal.z,
      } : null;
    },
    blockAt(x, y, z) { return world.get(keyOf(x, y, z)) || null; },
    debugWorld() {
      return {
        meshes: worldMeshes.length,
        height: heightAt(0, 8),
        pad: world.get(keyOf(0, 4, 8)) || null,
        above: world.get(keyOf(0, 5, 8)) || null,
      };
    },
    look(y, p) { yaw = y; pitch = clamp(p, -1.45, 1.45); },
    tp(x, y, z) { playerPos.set(x, y, z); playerVel.set(0, 0, 0); },
    press(code, down) { keys[code] = !!down; },
    place() { placeBlock(); },
    remove() { removeBlock(); },
    shipToggle() { toggleShip(); },
    crystalSpots(n) { return Array.from(naturalCrystals).slice(0, n || 5); },
    capture() {
      if (mode === 'walk') {
        camera.position.set(playerPos.x, playerPos.y + 1.62, playerPos.z);
        camera.rotation.set(pitch, yaw, 0);
      } else {
        updateShipCamera();
      }
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    save() { saveGame(); },
    restoreBackup() {
      try {
        const raw = localStorage.getItem(SAVE_BACKUP_KEY);
        if (!raw) return false;
        localStorage.setItem(SAVE_KEY, raw);
        return true;
      } catch (e) { return false; }
    },
  };
}
})();
