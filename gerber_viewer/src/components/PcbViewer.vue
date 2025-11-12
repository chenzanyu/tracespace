<template>
  <div ref="container" class="viewer" :style="{ width: containerWidth, height: containerHeight }"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick, defineExpose } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CanvasGeometry } from '../three/CanvasGeometry.js';
import { SRGBColorSpace } from 'three';

const props = defineProps({
  topUrl: { type: String, required: true },
  bottomUrl: { type: String, required: true },
  thickness: { type: Number, default: 0.016 },
  borderColor: { type: String, default: 'rgb(255, 235, 150)' },
  resolution: { type: Number, default: 2400 },
  backgroundColor: { type: String, default: '#0f1220' },
  containerWidth: { type: String, default: '70vw' },
  containerHeight: { type: String, default: '60vh' },
  fitPadding: { type: Number, default: 1.1 },
  fitLerpMs: { type: Number, default: 150 }
});

const container = ref(null);
let renderer, camera, scene, controls, mesh;
let geometryBox = null;

let running = false;
let rafId = 0;
let stopCount = 0;

const render = () => { if (renderer && scene && camera) renderer.render(scene, camera); };

const startLoop = () => { if (!running) { running = true; rafId = requestAnimationFrame(animate); } };
const stopLoopSoon = () => {
  if (!running) return;
  if (stopCount < 3) { stopCount++; rafId = requestAnimationFrame(animate); }
  else { stopCount = 0; running = false; cancelAnimationFrame(rafId); }
};
const requestRender = () => { if (!running) { controls?.update(); render(); } };

function animate() {
  if (!running) return;

  if (pendingResize) { pendingResize = false; commitRendererSize(); }

  // 推进相机平滑
  if (fitLerp.active) {
    const now = performance.now();
    const t = Math.min(1, (now - fitLerp.startTime) / Math.max(1, fitLerp.duration));
    const z = fitLerp.startZ + (fitLerp.targetZ - fitLerp.startZ) * t;
    camera.position.set(0, 0, z);
    if (t >= 1) { fitLerp.active = false; controls.enabled = true; }
  }

  const prevCamPos = camera.position.clone();
  const prevTarget = controls.target.clone();
  controls.update();
  render();

  const moved = prevCamPos.distanceToSquared(camera.position) > 1e-10 ||
                prevTarget.distanceToSquared(controls.target) > 1e-10;

  if (!moved && !fitLerp.active) { stopLoopSoon(); return; }
  rafId = requestAnimationFrame(animate);
}

/* ---------- 光栅化 & 纹理 ---------- */
let currentRasterRes = 0;
let topTexture = null, bottomTexture = null;
let topMaterial = null, bottomMaterial = null, sideMaterial = null;

function getTargetRasterRes() {
  if (!container.value) return props.resolution;
  const r = container.value.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return Math.max(props.resolution || 0, Math.ceil(Math.max(r.width, r.height) * dpr * 1.25));
}
function setupTextureParams(tex, { repeatX = 1 } = {}) {
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.x = repeatX;
  const maxAniso = renderer?.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  tex.anisotropy = Math.min(maxAniso || 1, 8);
  tex.needsUpdate = true;
}
function disposeTextures() { topTexture?.dispose?.(); bottomTexture?.dispose?.(); }

function loadSvgToCanvas(url, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (img.width > img.height) {
        canvas.width = size; canvas.height = Math.round((img.height / img.width) * size);
        const s = size / img.width; ctx.imageSmoothingEnabled = false; ctx.setTransform(s,0,0,s,0,0); ctx.drawImage(img,0,0);
      } else {
        canvas.height = size; canvas.width = Math.round((img.width / img.height) * size);
        const s = size / img.height; ctx.imageSmoothingEnabled = false; ctx.setTransform(s,0,0,s,0,0); ctx.drawImage(img,0,0);
      }
      resolve({ canvas, context: ctx, image: img, width: canvas.width, height: canvas.height });
    };
    img.onerror = reject; img.src = url;
  });
}

/** force=true 时无视阈值；return 值表明是否需要重建几何（当 topUrl 变更时） */
async function rasterizeAndUpdateTextures(force = false) {
  const targetRes = getTargetRasterRes();
  if (!force && currentRasterRes && targetRes <= currentRasterRes * 1.15) return false;

  const [topCanvasObj, bottomCanvasObj] = await Promise.all([
    loadSvgToCanvas(props.topUrl, targetRes),
    loadSvgToCanvas(props.bottomUrl, targetRes)
  ]);

  // 边界像素用 borderColor，避免边沿采样问题
  topCanvasObj.context.save();
  topCanvasObj.context.fillStyle = props.borderColor;
  topCanvasObj.context.fillRect(0, topCanvasObj.height - 1, 1, 1);
  topCanvasObj.context.restore();

  disposeTextures();

  topTexture = new THREE.CanvasTexture(topCanvasObj.canvas);
  setupTextureParams(topTexture, { repeatX: 1 });

  bottomTexture = new THREE.CanvasTexture(bottomCanvasObj.canvas);
  setupTextureParams(bottomTexture, { repeatX: -1 });

  if (!topMaterial || !bottomMaterial) {
  topMaterial = new THREE.MeshBasicMaterial({
    map: topTexture,
    side: THREE.FrontSide,   // 顶面：画正面
    transparent: false,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,     // 轻微“向前拉”，避免与侧面并深
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  bottomMaterial = new THREE.MeshBasicMaterial({
    map: bottomTexture,
    side: THREE.FrontSide,   // 底面同样画正面（你的底面法线也朝外）
    transparent: false,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,     // 同样“向前拉”
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
} else {
  topMaterial.map = topTexture; topMaterial.needsUpdate = true;
  bottomMaterial.map = bottomTexture; bottomMaterial.needsUpdate = true;
}

  currentRasterRes = targetRes;
  requestRender();
  return true; // 纹理已更新；若顶层 SVG 可能变形，建议重建几何
}

/* ---------- 几何重建（形状/厚度变化） ---------- */
function rebuildGeometry() {
  if (!topTexture?.image) return;
  // 移除旧 mesh
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry?.dispose?.();
    mesh = null;
  }

  const geometry = new CanvasGeometry(topTexture.image, {
    height: props.thickness,
    solid: true,
    offset: 3,
    steps: 10,
    material: 0,
    extrudeMaterial: 2
  });

  // 居中与 bbox
  geometry.computeBoundingBox();
  const preBox = geometry.boundingBox.clone();
  const center = new THREE.Vector3(); preBox.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  geometryBox = geometry.boundingBox.clone();

  mesh = new THREE.Mesh(geometry, [topMaterial, bottomMaterial, sideMaterial]);
  scene.add(mesh);

  // 重建后，按当前容器尺寸平滑自适应一次
  smoothRefitToBox();
  requestRender();
}

/* ---------- 背景同步 ---------- */
function applyBackground() {
  const c = new THREE.Color(props.backgroundColor);
  scene.background = c;
  renderer?.setClearColor(c, 1);
  if (renderer?.domElement) renderer.domElement.style.background = props.backgroundColor;
}

/* ---------- 相机 Fit 工具 ---------- */
function computeFitDistanceForBox(camera, box, containerWidth, containerHeight, padding = 1.1) {
  if (!box || containerWidth <= 0 || containerHeight <= 0) return camera.position.z;
  const size = new THREE.Vector3(); box.getSize(size);
  const halfY = size.y / 2, halfX = size.x / 2;
  const vFOV = (camera.fov * Math.PI) / 180;
  const aspect = Math.max(0.0001, containerWidth / containerHeight);
  const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * aspect);
  const distanceV = halfY / Math.tan(vFOV / 2);
  const distanceH = halfX / Math.tan(hFOV / 2);
  let d = Math.max(distanceV, distanceH) * Math.max(0.0001, padding);
  return Math.min(Math.max(d, 1e-6), 1e6);
}

const fitLerp = { active: false, startZ: 0, targetZ: 0, startTime: 0, duration: 150 };

function smoothRefitToBox() {
  if (!renderer || !camera || !geometryBox) return;
  const r = container.value.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  const targetZ = computeFitDistanceForBox(camera, geometryBox, w, h, Math.max(0.0001, props.fitPadding));
  if (Math.abs(camera.position.z - targetZ) < 1e-6) return;
  fitLerp.active = true;
  fitLerp.startZ = camera.position.z;
  fitLerp.targetZ = targetZ;
  fitLerp.startTime = performance.now();
  fitLerp.duration = Math.max(0, props.fitLerpMs || 150);
  controls.enabled = false;
  startLoop();
}

/* ---------- Resize：同帧 setSize + 平滑自适应 ---------- */
let ro, pendingResize = false, spinTimer = 0;

function commitRendererSize() {
  if (!container.value || !renderer) return;
  const r = container.value.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // 每次尺寸变化都按当前 bbox 平滑到能容纳的距离
  if (geometryBox) smoothRefitToBox();

  controls?.target.set(0, 0, 0);
  requestRender();
}

/* ---------- 生命周期 ---------- */
onMounted(async () => {
  if (!container.value) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.0001, 1000);
  camera.position.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({
    antialias: true, powerPreference: 'high-performance',
    alpha: false, depth: true, stencil: false, premultipliedAlpha: false
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.value.appendChild(renderer.domElement);
  applyBackground();

  // 首帧尺寸
  commitRendererSize();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.zoomSpeed = 0.6; controls.rotateSpeed = 0.6;
  controls.addEventListener('start', () => { stopCount = 0; startLoop(); });
  controls.addEventListener('change', () => { startLoop(); });
  controls.addEventListener('end', () => { stopLoopSoon(); });

  // 材质（侧面）
  sideMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(props.borderColor || 'rgb(255,235,150)'),
    side: THREE.DoubleSide, opacity: 0.9, transparent: true
  });
  const gl = renderer.getContext();
  const isWebGL2 = !!(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
  const ctxAttr = gl?.getContextAttributes?.();
  if (isWebGL2 && ctxAttr?.antialias && 'alphaToCoverage' in sideMaterial) sideMaterial.alphaToCoverage = true;

  // 纹理与几何
  await rasterizeAndUpdateTextures(true); // 首次强制
  rebuildGeometry();

  // ResizeObserver：同帧提交尺寸 + 平滑相机
  ro = new ResizeObserver(() => {
    pendingResize = true;
    startLoop();
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => {
      stopLoopSoon();
      rasterizeAndUpdateTextures().then(requestRender);
    }, 180);
  });
  ro.observe(container.value);
});

onBeforeUnmount(() => {
  ro?.disconnect?.();
  clearTimeout(spinTimer);
  cancelAnimationFrame(rafId);
  controls?.dispose();
  disposeTextures();
  renderer?.dispose();
  if (mesh) { mesh.geometry?.dispose?.(); }
  if (container.value && renderer?.domElement?.parentNode === container.value) {
    container.value.removeChild(renderer.domElement);
  }
});

/* ---------- 对外暴露：手动重新取景 ---------- */
defineExpose({
  async refit() {
    await nextTick();
    smoothRefitToBox();
  }
});

/* ---------- 响应外部 prop 变化 ---------- */
// 1) SVG/分辨率/边界色变化：重采样；若 SVG 形变则重建几何
watch(() => [props.topUrl, props.bottomUrl], async () => {
  const updated = await rasterizeAndUpdateTextures(true); // 强制
  if (updated) rebuildGeometry(); // SVG 变了，重建几何
});
watch(() => props.resolution, async () => {
  await rasterizeAndUpdateTextures(true);
  // 仅清晰度变化，不必重建几何
  requestRender();
});
watch(() => props.borderColor, async () => {
  // 更新侧面材质颜色
  sideMaterial?.color?.set(props.borderColor);
  // 影响顶图边缘像素 → 重新光栅化（并更新材质）
  await rasterizeAndUpdateTextures(true);
  requestRender();
});

// 2) 厚度变化：重建几何
watch(() => props.thickness, () => {
  rebuildGeometry();
});

// 3) 背景色变化
watch(() => props.backgroundColor, () => {
  applyBackground();
  requestRender();
});

// 4) 自适应参数变化：按当前尺寸平滑相机
watch(() => props.fitPadding, () => { smoothRefitToBox(); });
watch(() => props.fitLerpMs,  () => { /* 下次过渡会使用新时长 */ });

// 5) 容器宽高字符串变更（父组件可能动态切换百分比/像素）
watch(() => [props.containerWidth, props.containerHeight], () => {
  // 下一帧会触发 ResizeObserver；这里手动请求一次渲染即可
  requestRender();
});
</script>

<style scoped>
.viewer { overflow: hidden; background: #0f1220; }
</style>
