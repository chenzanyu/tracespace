<template>
  <div ref="container" class="viewer" :style="{ width: containerWidth, height: containerHeight, display: active ? 'block' : 'none' }"></div>
</template>

<script setup>
/**
 * PCB 3D 预览：基于 Three.js 渲染，由 top/bottom SVG 生成纹理。
 * - 支持 OffscreenCanvas Worker 异步栅格化，避免主线程阻塞；
 * - 未支持 OffscreenCanvas 的环境使用 requestIdleCallback 分片处理。
 */
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { SRGBColorSpace } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CanvasGeometry } from '../libs/3d/CanvasGeometry'

const props = defineProps({
  topSvg: { type: String, required: true },
  bottomSvg: { type: String, required: true },
  thickness: { type: Number, default: 0.016 },
  borderColor: { type: String, default: 'rgb(255, 235, 150)' },
  backgroundColor: { type: String, default: '#0f1220' },
  containerWidth: { type: String, default: '100%' },
  containerHeight: { type: String, default: '100%' },
  resolution: { type: Number, default: 2400 },
  fitPadding: { type: Number, default: 1.1 },
  fitLerpMs: { type: Number, default: 150 },
  active: { type: Boolean, default: true },
})

const container = ref(null)
let renderer, camera, scene, controls, mesh
let geometryBox = null
let running = false
let rafId = 0
let stopCount = 0

const renderScene = () => { if (renderer && scene && camera) renderer.render(scene, camera) }

const startLoop = () => { if (!running) { running = true; rafId = requestAnimationFrame(animate) } }
const stopLoopSoon = () => {
  if (!running) return
  if (stopCount < 3) { stopCount++; rafId = requestAnimationFrame(animate) }
  else { stopCount = 0; running = false; cancelAnimationFrame(rafId) }
}
const requestRender = () => { if (!running) { controls?.update(); renderScene() } }

let pendingResize = false
const scheduleResize = () => { pendingResize = true; requestRender() }

let fitLerp = { active: false, startTime: 0, duration: 0, startZ: 0, targetZ: 0 }

const animate = () => {
  if (!running) return
  if (pendingResize) { pendingResize = false; commitRendererSize() }
  if (fitLerp.active) {
    const now = performance.now()
    const t = Math.min(1, (now - fitLerp.startTime) / Math.max(1, fitLerp.duration))
    const z = fitLerp.startZ + (fitLerp.targetZ - fitLerp.startZ) * t
    camera.position.set(0, 0, z)
    if (t >= 1) { fitLerp.active = false; controls.enabled = true }
  }
  const prevCamPos = camera.position.clone()
  const prevTarget = controls.target.clone()
  controls.update()
  renderScene()
  const moved = prevCamPos.distanceToSquared(camera.position) > 1e-10 ||
    prevTarget.distanceToSquared(controls.target) > 1e-10
  if (!moved && !fitLerp.active) { stopLoopSoon(); return }
  rafId = requestAnimationFrame(animate)
}

/* ---------- Worker 支持检测 ---------- */
let rasterWorker = null
let rasterJobId = 0
const supportsWorkerRaster = () => typeof window !== 'undefined'
  && 'OffscreenCanvas' in window
  && typeof Worker !== 'undefined'

const ensureRasterWorker = () => {
  if (!supportsWorkerRaster()) return null
  if (!rasterWorker) {
    rasterWorker = new Worker(new URL('../workers/svgRaster.worker.js', import.meta.url), { type: 'module' })
  }
  return rasterWorker
}

const waitForIdle = () => new Promise((resolve) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve())
  else setTimeout(resolve, 16)
})

const getTargetRasterRes = () => {
  if (!container.value) return props.resolution
  const rect = container.value.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  return Math.max(props.resolution || 0, Math.ceil(Math.max(rect.width, rect.height) * dpr * 1.25))
}

let currentRasterRes = 0
let topTexture = null
let bottomTexture = null
let topMaterial = null
let bottomMaterial = null
let sideMaterial = null

const disposeTextures = () => {
  topTexture?.dispose?.()
  bottomTexture?.dispose?.()
}

const setupTextureParams = (tex, { repeatX = 1 } = {}) => {
  tex.colorSpace = SRGBColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.x = repeatX
  const maxAniso = renderer?.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1
  tex.anisotropy = Math.min(maxAniso || 1, 8)
  tex.needsUpdate = true
}

const rasterizeWithWorker = async (targetRes) => {
  const worker = ensureRasterWorker()
  if (!worker) throw new Error('worker unsupported')
  rasterJobId += 1
  const jobId = rasterJobId
  const payload = [
    { svgContent: props.topSvg, targetRes, borderColor: props.borderColor, role: 'top' },
    { svgContent: props.bottomSvg, targetRes, borderColor: props.borderColor, role: 'bottom' },
  ]
  const resultPromise = new Promise((resolve, reject) => {
    const handle = (event) => {
      if (event.data?.id !== jobId) return
      worker.removeEventListener('message', handle)
      if (event.data.success) resolve(event.data.results)
      else reject(new Error(event.data.message || 'worker failed'))
    }
    worker.addEventListener('message', handle)
    worker.postMessage({ id: jobId, payload })
  })
  const results = await resultPromise
  return results
}

const rasterizeFallback = async (targetRes) => {
  const canvases = []
  const loadOne = async (svg, role) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })
    URL.revokeObjectURL(url)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (img.width > img.height) {
      canvas.width = targetRes
      canvas.height = Math.round((img.height / img.width) * targetRes)
      const scale = targetRes / img.width
      ctx.imageSmoothingEnabled = false
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.drawImage(img, 0, 0)
    } else {
      canvas.height = targetRes
      canvas.width = Math.round((img.width / img.height) * targetRes)
      const scale = targetRes / img.height
      ctx.imageSmoothingEnabled = false
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.drawImage(img, 0, 0)
    }
    if (role === 'top') {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = props.borderColor
      ctx.fillRect(0, canvas.height - 1, 1, 1)
      ctx.restore()
    }
    canvases.push({ role, canvas })
    await waitForIdle()
  }
  await loadOne(props.topSvg, 'top')
  await loadOne(props.bottomSvg, 'bottom')
  return canvases.map(({ role, canvas }) => ({
    role,
    bitmap: canvas,
    width: canvas.width,
    height: canvas.height,
  }))
}

const bitmapToCanvas = (bitmap, width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return canvas
}

const rasterizeAndUpdateTextures = async (force = false) => {
  if (!props.topSvg || !props.bottomSvg) return false
  const targetRes = getTargetRasterRes()
  if (!force && currentRasterRes && targetRes <= currentRasterRes * 1.15) return false
  let results
  try {
    if (supportsWorkerRaster()) {
      results = await rasterizeWithWorker(targetRes)
    } else {
      results = await rasterizeFallback(targetRes)
    }
  } catch (error) {
    console.warn('[Pcb3dPreview] 栅格化失败，回退到主线程', error)
    results = await rasterizeFallback(targetRes)
  }
  disposeTextures()
  for (const item of results) {
    const sourceCanvas = item.bitmap instanceof ImageBitmap
      ? bitmapToCanvas(item.bitmap, item.width, item.height)
      : item.bitmap
    if (item.role === 'top') {
      topTexture = new THREE.CanvasTexture(sourceCanvas)
      setupTextureParams(topTexture, { repeatX: 1 })
    } else {
      bottomTexture = new THREE.CanvasTexture(sourceCanvas)
      setupTextureParams(bottomTexture, { repeatX: -1 })
    }
  }
  if (!topMaterial || !bottomMaterial) {
    topMaterial = new THREE.MeshBasicMaterial({
      map: topTexture,
      side: THREE.FrontSide,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    bottomMaterial = new THREE.MeshBasicMaterial({
      map: bottomTexture,
      side: THREE.FrontSide,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    sideMaterial = new THREE.MeshBasicMaterial({ color: props.borderColor })
  } else {
    topMaterial.map = topTexture
    topMaterial.needsUpdate = true
    bottomMaterial.map = bottomTexture
    bottomMaterial.needsUpdate = true
  }
  currentRasterRes = targetRes
  requestRender()
  return true
}

const rebuildGeometry = () => {
  if (!topTexture?.image) return
  if (mesh) {
    scene.remove(mesh)
    mesh.geometry?.dispose?.()
    mesh = null
  }
  const geometry = new CanvasGeometry(topTexture.image, {
    height: props.thickness,
    solid: true,
    offset: 3,
    steps: 10,
    material: 0,
    extrudeMaterial: 2,
  })
  geometry.computeBoundingBox()
  const preBox = geometry.boundingBox.clone()
  const center = new THREE.Vector3()
  preBox.getCenter(center)
  geometry.translate(-center.x, -center.y, -center.z)
  geometry.computeBoundingBox()
  geometryBox = geometry.boundingBox.clone()
  mesh = new THREE.Mesh(geometry, [topMaterial, bottomMaterial, sideMaterial])
  scene.add(mesh)
  fitViewImmediate()
}

const fitViewImmediate = () => {
  if (!geometryBox || !controls) return
  const size = geometryBox.getSize(new THREE.Vector3())
  const maxSide = Math.max(size.x, size.y)
  const padding = props.fitPadding
  const distance = (maxSide * padding) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  fitLerp = {
    active: true,
    startTime: performance.now(),
    duration: props.fitLerpMs,
    startZ: camera.position.z,
    targetZ: distance,
  }
  controls.enabled = false
  controls.target.set(0, 0, 0)
  startLoop()
}

const commitRendererSize = () => {
  if (!renderer || !container.value) return
  const { clientWidth, clientHeight } = container.value
  renderer.setSize(clientWidth, clientHeight)
  camera.aspect = clientWidth / Math.max(clientHeight, 1)
  camera.updateProjectionMatrix()
}

const initThree = () => {
  if (!container.value) return
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(props.backgroundColor, 1)
  container.value.appendChild(renderer.domElement)
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
  camera.position.set(0, 0, 2)
  scene = new THREE.Scene()
  scene.background = new THREE.Color(props.backgroundColor)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.1
  controls.addEventListener('start', startLoop)
  window.addEventListener('resize', scheduleResize)
  scheduleResize()
}

const destroyThree = () => {
  stopLoopSoon()
  window.removeEventListener('resize', scheduleResize)
  disposeTextures()
  sideMaterial?.dispose?.()
  renderer?.dispose?.()
  if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
  mesh = null
  scene = null
  renderer = null
  controls = null
}

const refreshPreview = async () => {
  if (!props.active) return
  const updated = await rasterizeAndUpdateTextures()
  if (updated) rebuildGeometry()
  requestRender()
}

watch(() => [props.topSvg, props.bottomSvg], () => {
  refreshPreview()
})

watch(() => props.active, async (isActive) => {
  if (!isActive) {
    stopLoopSoon()
    return
  }
  await nextTick()
  scheduleResize()
  refreshPreview()
})

onMounted(async () => {
  initThree()
  await nextTick()
  refreshPreview()
})

onBeforeUnmount(() => {
  destroyThree()
  if (rasterWorker) {
    rasterWorker.terminate()
    rasterWorker = null
  }
})
</script>

<style scoped>
.viewer {
  position: relative;
}
</style>
