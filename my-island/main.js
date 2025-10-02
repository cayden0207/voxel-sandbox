import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==================== 初始化場景 ====================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene = new THREE.Scene();
// ⭐ 明亮的白天天空
scene.background = new THREE.Color(0x87ceeb);  // 天藍色
scene.fog = new THREE.Fog(0xa4d7f0, 60, 180);  // 更淺的霧，更遠的距離

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(20, 25, 25);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 10;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI / 2.1;
controls.update();

// ==================== 燈光系統（白天場景優化）⭐ ====================
// 1. 主光源 - 明亮的太陽光
const sunLight = new THREE.DirectionalLight(0xffffee, 1.0);
sunLight.position.set(30, 45, 25);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 100;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// 2. 輪廓光 - 天空反射光（柔和藍色）
const rimLight = new THREE.DirectionalLight(0x9dc4e0, 0.3);
rimLight.position.set(-30, 25, -25);
scene.add(rimLight);

// 3. 環境光（明亮）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

// 4. 半球光（天空亮藍 vs 地面綠）
const skyLight = new THREE.HemisphereLight(0x87ceeb, 0x6b9b5c, 0.5);
scene.add(skyLight);

// ==================== 材質庫（優化版）====================
const materials = {
  // 主要地形材質
  grass: new THREE.MeshStandardMaterial({
    color: 0x64b46b,
    roughness: 0.92,
    metalness: 0.08
  }),
  dirt: new THREE.MeshStandardMaterial({
    color: 0x8f6b4a,
    roughness: 0.95,
    metalness: 0.05
  }),
  stone: new THREE.MeshStandardMaterial({
    color: 0x485364,
    roughness: 0.85,
    metalness: 0.12
  }),

  // ⭐ 底部專用材質（深色，增強深度感）
  underside: new THREE.MeshStandardMaterial({
    color: 0x2f3a4a,
    roughness: 0.88,
    metalness: 0.15
  }),

  // 裝飾材質
  wood: new THREE.MeshStandardMaterial({
    color: 0x7b4d2b,
    roughness: 0.78,
    metalness: 0.15
  }),
  leaves: new THREE.MeshStandardMaterial({
    color: 0x3d8750,
    roughness: 0.9,
    metalness: 0.04
  }),
  roof: new THREE.MeshStandardMaterial({
    color: 0xc62828,
    roughness: 0.7,
    metalness: 0.1
  }),

  // ⭐ 發光元素（水晶）
  crystal: new THREE.MeshStandardMaterial({
    color: 0xc5f2ff,
    roughness: 0.2,
    metalness: 0.28,
    transparent: true,
    opacity: 0.85,
    emissive: 0x96d4ff,
    emissiveIntensity: 0.55
  }),

  // ⭐ 櫻花（發光粉色）
  blossom: new THREE.MeshStandardMaterial({
    color: 0xffcce8,
    roughness: 0.6,
    metalness: 0.1,
    emissive: 0xff9ed0,
    emissiveIntensity: 0.2
  }),

  // 燈籠（發光）
  lamp: new THREE.MeshStandardMaterial({
    color: 0xfff9c4,
    emissive: 0xfff9c4,
    emissiveIntensity: 0.8,
    roughness: 0.3,
    metalness: 0.05
  }),

  // ⭐ 水面（帶發光）
  water: new THREE.MeshStandardMaterial({
    color: 0x3d7be2,
    emissive: 0x1c3d66,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.82,
    roughness: 0.25,
    metalness: 0.05
  }),

  // ⭐ 池塘發光層
  waterGlow: new THREE.MeshBasicMaterial({
    color: 0xffe4a8,
    transparent: true,
    opacity: 0.3
  }),

  // 預覽材質
  preview: new THREE.MeshStandardMaterial({
    color: 0x4caf50,
    transparent: true,
    opacity: 0.5,
    roughness: 0.5
  }),
  previewInvalid: new THREE.MeshStandardMaterial({
    color: 0xf44336,
    transparent: true,
    opacity: 0.5,
    roughness: 0.5
  })
};

// ==================== 簡易噪聲函數 ====================
function simpleNoise(x, z, seed = 0) {
  // 簡單的偽隨機噪聲
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, z, octaves = 3) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += simpleNoise(x * frequency * 0.1, z * frequency * 0.1, i) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

// ==================== 創建浮空島 (參考圖版本) ====================
function createFloatingIsland() {
  const island = new THREE.Group();
  const voxelSize = 1;

  // 島嶼配置
  const config = {
    width: 24,
    depth: 24,
    maxHeight: 8,
    baseHeight: 3,
    grassThickness: 1,
    dirtThickness: 2
  };

  const centerX = config.width / 2;
  const centerZ = config.depth / 2;
  const radius = config.width / 2.5;

  // 3D voxel地圖
  const voxelMap = new Map();

  // ===== 第一步：生成平坦島嶼表面 ⭐ =====
  const surfaceY = 4;  // 固定表面高度

  for (let x = 0; x < config.width; x++) {
    for (let z = 0; z < config.depth; z++) {
      const dx = x - centerX;
      const dz = z - centerZ;
      const distFromCenter = Math.sqrt(dx * dx + dz * dz);

      // 圓形邊界（帶輕微噪聲）
      const noise = smoothNoise(x, z, 2);
      const edgeNoise = (noise - 0.5) * 1.5;
      const effectiveRadius = radius + edgeNoise;

      if (distFromCenter > effectiveRadius) continue;

      // ⭐ 平坦表面，只在邊緣稍微降低
      let finalSurfaceY = surfaceY;
      if (distFromCenter > radius - 2) {
        finalSurfaceY = surfaceY - 1;  // 邊緣稍低
      }

      // 生成垂直的voxel柱（草地 -> 泥土 -> 石頭）
      for (let y = 0; y <= finalSurfaceY; y++) {
        const key = `${x},${y},${z}`;

        let type;
        if (y === finalSurfaceY) {
          type = 'grass';  // 頂層草地
        } else if (y >= finalSurfaceY - config.dirtThickness) {
          type = 'dirt';   // 泥土層
        } else {
          type = 'stone';  // 石頭基底
        }

        voxelMap.set(key, { x, y, z, type });
      }
    }
  }

  // ===== 第二步：創建倒三角底部（豐富地形）⭐⭐⭐ =====
  const maxUndersideDepth = 10;  // 底部最大深度

  for (let x = 0; x < config.width; x++) {
    for (let z = 0; z < config.depth; z++) {
      const dx = x - centerX;
      const dz = z - centerZ;
      const dist = Math.sqrt(dx * dx + dz * dz) / radius;

      if (dist > 1.0) continue;

      // 找到該位置的表面層
      let surfaceFound = false;
      for (let y = surfaceY; y >= 0; y--) {
        if (voxelMap.has(`${x},${y},${z}`)) {
          surfaceFound = true;
          break;
        }
      }

      if (!surfaceFound) continue;

      // ⭐ 倒三角形狀：中心深，邊緣淺
      const depthFactor = (1 - dist * dist);  // 平方讓中心更深
      const baseDepth = Math.floor(maxUndersideDepth * depthFactor);

      // 添加噪聲讓底部更豐富
      const depthNoise = smoothNoise(x * 0.8, z * 0.8, 88);
      const finalDepth = Math.floor(baseDepth + depthNoise * 3);

      // ⭐ 逐層收縮的倒錐形
      for (let y = 1; y <= finalDepth; y++) {
        // 每往下一層，收縮比例增加
        const shrinkFactor = 1 - (y / (finalDepth + 6));
        const adjustedDist = dist / shrinkFactor;

        if (adjustedDist < 1.0) {
          const key = `${x},${-y},${z}`;

          // 隨機添加一些懸掛的細節
          const hangNoise = smoothNoise(x * 2, z * 2, y);
          if (hangNoise > 0.75 && y > finalDepth * 0.6) {
            // 底部延伸的鐘乳石效果
            voxelMap.set(key, { x, y: -y, z, type: 'underside' });

            // 額外向下延伸
            if (hangNoise > 0.85 && y < finalDepth - 1) {
              const key2 = `${x},${-y-1},${z}`;
              voxelMap.set(key2, { x, y: -y-1, z, type: 'underside' });
            }
          } else if (y <= finalDepth * 0.9) {
            // 主體部分
            voxelMap.set(key, { x, y: -y, z, type: 'underside' });
          }
        }
      }
    }
  }

  // ===== 第三步：添加表面草叢細節 =====
  const grassTufts = [];
  for (let x = 0; x < config.width; x++) {
    for (let z = 0; z < config.depth; z++) {
      // 找頂層草地
      for (let y = config.maxHeight + config.baseHeight; y >= 0; y--) {
        const key = `${x},${y},${z}`;
        const voxel = voxelMap.get(key);

        if (voxel && voxel.type === 'grass') {
          // 隨機添加草叢
          const grassNoise = smoothNoise(x * 3, z * 3, 99);
          if (grassNoise > 0.7) {
            grassTufts.push({ x, y: y + 1, z });
          }
          break;
        }
      }
    }
  }

  // ===== 第四步：創建實際的mesh =====
  const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

  // 渲染主體voxel
  voxelMap.forEach(voxel => {
    const mesh = new THREE.Mesh(voxelGeo, materials[voxel.type]);
    mesh.position.set(
      (voxel.x - centerX) * voxelSize,
      voxel.y * voxelSize,
      (voxel.z - centerZ) * voxelSize
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    island.add(mesh);
  });

  // 渲染草叢（小的立體細節）
  grassTufts.forEach(tuft => {
    const grassGeo = new THREE.BoxGeometry(0.3, 0.6, 0.3);
    const grassMesh = new THREE.Mesh(grassGeo, materials.leaves);
    grassMesh.position.set(
      (tuft.x - centerX) * voxelSize + (Math.random() - 0.5) * 0.4,
      tuft.y * voxelSize + 0.3,
      (tuft.z - centerZ) * voxelSize + (Math.random() - 0.5) * 0.4
    );
    grassMesh.castShadow = true;
    island.add(grassMesh);
  });

  // ===== 第五步：添加特殊地形區域 + 發光元素 ⭐ =====
  // 小池塘（使用優化的水材質）
  const pondX = Math.floor(centerX + 4);
  const pondZ = Math.floor(centerZ - 3);
  let pondHeight = 0;

  for (let px = -1; px <= 1; px++) {
    for (let pz = -1; pz <= 1; pz++) {
      const x = pondX + px;
      const z = pondZ + pz;

      // 找到表面高度
      for (let y = config.maxHeight + config.baseHeight; y >= 0; y--) {
        const key = `${x},${y},${z}`;
        if (voxelMap.has(key)) {
          // ⭐ 使用發光水材質
          const waterGeo = new THREE.BoxGeometry(voxelSize, 0.35, voxelSize);
          const water = new THREE.Mesh(waterGeo, materials.water);
          water.position.set(
            (x - centerX) * voxelSize,
            y * voxelSize + 0.85,
            (z - centerZ) * voxelSize
          );
          water.receiveShadow = true;
          island.add(water);

          pondHeight = y * voxelSize + 1;
          break;
        }
      }
    }
  }

  // ⭐ 池塘發光層
  if (pondHeight > 0) {
    const glowGeo = new THREE.BoxGeometry(2.5, 0.1, 2.5);
    const glow = new THREE.Mesh(glowGeo, materials.waterGlow);
    glow.position.set(
      (pondX - centerX) * voxelSize,
      pondHeight + 0.1,
      (pondZ - centerZ) * voxelSize
    );
    island.add(glow);
  }

  // 小路（泥土路徑）
  const pathPoints = [
    [centerX - 2, centerZ + 3],
    [centerX - 1, centerZ + 2],
    [centerX, centerZ + 1],
    [centerX + 1, centerZ],
    [centerX + 2, centerZ - 1]
  ];

  pathPoints.forEach(([px, pz]) => {
    const x = Math.floor(px);
    const z = Math.floor(pz);

    for (let y = config.maxHeight + config.baseHeight; y >= 0; y--) {
      const key = `${x},${y},${z}`;
      const voxel = voxelMap.get(key);

      if (voxel && voxel.type === 'grass') {
        // 替換為泥土材質
        const mesh = island.children.find(child =>
          child.position.x === (x - centerX) * voxelSize &&
          child.position.y === y * voxelSize &&
          child.position.z === (z - centerZ) * voxelSize
        );
        if (mesh) {
          mesh.material = materials.dirt;
        }
        break;
      }
    }
  });

  // 添加懸浮動畫數據
  island.userData.baseY = 0;
  island.userData.floatSpeed = 0.3;

  return island;
}

const island = createFloatingIsland();
scene.add(island);

// ==================== 漂浮岩石系統 ⭐ ====================
function createFloatingRocks() {
  const group = new THREE.Group();
  const rocks = [];

  const positions = [
    { x: -20, y: 3, z: -8 },
    { x: 22, y: 5, z: 10 },
    { x: -12, y: -1, z: 18 },
    { x: 15, y: 7, z: -16 },
    { x: -18, y: 2, z: 12 },
  ];

  positions.forEach((pos, index) => {
    const rock = new THREE.Group();
    const scale = 1.4 + index * 0.2;

    // 每個岩石由多個小方塊組成
    for (let i = 0; i < 10; i++) {
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        materials.stone
      );
      chunk.scale.setScalar(0.6 + Math.random() * 0.5);
      chunk.position.set(
        (Math.random() - 0.5) * scale,
        (Math.random() - 0.5) * scale,
        (Math.random() - 0.5) * scale
      );
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      rock.add(chunk);
    }

    rock.position.set(pos.x, pos.y, pos.z);
    group.add(rock);

    // 保存動畫數據
    rocks.push({
      mesh: rock,
      baseY: pos.y,
      offset: Math.random() * Math.PI * 2,
      floatSpeed: 0.4 + Math.random() * 0.3,
      rotateSpeed: 0.1 + Math.random() * 0.15
    });
  });

  return { group, rocks };
}

const floatingRocks = createFloatingRocks();
scene.add(floatingRocks.group);

// ==================== 雲朵環繞系統 ⭐ ====================
function createCloudBand() {
  const group = new THREE.Group();
  const clouds = [];

  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7faff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.8
  });

  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();

    // 每朵雲由多個球體組成
    const puffCount = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffCount; j++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 0.8, 8, 8),
        cloudMaterial
      );
      puff.position.set(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 2
      );
      cloud.add(puff);
    }

    // 環繞島嶼放置
    const radius = 25 + Math.random() * 8;
    const angle = (Math.PI * 2 * i) / 10;
    cloud.position.set(
      Math.cos(angle) * radius,
      8 + Math.random() * 4,
      Math.sin(angle) * radius
    );
    cloud.rotation.y = Math.random() * Math.PI * 2;

    group.add(cloud);
    clouds.push({
      mesh: cloud,
      rotateSpeed: 0.03 + Math.random() * 0.04,
      startAngle: angle
    });
  }

  return { group, clouds };
}

const cloudBand = createCloudBand();
scene.add(cloudBand.group);

// ==================== 島上自動生成裝飾 ⭐ ====================
function addIslandDecorations() {
  const decorations = new THREE.Group();

  // 隨機生成樹木（3-5棵）
  const treeCount = 3 + Math.floor(Math.random() * 3);
  const treePositions = [];

  for (let i = 0; i < treeCount; i++) {
    const angle = (Math.PI * 2 * i) / treeCount + Math.random() * 0.5;
    const dist = 4 + Math.random() * 6;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    const tree = voxelObjects.tree.create();
    tree.position.set(x, 4, z);
    decorations.add(tree);
    treePositions.push({ x, z });
  }

  // 隨機石頭（5-8個）
  const rockCount = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < rockCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 8;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    // 避開樹木位置
    const tooClose = treePositions.some(tree => {
      const dx = tree.x - x;
      const dz = tree.z - z;
      return Math.sqrt(dx * dx + dz * dz) < 3;
    });

    if (!tooClose) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5),
        materials.stone
      );
      rock.position.set(x, 4.3, z);
      rock.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      rock.castShadow = true;
      rock.receiveShadow = true;
      decorations.add(rock);
    }
  }

  // 幾朵小花（4-6朵）
  const flowerCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < flowerCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 2 + Math.random() * 7;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    // 花莖
    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 1, 0.15),
      materials.leaves
    );
    stem.position.set(x, 4.5, z);
    decorations.add(stem);

    // 花朵
    const bloom = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      materials.blossom
    );
    bloom.position.set(x, 5.3, z);
    bloom.castShadow = true;
    decorations.add(bloom);
  }

  return decorations;
}

// ==================== 網格輔助線 ====================
const gridHelper = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// ==================== Voxel物件模板 ====================
const voxelObjects = {
  tree: {
    name: 'Tree',
    color: 0x4caf50,
    create: () => {
      const group = new THREE.Group();

      // 樹幹
      const trunkGeo = new THREE.BoxGeometry(1, 4, 1);
      const trunk = new THREE.Mesh(trunkGeo, materials.wood);
      trunk.position.y = 2;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      group.add(trunk);

      // ⭐ 多層漸變樹冠（參考Pagoda風格）
      const VOXEL_SIZE = 1;
      const VOXEL_GEO = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);

      for (let layer = 0; layer < 4; layer++) {
        const size = 4 - layer;
        for (let dx = -size; dx <= size; dx++) {
          for (let dz = -size; dz <= size; dz++) {
            if (Math.abs(dx) + Math.abs(dz) <= size + (layer === 0 ? 0 : 1)) {
              const leaf = new THREE.Mesh(VOXEL_GEO, materials.leaves);
              leaf.position.set(dx, 4 + layer, dz);
              leaf.castShadow = true;
              group.add(leaf);
            }
          }
        }
      }

      // ⭐ 隨機添加櫻花頂部（20%機率）
      if (Math.random() > 0.8) {
        const blossomGeo = new THREE.BoxGeometry(3, 2, 3);
        const blossom = new THREE.Mesh(blossomGeo, materials.blossom);
        blossom.position.set(0, 8, 0);
        blossom.castShadow = true;
        group.add(blossom);
      }

      return group;
    }
  },
  house: {
    name: 'House',
    color: 0x8d6e63,
    create: () => {
      const group = new THREE.Group();

      // 牆壁
      const wallGeo = new THREE.BoxGeometry(4, 3, 4);
      const wall = new THREE.Mesh(wallGeo, materials.wood);
      wall.position.y = 1.5;
      wall.castShadow = true;
      group.add(wall);

      // 屋頂
      const roofGeo = new THREE.ConeGeometry(3, 2, 4);
      const roof = new THREE.Mesh(roofGeo, materials.roof);
      roof.position.y = 4;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);

      return group;
    }
  },
  rock: {
    name: 'Rock',
    color: 0x78909c,
    create: () => {
      const group = new THREE.Group();
      const rockGeo = new THREE.DodecahedronGeometry(1.5);
      const rock = new THREE.Mesh(rockGeo, materials.stone);
      rock.position.y = 0.8;
      rock.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      rock.castShadow = true;
      group.add(rock);
      return group;
    }
  },
  lamp: {
    name: 'Lamp',
    color: 0xfff9c4,
    create: () => {
      const group = new THREE.Group();

      // 燈柱
      const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 4);
      const pole = new THREE.Mesh(poleGeo, materials.stone);
      pole.position.y = 2;
      pole.castShadow = true;
      group.add(pole);

      // 燈泡
      const lightGeo = new THREE.BoxGeometry(1, 1, 1);
      const lightMesh = new THREE.Mesh(lightGeo, materials.lamp);
      lightMesh.position.y = 4.5;
      lightMesh.castShadow = true;
      group.add(lightMesh);

      // 點光源
      const pointLight = new THREE.PointLight(0xfff9c4, 1, 10);
      pointLight.position.y = 4.5;
      pointLight.castShadow = true;
      group.add(pointLight);

      return group;
    }
  }
};

// ==================== 添加島嶼裝飾（在voxelObjects定義之後調用）====================
const islandDecorations = addIslandDecorations();
scene.add(islandDecorations);

// ==================== 遊戲狀態 ====================
const gameState = {
  mode: 'build', // 'build' or 'view'
  selectedObject: 'tree',
  deleteMode: false,
  placedObjects: [],
  previewObject: null,
  selectedPlacedObject: null,
  currentRotation: 0
};

// ==================== 放置系統 ====================
class PlacementSystem {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.gridSize = 1;
  }

  // 更新鼠標位置
  updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // 獲取鼠標與島嶼的交點
  getIntersectionPoint() {
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(island.children, true);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      // 對齊到網格
      return new THREE.Vector3(
        Math.round(point.x / this.gridSize) * this.gridSize,
        Math.round(point.y / this.gridSize) * this.gridSize + this.gridSize,
        Math.round(point.z / this.gridSize) * this.gridSize
      );
    }
    return null;
  }

  // 檢查位置是否有效（是否與其他物件重疊）
  isValidPlacement(position) {
    const threshold = 0.5;
    for (const obj of gameState.placedObjects) {
      const distance = position.distanceTo(obj.position);
      if (distance < threshold) {
        return false;
      }
    }
    return true;
  }

  // 獲取鼠標下的已放置物件
  getObjectAtMouse() {
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(
      gameState.placedObjects.map(o => o.object),
      true
    );

    if (intersects.length > 0) {
      // 找到父級對象
      let obj = intersects[0].object;
      while (obj.parent && !gameState.placedObjects.find(p => p.object === obj)) {
        obj = obj.parent;
      }
      return gameState.placedObjects.find(p => p.object === obj);
    }
    return null;
  }
}

const placementSystem = new PlacementSystem();

// ==================== 預覽物件 ====================
function createPreviewObject() {
  if (gameState.previewObject) {
    scene.remove(gameState.previewObject);
    gameState.previewObject = null;
  }

  if (gameState.mode !== 'build' || gameState.deleteMode) return;

  const template = voxelObjects[gameState.selectedObject];
  if (!template) return;

  const preview = template.create();

  // 設置所有子物件為預覽材質
  preview.traverse(child => {
    if (child.isMesh) {
      child.material = materials.preview;
    }
  });

  preview.userData.isPreview = true;
  gameState.previewObject = preview;
  scene.add(preview);
}

// ==================== 更新預覽位置 ====================
function updatePreview() {
  if (!gameState.previewObject) return;

  const position = placementSystem.getIntersectionPoint();
  if (position) {
    gameState.previewObject.position.copy(position);
    gameState.previewObject.rotation.y = gameState.currentRotation;
    gameState.previewObject.visible = true;

    // 檢查是否可以放置
    const isValid = placementSystem.isValidPlacement(position);
    const previewMaterial = isValid ? materials.preview : materials.previewInvalid;

    gameState.previewObject.traverse(child => {
      if (child.isMesh && !child.userData.isLight) {
        child.material = previewMaterial;
      }
    });
  } else {
    gameState.previewObject.visible = false;
  }
}

// ==================== 放置物件 ====================
function placeObject() {
  if (gameState.mode !== 'build' || gameState.deleteMode) return;
  if (!gameState.previewObject || !gameState.previewObject.visible) return;

  const position = gameState.previewObject.position.clone();

  if (!placementSystem.isValidPlacement(position)) {
    updateStatus('❌ Cannot place here!');
    return;
  }

  const template = voxelObjects[gameState.selectedObject];
  const newObject = template.create();
  newObject.position.copy(position);
  newObject.rotation.y = gameState.currentRotation;

  scene.add(newObject);

  gameState.placedObjects.push({
    object: newObject,
    type: gameState.selectedObject,
    position: position.clone(),
    rotation: gameState.currentRotation
  });

  updateObjectCount();
  updateStatus(`✅ Placed ${template.name}`);
}

// ==================== 刪除物件 ====================
function deleteObject(placedObj) {
  if (!placedObj) return;

  scene.remove(placedObj.object);
  const index = gameState.placedObjects.indexOf(placedObj);
  if (index > -1) {
    gameState.placedObjects.splice(index, 1);
  }

  updateObjectCount();
  updateStatus('🗑️ Deleted object');
}

// ==================== 選中物件 ====================
function selectObject(placedObj) {
  // 取消之前的選中
  if (gameState.selectedPlacedObject) {
    gameState.selectedPlacedObject.object.traverse(child => {
      if (child.isMesh) {
        child.material.emissive = new THREE.Color(0x000000);
      }
    });
  }

  gameState.selectedPlacedObject = placedObj;

  if (placedObj) {
    // 高亮選中的物件
    placedObj.object.traverse(child => {
      if (child.isMesh) {
        child.material.emissive = new THREE.Color(0x4a9eff);
        child.material.emissiveIntensity = 0.3;
      }
    });
  }
}

// ==================== 事件處理 ====================
canvas.addEventListener('mousemove', (event) => {
  placementSystem.updateMouse(event);

  if (gameState.mode === 'build') {
    updatePreview();
  }
});

canvas.addEventListener('click', (event) => {
  placementSystem.updateMouse(event);

  if (gameState.mode === 'build') {
    if (gameState.deleteMode) {
      const obj = placementSystem.getObjectAtMouse();
      if (obj) {
        deleteObject(obj);
      }
    } else {
      placeObject();
    }
  } else {
    // 查看模式：選中物件
    const obj = placementSystem.getObjectAtMouse();
    selectObject(obj);
  }
});

// 鍵盤控制
window.addEventListener('keydown', (event) => {
  if (event.key === 'r' || event.key === 'R') {
    // 旋轉預覽物件
    gameState.currentRotation += Math.PI / 2;
    if (gameState.currentRotation >= Math.PI * 2) {
      gameState.currentRotation = 0;
    }
    updateStatus('🔄 Rotated');
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (gameState.selectedPlacedObject) {
      deleteObject(gameState.selectedPlacedObject);
      gameState.selectedPlacedObject = null;
    }
  }
});

// ==================== UI控制 ====================
const buildModeBtn = document.getElementById('buildMode');
const viewModeBtn = document.getElementById('viewMode');
const deleteModeBtn = document.getElementById('deleteMode');
const clearAllBtn = document.getElementById('clearAll');
const gridToggle = document.getElementById('gridToggle');
const objectButtons = document.querySelectorAll('.object-btn');

buildModeBtn.addEventListener('click', () => {
  gameState.mode = 'build';
  buildModeBtn.classList.add('active');
  viewModeBtn.classList.remove('active');
  canvas.classList.remove('view-mode');
  createPreviewObject();
  updateStatus('🏗️ Build mode');
});

viewModeBtn.addEventListener('click', () => {
  gameState.mode = 'view';
  viewModeBtn.classList.add('active');
  buildModeBtn.classList.remove('active');
  canvas.classList.add('view-mode');
  if (gameState.previewObject) {
    scene.remove(gameState.previewObject);
    gameState.previewObject = null;
  }
  updateStatus('👁️ View mode');
});

deleteModeBtn.addEventListener('click', () => {
  gameState.deleteMode = !gameState.deleteMode;
  deleteModeBtn.classList.toggle('active', gameState.deleteMode);

  if (gameState.deleteMode) {
    if (gameState.previewObject) {
      scene.remove(gameState.previewObject);
      gameState.previewObject = null;
    }
    updateStatus('🗑️ Delete mode - Click objects to remove');
  } else {
    createPreviewObject();
    updateStatus('🏗️ Build mode');
  }
});

clearAllBtn.addEventListener('click', () => {
  if (confirm('Clear all objects?')) {
    gameState.placedObjects.forEach(obj => {
      scene.remove(obj.object);
    });
    gameState.placedObjects = [];
    updateObjectCount();
    updateStatus('🔄 Cleared all objects');
  }
});

gridToggle.addEventListener('change', (e) => {
  gridHelper.visible = e.target.checked;
});

objectButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    objectButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    gameState.selectedObject = btn.dataset.object;
    gameState.deleteMode = false;
    deleteModeBtn.classList.remove('active');

    createPreviewObject();

    const template = voxelObjects[gameState.selectedObject];
    updateStatus(`Selected: ${template.name}`);
  });
});

// ==================== UI更新函數 ====================
function updateStatus(message) {
  document.getElementById('status').textContent = message;
}

function updateObjectCount() {
  document.getElementById('objectCount').textContent = gameState.placedObjects.length;
}

// ==================== 動畫循環 ⭐ 增強版 ====================
const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  const delta = clock.getDelta();

  // 1. 島嶼懸浮動畫
  island.position.y = Math.sin(elapsed * island.userData.floatSpeed) * 0.3;

  // 2. ⭐ 漂浮岩石動畫（上下移動 + 旋轉）
  floatingRocks.rocks.forEach(rock => {
    // 上下浮動
    rock.mesh.position.y = rock.baseY + Math.sin(elapsed * rock.floatSpeed + rock.offset) * 1.5;

    // 緩慢旋轉
    rock.mesh.rotation.y += delta * rock.rotateSpeed;
    rock.mesh.rotation.x += delta * rock.rotateSpeed * 0.5;
  });

  // 3. ⭐ 雲朵環繞動畫
  cloudBand.clouds.forEach((cloud, index) => {
    // 環繞島嶼旋轉
    const currentAngle = cloud.startAngle + elapsed * cloud.rotateSpeed;
    const radius = 25 + index * 0.8;
    cloud.mesh.position.x = Math.cos(currentAngle) * radius;
    cloud.mesh.position.z = Math.sin(currentAngle) * radius;

    // 輕微上下飄動
    cloud.mesh.position.y += Math.sin(elapsed * 0.5 + index) * 0.005;
  });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ==================== 窗口調整 ====================
function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resizeRenderer);
resizeRenderer();

// ==================== 啟動 ====================
createPreviewObject();
updateStatus('🏝️ Welcome to My Island! Click to place objects');
animate();
