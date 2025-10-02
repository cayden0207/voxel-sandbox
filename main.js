import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('app');
const canvas = document.getElementById('scene');

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
scene.background = new THREE.Color(0x101a28);
scene.fog = new THREE.Fog(scene.background.getHex(), 40, 160);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
camera.position.set(26, 24, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.08;
controls.minDistance = 10;
controls.maxDistance = 110;
controls.target.set(0, 6, 0);
controls.update();

const ambientLight = new THREE.AmbientLight(0xbfd1ff, 0.32);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x84b6ff, 0x1a202c, 0.28);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe0bc, 1.2);
sunLight.position.set(32, 42, 22);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 160;
sunLight.shadow.camera.left = -58;
sunLight.shadow.camera.right = 58;
sunLight.shadow.camera.top = 58;
sunLight.shadow.camera.bottom = -36;
scene.add(sunLight);

const gridHelper = new THREE.GridHelper(200, 20, 0x3b4458, 0x2a313f);
gridHelper.position.y = -0.5;
scene.add(gridHelper);

const Block = {
  AIR: 0,
  SOLID: 1,
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
const STORAGE_KEY = 'voxel-sandbox-chunk-v1';
const SAVE_DEBOUNCE_MS = 250;
const chunk = new VoxelChunk(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE);

function fillDefaultTerrain() {
  for (let x = 0; x < CHUNK_SIZE; x += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      chunk.setBlock(x, 0, z, Block.SOLID);
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
  } catch (error) {
    console.warn('[voxel] failed to save chunk:', error);
  }
}

function scheduleSave() {
  if (typeof window === 'undefined') {
    return;
  }
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
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

const solidMaterial = new THREE.MeshStandardMaterial({
  color: 0x7acb72,
  roughness: 0.75,
  metalness: 0.05,
});
const solidGeometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
const solidMesh = new THREE.InstancedMesh(solidGeometry, solidMaterial, chunk.cellCount());
solidMesh.castShadow = true;
solidMesh.receiveShadow = true;
solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(solidMesh);

const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
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
  let solidIndex = 0;

  chunk.forEach((value, x, y, z) => {
    if (value !== Block.SOLID) {
      return;
    }
    const pos = cellToWorld(x, y, z);
    tmpMatrix.makeTranslation(pos.x, pos.y, pos.z);
    solidMesh.setMatrixAt(solidIndex, tmpMatrix);
    solidIndex += 1;
  });

  solidMesh.count = solidIndex;
  solidMesh.instanceMatrix.needsUpdate = true;
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
const highlightMesh = new THREE.Mesh(solidGeometry, highlightMaterial.clone());
highlightMesh.visible = false;
highlightMesh.renderOrder = 5;
scene.add(highlightMesh);

const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(chunk.width * VOXEL_SIZE, chunk.depth * VOXEL_SIZE),
  new THREE.MeshBasicMaterial({ visible: false }),
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = 0;
scene.add(groundPlane);

const intersectables = [solidMesh, groundPlane];

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
  if (chunk.getBlock(cell.x, cell.y, cell.z) !== Block.AIR) {
    return;
  }
  chunk.setBlock(cell.x, cell.y, cell.z, Block.SOLID);
  refreshChunkInstances();
  scheduleSave();
  triggerFeedback('place');
  hoverPlaceCell = null;
  hoverRemoveCell = null;
  updateHoverFromPointer();
}

function attemptRemove(cell) {
  if (!cell) {
    return;
  }
  if (chunk.getBlock(cell.x, cell.y, cell.z) === Block.AIR) {
    return;
  }
  chunk.setBlock(cell.x, cell.y, cell.z, Block.AIR);
  refreshChunkInstances();
  scheduleSave();
  triggerFeedback('remove');
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

  if (hit.object === solidMesh && hit.face) {
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
  } else {
    const groundCell = worldPointToCell(hit.point.clone(), { snapY: false });
    if (groundCell) {
      groundCell.y = 0;
      if (chunk.getBlock(groundCell.x, groundCell.y, groundCell.z) === Block.AIR) {
        hoverPlaceCell = groundCell;
      } else {
        hoverRemoveCell = groundCell;
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
