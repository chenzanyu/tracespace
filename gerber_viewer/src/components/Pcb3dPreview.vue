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
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'

const props = defineProps({
  modelData: { type: Object, default: () => ({ layers: [], version: 0 }) },
  thickness: { type: Number, default: 1.6 },
  borderColor: { type: String, default: 'rgb(255, 235, 150)' },
  coreColor: { type: String, default: 'rgb(234, 226, 118)' },
  layerColors: { type: Object, default: () => ({}) },
  layerVisibility: { type: Object, default: () => ({}) },
  surfaceFinishType: { type: String, default: 'leadfree-hasl' },
  backgroundColor: { type: String, default: '#0f1220' },
  envMapIntensity: { type: Number, default: 0.45 },
  containerWidth: { type: String, default: '100%' },
  containerHeight: { type: String, default: '100%' },
  displayWidth: { type: Number, default: 0 },
  displayHeight: { type: Number, default: 0 },
  explosionActive: { type: Boolean, default: false },
  fitPadding: { type: Number, default: 1.1 },
  fitLerpMs: { type: Number, default: 150 },
  explosionSpacingMultiplier: { type: Number, default: 4 },
  active: { type: Boolean, default: true },
  layerSimplifyTolerancesMm: {
    type: Object,
    default: () => ({
      copper: 0.5,
      soldermask: 0.5,
      silkscreen: 0.5,
      drill: 0.5,
      outline: 0.5,
    }),
  },
  drillLimit: { type: Number, default: Infinity },
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
let geometryRadius = 0
const geometryCenter = new THREE.Vector3()
const doubleSideMaterials = new WeakSet()
let rafId = 0
let running = false
const objectLoader = new THREE.ObjectLoader()
let lightingGroup = null
let pmremGenerator = null
let environmentTarget = null
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
  surfacefinish: '#D0D0D6',
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
        material.depthWrite = false
        material.depthTest = true
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
const laminarDefaults = {
  total: 1.6,
  copper: 0.035,
  solderMask: 0.04,
  surfaceFinish: 0.005,
  silkscreen: 0.01,
  solderPaste: 0.015,
  oil: 0.01,
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
let explosionBaseSpan = laminarDefaults.total
const topLayerRenderOrders = {
  copper: 90,
  soldermask: 92,
  surfacefinish: 93,
  silkscreen: 94,
  solderpaste: 96,
}
const bottomLayerRenderOrders = {
  copper: 10,
  soldermask: 12,
  surfacefinish: 13,
  silkscreen: 14,
  solderpaste: 16,
}

const layerMaterialProfiles = Object.freeze({
  default: { metalness: 0.12, roughness: 0.92, emissiveIntensity: 0.04 },
  copper: { metalness: 0.48, roughness: 0.45, emissiveIntensity: 0.06 },
  soldermask: { metalness: 0.05, roughness: 0.96, emissiveIntensity: 0.08 },
  surfacefinish: { metalness: 0.14, roughness: 0.86, emissiveIntensity: 0.01 },
  silkscreen: { metalness: 0.02, roughness: 0.78, emissiveIntensity: 0.05 },
  solderpaste: { metalness: 0.22, roughness: 0.62, emissiveIntensity: 0.04 },
  drill: { metalness: 0.08, roughness: 0.72, emissiveIntensity: 0.02 },
  outline: { metalness: 0.06, roughness: 0.92, emissiveIntensity: 0.02 },
  core: { metalness: 0.02, roughness: 0.96, emissiveIntensity: 0.01 },
})

const surfaceFinishProfiles = Object.freeze({
  enig: { metalness: 0.92, roughness: 0.24, emissiveIntensity: 0 },
  'immersion-silver': { metalness: 0.98, roughness: 0.18, emissiveIntensity: 0 },
  'immersion-tin': { metalness: 0.88, roughness: 0.32, emissiveIntensity: 0 },
  'leadfree-hasl': { metalness: 0.22, roughness: 0.62, emissiveIntensity: 0.01 },
  osp: { metalness: 0.06, roughness: 0.9, emissiveIntensity: 0.01 },
})

const resolveSurfaceFinishProfile = () => {
  const key = typeof props.surfaceFinishType === 'string' ? props.surfaceFinishType : ''
  return surfaceFinishProfiles[key] || layerMaterialProfiles.surfacefinish
}

const resolveEnvMapIntensity = () => {
  const value = Number(props.envMapIntensity)
  if (!Number.isFinite(value)) return 1
  return THREE.MathUtils.clamp(value, 0, 4)
}

const applyEnvironmentIntensity = () => {
  if (!scene) return
  const intensity = resolveEnvMapIntensity()
  if (typeof scene.environmentIntensity === 'number') {
    scene.environmentIntensity = intensity
  }
}

const applyMaterialFinish = (material, type, isClear = false) => {
  const profile = isClear
    ? layerMaterialProfiles.core
    : type === 'surfacefinish'
      ? resolveSurfaceFinishProfile()
      : layerMaterialProfiles[type] || layerMaterialProfiles.default
  if (!material) return
  const envMapIntensity = resolveEnvMapIntensity()
  const setProps = (target) => {
    if (!target) return
    if (typeof target.metalness === 'number') target.metalness = profile.metalness
    if (typeof target.roughness === 'number') target.roughness = profile.roughness
    if (target.emissive?.copy && target.color) {
      target.emissive.copy(target.color)
      target.emissiveIntensity = profile.emissiveIntensity ?? 0
    }
    if (typeof target.envMapIntensity === 'number') {
      target.envMapIntensity = envMapIntensity
    }
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
    const isPlanar = Boolean(child.userData?.planar)
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => {
        if (!isPlanar) applyMaterialDepthBias(mat, order)
      })
    } else {
      if (!isPlanar) applyMaterialDepthBias(child.material, order)
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

const explosionLayerSequence = [
  { type: 'drill', side: 'bottom', order: -5 },
  { type: 'solderpaste', side: 'bottom', order: -4 },
  { type: 'silkscreen', side: 'bottom', order: -3 },
  { type: 'surfacefinish', side: 'bottom', order: -2.5 },
  { type: 'soldermask', side: 'bottom', order: -2 },
  { type: 'copper', side: 'bottom', order: -1 },
  { type: 'copper', side: 'top', order: 1 },
  { type: 'soldermask', side: 'top', order: 2 },
  { type: 'surfacefinish', side: 'top', order: 2.5 },
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

const applyEnvMapIntensityOverrides = () => {
  const envMapIntensity = resolveEnvMapIntensity()
  applyEnvironmentIntensity()
  if (!modelGroup) return
  modelGroup.traverse((child) => {
    if (!child.isMesh) return
    const updateMaterial = (mat) => {
      if (!mat || typeof mat.envMapIntensity !== 'number') return
      mat.envMapIntensity = envMapIntensity
    }
    if (Array.isArray(child.material)) child.material.forEach(updateMaterial)
    else updateMaterial(child.material)
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
  updateCameraDepthRange()
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
  const span = explosionBaseSpan
  const rawInput = Number(props.explosionSpacingMultiplier)
  const spacingMultiplier = Number.isFinite(rawInput) ? Math.max(rawInput, 0) : 0
  if (!Number.isFinite(span) || span <= 0) {
    const totalThicknessFallback = Math.max(props.thickness || laminarDefaults.total, 0.001)
    return totalThicknessFallback * spacingMultiplier
  }
  const normalizedSpan = span * 0.01
  return normalizedSpan * spacingMultiplier
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
  const providedThickness = Number(props.thickness)
  const total =
    Number.isFinite(providedThickness) && providedThickness > 0
      ? providedThickness
      : Math.max(laminarDefaults.total, 0.001)
  const scale = total / laminarDefaults.total
  const copper = laminarDefaults.copper * scale
  const solderMask = laminarDefaults.solderMask * scale
  const surfaceFinish = laminarDefaults.surfaceFinish * scale
  const silkscreen = laminarDefaults.silkscreen * scale
  const solderPaste = laminarDefaults.solderPaste * scale
  const oil = laminarDefaults.oil * scale
  let core = total - 2 * (copper + solderMask + silkscreen + solderPaste + oil)
  if (core <= 0) core = total * 0.6
  return { total, core, copper, solderMask, surfaceFinish, silkscreen, solderPaste, oil }
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
  const limitedDrills = limitDrillMeshesIfNeeded(drills)
  return { outline: outline[0] || null, top, bottom, drills: limitedDrills }
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

const limitDrillMeshesIfNeeded = (drillMeshes) => {
  if (!Array.isArray(drillMeshes) || drillMeshes.length === 0) return []
  const limitRaw = Number(props.drillLimit)
  if (!Number.isFinite(limitRaw) || limitRaw <= 0) return []
  if (drillMeshes.length <= limitRaw) return drillMeshes
  const limit = Math.max(0, Math.floor(limitRaw))
  const sizeVector = new THREE.Vector3()
  const box = new THREE.Box3()
  const entries = drillMeshes.map((mesh, index) => {
    let maxEdge = 0
    if (mesh) {
      box.setFromObject(mesh)
      box.getSize(sizeVector)
      maxEdge = Math.max(sizeVector.x || 0, sizeVector.y || 0, sizeVector.z || 0)
    }
    return { mesh, maxEdge, index }
  })
  entries.sort((a, b) => {
    if (b.maxEdge === a.maxEdge) return a.index - b.index
    return b.maxEdge - a.maxEdge
  })
  if (limit <= 0) return []
  return entries.slice(0, limit).map((entry) => entry.mesh)
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
  const biasStep = Math.max(laminate.total * 0.01, 1e-6)
  let soldermaskZTop = null
  let soldermaskZBottom = null
  let silkscreenZTop = null
  let silkscreenZBottom = null
  let cursorTop = halfCore
  for (const layer of stack) {
    const mesh = classification.top[layer.key]
    if (!mesh) continue
    cursorTop += layer.thickness / 2
    placeLayer(modelGroup, mesh, cursorTop, layer.thickness, layer.key, 'top')
    if (layer.key === 'soldermask') soldermaskZTop = cursorTop
    if (layer.key === 'silkscreen') silkscreenZTop = cursorTop
    cursorTop += layer.thickness / 2
  }
  let cursorBottom = -halfCore
  for (const layer of stack) {
    const mesh = classification.bottom[layer.key]
    if (!mesh) continue
    cursorBottom -= layer.thickness / 2
    placeLayer(modelGroup, mesh, cursorBottom, layer.thickness, layer.key, 'bottom')
    if (layer.key === 'soldermask') soldermaskZBottom = cursorBottom
    if (layer.key === 'silkscreen') silkscreenZBottom = cursorBottom
    cursorBottom -= layer.thickness / 2
  }
  const placeSurfaceFinishDecal = (side) => {
    const mesh = side === 'bottom' ? classification.bottom.surfacefinish : classification.top.surfacefinish
    if (!mesh) return
    const soldermaskZ = side === 'bottom' ? soldermaskZBottom : soldermaskZTop
    const silkscreenZ = side === 'bottom' ? silkscreenZBottom : silkscreenZTop
    const fallbackZ =
      side === 'bottom'
        ? (-halfCore - laminate.copper - laminate.solderMask / 2)
        : (halfCore + laminate.copper + laminate.solderMask / 2)
    const baseZ = Number.isFinite(soldermaskZ) ? soldermaskZ : fallbackZ
    const targetZ = side === 'bottom' ? baseZ - biasStep : baseZ + biasStep
    if (Number.isFinite(silkscreenZ)) {
      const minZ = Math.min(baseZ, silkscreenZ) + biasStep
      const maxZ = Math.max(baseZ, silkscreenZ) - biasStep
      const clamped = Math.min(Math.max(targetZ, minZ), maxZ)
      placeLayer(modelGroup, mesh, clamped, laminate.surfaceFinish, 'surfacefinish', side)
      return
    }
    placeLayer(modelGroup, mesh, targetZ, laminate.surfaceFinish, 'surfacefinish', side)
  }
  placeSurfaceFinishDecal('top')
  placeSurfaceFinishDecal('bottom')
  scene.add(modelGroup)
  applyLayerColorOverrides()
  applyLayerVisibility()
  geometryBox = new THREE.Box3().setFromObject(modelGroup)
  if (geometryBox) {
    geometryBox.getCenter(geometryCenter)
    geometryBox.getSize(explosionSizeVector)
    geometryRadius = Math.max(explosionSizeVector.length() / 2, 0.001)
    explosionBaseSpan = Math.max(
      explosionSizeVector.x,
      explosionSizeVector.y,
      laminarDefaults.total
    )
  } else {
    geometryCenter.set(0, 0, 0)
    explosionSizeVector.set(0, 0, 0)
    geometryRadius = Math.max(props.thickness || 0.001, 0.001)
    explosionBaseSpan = laminarDefaults.total
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

let rebuildScheduleHandle = null
let rebuildScheduleKind = null
let rebuildInFlight = false
let rebuildQueued = false

const cancelScheduledRebuild = () => {
  if (!rebuildScheduleHandle) return
  try {
    if (rebuildScheduleKind === 'idle' && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(rebuildScheduleHandle)
    } else {
      clearTimeout(rebuildScheduleHandle)
    }
  } catch {
    // ignore cancellation failures
  }
  rebuildScheduleHandle = null
  rebuildScheduleKind = null
}

const performRebuild = async () => {
  if (!scene) return
  if (rebuildInFlight) {
    rebuildQueued = true
    return
  }
  rebuildInFlight = true
  try {
    await rebuildModel()
  } finally {
    rebuildInFlight = false
    if (rebuildQueued) {
      rebuildQueued = false
      scheduleRebuild({ immediate: props.active })
    }
  }
}

const scheduleRebuild = ({ immediate = false } = {}) => {
  if (!scene) return
  rebuildQueued = true
  cancelScheduledRebuild()
  const run = () => {
    rebuildScheduleHandle = null
    rebuildScheduleKind = null
    if (!rebuildQueued) return
    rebuildQueued = false
    performRebuild()
  }

  const shouldRunSoon = Boolean(immediate || props.active)
  if (shouldRunSoon) {
    rebuildScheduleKind = 'timeout'
    rebuildScheduleHandle = setTimeout(run, 0)
    return
  }

  if (typeof requestIdleCallback === 'function') {
    rebuildScheduleKind = 'idle'
    rebuildScheduleHandle = requestIdleCallback(run, { timeout: 1200 })
    return
  }

  rebuildScheduleKind = 'timeout'
  rebuildScheduleHandle = setTimeout(run, 120)
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
  const radius = Math.max(geometryRadius || 0, props.thickness || 0.001, 0.001)
  const target = controls?.target ?? geometryCenter
  const distance = camera.position.distanceTo(target)
  const margin = radius * 1.05
  const nextNear = Math.max(0.001, distance - margin)
  const nextFar = Math.max(nextNear + 0.01, distance + margin)
  const nearChanged = Math.abs(camera.near - nextNear) > Math.max(1e-4, nextNear * 1e-3)
  const farChanged = Math.abs(camera.far - nextFar) > Math.max(1e-4, nextFar * 1e-3)
  if (nearChanged || farChanged) {
    camera.near = nextNear
    camera.far = nextFar
    camera.updateProjectionMatrix()
  }
  if (controls) {
    const minDistance = Math.max(radius * 0.02, 0.005)
    const maxDistance = Math.max(radius * 50, minDistance * 10)
    if (!Number.isFinite(controls.minDistance) || controls.minDistance !== minDistance) {
      controls.minDistance = minDistance
    }
    if (!Number.isFinite(controls.maxDistance) || controls.maxDistance !== maxDistance) {
      controls.maxDistance = maxDistance
    }
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

const disposeSceneEnvironment = () => {
  if (scene) scene.environment = null
  if (scene && typeof scene.environmentIntensity === 'number') {
    scene.environmentIntensity = 1
  }
  if (environmentTarget) {
    environmentTarget.dispose()
    environmentTarget = null
  }
  if (pmremGenerator) {
    pmremGenerator.dispose()
    pmremGenerator = null
  }
}

const createSceneEnvironment = () => {
  if (!scene || !renderer) return
  if (!pmremGenerator) {
    pmremGenerator = new THREE.PMREMGenerator(renderer)
  }
  if (environmentTarget) {
    environmentTarget.dispose()
    environmentTarget = null
  }
  const environmentScene = new RoomEnvironment()
  environmentTarget = pmremGenerator.fromScene(environmentScene, 0.1)
  scene.environment = environmentTarget.texture
  applyEnvironmentIntensity()
  environmentScene?.dispose?.()
}

const createSceneLights = () => {
  if (!scene) return
  if (lightingGroup) {
    scene.remove(lightingGroup)
    lightingGroup = null
  }
  lightingGroup = new THREE.Group()
  const ambient = new THREE.AmbientLight(0xffffff, 1.1)
  lightingGroup.add(ambient)
  const hemi = new THREE.HemisphereLight(0xf2f7ff, 0xcbd5e1, 1.55)
  hemi.position.set(0, 10, 0)
  lightingGroup.add(hemi)
  const createDirectional = (color, intensity, position) => {
    const light = new THREE.DirectionalLight(color, intensity)
    light.position.copy(position)
    light.castShadow = false
    lightingGroup.add(light)
    return light
  }
  createDirectional(0xffffff, 0.7, new THREE.Vector3(6, 11, 7))
  createDirectional(0xffe3bf, 0.25, new THREE.Vector3(-6, 4, 6))
  createDirectional(0xffffff, 0.95, new THREE.Vector3(-6, -9, -7))
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
  renderer.toneMappingExposure = 1.6
  renderer.physicallyCorrectLights = true
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.value.appendChild(renderer.domElement)
  setSceneBackground()
  createSceneEnvironment()
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
  disposeSceneEnvironment()
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

const SOLDER_MASK_EXPORT_OPACITY = 0.98

const enhanceSoldermaskMaterialForExport = (material) => {
  if (!material) return
  const targetOpacity = Math.max(SOLDER_MASK_EXPORT_OPACITY, material.opacity ?? 1)
  material.opacity = Math.min(1, targetOpacity)
  material.transparent = material.opacity < 1
  material.needsUpdate = true
}

const adjustExportMaterials = (object) => {
  if (!object) return
  object.traverse((child) => {
    if (!child.isMesh) return
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat) => (mat?.clone ? mat.clone() : mat))
    } else if (child.material?.clone) {
      child.material = child.material.clone()
    }
    if (child.userData?.layerType !== 'soldermask') return
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => enhanceSoldermaskMaterialForExport(mat))
    } else {
      enhanceSoldermaskMaterialForExport(child.material)
    }
  })
}

const createExportSnapshot = () => {
  const clone = modelGroup.clone(true)
  adjustExportMaterials(clone)
  return clone
}

const disposeExportSnapshot = (root) => {
  if (!root) return
  root.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose?.()
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat?.dispose?.())
      } else {
        child.material?.dispose?.()
      }
    }
  })
}

const captureCurrentViewImageBlob = async () => {
  if (!renderer || !scene || !camera) throw new Error('Viewer not ready')
  renderer.render(scene, camera)
  return new Promise((resolve, reject) => {
    renderer.domElement.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to capture image'))
      },
      'image/png',
      1
    )
  })
}

const exportGltfBlob = () => {
  if (!modelGroup) throw new Error('?????')
  const exporter = new GLTFExporter()
  const snapshot = createExportSnapshot()
  return new Promise((resolve, reject) => {
    exporter.parse(
      snapshot,
      (result) => {
        disposeExportSnapshot(snapshot)
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: 'model/gltf-binary' }))
          return
        }
        const json = typeof result === 'string' ? result : JSON.stringify(result)
        resolve(new Blob([json], { type: 'model/gltf+json' }))
      },
      (error) => {
        disposeExportSnapshot(snapshot)
        reject(error)
      },
      { binary: true, embedImages: true }
    )
  })
}

watch(
  () => [props.modelData?.version, props.thickness],
  () => {
    if (!scene) return
    scheduleRebuild()
  }
)

watch(() => props.backgroundColor, () => { setSceneBackground(); requestRender() })
watch(() => props.coreColor, () => updateStructuralColors())
watch(() => props.borderColor, () => updateStructuralColors())
watch(
  () => [
    props.layerColors?.copper,
    props.layerColors?.soldermask,
    props.layerColors?.surfacefinish,
    props.layerColors?.silkscreen,
    props.layerColors?.solderpaste,
  ],
  () => applyLayerColorOverrides()
)
watch(() => props.surfaceFinishType, () => applyLayerColorOverrides())
watch(() => props.envMapIntensity, () => applyEnvMapIntensityOverrides())
watch(
  () => [
    props.layerVisibility?.copper,
    props.layerVisibility?.soldermask,
    props.layerVisibility?.surfacefinish,
    props.layerVisibility?.silkscreen,
    props.layerVisibility?.solderpaste,
  ],
  () => applyLayerVisibility()
)
watch(
  () => props.drillLimit,
  () => {
    if (!scene) return
    scheduleRebuild()
  }
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
  scheduleRebuild({ immediate: true })
})

onMounted(async () => {
  initThree()
  await nextTick()
  scheduleRebuild({ immediate: true })
})

onBeforeUnmount(() => {
  cancelScheduledRebuild()
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
  async exportCurrentImage() {
    return captureCurrentViewImageBlob()
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
