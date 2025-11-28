<template>
  <div
    ref="container"
    class="viewer"
    :style="{ width: containerWidth, height: containerHeight, display: active ? 'block' : 'none' }"
  ></div>
</template>

<script setup>
import {ref, watch, onMounted, onBeforeUnmount, nextTick, defineExpose, defineEmits} from 'vue'
import * as THREE from 'three'
import {SRGBColorSpace} from 'three'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'

const props = defineProps({
  modelData: { type: Object, default: () => ({ layers: [], version: 0 }) },
  thickness: { type: Number, default: 1.6 },
  borderColor: { type: String, default: 'rgb(255, 235, 150)' },
  coreColor: { type: String, default: 'rgb(234, 226, 118)' },
  layerColors: { type: Object, default: () => ({}) },
  layerVisibility: { type: Object, default: () => ({}) },
  backgroundColor: { type: String, default: '#0f1220' },
  containerWidth: { type: String, default: '100%' },
  containerHeight: { type: String, default: '100%' },
  displayWidth: { type: Number, default: 0 },
  displayHeight: { type: Number, default: 0 },
  explosionActive: { type: Boolean, default: false },
  fitPadding: { type: Number, default: 1.1 },
  fitLerpMs: { type: Number, default: 150 },
  explosionSpacingMultiplier: { type: Number, default: 4 },
  active: { type: Boolean, default: true },
})

const emit = defineEmits(['loading-change', 'perf-stats'])
const container = ref(null)

let scene = null
let camera = null
let renderer = null
let controls = null
let resizeObserver = null
let modelGroup = null
let geometryBox = null
const geometryCenter = new THREE.Vector3()
const doubleSideMaterials = new WeakSet()
let rafId = 0
let running = false
const objectLoader = new THREE.ObjectLoader()
let lightingGroup = null
const typedArrayConstructors = {
  Float32Array,
  Float64Array,
  Uint32Array,
  Uint16Array,
  Uint8Array,
  Uint8ClampedArray,
  Int32Array,
  Int16Array,
  Int8Array,
}
const getPerfNow = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now())
const captureMemorySnapshot = () => {
  if (typeof performance === 'undefined' || !performance.memory) return null
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory
  if (!Number.isFinite(usedJSHeapSize)) return null
  return {
    usedBytes: usedJSHeapSize,
    totalBytes: totalJSHeapSize,
    limitBytes: jsHeapSizeLimit,
  }
}
const computeMemoryDelta = (start, end) => {
  if (!start || !end) return null
  if (!Number.isFinite(start.usedBytes) || !Number.isFinite(end.usedBytes)) return null
  return end.usedBytes - start.usedBytes
}
const emitViewerPerfSample = (stage, durationMs, meta, memoryStart, memoryEnd) => {
  emit('perf-stats', {
    stage,
    category: 'viewer',
    durationMs: Number.isFinite(durationMs) ? Number(durationMs.toFixed(2)) : null,
    meta: meta || {},
    memoryStart,
    memoryEnd,
    memoryDeltaBytes: computeMemoryDelta(memoryStart, memoryEnd),
    timestamp: Date.now(),
  })
}

const defaultLayerColors = {
  copper: '#cc9933',
  soldermask: '#004200',
  silkscreen: '#ffffff',
  solderpaste: '#b2b2b2',
}

const buildMeshGroupFromData = (meshData, defaultColor) => {
  if (!meshData) return new THREE.Group()
  if (meshData.format === 'buffer-geometry') {
    const group = new THREE.Group()
    const chunks = Array.isArray(meshData.chunks) ? meshData.chunks : []
    const createTypedArray = (desc, fallback = Float32Array) => {
      if (!desc?.array) return null
      const ArrayCtor = typedArrayConstructors[desc.arrayType] || fallback
      try {
        return new ArrayCtor(desc.array)
      } catch (error) {
        console.warn('[Pcb3dPreview] Failed to create typed array', desc, error)
        return null
      }
    }
    const addAttribute = (geometry, name, desc) => {
      const typedArray = createTypedArray(desc)
      if (!typedArray) return
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          typedArray,
          desc.itemSize || 3,
          desc.normalized ?? false
        )
      )
    }
    chunks.forEach((chunk) => {
      const geometry = new THREE.BufferGeometry()
      addAttribute(geometry, 'position', chunk?.attributes?.position)
      addAttribute(geometry, 'normal', chunk?.attributes?.normal)
      addAttribute(geometry, 'uv', chunk?.attributes?.uv)
      if (chunk?.index?.array) {
        const indexArray = createTypedArray(
          chunk.index,
          chunk.index?.arrayType === 'Uint16Array' ? Uint16Array : Uint32Array
        )
        if (indexArray) {
          geometry.setIndex(new THREE.BufferAttribute(indexArray, 1))
        }
      } else {
        geometry.setIndex(null)
      }
      const color =
        chunk?.material?.color != null ? chunk.material.color : defaultColor
      const material = new THREE.MeshStandardMaterial({
        color: color ?? 0xffffff,
        transparent: chunk?.material?.transparent ?? false,
        opacity: chunk?.material?.opacity ?? 1,
      })
      applyMaterialFinish(material, null, chunk?.metadata?.isClear)
      const metadata = chunk?.metadata ? {...chunk.metadata} : {}
      if (metadata.planar) {
        material.side = THREE.DoubleSide
        material.depthWrite = metadata.isClear ? false : true
        material.polygonOffset = true
        material.polygonOffsetFactor = metadata.isClear ? -0.5 : -0.2
        material.polygonOffsetUnits = metadata.isClear ? -0.5 : -0.2
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData = metadata
      group.add(mesh)
    })
    return group
  }
  try {
    return objectLoader.parse(meshData)
  } catch (error) {
    console.warn('[Pcb3dPreview] Failed to parse legacy mesh JSON', error)
    return new THREE.Group()
  }
}
let explosionEntries = []
const explosionState = { progress: 0, target: 0 }
const fitState = {
  active: false,
  start: new THREE.Vector3(),
  target: new THREE.Vector3(),
  startTime: 0,
  duration: 150,
}
const explosionEpsilon = 1e-3
const explosionSizeVector = new THREE.Vector3()
const topLayerRenderOrders = {
  copper: 90,
  soldermask: 92,
  silkscreen: 94,
  solderpaste: 96,
}
const bottomLayerRenderOrders = {
  copper: 10,
  soldermask: 12,
  silkscreen: 14,
  solderpaste: 16,
}

const layerMaterialProfiles = Object.freeze({
  default: { metalness: 0.25, roughness: 0.85 },
  copper: { metalness: 0.75, roughness: 0.3 },
  soldermask: { metalness: 0.08, roughness: 0.92 },
  silkscreen: { metalness: 0.05, roughness: 0.65 },
  solderpaste: { metalness: 0.55, roughness: 0.4 },
  drill: { metalness: 0.18, roughness: 0.55 },
  outline: { metalness: 0.12, roughness: 0.75 },
  core: { metalness: 0.05, roughness: 0.9 },
})

const applyMaterialFinish = (material, type, isClear = false) => {
  const profileKey = isClear ? 'core' : type
  const profile =
    (profileKey && layerMaterialProfiles[profileKey]) || layerMaterialProfiles.default
  if (!material) return
  const setProps = (target) => {
    if (!target) return
    if (typeof target.metalness === 'number') target.metalness = profile.metalness
    if (typeof target.roughness === 'number') target.roughness = profile.roughness
    target.needsUpdate = true
  }
  if (Array.isArray(material)) material.forEach(setProps)
  else setProps(material)
}

const getLayerRenderOrder = (type, side) => {
  if (type === 'outline') return 50
  if (type === 'drill') return 52
  if (side === 'top') return topLayerRenderOrders[type] ?? 80
  if (side === 'bottom') return bottomLayerRenderOrders[type] ?? 20
  if (type === 'drawing') return 40
  return 60
}

const applyMaterialDepthBias = (material, order) => {
  if (!material) return
  material.polygonOffset = true
  const factor = -order * 0.02
  const units = -order * 0.5
  material.polygonOffsetFactor = factor
  material.polygonOffsetUnits = units
  material.needsUpdate = true
}

const configureLayerVisuals = (mesh, type, side) => {
  if (!mesh) return
  const order = getLayerRenderOrder(type, side)
  mesh.renderOrder = order
  mesh.traverse((child) => {
    if (!child.isMesh) return
    child.renderOrder = order
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => applyMaterialDepthBias(mat, order))
    } else {
      applyMaterialDepthBias(child.material, order)
    }
    if (type === 'outline') {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((mat) => {
        if (mat && !doubleSideMaterials.has(mat)) {
          mat.side = THREE.DoubleSide
          mat.needsUpdate = true
          doubleSideMaterials.add(mat)
        }
      })
    }
  })
}

const laminarDefaults = {
  total: 1.6,
  copper: 0.035,
  solderMask: 0.04,
  silkscreen: 0.01,
  solderPaste: 0.015,
  oil: 0.01,
}

const explosionLayerSequence = [
  { type: 'drill', side: 'bottom', order: -5 },
  { type: 'solderpaste', side: 'bottom', order: -4 },
  { type: 'silkscreen', side: 'bottom', order: -3 },
  { type: 'soldermask', side: 'bottom', order: -2 },
  { type: 'copper', side: 'bottom', order: -1 },
  { type: 'copper', side: 'top', order: 1 },
  { type: 'soldermask', side: 'top', order: 2 },
  { type: 'silkscreen', side: 'top', order: 3 },
  { type: 'solderpaste', side: 'top', order: 4 },
]

const createColor = (value, fallback) => {
  try {
    return new THREE.Color(value ?? fallback)
  } catch (error) {
    return new THREE.Color(fallback)
  }
}

const resolveLayerColor = (type, fallbackColor) => {
  if (props.layerColors && props.layerColors[type]) {
    return props.layerColors[type]
  }
  if (fallbackColor) return fallbackColor
  return defaultLayerColors[type] || '#ffffff'
}
const isLayerTypeVisible = (type) => {
  if (!type) return true
  const visibility = props.layerVisibility || {}
  const value = visibility[type]
  if (typeof value === 'boolean') return value
  return true
}

const setMeshColor = (object, color, type = null) => {
  if (!object) return
  const next = createColor(color, '#ffffff')
  const coreColor = createColor(props.coreColor || props.borderColor, '#ffffff')
  object.traverse((child) => {
    if (child.isMesh) {
      const targetColor = child.userData?.isClear ? coreColor : next
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => {
          mat?.color?.set?.(targetColor)
          applyMaterialFinish(mat, type ?? child.userData?.layerType, child.userData?.isClear)
        })
      } else {
        child.material?.color?.set?.(targetColor)
        applyMaterialFinish(child.material, type ?? child.userData?.layerType, child.userData?.isClear)
      }
    }
  })
}

const applyLayerColorOverrides = () => {
  if (!modelGroup) return
  modelGroup.traverse((child) => {
    if (!child.isMesh) return
    const type = child.userData?.layerType
    if (!type || !defaultLayerColors[type]) return
    const color = resolveLayerColor(type)
    if (color) setMeshColor(child, color, type)
  })
  requestRender()
}
const applyLayerVisibility = () => {
  if (!modelGroup) return
  modelGroup.traverse((child) => {
    const type = child.userData?.layerType
    if (!type) return
    child.visible = isLayerTypeVisible(type)
  })
  requestRender()
}

const disposeObject = (object) => {
  if (!object) return
  object.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry?.dispose) child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat?.dispose?.())
      } else {
        child.material?.dispose?.()
      }
    }
  })
}

const getHostSize = () => {
  const rect = container.value?.getBoundingClientRect?.()
  const width = Math.max(0, Math.round(rect?.width || props.displayWidth || 0))
  const height = Math.max(0, Math.round(rect?.height || props.displayHeight || 0))
  return { width, height }
}

const updateRendererSize = () => {
  if (!renderer || !camera) return
  const { width, height } = getHostSize()
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  renderer.setSize(safeWidth, safeHeight, false)
  camera.aspect = safeWidth / safeHeight
  camera.updateProjectionMatrix()
}

const handleViewportResize = () => {
  updateRendererSize()
  if (geometryBox) {
    smoothRefitToBox()
  } else {
    requestRender()
  }
}

const requestRender = () => {
  if (!renderer || !scene || !camera) return
  if (!running) {
    controls?.update()
    renderer.render(scene, camera)
  }
}

const startLoop = () => {
  if (running) return
  running = true
  rafId = requestAnimationFrame(animate)
}

const stopLoop = () => {
  if (!running) return
  running = false
  cancelAnimationFrame(rafId)
}

const isExplosionSettled = () =>
  Math.abs(explosionState.progress - explosionState.target) <= explosionEpsilon

const stopLoopIfIdle = () => {
  if (!fitState.active && isExplosionSettled()) {
    stopLoop()
  }
}

const handleControlsStart = () => {
  startLoop()
}

const handleControlsChange = () => {
  startLoop()
}

const handleControlsEnd = () => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      stopLoopIfIdle()
    })
    return
  }
  setTimeout(() => stopLoopIfIdle(), 16)
}

const updateExplosionAnimation = () => {
  if (!explosionEntries.length) return
  const damping = explosionState.target === 0 ? 3.6 : 2.5
  explosionState.progress = THREE.MathUtils.damp(
    explosionState.progress,
    explosionState.target,
    damping,
    0.016
  )
  explosionEntries.forEach((entry) => {
    entry.mesh.position.z = entry.baseZ + entry.offset * explosionState.progress
  })
}

const animate = () => {
  if (!running) return
  const now = performance.now()
  if (fitState.active && camera) {
    const duration = Math.max(1, fitState.duration)
    const t = Math.min(1, (now - fitState.startTime) / duration)
    camera.position.lerpVectors(fitState.start, fitState.target, t)
    if (t >= 1) fitState.active = false
  }
  controls?.update()
  updateExplosionAnimation()
  renderer?.render(scene, camera)
  rafId = requestAnimationFrame(animate)
  stopLoopIfIdle()
}

const determineExplosionOrder = (type, side) => {
  const match = explosionLayerSequence.find(
    (entry) => entry.type === type && entry.side === side
  )
  if (match) return match.order
  if (side === 'bottom') return -1
  if (side === 'top') return 1
  return 0
}

const resolveExplosionStep = () => {
  const totalThickness = Math.max(props.thickness || laminarDefaults.total, 0.001)
  const rawInput = Number(props.explosionSpacingMultiplier)
  const spacingMultiplier = Number.isFinite(rawInput) ? Math.max(rawInput, 0) : 0
  return totalThickness * spacingMultiplier
}

const computeExplosionOffset = (type, side) => {
  const order = determineExplosionOrder(type, side)
  const step = resolveExplosionStep()
  return order * step
}

const refreshExplosionOffsets = () => {
  if (!explosionEntries.length) return
  explosionEntries.forEach((entry) => {
    entry.offset = computeExplosionOffset(entry.type, entry.side)
  })
  startLoop()
}

const computeLaminate = () => {
  const total = Math.max(props.thickness || laminarDefaults.total, 0.001)
  const scale = total / laminarDefaults.total
  const copper = laminarDefaults.copper * scale
  const solderMask = laminarDefaults.solderMask * scale
  const silkscreen = laminarDefaults.silkscreen * scale
  const solderPaste = laminarDefaults.solderPaste * scale
  const oil = laminarDefaults.oil * scale
  let core = total - 2 * (copper + solderMask + silkscreen + solderPaste + oil)
  if (core <= 0) core = total * 0.6
  return { total, core, copper, solderMask, silkscreen, solderPaste, oil }
}

const classifyLayers = (entries) => {
  const outline = []
  const top = {}
  const bottom = {}
  const drills = []
  for (const entry of entries) {
    if (!entry?.mesh) continue
    const mesh = buildMeshGroupFromData(entry.mesh, entry.color)
    mesh.userData.layerId = entry.id
    mesh.userData.layerType = entry.type
    mesh.userData.layerSide = entry.side
    mesh.traverse((child) => {
      if (!child.isMesh) return
      child.userData = child.userData || {}
      child.userData.layerId = entry.id
      child.userData.layerType = entry.type
      child.userData.layerSide = entry.side
    })
    const layerColor = resolveLayerColor(entry.type, entry.color)
    setMeshColor(mesh, layerColor, entry.type)
    configureLayerVisuals(mesh, entry.type, entry.side)
    if (entry.type === 'outline') {
      outline.push(mesh)
    } else if (entry.type === 'drill') {
      drills.push(mesh)
    } else if (entry.side === 'bottom') {
      bottom[entry.type] = mesh
    } else {
      top[entry.type] = mesh
    }
  }
  return { outline: outline[0] || null, top, bottom, drills }
}

const explosionEntriesForMesh = (mesh, type, side, baseZ) => {
  const offset = computeExplosionOffset(type, side)
  explosionEntries.push({
    mesh,
    baseZ,
    offset,
    type,
    side,
  })
}

const placeLayer = (group, mesh, z, thickness, type, side) => {
  if (!mesh) return
  mesh.position.setZ(z)
  mesh.scale.setZ(Math.max(thickness, 0.0001))
  group.add(mesh)
  explosionEntriesForMesh(mesh, type, side, z)
}

const assembleLayers = (entries) => {
  if (!scene) return
  if (modelGroup) {
    scene.remove(modelGroup)
    disposeObject(modelGroup)
    modelGroup = null
  }
  modelGroup = new THREE.Group()
  explosionEntries = []
  const classification = classifyLayers(entries)
  const laminate = computeLaminate()
  const halfCore = laminate.core / 2
  if (classification.outline) {
    setMeshColor(classification.outline, props.coreColor || props.borderColor, 'outline')
    classification.outline.scale.setZ(laminate.core)
    classification.outline.position.setZ(0)
    modelGroup.add(classification.outline)
    explosionEntriesForMesh(classification.outline, 'outline', null, 0)
  }
  for (const drill of classification.drills) {
    setMeshColor(drill, props.borderColor, 'drill')
    drill.scale.setZ(laminate.total)
    drill.position.setZ(0)
    modelGroup.add(drill)
    explosionEntriesForMesh(drill, 'drill', null, 0)
  }
  const stack = [
    { key: 'copper', thickness: laminate.copper },
    { key: 'soldermask', thickness: laminate.solderMask },
    { key: 'silkscreen', thickness: laminate.silkscreen },
    { key: 'solderpaste', thickness: laminate.solderPaste },
  ]
  let cursorTop = halfCore
  for (const layer of stack) {
    const mesh = classification.top[layer.key]
    if (!mesh) continue
    cursorTop += layer.thickness / 2
    placeLayer(modelGroup, mesh, cursorTop, layer.thickness, layer.key, 'top')
    cursorTop += layer.thickness / 2
  }
  let cursorBottom = -halfCore
  for (const layer of stack) {
    const mesh = classification.bottom[layer.key]
    if (!mesh) continue
    cursorBottom -= layer.thickness / 2
    placeLayer(modelGroup, mesh, cursorBottom, layer.thickness, layer.key, 'bottom')
    cursorBottom -= layer.thickness / 2
  }
  scene.add(modelGroup)
  applyLayerColorOverrides()
  applyLayerVisibility()
  geometryBox = new THREE.Box3().setFromObject(modelGroup)
  if (geometryBox) {
    geometryBox.getCenter(geometryCenter)
  } else {
    geometryCenter.set(0, 0, 0)
  }
  refreshExplosionOffsets()
  updateCameraDepthRange()
  smoothRefitToBox()
  requestRender()
}

const rebuildModel = async () => {
  emit('loading-change', true)
  const layers = Array.isArray(props.modelData?.layers) ? props.modelData.layers : []
  const perfStart = getPerfNow()
  const memoryStart = captureMemorySnapshot()
  const vertexCount = layers.reduce(
    (sum, layer) => sum + (layer?.meshSummary?.totalVertices ?? 0),
    0
  )
  try {
    if (!layers.length) {
      if (modelGroup) {
        scene.remove(modelGroup)
        disposeObject(modelGroup)
        modelGroup = null
      }
      geometryBox = null
      geometryCenter.set(0, 0, 0)
      controls?.target?.set?.(0, 0, 0)
      explosionEntries = []
      requestRender()
      return
    }
    assembleLayers(layers)
  } finally {
    emit('loading-change', false)
    const durationMs = getPerfNow() - perfStart
    const memoryEnd = captureMemorySnapshot()
    emitViewerPerfSample('three:rebuildModel', durationMs, { layerCount: layers.length, vertexCount }, memoryStart, memoryEnd)
  }
}

const computeFitDistance = (box, width, height, padding) => {
  if (!box || width <= 0 || height <= 0 || !camera) return camera?.position.z || 1
  const size = new THREE.Vector3()
  box.getSize(size)
  const halfY = size.y / 2
  const halfX = size.x / 2
  const vFov = (camera.fov * Math.PI) / 180
  const aspect = Math.max(0.0001, width / Math.max(1, height))
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
  const distanceV = halfY / Math.tan(vFov / 2)
  const distanceH = halfX / Math.tan(hFov / 2)
  return Math.max(distanceV, distanceH) * Math.max(0.0001, padding)
}

const smoothRefitToBox = () => {
  if (!camera || !controls) return
  if (!geometryBox) {
    geometryCenter.set(0, 0, 0)
    controls.target.set(0, 0, 0)
    requestRender()
    return
  }
  const { width, height } = getHostSize()
  const distance = computeFitDistance(geometryBox, width, height, props.fitPadding || 1.1)
  if (!Number.isFinite(distance)) return
  controls.target.copy(geometryCenter)
  fitState.active = true
  fitState.start.copy(camera.position)
  fitState.target.copy(geometryCenter)
  fitState.target.z += distance
  fitState.startTime = performance.now()
  fitState.duration = Math.max(props.fitLerpMs || 0, 0)
  startLoop()
}

const updateCameraDepthRange = () => {
  if (!camera) return
  const size = new THREE.Vector3()
  let radius = Math.max(props.thickness || 0.001, 0.001)
  if (geometryBox) {
    geometryBox.getSize(size)
    radius = Math.max(radius, size.length() / 2)
  }
  const near = Math.max(radius / 500, 0.01)
  const far = Math.max(radius * 20, near + radius * 2)
  camera.near = near
  camera.far = far
  camera.updateProjectionMatrix()
  if (controls) {
    controls.minDistance = near * 1.1
    controls.maxDistance = far
  }
}

const setSceneBackground = () => {
  if (!scene) return
  const color = createColor(props.backgroundColor, '#0f1220')
  scene.background = color
  renderer?.setClearColor(color, 1)
  if (renderer?.domElement) {
    renderer.domElement.style.background = props.backgroundColor
  }
}

const createSceneLights = () => {
  if (!scene) return
  if (lightingGroup) {
    scene.remove(lightingGroup)
    lightingGroup = null
  }
  lightingGroup = new THREE.Group()
  const ambient = new THREE.AmbientLight(0xffffff, 1.25)
  lightingGroup.add(ambient)
  const hemi = new THREE.HemisphereLight(0xcad6ff, 0x0c1016, 1.2)
  hemi.position.set(0, 10, 0)
  lightingGroup.add(hemi)
  const createDirectional = (color, intensity, position) => {
    const light = new THREE.DirectionalLight(color, intensity)
    light.position.copy(position)
    light.castShadow = false
    lightingGroup.add(light)
    return light
  }
  createDirectional(0xffffff, 1.8, new THREE.Vector3(6, 11, 7))
  createDirectional(0xffd7b0, 1.05, new THREE.Vector3(-6, 4, 6))
  createDirectional(0x9bb9ff, 1.05, new THREE.Vector3(0, -7, -6))
  createDirectional(0xcfe4ff, 0.8, new THREE.Vector3(0, -4, 5))
  createDirectional(0xfff3d2, 0.55, new THREE.Vector3(4, -3, -6))
  const bottomFill = new THREE.PointLight(0xffffff, 0.9)
  bottomFill.position.set(0, -6, 0)
  lightingGroup.add(bottomFill)
  scene.add(lightingGroup)
}

const initThree = () => {
  if (!container.value) return
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.001, 1000)
  camera.position.set(0, 0, 1)
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    depth: true,
    stencil: false,
    logarithmicDepthBuffer: true,
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.7
  renderer.physicallyCorrectLights = true
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.value.appendChild(renderer.domElement)
  setSceneBackground()
  createSceneLights()
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.addEventListener('start', handleControlsStart)
  controls.addEventListener('change', handleControlsChange)
  controls.addEventListener('end', handleControlsEnd)
  updateRendererSize()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      handleViewportResize()
    })
    resizeObserver.observe(container.value)
  }
}

const destroyThree = () => {
  stopLoop()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (modelGroup) {
    disposeObject(modelGroup)
    modelGroup = null
  }
  explosionEntries = []
  geometryBox = null
  geometryCenter.set(0, 0, 0)
  renderer?.dispose?.()
  if (lightingGroup && scene) {
    scene.remove(lightingGroup)
  }
  lightingGroup = null
  if (renderer?.domElement && container.value && renderer.domElement.parentNode === container.value) {
    container.value.removeChild(renderer.domElement)
  }
  scene = null
  camera = null
  renderer = null
  if (controls) {
    controls.removeEventListener('start', handleControlsStart)
    controls.removeEventListener('change', handleControlsChange)
    controls.removeEventListener('end', handleControlsEnd)
  }
  controls = null
}

const updateStructuralColors = () => {
  if (!modelGroup) return
  modelGroup.traverse((child) => {
    if (!child.isMesh) return
    if (child.userData?.layerType === 'outline') {
      setMeshColor(child, props.coreColor || props.borderColor, 'outline')
    }
    if (child.userData?.layerType === 'drill') {
      setMeshColor(child, props.borderColor, 'drill')
    }
  })
  requestRender()
}

const exportGltfBlob = () => {
  if (!modelGroup) throw new Error('?????')
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      modelGroup,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: 'model/gltf-binary' }))
          return
        }
        const json = typeof result === 'string' ? result : JSON.stringify(result)
        resolve(new Blob([json], { type: 'model/gltf+json' }))
      },
      (error) => reject(error),
      { binary: true, embedImages: true }
    )
  })
}

watch(
  () => [props.modelData?.version, props.thickness],
  () => {
    if (!scene) return
    rebuildModel()
  }
)

watch(() => props.backgroundColor, () => { setSceneBackground(); requestRender() })
watch(() => props.coreColor, () => updateStructuralColors())
watch(() => props.borderColor, () => updateStructuralColors())
watch(
  () => [
    props.layerColors?.copper,
    props.layerColors?.soldermask,
    props.layerColors?.silkscreen,
    props.layerColors?.solderpaste,
  ],
  () => applyLayerColorOverrides()
)
watch(
  () => [
    props.layerVisibility?.copper,
    props.layerVisibility?.soldermask,
    props.layerVisibility?.silkscreen,
    props.layerVisibility?.solderpaste,
  ],
  () => applyLayerVisibility()
)
watch(() => props.explosionActive, (isActive) => {
  explosionState.target = isActive ? 1 : 0
  startLoop()
})
watch(() => props.explosionSpacingMultiplier, () => {
  refreshExplosionOffsets()
})
watch(() => props.fitPadding, () => { if (geometryBox) smoothRefitToBox() })
watch(() => props.fitLerpMs, () => { /* new lerp duration applied next refit */ })
watch(
  () => [props.containerWidth, props.containerHeight, props.displayWidth, props.displayHeight],
  () => {
    handleViewportResize()
  }
)
watch(() => props.active, async (isActive) => {
  if (!isActive) {
    stopLoop()
    return
  }
  await nextTick()
  handleViewportResize()
})

onMounted(async () => {
  initThree()
  await nextTick()
  rebuildModel()
})

onBeforeUnmount(() => {
  destroyThree()
})

defineExpose({
  async refit() {
    await nextTick()
    smoothRefitToBox()
  },
  async resetView() {
    controls?.reset()
    await nextTick()
    smoothRefitToBox()
  },
  async exportGltf() {
    return exportGltfBlob()
  },
})
</script>

<style scoped>
.viewer {
  position: relative;
  overflow: hidden;
  background: #0f1220;
}
</style>
