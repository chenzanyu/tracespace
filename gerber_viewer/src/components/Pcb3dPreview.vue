<template>
  <div
    ref="container"
    class="viewer"
    :style="{ width: containerWidth, height: containerHeight, display: active ? 'block' : 'none' }"
  ></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick, defineExpose } from 'vue'
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

const rasterizeAndUpdateTextures = async (force = false) => {
  if (!props.topSvg || !props.bottomSvg) return false
  const targetRes = getTargetRasterRes()
  if (!force && currentRasterRes && targetRes <= currentRasterRes * 1.15) return false

  const [topCanvasObj, bottomCanvasObj] = await Promise.all([
    loadSvgStringToCanvas(props.topSvg, targetRes),
    loadSvgStringToCanvas(props.bottomSvg, targetRes),
  ])

  topCanvasObj.context.save()
  topCanvasObj.context.fillStyle = props.borderColor
  topCanvasObj.context.fillRect(0, Math.max(0, topCanvasObj.height - 1), 1, 1)
  topCanvasObj.context.restore()

  disposeTextures()

  topTexture = new THREE.CanvasTexture(topCanvasObj.canvas)
  setupTextureParams(topTexture, { repeatX: 1 })

  bottomTexture = new THREE.CanvasTexture(bottomCanvasObj.canvas)
  setupTextureParams(bottomTexture, { repeatX: -1 })

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
  return true
}

const rebuildGeometry = () => {
  if (!topTexture?.image || !scene) return
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
  smoothRefitToBox()
  requestRender()
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

const commitRendererSize = () => {
  if (!container.value || !renderer || !camera) return
  const rect = container.value.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  if (geometryBox) smoothRefitToBox()
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
        rasterizeAndUpdateTextures().then(() => requestRender())
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
}

const refreshPreview = async (force = false) => {
  if (!props.active || !renderer || !scene || !camera) return
  if (!props.topSvg || !props.bottomSvg) {
    if (mesh && scene) {
      scene.remove(mesh)
      mesh.geometry?.dispose?.()
      mesh = null
    }
    geometryBox = null
    disposeTextures()
    requestRender()
    return
  }
  try {
    const updated = await rasterizeAndUpdateTextures(force)
    if (updated) rebuildGeometry()
    else requestRender()
  } catch (error) {
    console.error('[Pcb3dPreview] rasterize failed', error)
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

watch(() => props.thickness, () => {
  rebuildGeometry()
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
  commitRendererSize()
  await refreshPreview(true)
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
