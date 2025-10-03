import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('app');
const canvas = document.getElementById('scene');
const blockPalette = document.getElementById('blockPalette');
const blockButtons = blockPalette
  ? Array.from(blockPalette.querySelectorAll('.block-btn'))
  : [];
const blockCountElement = document.getElementById('blockCount');
const selectedBlockLabelElement = document.getElementById('selectedBlockLabel');
const saveStatusElement = document.getElementById('saveStatus');
const undoButton = document.getElementById('undoAction');
const redoButton = document.getElementById('redoAction');
const resetButton = document.getElementById('resetChunk');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
if ('outputColorSpace' in renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
} else if ('outputEncoding' in renderer) {
  renderer.outputEncoding = THREE.sRGBEncoding;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG_COLOR = 0xb5d6ff; // softer anime-like horizon blue
scene.fog = new THREE.Fog(FOG_COLOR, 95, 380);
// Clear with the bottom sky color for cleaner gradient edges
renderer.setClearColor(new THREE.Color(FOG_COLOR), 1);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
camera.position.set(38, 30, 44);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 12;
controls.maxDistance = 180;
controls.target.set(0, 5, 0);
controls.update();

const ambientLight = new THREE.AmbientLight(0xbfd1ff, 0.36);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x9dc7ff, 0x1a202c, 0.24);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe0bc, 1.15);
sunLight.position.set(40, 60, 24);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 160;
sunLight.shadow.camera.left = -58;
sunLight.shadow.camera.right = 58;
sunLight.shadow.camera.top = 58;
sunLight.shadow.camera.bottom = -36;
scene.add(sunLight);

// Stylized anime sky: big inverted sphere with banded gradient + soft sun
const SKY_TOP = new THREE.Color(0x6fb5ff);      // top
const SKY_HORIZON = new THREE.Color(0xaed8ff);  // horizon blend
const SKY_BOTTOM = new THREE.Color(FOG_COLOR);  // near-white bottom

const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: SKY_TOP.clone().convertSRGBToLinear() },
    horizonColor: { value: SKY_HORIZON.clone().convertSRGBToLinear() },
    bottomColor: { value: SKY_BOTTOM.clone().convertSRGBToLinear() },
    bands: { value: 5.0 },
    exponent: { value: 1.2 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff2cc).convertSRGBToLinear() },
    sunSize: { value: THREE.MathUtils.degToRad(2.5) },
    sunSoft: { value: THREE.MathUtils.degToRad(2.0) },
  },
  vertexShader: `
    varying vec3 vDir;
    void main(){
      vec4 wp = modelMatrix * vec4(position,1.0);
      vDir = normalize(wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vDir;
    uniform vec3 topColor, horizonColor, bottomColor;
    uniform float bands, exponent;
    uniform vec3 sunDir, sunColor;
    uniform float sunSize, sunSoft;

    float smoothBand(float t, float b){
      float qt = floor(t*b)/b; // quantize
      return qt;
    }

    void main(){
      float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
      t = pow(t, exponent);
      t = smoothBand(t, max(1.0, bands));

      vec3 c = mix(bottomColor, horizonColor, smoothstep(0.0, 0.55, t));
      c = mix(c, topColor, smoothstep(0.35, 1.0, t));

      // soft sun disc
      float ang = acos(clamp(dot(normalize(vDir), normalize(sunDir)), -1.0, 1.0));
      float core = 1.0 - smoothstep(sunSize, sunSize + sunSoft, ang);
      c = mix(c, sunColor, core * 0.6);

      gl_FragColor = vec4(c, 1.0);
    }
  `,
});
const animeSky = new THREE.Mesh(skyGeo, skyMat);
animeSky.frustumCulled = false;
scene.add(animeSky);

const sunPosition = new THREE.Vector3();
function updateSun(elevation = 52, azimuth = 135) {
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sunPosition.setFromSphericalCoords(1, phi, theta);
  sunLight.position.copy(sunPosition).multiplyScalar(120);
  skyMat.uniforms.sunDir.value.copy(sunPosition);
}
scene.environment = null; // disable IBL for consistent toon look
updateSun();

// Removed ground grid for floating island scene

const Block = {
  AIR: 0,
  GRASS: 1,
  SAND: 2,
  STONE: 3,
  WATER: 4,
  WOOD: 5,
};

class VoxelChunk {
  constructor(width, height, depth) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.data = new Uint8Array(width * height * depth);
  }

  getIndex(x, y, z) {
    return y * this.width * this.depth + z * this.width + x;
  }

  inBounds(x, y, z) {
    return (
      x >= 0 && x < this.width && y >= 0 && y < this.height && z >= 0 && z < this.depth
    );
  }

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) {
      return Block.AIR;
    }
    return this.data[this.getIndex(x, y, z)];
  }

  setBlock(x, y, z, value) {
    if (!this.inBounds(x, y, z)) {
      return;
    }
    this.data[this.getIndex(x, y, z)] = value;
  }

  forEach(callback) {
    for (let y = 0; y < this.height; y += 1) {
      for (let z = 0; z < this.depth; z += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const value = this.getBlock(x, y, z);
          callback(value, x, y, z);
        }
      }
    }
  }

  cellCount() {
    return this.width * this.height * this.depth;
  }
}

const VOXEL_SIZE = 1;
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 12;
const STORAGE_KEY = 'voxel-sandbox-sky-v4';
const SAVE_DEBOUNCE_MS = 250;
const chunk = new VoxelChunk(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE);
const CHUNK_CAPACITY = chunk.cellCount();

const BLOCK_TYPES = [
  { id: Block.AIR, label: 'Air', placeable: false },
  {
    id: Block.GRASS,
    label: 'Grass',
    colors: { top: 0x83d86b, side: 0x4f8f3e, bottom: 0x3a2818 },
    highlight: 0x9ce59b,
    roughness: 0.9,
    metalness: 0.02,
    variation: 0.0,
  },
  {
    id: Block.SAND,
    label: 'Sand',
    colors: { top: 0xf2e6b6, side: 0xe9d79c, bottom: 0xcabf8a },
    highlight: 0xfff1c0,
    roughness: 0.95,
    metalness: 0.0,
    variation: 0.05,
  },
  {
    id: Block.STONE,
    label: 'Stone',
    colors: { top: 0x7a8794, side: 0x5e6973, bottom: 0x3f454b },
    highlight: 0x93a2b1,
    roughness: 0.82,
    metalness: 0.02,
    variation: 0.0,
  },
  {
    id: Block.WATER,
    label: 'Water',
    colors: { top: 0x3aa0ff, side: 0x2c7dd6, bottom: 0x1d4e9c },
    highlight: 0x6fc0ff,
    roughness: 0.12,
    metalness: 0.0,
    castShadow: false,
    variation: 0.03,
  },
  {
    id: Block.WOOD,
    label: 'Wood',
    colors: { top: 0xb77745, side: 0x8f5a33, bottom: 0x5b371e },
    highlight: 0xd08b58,
    roughness: 0.8,
    metalness: 0.02,
    variation: 0.0,
  },
];

const blockTypeById = new Map(BLOCK_TYPES.map((block) => [block.id, block]));
const placeableBlocks = BLOCK_TYPES.filter((block) => block.placeable !== false && block.id !== Block.AIR);
const defaultBlockId = Block.GRASS;
let selectedBlockId = defaultBlockId;
let lastBlockCount = 0;
const undoStack = [];
const redoStack = [];
let isRestoring = false;

const blockGeometryCache = new Map();
const blockMaterialCache = new Map();

function applyBlockVertexColors(geometry, blockType) {
  const colors = [];
  const normal = geometry.attributes.normal;
  const topColor = new THREE.Color(blockType.colors?.top ?? blockType.color ?? 0xffffff);
  const sideColor = new THREE.Color(blockType.colors?.side ?? blockType.color ?? 0xffffff);
  const bottomColor = new THREE.Color(blockType.colors?.bottom ?? blockType.color ?? 0xffffff);
  const normalVector = new THREE.Vector3();

  for (let i = 0; i < normal.count; i += 1) {
    normalVector.fromBufferAttribute(normal, i);
    let color;
    if (normalVector.y > 0.99) {
      color = topColor;
    } else if (normalVector.y < -0.99) {
      color = bottomColor;
    } else {
      color = sideColor;
    }
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function getBlockGeometry(blockType) {
  if (blockGeometryCache.has(blockType.id)) {
    return blockGeometryCache.get(blockType.id);
  }
  const geometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
  applyBlockVertexColors(geometry, blockType);
  blockGeometryCache.set(blockType.id, geometry);
  return geometry;
}

function getBlockMaterial(blockType) {
  if (blockMaterialCache.has(blockType.id)) {
    return blockMaterialCache.get(blockType.id);
  }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: blockType.roughness ?? 0.75,
    metalness: blockType.metalness ?? 0.1,
    transparent: Boolean(blockType.transparent),
    opacity: blockType.transparent ? blockType.opacity ?? 0.85 : 1,
    emissive: new THREE.Color(blockType.emissive ?? 0x000000),
    emissiveIntensity: blockType.emissiveIntensity ?? 0,
  });

  // Grass: pixel texture like Minecraft style
  if (blockType.id === Block.GRASS) {
    const tex = getGrassPixelTexture();
    material.map = tex;
    material.vertexColors = false; // rely on texture colors for a clean pixel look
    material.roughness = blockType.roughness ?? 0.9;
    material.metalness = blockType.metalness ?? 0.02;
    material.needsUpdate = true;
  }

  // Stone: use a crisp pixel texture (Minecraft-like), no vertex colors tint
  if (blockType.id === Block.STONE) {
    const tex = getStonePixelTexture();
    material.map = tex;
    material.vertexColors = false;
    material.needsUpdate = true;
    // optional: slight roughness variation via shader for subtle depth
    // enhanceStoneMaterial(material, blockType);
  }
  // Sand: fine speckled pixel texture
  if (blockType.id === Block.SAND) {
    const tex = getSandPixelTexture();
    material.map = tex;
    material.vertexColors = false;
    material.roughness = blockType.roughness ?? 0.95;
    material.metalness = blockType.metalness ?? 0.0;
    material.needsUpdate = true;
  }
  // Wood: vertical bark-like pixel texture
  if (blockType.id === Block.WOOD) {
    const tex = getWoodPixelTexture();
    material.map = tex;
    material.vertexColors = false;
    material.roughness = blockType.roughness ?? 0.8;
    material.metalness = blockType.metalness ?? 0.02;
    material.needsUpdate = true;
  }
  blockMaterialCache.set(blockType.id, material);
  return material;
}

let stoneTextureCache = null;
function getStonePixelTexture(size = 32) {
  if (stoneTextureCache) return stoneTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const palette = [
    [200, 200, 200], // light
    [170, 170, 170],
    [140, 140, 140],
    [115, 115, 115], // dark
  ];

  function rng(x, y) {
    // deterministic hash noise
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // blocky pattern: quantize into 4x4 macro tiles
      const qx = Math.floor(x / 4);
      const qy = Math.floor(y / 4);
      const n = rng(qx + 0.5 * qy, qy + 0.7 * qx);
      let idx = Math.floor(n * palette.length) % palette.length;

      // add subtle streaks
      const st = rng(x * 0.2, y * 1.7);
      if (st > 0.82) idx = Math.min(idx + 1, palette.length - 1);

      const off = (y * size + x) * 4;
      const col = palette[idx];
      data[off + 0] = col[0];
      data[off + 1] = col[1];
      data[off + 2] = col[2];
      data[off + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  stoneTextureCache = tex;
  return tex;
}

let grassTextureCache = null;
function getGrassPixelTexture(size = 32) {
  if (grassTextureCache) return grassTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  // greens from light to dark
  const palette = [
    [146, 216, 125],
    [126, 196, 110],
    [108, 176, 96],
    [92, 156, 84],
    [76, 136, 72],
  ];

  function rng(x, y) {
    const s = Math.sin(x * 97.1 + y * 213.7) * 43758.5453;
    return s - Math.floor(s);
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // combine fine and coarse noise to form patches
      const c = Math.floor(x / 4) + Math.floor(y / 4) * 13;
      const n1 = rng(x * 0.9, y * 0.9);
      const n2 = rng(c, c * 1.37);
      let t = n1 * 0.6 + n2 * 0.4;
      let idx = Math.floor(t * palette.length);

      // sparse brighter specks to mimic blades
      const s1 = rng(x * 1.7 + 7.0, y * 1.3 + 3.0);
      if (s1 > 0.96) idx = Math.max(0, idx - 1);

      idx = Math.max(0, Math.min(palette.length - 1, idx));
      const off = (y * size + x) * 4;
      const col = palette[idx];
      data[off + 0] = col[0];
      data[off + 1] = col[1];
      data[off + 2] = col[2];
      data[off + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  grassTextureCache = tex;
  return tex;
}

let sandTextureCache = null;
function getSandPixelTexture(size = 32) {
  if (sandTextureCache) return sandTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const palette = [
    [242, 230, 182], // light
    [233, 215, 156],
    [214, 196, 143],
    [202, 191, 138],
  ];

  function rng(x, y) {
    const s = Math.sin(x * 91.7 + y * 151.3) * 43758.5453;
    return s - Math.floor(s);
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // fine speckles with slight clustering
      const n1 = rng(x * 0.8, y * 0.8);
      const n2 = rng(Math.floor(x / 2), Math.floor(y / 2));
      let idx = Math.floor((n1 * 0.7 + n2 * 0.3) * palette.length);
      idx = Math.max(0, Math.min(palette.length - 1, idx));

      const off = (y * size + x) * 4;
      const col = palette[idx];
      data[off + 0] = col[0];
      data[off + 1] = col[1];
      data[off + 2] = col[2];
      data[off + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  sandTextureCache = tex;
  return tex;
}

let woodTextureCache = null;
function getWoodPixelTexture(size = 32) {
  if (woodTextureCache) return woodTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const palette = [
    [91, 55, 30],   // deep
    [115, 72, 40],
    [139, 90, 50],
    [176, 119, 69], // light
  ];

  function rng(x, y) {
    const s = Math.sin(x * 123.7 + y * 45.1) * 43758.5453;
    return s - Math.floor(s);
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // vertical banding with jitter
      const band = Math.floor(x / 3);
      let n = rng(band, y * 0.6);
      let idx = Math.floor(n * palette.length);

      // occasional darker streaks
      const streak = rng(x * 0.35, y * 1.5);
      if (streak > 0.82) idx = Math.max(0, idx - 1);

      // small knot clusters
      const k = rng(Math.floor(x / 6), Math.floor(y / 6));
      if (k > 0.88) idx = Math.max(0, idx - 1);

      idx = Math.max(0, Math.min(palette.length - 1, idx));
      const off = (y * size + x) * 4;
      const col = palette[idx];
      data[off + 0] = col[0];
      data[off + 1] = col[1];
      data[off + 2] = col[2];
      data[off + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  woodTextureCache = tex;
  return tex;
}

function enhanceStoneMaterial(material, blockType) {
  const noiseScale = 3.0;
  const noiseStrength = 0.18;
  const edgeDarken = 0.22;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoiseScale = { value: noiseScale };
    shader.uniforms.uNoiseStrength = { value: noiseStrength };
    shader.uniforms.uEdgeDarken = { value: edgeDarken };

    // Pass local and world positions to fragment stage
    shader.vertexShader = `
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      'gl_Position = projectionMatrix * mvPosition;',
      `vLocalPos = position;
       vWorldPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;
       gl_Position = projectionMatrix * mvPosition;`
    );

    // Inject simple hash noise + rocky tint and edge darkening
    shader.fragmentShader = `
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      uniform float uNoiseScale;
      uniform float uNoiseStrength;
      uniform float uEdgeDarken;

      // cheap hash noise
      float hash31(vec3 p){
        p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      // distance to edges of a unit cube (approx)
      float edgeMask(vec3 lp){
        vec3 a = abs(lp) * 2.0; // 0..1
        float e1 = min(a.x, a.y);
        float e2 = min(a.y, a.z);
        float e3 = min(a.z, a.x);
        float e = max(e1, max(e2, e3));
        return smoothstep(0.75, 1.0, e);
      }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `vec4 diffuseColor = vec4( diffuse, opacity );
       // rocky speckles using world-space noise
       float n = hash31(vWorldPos * uNoiseScale);
       float tint = 1.0 + (n - 0.5) * (uNoiseStrength * 2.0);
       diffuseColor.rgb *= tint;
       // darken near edges and corners for more depth
       float e = edgeMask(vLocalPos);
       diffuseColor.rgb *= 1.0 - e * uEdgeDarken;`
    );

    // roughness modulation for more micro-variation
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       float rn = hash31(vWorldPos * (uNoiseScale*0.7));
       roughnessFactor = clamp(roughnessFactor + (rn - 0.5) * 0.15, 0.05, 1.0);`
    );
  };
}

function randomVariation(x, y, z) {
  const seed = x * 12.9898 + y * 78.233 + z * 37.719;
  const noise = Math.sin(seed) * 43758.5453123;
  return noise - Math.floor(noise);
}

function updateStats(totalBlocks = lastBlockCount) {
  if (typeof totalBlocks === 'number' && !Number.isNaN(totalBlocks)) {
    lastBlockCount = totalBlocks;
  }

  if (blockCountElement) {
    blockCountElement.textContent = String(lastBlockCount);
  }

  const blockType = blockTypeById.get(selectedBlockId);
  if (selectedBlockLabelElement && blockType) {
    selectedBlockLabelElement.textContent = blockType.label;
  }
}

function setSaveStatus(text) {
  if (saveStatusElement) {
    saveStatusElement.textContent = text;
  }
}

function markSavePending() {
  setSaveStatus('Saving...');
}

function markSaveComplete(text = 'Just now') {
  setSaveStatus(text);
}

function updateSelectedBlockUI() {
  blockButtons.forEach((button) => {
    const blockId = Number(button.dataset.block);
    button.classList.toggle('active', blockId === selectedBlockId);
  });
}

function setSelectedBlock(blockId) {
  const blockType = blockTypeById.get(blockId);
  if (!blockType || blockType.id === Block.AIR) {
    return;
  }
  selectedBlockId = blockType.id;
  updateSelectedBlockUI();
  updateStats();
}

function setupBlockPalette() {
  blockButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const blockId = Number(button.dataset.block);
      setSelectedBlock(blockId);
    });
  });
  updateSelectedBlockUI();
}

function updateHistoryButtons() {
  if (undoButton) {
    undoButton.disabled = undoStack.length === 0;
  }
  if (redoButton) {
    redoButton.disabled = redoStack.length === 0;
  }
}

function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  updateHistoryButtons();
}

function invertAction(action) {
  if (!action) {
    return null;
  }
  if (action.type === 'place') {
    return { type: 'remove', blockId: action.blockId, cell: cloneCell(action.cell) };
  }
  if (action.type === 'remove') {
    return { type: 'place', blockId: action.blockId, cell: cloneCell(action.cell) };
  }
  return null;
}

function applyAction(action) {
  if (!action || !action.cell) {
    return false;
  }

  const { cell } = action;
  if (!chunk.inBounds(cell.x, cell.y, cell.z)) {
    return false;
  }

  let value = Block.AIR;
  if (action.type === 'place') {
    value = action.blockId ?? Block.AIR;
  }

  isRestoring = true;
  try {
    chunk.setBlock(cell.x, cell.y, cell.z, value);
    refreshChunkInstances();
    scheduleSave();
  } finally {
    isRestoring = false;
  }
  return true;
}

function pushAction(action) {
  if (!action) {
    return;
  }
  const stored = {
    ...action,
    cell: cloneCell(action.cell),
  };
  undoStack.push(stored);
  redoStack.length = 0;
  updateHistoryButtons();
}

function undo() {
  if (undoStack.length === 0) {
    return;
  }
  const action = undoStack.pop();
  const inverse = invertAction(action);
  if (inverse && applyAction(inverse)) {
    redoStack.push({
      ...action,
      cell: cloneCell(action.cell),
    });
  }
  updateHistoryButtons();
}

function redo() {
  if (redoStack.length === 0) {
    return;
  }
  const action = redoStack.pop();
  if (applyAction(action)) {
    undoStack.push({
      ...action,
      cell: cloneCell(action.cell),
    });
  }
  updateHistoryButtons();
}

function resetChunkState() {
  chunk.data.fill(Block.AIR);
  fillDefaultTerrain();
  refreshChunkInstances();
  clearHistory();
  flushSave();
}

function fillDefaultTerrain() {
  // Inverted island: flat buildable top, rich/varied underside
  const cx = Math.floor(CHUNK_SIZE / 2);
  const cz = Math.floor(CHUNK_SIZE / 2);
  const plateauY = 5; // flat top surface height
  const rMax = CHUNK_SIZE * 0.48;
  const maxThickness = Math.floor(CHUNK_HEIGHT * 0.8);

  for (let x = 0; x < CHUNK_SIZE; x += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      const dx = x - cx;
      const dz = z - cz;
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r > rMax) continue; // outside island radius

      // Top strictly flat; near edge chance of sand
      const topY = Math.min(CHUNK_HEIGHT - 1, plateauY);
      const edgeFactor = 1 - (r / rMax);
      const nearEdge = edgeFactor < 0.35;
      const sandChance = nearEdge ? 0.25 : 0.05;
      const useSand = randomVariation(x, 7, z) < sandChance;
      const topId = useSand ? Block.SAND : Block.GRASS;

      // Thickness grows toward center (inverted cone), with stronger noise toward bottom
      const shape = Math.pow(Math.max(0, edgeFactor), 1.1);
      const baseThickness = 2 + shape * maxThickness; // 2..max
      const noiseAmp = 3.0 * (0.3 + shape); // more variation near center
      const noise = (randomVariation(x, 3, z) - 0.5) * noiseAmp;
      let thickness = Math.max(2, Math.floor(baseThickness + noise));
      const bottomY = Math.max(0, topY - thickness);

      for (let y = bottomY; y <= topY; y += 1) {
        const depthFromTop = topY - y;
        let id = Block.STONE;
        if (depthFromTop === 0) {
          id = topId;
        }

        // Carve small air pockets on the underside for richer silhouette
        const caveNoise = randomVariation(x * 1.7, y * 2.3, z * 1.9);
        const carve = (y < plateauY - 2) && caveNoise > 0.86 && depthFromTop > 2;
        if (!carve) {
          chunk.setBlock(x, y, z, id);
        }
      }
    }
  }
}

function encodeChunkData() {
  const binaryString = String.fromCharCode(...chunk.data);
  return btoa(binaryString);
}

function decodeChunkData(encoded) {
  const binaryString = atob(encoded);
  const expectedLength = chunk.data.length;
  if (binaryString.length !== expectedLength) {
    throw new Error('Stored chunk length mismatch');
  }
  for (let i = 0; i < expectedLength; i += 1) {
    chunk.data[i] = binaryString.charCodeAt(i);
  }
}

function loadChunkFromStorage() {
  try {
    const encoded = window.localStorage.getItem(STORAGE_KEY);
    if (!encoded) {
      return false;
    }
    decodeChunkData(encoded);
    markSaveComplete('Restored');
    return true;
  } catch (error) {
    console.warn('[voxel] failed to load chunk from storage:', error);
    return false;
  }
}

let saveTimer = null;

function flushSave() {
  if (typeof window === 'undefined') {
    return;
  }
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    const encoded = encodeChunkData();
    window.localStorage.setItem(STORAGE_KEY, encoded);
    markSaveComplete();
  } catch (error) {
    console.warn('[voxel] failed to save chunk:', error);
    setSaveStatus('Save failed');
  }
}

function scheduleSave() {
  if (typeof window === 'undefined') {
    return;
  }
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  markSavePending();
  saveTimer = window.setTimeout(() => {
    flushSave();
    saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

const didLoad = loadChunkFromStorage();
if (!didLoad) {
  fillDefaultTerrain();
  flushSave();
}

const blockMeshes = new Map();
const blockMeshStates = new Map();
const blockIdByObject = new Map();
const intersectables = [];

placeableBlocks.forEach((blockType) => {
  const geometry = getBlockGeometry(blockType);
  const material = getBlockMaterial(blockType);
  const mesh = new THREE.InstancedMesh(geometry, material, CHUNK_CAPACITY);
  mesh.castShadow = blockType.castShadow ?? true;
  mesh.receiveShadow = blockType.receiveShadow ?? true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.visible = false;
  scene.add(mesh);
  blockMeshes.set(blockType.id, mesh);
  blockMeshStates.set(blockType.id, { mesh, index: 0 });
  blockIdByObject.set(mesh, blockType.id);
  intersectables.push(mesh);
});

const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpColor = new THREE.Color();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

const halfWidth = (chunk.width * VOXEL_SIZE) / 2;
const halfDepth = (chunk.depth * VOXEL_SIZE) / 2;

function cellToWorld(x, y, z) {
  tmpPosition.set(
    (x + 0.5) * VOXEL_SIZE - halfWidth,
    y * VOXEL_SIZE,
    (z + 0.5) * VOXEL_SIZE - halfDepth,
  );
  return tmpPosition;
}

function worldPointToCell(worldPoint, options = { snapY: true }) {
  const x = Math.floor((worldPoint.x + halfWidth) / VOXEL_SIZE);
  const yRaw = options.snapY ? worldPoint.y / VOXEL_SIZE : worldPoint.y;
  const y = Math.floor(yRaw + 0.5);
  const z = Math.floor((worldPoint.z + halfDepth) / VOXEL_SIZE);
  if (!chunk.inBounds(x, y, z)) {
    return null;
  }
  return { x, y, z };
}

function refreshChunkInstances() {
  blockMeshStates.forEach((state) => {
    state.index = 0;
  });

  let totalBlocks = 0;

  chunk.forEach((value, x, y, z) => {
    if (value === Block.AIR) {
      return;
    }
    const state = blockMeshStates.get(value);
    if (!state) {
      return;
    }
    const blockType = blockTypeById.get(value);
    const pos = cellToWorld(x, y, z);
    tmpMatrix.makeTranslation(pos.x, pos.y, pos.z);
    state.mesh.setMatrixAt(state.index, tmpMatrix);

    const variationStrength = blockType?.variation ?? 0.08;
    const noise = randomVariation(x, y, z) - 0.5;
    const tint = 1 + variationStrength * noise;
    tmpColor.setScalar(tint);
    state.mesh.setColorAt(state.index, tmpColor);

    state.index += 1;
    totalBlocks += 1;
  });

  blockMeshStates.forEach((state) => {
    state.mesh.count = state.index;
    state.mesh.instanceMatrix.needsUpdate = true;
    state.mesh.visible = state.index > 0;
    if (state.mesh.instanceColor) {
      state.mesh.instanceColor.needsUpdate = true;
    }
  });

  updateStats(totalBlocks);
}

refreshChunkInstances();

const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x6fd4ff,
  transparent: true,
  opacity: 0.32,
  roughness: 0.6,
  metalness: 0.0,
  depthWrite: false,
  emissive: 0x3a78ff,
  emissiveIntensity: 0.25,
});
const highlightMesh = new THREE.Mesh(getBlockGeometry(blockTypeById.get(Block.GRASS)), highlightMaterial.clone());
highlightMesh.visible = false;
highlightMesh.renderOrder = 5;
scene.add(highlightMesh);

// No ground plane in floating island scene; raycast only against block instances

setupBlockPalette();
updateStats();
updateHistoryButtons();

if (undoButton) {
  undoButton.addEventListener('click', undo);
}
if (redoButton) {
  redoButton.addEventListener('click', redo);
}
if (resetButton) {
  resetButton.addEventListener('click', resetChunkState);
}

renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.userSelect = 'none';
renderer.domElement.style.webkitUserSelect = 'none';
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

let hoverPlaceCell = null;
let hoverRemoveCell = null;
let lastPointerCoords = null;

const pointerState = {
  pointerId: null,
  timer: null,
  longPressFired: false,
  placeCell: null,
  removeCell: null,
};

const LONG_PRESS_MS = 450;

function triggerFeedback(action) {
  if (typeof window === 'undefined' || typeof window.navigator === 'undefined') {
    return;
  }
  const pattern = action === 'remove' ? [12, 80, 24] : [18];
  if (typeof window.navigator.vibrate === 'function') {
    window.navigator.vibrate(pattern);
  }
}

function clearPointerTimer() {
  if (pointerState.timer !== null) {
    clearTimeout(pointerState.timer);
    pointerState.timer = null;
  }
}

function clearPointerState() {
  clearPointerTimer();
  pointerState.pointerId = null;
  pointerState.longPressFired = false;
  pointerState.placeCell = null;
  pointerState.removeCell = null;
}

function cloneCell(cell) {
  if (!cell) {
    return null;
  }
  return { x: cell.x, y: cell.y, z: cell.z };
}

function attemptPlace(cell) {
  if (!cell) {
    return;
  }
  const blockType = blockTypeById.get(selectedBlockId);
  if (!blockType || blockType.id === Block.AIR) {
    return;
  }
  if (chunk.getBlock(cell.x, cell.y, cell.z) !== Block.AIR) {
    return;
  }
  chunk.setBlock(cell.x, cell.y, cell.z, blockType.id);
  refreshChunkInstances();
  scheduleSave();
  triggerFeedback('place');
  if (!isRestoring) {
    pushAction({ type: 'place', blockId: blockType.id, cell: cloneCell(cell) });
  }
  hoverPlaceCell = null;
  hoverRemoveCell = null;
  updateHoverFromPointer();
}

function attemptRemove(cell) {
  if (!cell) {
    return;
  }
  const existing = chunk.getBlock(cell.x, cell.y, cell.z);
  if (existing === Block.AIR) {
    return;
  }
  chunk.setBlock(cell.x, cell.y, cell.z, Block.AIR);
  refreshChunkInstances();
  scheduleSave();
  triggerFeedback('remove');
  if (!isRestoring) {
    pushAction({ type: 'remove', blockId: existing, cell: cloneCell(cell) });
  }
  hoverPlaceCell = null;
  hoverRemoveCell = null;
  updateHoverFromPointer();
}

function setPointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  pointer.set(x * 2 - 1, -(y * 2 - 1));
  lastPointerCoords = { x: pointer.x, y: pointer.y };
}

function updateHover(event) {
  setPointerFromEvent(event);
  updateHoverFromPointer();
}

function updateHoverFromPointer() {
  if (!lastPointerCoords) {
    hoverPlaceCell = null;
    hoverRemoveCell = null;
    updateHighlight();
    return;
  }

  pointer.set(lastPointerCoords.x, lastPointerCoords.y);
  raycaster.setFromCamera(pointer, camera);

  hoverPlaceCell = null;
  hoverRemoveCell = null;

  const intersections = raycaster.intersectObjects(intersectables, false);
  if (intersections.length === 0) {
    updateHighlight();
    return;
  }

  const hit = intersections[0];

  if (blockIdByObject.has(hit.object) && hit.face) {
    tmpNormal.copy(hit.face.normal);
    const pointInside = hit.point.clone().addScaledVector(tmpNormal, -0.5 * VOXEL_SIZE);
    const hitCell = worldPointToCell(pointInside);

    if (hitCell) {
      hoverRemoveCell = hitCell;

      const adjacentCell = {
        x: hitCell.x + tmpNormal.x,
        y: hitCell.y + tmpNormal.y,
        z: hitCell.z + tmpNormal.z,
      };

      if (chunk.inBounds(adjacentCell.x, adjacentCell.y, adjacentCell.z)) {
        if (chunk.getBlock(adjacentCell.x, adjacentCell.y, adjacentCell.z) === Block.AIR) {
          hoverPlaceCell = adjacentCell;
        }
      }
    }
  }

  updateHighlight();
}

function updateHighlight() {
  const activeCell = hoverPlaceCell || hoverRemoveCell;
  if (!activeCell) {
    highlightMesh.visible = false;
    return;
  }

  const pos = cellToWorld(activeCell.x, activeCell.y, activeCell.z);
  highlightMesh.position.set(pos.x, pos.y, pos.z);

  const isPlacement = Boolean(hoverPlaceCell);
  highlightMesh.material.color.set(isPlacement ? 0x6fd4ff : 0xff6f6b);
  highlightMesh.material.emissive.set(isPlacement ? 0x3a78ff : 0x7a1c1c);
  highlightMesh.visible = true;
}

function handlePointerMove(event) {
  updateHover(event);

  if (pointerState.pointerId === event.pointerId) {
    pointerState.placeCell = cloneCell(hoverPlaceCell);
    pointerState.removeCell = cloneCell(hoverRemoveCell);

    if (!pointerState.removeCell) {
      clearPointerTimer();
    }
  }
}

function handlePointerDown(event) {
  if (pointerState.pointerId !== null || event.button > 0) {
    return;
  }

  updateHover(event);
  if (!hoverPlaceCell && !hoverRemoveCell) {
    return;
  }

  pointerState.pointerId = event.pointerId;
  pointerState.placeCell = cloneCell(hoverPlaceCell);
  pointerState.removeCell = cloneCell(hoverRemoveCell);
  pointerState.longPressFired = false;

  if (pointerState.removeCell) {
    pointerState.timer = window.setTimeout(() => {
      attemptRemove(pointerState.removeCell);
      pointerState.longPressFired = true;
    }, LONG_PRESS_MS);
  }
}

function handlePointerUp(event) {
  if (pointerState.pointerId !== event.pointerId) {
    return;
  }

  const placeCell = cloneCell(pointerState.placeCell);
  const shouldPlace = !pointerState.longPressFired && Boolean(placeCell);
  clearPointerState();

  if (shouldPlace) {
    attemptPlace(placeCell);
  }
}

function handlePointerCancel(event) {
  if (pointerState.pointerId !== event.pointerId) {
    return;
  }
  clearPointerState();
}

function handlePointerLeave() {
  hoverPlaceCell = null;
  hoverRemoveCell = null;
  updateHighlight();
  clearPointerState();
  lastPointerCoords = null;
}

renderer.domElement.addEventListener('pointermove', handlePointerMove);
renderer.domElement.addEventListener('pointerdown', handlePointerDown);
renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('pointercancel', handlePointerCancel);
window.addEventListener('beforeunload', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    flushSave();
  }
});

resizeRenderer();
window.addEventListener('resize', resizeRenderer);

const clock = new THREE.Clock();

function animate() {
  clock.getDelta();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

function resizeRenderer() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
