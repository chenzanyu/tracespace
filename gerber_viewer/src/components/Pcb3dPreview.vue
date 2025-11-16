<template>
  <div
    ref="container"
    class="viewer"
    :style="{ width: containerWidth, height: containerHeight, display: active ? 'block' : 'none' }"
  ></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick, defineExpose, defineEmits } from 'vue'
import * as THREE from 'three'
import { SRGBColorSpace } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CanvasGeometry } from '../libs/3d/CanvasGeometry'
const createGeometryWorker = () => new Worker(new URL('../workers/canvasGeometry.worker.js', import.meta.url), { type: 'module' })

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

const emit = defineEmits(['loading-change'])

const container = ref(null)
let renderer = null
let camera = null
let scene = null
let controls = null
let mesh = null
let geometryBox = null

let running = false
let rafId = 0
let stopCount = 0
let ro = null
let pendingResize = false
let spinTimer = 0
let refreshQueued = false
let refreshForce = false
let loadingDepth = 0
let geometryWorker = null
const geometryWorkerJobs = new Map()
let geometryWorkerSeq = 0
let geometryBuildToken = 0
let geometryWorkerFailed = false

const pushLoading = () => {
  loadingDepth += 1
  if (loadingDepth === 1) emit('loading-change', true)
}

const popLoading = () => {
  if (loadingDepth === 0) return
  loadingDepth -= 1
  if (loadingDepth === 0) emit('loading-change', false)
}

const renderScene = () => { if (renderer && scene && camera) renderer.render(scene, camera) }

const startLoop = () => { if (!running) { running = true; rafId = requestAnimationFrame(animate) } }
const stopLoopSoon = () => {
  if (!running) return
  if (stopCount < 3) { stopCount++; rafId = requestAnimationFrame(animate) }
  else {
    stopCount = 0
    running = false
    cancelAnimationFrame(rafId)
  }
}
const requestRender = () => { if (!running) { controls?.update(); renderScene() } }

const fitLerp = { active: false, startZ: 0, targetZ: 0, startTime: 0, duration: 150 }

const animate = () => {
  if (!running) return
  if (pendingResize) {
    pendingResize = false
    commitRendererSize()
  }
  if (fitLerp.active && camera && controls) {
    const now = performance.now()
    const t = Math.min(1, (now - fitLerp.startTime) / Math.max(1, fitLerp.duration))
    const z = fitLerp.startZ + (fitLerp.targetZ - fitLerp.startZ) * t
    camera.position.set(0, 0, z)
    if (t >= 1) { fitLerp.active = false; controls.enabled = true }
  }
  const prevCamPos = camera ? camera.position.clone() : null
  const prevTarget = controls ? controls.target.clone() : null
  controls?.update()
  renderScene()
  const moved = (camera && prevCamPos && camera.position.distanceToSquared(prevCamPos) > 1e-10)
    || (controls && prevTarget && controls.target.distanceToSquared(prevTarget) > 1e-10)
  if (!moved && !fitLerp.active) { stopLoopSoon(); return }
  rafId = requestAnimationFrame(animate)
}

let currentRasterRes = 0
let topTexture = null
let bottomTexture = null
let topMaterial = null
let bottomMaterial = null
let sideMaterial = null

const getTargetRasterRes = () => {
  if (!container.value) return props.resolution
  const rect = container.value.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  return Math.max(props.resolution || 0, Math.ceil(Math.max(rect.width, rect.height) * dpr * 1.25))
}

const setupTextureParams = (tex, { repeatX = 1 } = {}) => {
  tex.colorSpace = SRGBColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.x = repeatX
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1
  tex.anisotropy = Math.min(maxAniso || 1, 8)
  tex.needsUpdate = true
}

const disposeTextures = () => {
  topTexture?.dispose?.()
  bottomTexture?.dispose?.()
  topTexture = null
  bottomTexture = null
}

const handleGeometryWorkerMessage = (event) => {
  const { id, success, payload, message } = event.data || {}
  if (!id) return
  const job = geometryWorkerJobs.get(id)
  if (!job) return
  geometryWorkerJobs.delete(id)
  if (!success) {
    job.reject(new Error(message || 'geometry worker failed'))
    return
  }
  job.resolve(payload)
}

const failAllGeometryJobs = (error) => {
  geometryWorkerJobs.forEach(({ reject }) => reject(error))
  geometryWorkerJobs.clear()
}

const ensureGeometryWorker = () => {
  if (geometryWorkerFailed) return null
  if (geometryWorker) return geometryWorker
  try {
    geometryWorker = createGeometryWorker()
    geometryWorker.onmessage = handleGeometryWorkerMessage
    geometryWorker.onerror = (err) => {
      failAllGeometryJobs(err instanceof Error ? err : new Error('geometry worker error'))
      geometryWorker?.terminate()
      geometryWorker = null
      geometryWorkerFailed = true
    }
    return geometryWorker
  } catch (error) {
    geometryWorkerFailed = true
    console.warn('[Pcb3dPreview] geometry worker unavailable', error)
    return null
  }
}

const terminateGeometryWorker = () => {
  if (!geometryWorker && geometryWorkerJobs.size === 0) return
  failAllGeometryJobs(new Error('geometry worker terminated'))
  geometryWorker?.terminate?.()
  geometryWorker = null
}

const createTextureFromImage = (image, { repeatX = 1 } = {}) => {
  if (!image) return null
  const isCanvasLike = typeof image.getContext === 'function'
  const texture = isCanvasLike ? new THREE.CanvasTexture(image) : new THREE.Texture(image)
  setupTextureParams(texture, { repeatX })
  texture.needsUpdate = true
  return texture
}

// 从当前 top 纹理重新抓取像素数据（用于 Worker 同步回退）
const captureGeometrySourceFromTexture = () => {
  const image = topTexture?.image
  if (!image) return null
  const width = image.width || image.videoWidth || image.naturalWidth || image.displayWidth || image.clientWidth || 0
  const height = image.height || image.videoHeight || image.naturalHeight || image.displayHeight || image.clientHeight || 0
  if (!width || !height) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    return { width, height, data: imageData.data.buffer, canvas }
  } catch (error) {
    console.warn('[Pcb3dPreview] captureGeometrySource failed', error)
    return null
  }
}

// 将 geometrySource 转成 canvas，供同步构建或者作为纹理复用
const ensureCanvasFromSource = (source) => {
  if (!source) return null
  if (source.canvas && typeof source.canvas.getContext === 'function') return source.canvas
  const { width, height } = source
  if (!width || !height) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (source.bitmap && typeof ctx.drawImage === 'function') {
    ctx.drawImage(source.bitmap, 0, 0, width, height)
  } else if (source.data) {
    const buffer = source.data instanceof ArrayBuffer
      ? source.data
      : ArrayBuffer.isView(source.data)
        ? source.data.buffer
        : null
    if (!buffer) return null
    const array = new Uint8ClampedArray(buffer)
    const imageData = new ImageData(array, width, height)
    ctx.putImageData(imageData, 0, 0)
  } else {
    return null
  }
  return canvas
}

const bufferGeometryFromWorkerPayload = (payload) => {
  const geometry = new THREE.BufferGeometry()
  if (!payload) return geometry
  const castArray = (value) => {
    if (value instanceof Float32Array) return value
    if (ArrayBuffer.isView(value)) return new Float32Array(value.buffer, value.byteOffset, value.length)
    if (value instanceof ArrayBuffer) return new Float32Array(value)
    return new Float32Array()
  }
  const positions = castArray(payload.positions)
  const normals = castArray(payload.normals)
  const uvs = castArray(payload.uvs)
  if (positions.length) geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  if (normals.length) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  if (uvs.length) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.clearGroups()
  if (Array.isArray(payload.groups)) {
    for (const group of payload.groups) {
      geometry.addGroup(group.start || 0, group.count || 0, group.materialIndex || 0)
    }
  }
  if (payload.boundingBox?.min && payload.boundingBox?.max) {
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3().fromArray(payload.boundingBox.min),
      new THREE.Vector3().fromArray(payload.boundingBox.max),
    )
  } else {
    geometry.computeBoundingBox()
  }
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals()
  }
  return geometry
}

const buildGeometryViaWorker = (source) => {
  const worker = ensureGeometryWorker()
  if (!worker) return Promise.reject(new Error('geometry worker unavailable'))
  const { width, height } = source || {}
  const buffer = source?.data instanceof ArrayBuffer
    ? source.data
    : ArrayBuffer.isView(source?.data)
      ? source.data.buffer
      : null
  if (!width || !height || !buffer || buffer.byteLength === 0) {
    return Promise.reject(new Error('missing image data for geometry worker'))
  }
  const jobId = ++geometryWorkerSeq
  const options = {
    height: props.thickness,
    solid: true,
    offset: 3,
    steps: 10,
    material: 0,
    extrudeMaterial: 2,
  }
  return new Promise((resolve, reject) => {
    geometryWorkerJobs.set(jobId, { resolve, reject })
    try {
      worker.postMessage(
        { id: jobId, image: { width, height, data: buffer }, options },
        [buffer],
      )
      source.data = null
    } catch (error) {
      geometryWorkerJobs.delete(jobId)
      reject(error)
    }
  })
}

const buildGeometrySynchronously = (source) => {
  const canvas = ensureCanvasFromSource(source)
  if (!canvas) return null
  const geometry = new CanvasGeometry(canvas, {
    height: props.thickness,
    solid: true,
    offset: 3,
    steps: 10,
    material: 0,
    extrudeMaterial: 2,
  })
  geometry.computeBoundingBox()
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  return geometry
}

const runGeometryBuild = async (source) => {
  if (!source) return null
  try {
    const payload = await buildGeometryViaWorker(source)
    return bufferGeometryFromWorkerPayload(payload)
  } catch (error) {
    console.warn('[Pcb3dPreview] geometry worker failed, using sync fallback', error)
    const message = error?.message || ''
    if (message.includes('geometry worker unavailable') || message.includes('OffscreenCanvas')) {
      geometryWorkerFailed = true
    }
    return buildGeometrySynchronously(source)
  }
}

// 兼容性最好的主线程 SVG -> Canvas 实现（用 <img> + drawImage）
const loadSvgStringToCanvas = (svgString, size) => new Promise((resolve, reject) => {
  if (!svgString) {
    reject(new Error('SVG source missing'))
    return
  }
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    URL.revokeObjectURL(url)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('2d context unavailable'))
      return
    }
    if (img.width > img.height) {
      canvas.width = size
      canvas.height = Math.max(1, Math.round((img.height / Math.max(1, img.width)) * size))
      const scale = size / Math.max(1, img.width)
      ctx.imageSmoothingEnabled = false
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
    } else {
      canvas.height = size
      canvas.width = Math.max(1, Math.round((img.width / Math.max(1, img.height)) * size))
      const scale = size / Math.max(1, img.height)
      ctx.imageSmoothingEnabled = false
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
    }
    ctx.drawImage(img, 0, 0)
    resolve({ canvas, context: ctx, width: canvas.width, height: canvas.height })
  }
  img.onerror = (err) => {
    URL.revokeObjectURL(url)
    reject(err)
  }
  img.src = url
})

// 包装上色/边框后返回 canvas + RGBA buffer，供纹理与 Worker 共用
const rasterizeSvgOnMainThread = async (svgString, targetRes, { borderColor, applyBorder }) => {
  const canvasObj = await loadSvgStringToCanvas(svgString, targetRes)
  if (applyBorder) {
    canvasObj.context.save()
    canvasObj.context.fillStyle = borderColor
    canvasObj.context.fillRect(0, Math.max(0, canvasObj.height - 1), 1, 1)
    canvasObj.context.restore()
  }
  const imageData = canvasObj.context.getImageData(0, 0, canvasObj.width, canvasObj.height)
  return {
    canvas: canvasObj.canvas,
    width: canvasObj.width,
    height: canvasObj.height,
    data: imageData.data.buffer,
  }
}

const rasterizeAndUpdateTextures = async (force = false) => {
  if (!props.topSvg || !props.bottomSvg) return { updated: false }
  const targetRes = getTargetRasterRes()
  if (!force && currentRasterRes && targetRes <= currentRasterRes * 1.15) return { updated: false }

  const [topResult, bottomResult] = await Promise.all([
    rasterizeSvgOnMainThread(props.topSvg, targetRes, { borderColor: props.borderColor, applyBorder: true }),
    rasterizeSvgOnMainThread(props.bottomSvg, targetRes, { borderColor: props.borderColor, applyBorder: false }),
  ])

  disposeTextures()
  topTexture = createTextureFromImage(topResult.canvas, { repeatX: 1 })
  bottomTexture = createTextureFromImage(bottomResult.canvas, { repeatX: -1 })

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
  } else {
    topMaterial.map = topTexture
    topMaterial.needsUpdate = true
    bottomMaterial.map = bottomTexture
    bottomMaterial.needsUpdate = true
  }

  currentRasterRes = targetRes
  requestRender()
  const geometrySource = {
    width: topResult.width,
    height: topResult.height,
    data: topResult.data,
    canvas: topResult.canvas,
  }
  return { updated: true, geometrySource }
}

const rebuildGeometry = async (geometrySource = null, { onMeshReady } = {}) => {
  if (!scene || !topMaterial || !bottomMaterial || !sideMaterial) return
  const source = geometrySource || captureGeometrySourceFromTexture()
  if (!source?.data) return
  const token = ++geometryBuildToken
  try {
    const geometry = await runGeometryBuild(source)
    if (!geometry) return
    const beforeBox = geometry.boundingBox ? geometry.boundingBox.clone() : null
    if (beforeBox) {
      const center = new THREE.Vector3()
      beforeBox.getCenter(center)
      geometry.translate(-center.x, -center.y, -center.z)
    }
    geometry.computeBoundingBox()
    if (token !== geometryBuildToken) {
      geometry.dispose?.()
      return
    }
    if (mesh) {
      scene.remove(mesh)
      mesh.geometry?.dispose?.()
      mesh = null
    }
    geometryBox = geometry.boundingBox?.clone() || null
    mesh = new THREE.Mesh(geometry, [topMaterial, bottomMaterial, sideMaterial])
    scene.add(mesh)
    onMeshReady?.()
    smoothRefitToBox()
    requestRender()
  } catch (error) {
    console.error('[Pcb3dPreview] rebuildGeometry failed', error)
  }
}

const applyBackground = () => {
  if (!scene) return
  const color = new THREE.Color(props.backgroundColor)
  scene.background = color
  renderer?.setClearColor(color, 1)
  if (renderer?.domElement) renderer.domElement.style.background = props.backgroundColor
}

const computeFitDistanceForBox = (box, width, height, padding = 1.1) => {
  if (!camera || !box || width <= 0 || height <= 0) return camera?.position.z || 1
  const size = new THREE.Vector3()
  box.getSize(size)
  const halfY = size.y / 2
  const halfX = size.x / 2
  const vFov = (camera.fov * Math.PI) / 180
  const aspect = Math.max(0.0001, width / Math.max(1, height))
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
  const distanceV = halfY / Math.tan(vFov / 2)
  const distanceH = halfX / Math.tan(hFov / 2)
  return Math.min(Math.max(Math.max(distanceV, distanceH) * Math.max(0.0001, padding), 1e-6), 1e6)
}

const smoothRefitToBox = () => {
  if (!renderer || !camera || !geometryBox || !container.value) return
  const rect = container.value.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  const targetZ = computeFitDistanceForBox(geometryBox, w, h, Math.max(0.0001, props.fitPadding))
  if (Math.abs(camera.position.z - targetZ) < 1e-6) return
  fitLerp.active = true
  fitLerp.startZ = camera.position.z
  fitLerp.targetZ = targetZ
  fitLerp.startTime = performance.now()
  fitLerp.duration = Math.max(0, props.fitLerpMs || 150)
  if (controls) controls.enabled = false
  startLoop()
}

const commitRendererSize = ({ refit = true } = {}) => {
  if (!container.value || !renderer || !camera) return
  const rect = container.value.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  if (refit && geometryBox) smoothRefitToBox()
  controls?.target.set(0, 0, 0)
  requestRender()
}

const initThree = async () => {
  if (!container.value) return

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.0001, 1000)
  camera.position.set(0, 0, 1)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.value.appendChild(renderer.domElement)
  applyBackground()
  commitRendererSize()

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.zoomSpeed = 0.6
  controls.rotateSpeed = 0.6
  controls.addEventListener('start', () => { stopCount = 0; startLoop() })
  controls.addEventListener('change', () => { startLoop() })
  controls.addEventListener('end', () => { stopLoopSoon() })

  sideMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(props.borderColor || 'rgb(255,235,150)'),
    side: THREE.DoubleSide,
    opacity: 0.9,
    transparent: true,
  })
  const gl = renderer.getContext()
  const isWebGL2 = !!(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)
  const ctxAttr = gl?.getContextAttributes?.()
  if (isWebGL2 && ctxAttr?.antialias && sideMaterial && 'alphaToCoverage' in sideMaterial) {
    sideMaterial.alphaToCoverage = true
  }

  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      pendingResize = true
      startLoop()
      clearTimeout(spinTimer)
      spinTimer = window.setTimeout(() => {
        stopLoopSoon()
        rasterizeAndUpdateTextures()
          .then((result) => {
            if (result?.updated) return rebuildGeometry(result.geometrySource)
            return null
          })
          .catch((error) => { console.error('[Pcb3dPreview] resize rasterize failed', error) })
          .finally(() => requestRender())
      }, 180)
    })
    ro.observe(container.value)
  }
}

const destroyThree = () => {
  ro?.disconnect?.()
  ro = null
  clearTimeout(spinTimer)
  cancelAnimationFrame(rafId)
  stopLoopSoon()
  controls?.dispose?.()
  disposeTextures()
  sideMaterial?.dispose?.()
  sideMaterial = null
  renderer?.dispose?.()
  terminateGeometryWorker()
  terminateRasterWorker()
  if (mesh) {
    mesh.geometry?.dispose?.()
    mesh = null
  }
  if (container.value && renderer?.domElement?.parentNode === container.value) {
    container.value.removeChild(renderer.domElement)
  }
  scene = null
  renderer = null
  camera = null
  controls = null
  geometryBox = null
  refreshQueued = false
  refreshForce = false
  loadingDepth = 0
  emit('loading-change', false)
}

const refreshPreview = async (force = false) => {
  if (!renderer || !scene || !camera || !container.value || !props.active) {
    refreshQueued = true
    refreshForce = refreshForce || force
    return
  }
  const shouldForce = force || refreshForce
  refreshQueued = false
  refreshForce = false
  pushLoading()
  let loadingCleared = false
  const resolveLoading = () => {
    if (!loadingCleared) {
      loadingCleared = true
      popLoading()
    }
  }
  try {
    if (!props.topSvg || !props.bottomSvg) {
      if (mesh && scene) {
        scene.remove(mesh)
        mesh.geometry?.dispose?.()
        mesh = null
      }
      geometryBox = null
      disposeTextures()
      requestRender()
      resolveLoading()
      return
    }
    const rasterResult = await rasterizeAndUpdateTextures(shouldForce)
    if (rasterResult?.updated) {
      await rebuildGeometry(rasterResult.geometrySource, { onMeshReady: resolveLoading })
    } else {
      requestRender()
      resolveLoading()
    }
  } catch (error) {
    console.error('[Pcb3dPreview] rasterize failed', error)
    resolveLoading()
  } finally {
    resolveLoading()
  }
}

defineExpose({
  async refit() {
    await nextTick()
    smoothRefitToBox()
  },
  async resetView() {
    if (!controls || !camera) return
    controls.reset()
    controls.update()
    await nextTick()
    smoothRefitToBox()
    requestRender()
  },
})

watch(() => [props.topSvg, props.bottomSvg], async () => {
  await refreshPreview(true)
})

watch(() => props.resolution, async () => {
  await refreshPreview(true)
})

watch(() => props.borderColor, async () => {
  sideMaterial?.color?.set(props.borderColor)
  await refreshPreview(true)
})

watch(() => props.thickness, async () => {
  await refreshPreview(true)
})

watch(() => props.backgroundColor, () => {
  applyBackground()
  requestRender()
})

watch(() => props.fitPadding, () => { smoothRefitToBox() })
watch(() => props.fitLerpMs, () => { /* 下次拟合会使用新的过渡时长 */ })

watch(() => [props.containerWidth, props.containerHeight], () => {
  requestRender()
})

watch(() => props.active, async (isActive) => {
  if (!isActive) {
    stopLoopSoon()
    return
  }
  await nextTick()
  commitRendererSize({ refit: false })
  requestRender()
  if (refreshQueued || refreshForce) await refreshPreview()
})

onMounted(async () => {
  await initThree()
  await nextTick()
  await refreshPreview(true)
})

onBeforeUnmount(() => {
  destroyThree()
})
</script>

<style scoped>
.viewer {
  position: relative;
  overflow: hidden;
  background: #0f1220;
}
</style>
