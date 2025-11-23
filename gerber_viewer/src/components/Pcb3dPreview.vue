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
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
const createGeometryWorker = () => new Worker(new URL('../workers/canvasGeometry.worker.js', import.meta.url), { type: 'module' })

const props = defineProps({
  topSvg: { type: String, required: true },
  bottomSvg: { type: String, required: true },
  thickness: { type: Number, default: 0.016 },
  borderColor: { type: String, default: 'rgb(255, 235, 150)' },
  backgroundColor: { type: String, default: '#0f1220' },
  containerWidth: { type: String, default: '100%' },
  containerHeight: { type: String, default: '100%' },
  displayWidth: { type: Number, default: 0 },
  displayHeight: { type: Number, default: 0 },
  explosionActive: { type: Boolean, default: false },
  explosionLayers: { type: Array, default: () => [] },
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
let lastFrameTime = 0
let explosionGroup = null
let explosionPlaneGeometry = null
let explosionMeshes = []
let explosionBuildToken = 0
let explosionRebuildScheduled = false
let coreMesh = null
let coreMaterial = null
let exportGeometry = null
const explosionState = { progress: 0, target: 0 }
const explosionLayerSequence = [
  { type: 'drill', side: 'bottom', offsetIndex: -5, opacity: 0.7, color: '#dcdcdc' },
  { type: 'solderpaste', side: 'bottom', offsetIndex: -4, opacity: 0.65, color: '#b4b8c0' },
  { type: 'silkscreen', side: 'bottom', offsetIndex: -3, opacity: 0.95, color: '#ffffff' },
  { type: 'soldermask', side: 'bottom', offsetIndex: -2, opacity: 0.8, color: '#1c7a2a' },
  { type: 'copper', side: 'bottom', offsetIndex: -1, opacity: 0.95, color: '#f2c55b' },
  { type: 'copper', side: 'top', offsetIndex: 1, opacity: 0.95, color: '#f2c55b' },
  { type: 'soldermask', side: 'top', offsetIndex: 2, opacity: 0.8, color: '#1c7a2a' },
  { type: 'silkscreen', side: 'top', offsetIndex: 3, opacity: 0.95, color: '#ffffff' },
  { type: 'solderpaste', side: 'top', offsetIndex: 4, opacity: 0.65, color: '#b4b8c0' },
]

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
  const frameTime = performance.now()
  const delta = lastFrameTime ? frameTime - lastFrameTime : 16
  lastFrameTime = frameTime
  if (pendingResize) {
    pendingResize = false
    commitRendererSize()
  }
  if (fitLerp.active && camera && controls) {
    const t = Math.min(1, (frameTime - fitLerp.startTime) / Math.max(1, fitLerp.duration))
    const z = fitLerp.startZ + (fitLerp.targetZ - fitLerp.startZ) * t
    camera.position.set(0, 0, z)
    if (t >= 1) { fitLerp.active = false; controls.enabled = true }
  }
  const prevCamPos = camera ? camera.position.clone() : null
  const prevTarget = controls ? controls.target.clone() : null
  controls?.update()
  renderScene()
  updateExplosionAnimation(delta)
  updateBaseMeshVisibility()
  const moved = (camera && prevCamPos && camera.position.distanceToSquared(prevCamPos) > 1e-10)
    || (controls && prevTarget && controls.target.distanceToSquared(prevTarget) > 1e-10)
    || Math.abs(explosionState.progress - explosionState.target) > 1e-3
  if (!moved && !fitLerp.active) { stopLoopSoon(); return }
  rafId = requestAnimationFrame(animate)
}

let currentRasterRes = 0
let topTexture = null
let bottomTexture = null
let topMaterial = null
let bottomMaterial = null
let sideMaterial = null

const getHostSize = () => {
  const rect = container.value?.getBoundingClientRect?.()
  const measuredWidth = rect?.width ?? 0
  const measuredHeight = rect?.height ?? 0
  const fallbackWidth = Math.max(0, props.displayWidth || 0)
  const fallbackHeight = Math.max(0, props.displayHeight || 0)
  return {
    width: measuredWidth > 0 ? measuredWidth : fallbackWidth,
    height: measuredHeight > 0 ? measuredHeight : fallbackHeight,
  }
}

const getTargetRasterRes = () => {
  const { width, height } = getHostSize()
  const dpr = window.devicePixelRatio || 1
  const edge = Math.max(width, height, 1)
  return Math.max(props.resolution || 0, Math.ceil(edge * dpr * 1.25))
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
const clearExplosionGroup = () => {
  if (explosionGroup && scene) scene.remove(explosionGroup)
  explosionGroup = null
  explosionMeshes.forEach(({ material, texture }) => {
    texture?.dispose?.()
    material?.dispose?.()
  })
  explosionMeshes = []
  if (explosionPlaneGeometry) {
    explosionPlaneGeometry.dispose()
    explosionPlaneGeometry = null
  }
  explosionState.progress = 0
  explosionState.target = 0
  updateBaseMeshVisibility()
}
const disposeCoreMesh = () => {
  if (coreMesh && scene) {
    scene.remove(coreMesh)
  }
  if (coreMesh?.geometry) coreMesh.geometry.dispose()
  if (coreMaterial) coreMaterial.dispose()
  coreMesh = null
  coreMaterial = null
}
const buildCoreMesh = (geometry) => {
  disposeCoreMesh()
  if (!scene || !geometry) return
  try {
    const thickness = Math.max(props.thickness || 0.016, 0.0005)
    const topZ = thickness / 2
    const bottomZ = -thickness / 2
    const cloned = geometry.clone()
    const position = cloned.getAttribute('position')
    const array = position?.array
    if (array) {
      for (let i = 0; i < array.length; i += 3) {
        array[i + 2] = THREE.MathUtils.clamp(array[i + 2], bottomZ, topZ)
      }
      position.needsUpdate = true
    }
    coreMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(props.borderColor || '#f5d398'),
      transparent: true,
      opacity: 0,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    coreMesh = new THREE.Mesh(cloned, coreMaterial)
    coreMesh.visible = false
    scene.add(coreMesh)
  } catch (error) {
    console.warn('[Pcb3dPreview] buildCoreMesh failed', error)
    disposeCoreMesh()
  }
}
const prepareGeometryForExport = (geometry) => {
  let cloned = geometry.clone()
  if (cloned.index) cloned = cloned.toNonIndexed()
  cloned.computeBoundingBox()
  const bbox = cloned.boundingBox
  const position = cloned.getAttribute('position')
  const normals = cloned.getAttribute('normal')
  const array = position?.array
  if (!array) {
    console.warn('[Pcb3dPreview] export: missing position attribute')
    return cloned
  }
  const thickness = Math.max(props.thickness || 0.016, 0.0005)
  const topZ = bbox?.max?.z ?? thickness / 2
  const bottomZ = bbox?.min?.z ?? -thickness / 2
  const snapGroup = (materialIndex, targetZ) => {
    let applied = 0
    for (const group of cloned.groups || []) {
      if (group.materialIndex !== materialIndex) continue
      const end = group.start + group.count
      for (let idx = group.start; idx < end; idx++) {
        const vertexIndex = idx * 3
        array[vertexIndex + 2] = targetZ
        applied++
      }
    }
    return applied
  }
  const topApplied = snapGroup(0, topZ)
  const bottomApplied = snapGroup(1, bottomZ)
  if (!topApplied || !bottomApplied) {
    console.warn('[Pcb3dPreview] export: group snap incomplete', { topApplied, bottomApplied })
    if (normals) {
      const nArray = normals.array
      let normalApplied = 0
      for (let i = 0; i < array.length; i += 3) {
        const nz = nArray[i + 2]
        if (nz >= 0.9) {
          array[i + 2] = topZ
          normalApplied++
        } else if (nz <= -0.9) {
          array[i + 2] = bottomZ
          normalApplied++
        }
      }
      if (!normalApplied) {
        console.warn('[Pcb3dPreview] export: normal fall-back failed, using sign snap')
        for (let i = 0; i < array.length; i += 3) {
          const z = array[i + 2]
          array[i + 2] = z >= 0 ? topZ : bottomZ
        }
      }
    }
  }
  position.needsUpdate = true
  cloned.computeBoundingBox()
  cloned.computeVertexNormals()
  return cloned
}
const cloneMaterialForExport = (material) => {
  if (!material) return null
  const cloned = material.clone ? material.clone() : material
  cloned.transparent = false
  cloned.opacity = 1
  return cloned
}
const cloneMeshForExport = () => {
  const baseGeometry = exportGeometry || mesh?.geometry
  if (!baseGeometry) {
    console.warn('[Pcb3dPreview] export: source geometry missing')
    return null
  }
  if (!mesh) {
    console.warn('[Pcb3dPreview] export: mesh reference missing')
    return null
  }
  const preparedGeometry = prepareGeometryForExport(baseGeometry)
  const baseMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const clonedMaterials = baseMaterials.map(cloneMaterialForExport)
  const exportMesh = new THREE.Mesh(preparedGeometry, clonedMaterials)
  exportMesh.visible = true
  return exportMesh
}
const updateBaseMeshVisibility = () => {
  const t = THREE.MathUtils.clamp(explosionState.progress, 0, 1)
  const baseOpacity = 1 - t
  const ensureTransparent = (material) => {
    if (!material) return
    if (!material.transparent) material.transparent = true
    material.opacity = baseOpacity
  }
  ensureTransparent(topMaterial)
  ensureTransparent(bottomMaterial)
  ensureTransparent(sideMaterial)
  if (mesh) {
    mesh.visible = baseOpacity > 0.02
  }
  if (coreMaterial && coreMesh) {
    coreMaterial.opacity = Math.min(0.95, 0.25 + t * 0.65)
    coreMesh.visible = t > 0.02
  }
}
const requestExplosionRebuild = () => {
  if (explosionRebuildScheduled) return
  explosionRebuildScheduled = true
  Promise.resolve().then(() => {
    explosionRebuildScheduled = false
    rebuildExplosionGroup().catch((error) => {
      console.warn('[Pcb3dPreview] explosion rebuild failed', error)
    })
  })
}
const computeExplosionOffset = (index, zStep) => {
  const dir = index >= 0 ? 1 : -1
  const magnitude = Math.max(1, Math.abs(index))
  const thickness = Math.max(props.thickness || 0.016, 0.001)
  const topZ = geometryBox?.max?.z ?? thickness / 2
  const bottomZ = geometryBox?.min?.z ?? -thickness / 2
  const epsilon = Math.max(zStep * 0.02, 0.0005)
  const originZ = dir > 0 ? topZ + epsilon : bottomZ - epsilon
  const offset = new THREE.Vector3(0, 0, dir * zStep * magnitude)
  const origin = new THREE.Vector3(0, 0, originZ)
  return { offset, origin }
}
const applyExplosionTransforms = () => {
  if (!explosionGroup) return
  const visible = explosionState.progress > 0.01 || explosionState.target > 0
  explosionMeshes.forEach(({ mesh, offset, origin }) => {
    mesh.position.copy(origin)
    mesh.position.addScaledVector(offset, explosionState.progress)
    if (mesh.material) {
      const baseOpacity = mesh.material.userData?.baseOpacity ?? mesh.material.opacity ?? 1
      mesh.material.opacity = baseOpacity * Math.max(0.05, explosionState.progress)
    }
    mesh.visible = visible
  })
  explosionGroup.visible = visible
  updateBaseMeshVisibility()
}
const updateExplosionAnimation = (deltaMs) => {
  if (!explosionGroup) return
  const epsilon = 1e-4
  if (explosionState.target === 0) {
    const direction = explosionState.progress < explosionState.target ? 1 : -1
    const step = Math.min(1, (deltaMs || 16) / 300)
    explosionState.progress = THREE.MathUtils.clamp(explosionState.progress + direction * step, 0, 1)
  } else {
    const deltaSeconds = Math.max(deltaMs || 16, 16) / 1000
    const easing = 2.2
    explosionState.progress = THREE.MathUtils.damp(
      explosionState.progress,
      explosionState.target,
      easing,
      deltaSeconds,
    )
  }
  if (Math.abs(explosionState.progress - explosionState.target) <= epsilon) {
    explosionState.progress = explosionState.target
  }
  applyExplosionTransforms()
}
const findExplosionLayerSource = (map, type, side) => {
  if (type === 'core') return map.get('core|inner') || map.get('core|none')
  const normalizedSide = side || 'none'
  return map.get(`${type}|${normalizedSide}`) || map.get(`${type}|all`) || map.get(`${type}|none`)
}
const rebuildExplosionGroup = async () => {
  explosionBuildToken += 1
  const token = explosionBuildToken
  clearExplosionGroup()
  if (!scene || !geometryBox || !(props.explosionLayers || []).length) return
  const width = geometryBox.max.x - geometryBox.min.x
  const height = geometryBox.max.y - geometryBox.min.y
  if (width <= 0 || height <= 0) return
  const lookup = new Map()
  for (const layer of props.explosionLayers || []) {
    if (!layer?.type || !layer.svg) continue
    const key = `${layer.type}|${layer.side || 'none'}`
    if (!lookup.has(key)) lookup.set(key, layer)
  }
  const targetRes = currentRasterRes || getTargetRasterRes()
  const tasks = explosionLayerSequence.map(async (seq) => {
    const source = findExplosionLayerSource(lookup, seq.type, seq.side)
    if (!source?.svg) return null
    try {
      const raster = await rasterizeSvgOnMainThread(
        source.svg,
        targetRes,
        { borderColor: props.borderColor, applyBorder: false },
      )
      const ctx = raster.canvas.getContext('2d')
      if (ctx) {
        ctx.globalCompositeOperation = 'source-in'
        ctx.fillStyle = seq.color || '#ffffff'
        ctx.fillRect(0, 0, raster.canvas.width, raster.canvas.height)
        ctx.globalCompositeOperation = 'source-over'
      }
      const texture = createTextureFromImage(raster.canvas, { repeatX: seq.side === 'bottom' ? -1 : 1 })
      return { seq, texture }
    } catch (error) {
      console.warn('[Pcb3dPreview] explosion layer raster failed', error)
      return null
    }
  })
  const layerEntries = (await Promise.all(tasks)).filter(Boolean)
  if (token !== explosionBuildToken || !layerEntries.length) {
    layerEntries.forEach((entry) => entry?.texture?.dispose?.())
    return
  }
  explosionPlaneGeometry = new THREE.PlaneGeometry(width, height)
  explosionGroup = new THREE.Group()
  const zStep = Math.max(props.thickness || 0.016, 0.002) * 3.2
  let order = 30
  explosionMeshes = layerEntries.map(({ seq, texture }) => {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: seq.opacity ?? 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    })
    material.userData = { baseOpacity: seq.opacity ?? 0.6 }
    const mesh = new THREE.Mesh(explosionPlaneGeometry, material)
    mesh.renderOrder = order++
    mesh.visible = false
    const { offset, origin } = computeExplosionOffset(seq.offsetIndex || 0, zStep)
    explosionGroup.add(mesh)
    return { mesh, material, texture, offset, origin }
  })
  scene.add(explosionGroup)
  explosionState.progress = props.explosionActive ? 1 : 0
  explosionState.target = props.explosionActive ? 1 : 0
  applyExplosionTransforms()
  requestRender()
}
const dataUrlToBlob = (dataUrl, mime = 'image/png') => {
  const parts = dataUrl.split(',')
  if (parts.length < 2) return null
  const binary = atob(parts[1])
  const len = binary.length
  const array = new Uint8Array(len)
  for (let i = 0; i < len; i++) array[i] = binary.charCodeAt(i)
  return new Blob([array], { type: mime })
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
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    bottomMaterial = new THREE.MeshBasicMaterial({
      map: bottomTexture,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  } else {
    topMaterial.map = topTexture
    topMaterial.transparent = true
    topMaterial.opacity = 1
    topMaterial.needsUpdate = true
    bottomMaterial.map = bottomTexture
    bottomMaterial.transparent = true
    bottomMaterial.opacity = 1
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
    exportGeometry?.dispose?.()
    exportGeometry = geometry.clone()
    disposeCoreMesh()
    geometryBox = geometry.boundingBox?.clone() || null
    mesh = new THREE.Mesh(geometry, [topMaterial, bottomMaterial, sideMaterial])
    scene.add(mesh)
    buildCoreMesh(geometry)
    updateBaseMeshVisibility()
    requestExplosionRebuild()
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
  if (!renderer || !camera || !geometryBox) return
  const { width, height } = getHostSize()
  const w = Math.max(1, Math.round(width || 0))
  const h = Math.max(1, Math.round(height || 0))
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
const exportPngBlob = async () => {
  if (!renderer || !scene || !camera) throw new Error('Renderer unavailable')
  controls?.update()
  renderer.render(scene, camera)
  const canvas = renderer.domElement
  if (!canvas) throw new Error('Canvas unavailable')
  const mime = 'image/png'
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('PNG blob empty'))
      }, mime)
    } else {
      try {
        const blob = dataUrlToBlob(canvas.toDataURL(mime), mime)
        if (!blob) throw new Error('PNG dataURL failed')
        resolve(blob)
      } catch (error) {
        reject(error)
      }
    }
  })
}
const exportGltfBlob = async () => {
  const baseMesh = mesh
  if (!baseMesh) {
    console.warn('[Pcb3dPreview] export: no primary mesh available', { explosionActive: props.explosionActive })
    throw new Error('Mesh unavailable')
  }
  const targetMesh = cloneMeshForExport(baseMesh)
  if (!targetMesh) throw new Error('Mesh unavailable')
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    try {
      exporter.parse(
        targetMesh,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(new Blob([result], { type: 'model/gltf-binary' }))
            return
          }
          const json = typeof result === 'string' ? result : JSON.stringify(result)
          resolve(new Blob([json], { type: 'model/gltf+json' }))
        },
        (error) => reject(error),
        { binary: true, embedImages: true },
      )
    } catch (error) {
      reject(error)
    }
  })
}

const commitRendererSize = ({ refit = true } = {}) => {
  if (!renderer || !camera) return
  const { width, height } = getHostSize()
  const w = Math.max(1, Math.round(width || 0))
  const h = Math.max(1, Math.round(height || 0))
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
        commitRendererSize()
        smoothRefitToBox()
        requestRender()
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
  lastFrameTime = 0
  controls?.dispose?.()
  disposeTextures()
  sideMaterial?.dispose?.()
  sideMaterial = null
  disposeCoreMesh()
  exportGeometry?.dispose?.()
  exportGeometry = null
  clearExplosionGroup()
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
  if (!renderer || !scene || !camera || !container.value) {
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
      exportGeometry?.dispose?.()
      exportGeometry = null
      disposeCoreMesh()
      clearExplosionGroup()
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
  async exportPng() {
    return exportPngBlob()
  },
  async exportGltf() {
    return exportGltfBlob()
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
  coreMaterial?.color?.set(props.borderColor || '#f5d398')
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

watch(() => props.explosionLayers, () => {
  requestExplosionRebuild()
}, { deep: true })

watch(() => props.explosionActive, (isActive) => {
  explosionState.target = isActive ? 1 : 0
  if (isActive && !explosionMeshes.length) requestExplosionRebuild()
  updateBaseMeshVisibility()
  startLoop()
})

watch(() => [props.displayWidth, props.displayHeight], () => {
  if (!renderer || !camera) return
  pendingResize = true
  commitRendererSize()
  requestRender()
})

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
  if (refreshQueued || refreshForce) {
    await refreshPreview()
  } else if (geometryBox) {
    smoothRefitToBox()
  }
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
