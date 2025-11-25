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
  thickness: { type: Number, default: 0.016 },
  borderColor: { type: String, default: 'rgb(255, 235, 150)' },
  coreColor: { type: String, default: 'rgb(234, 226, 118)' },
  backgroundColor: { type: String, default: '#0f1220' },
  containerWidth: { type: String, default: '100%' },
  containerHeight: { type: String, default: '100%' },
  displayWidth: { type: Number, default: 0 },
  displayHeight: { type: Number, default: 0 },
  explosionActive: { type: Boolean, default: false },
  fitPadding: { type: Number, default: 1.1 },
  fitLerpMs: { type: Number, default: 150 },
  active: { type: Boolean, default: true },
})

const emit = defineEmits(['loading-change'])
const container = ref(null)

let scene = null
let camera = null
let renderer = null
let controls = null
let resizeObserver = null
let modelGroup = null
let geometryBox = null
let rafId = 0
let running = false
const objectLoader = new THREE.ObjectLoader()
let explosionEntries = []
const explosionState = { progress: 0, target: 0 }
const fitState = { active: false, start: 0, target: 0, startTime: 0, duration: 150 }

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

const setMeshColor = (object, color) => {
  if (!object) return
  const next = createColor(color, '#ffffff')
  object.traverse((child) => {
    if (child.isMesh) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat?.color?.set?.(next))
      } else {
        child.material?.color?.set?.(next)
      }
    }
  })
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
    const nextZ = THREE.MathUtils.lerp(fitState.start, fitState.target, t)
    camera.position.setZ(nextZ)
    if (t >= 1) fitState.active = false
  }
  controls?.update()
  updateExplosionAnimation()
  renderer?.render(scene, camera)
  rafId = requestAnimationFrame(animate)
  if (!fitState.active && Math.abs(explosionState.progress - explosionState.target) <= 1e-3) {
    stopLoop()
  }
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

const computeExplosionOffset = (type, side) => {
  const order = determineExplosionOrder(type, side)
  const step = Math.max(props.thickness || 0.001, 0.001) * 0.35
  return order * step
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
    const mesh = objectLoader.parse(entry.mesh)
    mesh.userData.layerId = entry.id
    mesh.userData.layerType = entry.type
    mesh.userData.layerSide = entry.side
    setMeshColor(mesh, entry.color)
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
  explosionEntries.push({
    mesh,
    baseZ,
    offset: computeExplosionOffset(type, side),
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
    setMeshColor(classification.outline, props.coreColor || props.borderColor)
    classification.outline.scale.setZ(laminate.core)
    classification.outline.position.setZ(0)
    modelGroup.add(classification.outline)
    explosionEntriesForMesh(classification.outline, 'outline', null, 0)
  }
  for (const drill of classification.drills) {
    setMeshColor(drill, props.borderColor)
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
  geometryBox = new THREE.Box3().setFromObject(modelGroup)
  updateCameraDepthRange()
  smoothRefitToBox()
  requestRender()
}

const rebuildModel = async () => {
  emit('loading-change', true)
  try {
    const layers = Array.isArray(props.modelData?.layers) ? props.modelData.layers : []
    if (!layers.length) {
      if (modelGroup) {
        scene.remove(modelGroup)
        disposeObject(modelGroup)
        modelGroup = null
      }
      geometryBox = null
      explosionEntries = []
      requestRender()
      return
    }
    assembleLayers(layers)
  } finally {
    emit('loading-change', false)
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
    controls.target.set(0, 0, 0)
    requestRender()
    return
  }
  const { width, height } = getHostSize()
  const distance = computeFitDistance(geometryBox, width, height, props.fitPadding || 1.1)
  if (!Number.isFinite(distance)) return
  fitState.active = true
  fitState.start = camera.position.z
  fitState.target = distance
  fitState.startTime = performance.now()
  fitState.duration = Math.max(props.fitLerpMs || 0, 0)
  controls.target.set(0, 0, 0)
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

const initThree = () => {
  if (!container.value) return
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.001, 1000)
  camera.position.set(0, 0, 1)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, depth: true, stencil: false })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.value.appendChild(renderer.domElement)
  setSceneBackground()
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.addEventListener('start', startLoop)
  controls.addEventListener('change', startLoop)
  controls.addEventListener('end', stopLoop)
  updateRendererSize()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateRendererSize()
      requestRender()
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
  renderer?.dispose?.()
  if (renderer?.domElement && container.value && renderer.domElement.parentNode === container.value) {
    container.value.removeChild(renderer.domElement)
  }
  scene = null
  camera = null
  renderer = null
  controls = null
}

const updateStructuralColors = () => {
  if (!modelGroup) return
  modelGroup.traverse((child) => {
    if (!child.isMesh) return
    if (child.userData?.layerType === 'outline') {
      setMeshColor(child, props.coreColor || props.borderColor)
    }
    if (child.userData?.layerType === 'drill') {
      setMeshColor(child, props.borderColor)
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
watch(() => props.explosionActive, (isActive) => {
  explosionState.target = isActive ? 1 : 0
  startLoop()
})
watch(() => props.fitPadding, () => { if (geometryBox) smoothRefitToBox() })
watch(() => props.fitLerpMs, () => { /* new lerp duration applied next refit */ })
watch(
  () => [props.containerWidth, props.containerHeight, props.displayWidth, props.displayHeight],
  () => {
    updateRendererSize()
    requestRender()
  }
)
watch(() => props.active, async (isActive) => {
  if (!isActive) {
    stopLoop()
    return
  }
  await nextTick()
  updateRendererSize()
  requestRender()
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
