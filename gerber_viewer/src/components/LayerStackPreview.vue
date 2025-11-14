<template>
  <div
    ref="compositeContainer"
    class="h-full w-full bg-transparent select-none relative overflow-hidden"
    @wheel.prevent="onWheel"
    @mousedown="onPointerDown"
    @mousemove="onCompositeMouseMove"
    @mouseleave="onCompositeMouseLeave"
  >
    <div
      v-if="measurementOverlayVisible"
      class="pointer-events-none absolute inset-0 z-30"
    >
      <div v-if="crosshair.visible" class="absolute inset-0">
        <div class="absolute w-px bg-white/70" :style="{ left: `${crosshair.x}px`, top: '0', height: '100%' }"></div>
        <div class="absolute h-px bg-white/70" :style="{ top: `${crosshair.y}px`, left: '0', width: '100%' }"></div>
      </div>
      <div
        v-if="measurementRect"
        class="absolute border border-cyan-400 bg-cyan-400/10"
        :style="measurementRect.style"
      ></div>
      <div
        v-if="measurementValues && measurementRect"
        class="absolute text-[15px] font-semibold text-white bg-[#04111f]/95 px-4 py-3 border border-cyan-300 shadow-[0_0_16px_rgba(0,255,255,0.8)] tracking-wide"
        :style="measurementLabelStyle"
      >
        DX: {{ measurementValues.dx.toFixed(2) }}mm<br />
        DY: {{ measurementValues.dy.toFixed(2) }}mm<br />
        D: {{ measurementValues.diagonal.toFixed(2) }}mm
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * Gerber 层叠视图：负责 Pixi.js 渲染与测量交互。
 * 父组件仅负责传入图层数据与控制测量开关，避免重复的 WebGL 初始化逻辑。
 */
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount, unref } from 'vue'
import { Application, Container } from 'pixi.js'
import { createLayerDisplay, parseHexColor } from '../libs/gerber_stack'

const props = defineProps({
  orderedLayers: { type: Array, required: true },
  fmResult: { type: Object, required: false },
  boardViewBox: { type: Array, required: true },
  boardWidthMm: { type: Number, required: true },
  boardHeightMm: { type: Number, required: true },
  measurementActive: { type: Boolean, default: false },
  recenterSignal: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
})

const emit = defineEmits(['exit-measurement'])

const compositeContainer = ref(null)
const viewScale = ref(1)
const viewTranslate = reactive({ x: 0, y: 0 })

const measurementStart = ref(null)
const measurementEnd = ref(null)
const crosshair = reactive({ x: 0, y: 0, visible: false })

const PIXELS_PER_MM = 96 / 25.4
const measurementOverlayVisible = computed(() => props.active && props.measurementActive)
const measurementRect = computed(() => {
  if (!measurementOverlayVisible.value || !measurementStart.value || !measurementEnd.value) return null
  const left = Math.min(measurementStart.value.x, measurementEnd.value.x)
  const top = Math.min(measurementStart.value.y, measurementEnd.value.y)
  const width = Math.abs(measurementEnd.value.x - measurementStart.value.x)
  const height = Math.abs(measurementEnd.value.y - measurementStart.value.y)
  return {
    style: {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    },
    left,
    top,
    width,
    height,
  }
})
const measurementValues = computed(() => {
  if (!measurementOverlayVisible.value || !measurementStart.value || !measurementEnd.value) return null
  const dxPx = measurementEnd.value.x - measurementStart.value.x
  const dyPx = measurementEnd.value.y - measurementStart.value.y
  const pxToMm = 1 / (PIXELS_PER_MM * (viewScale.value || 0.0001))
  return {
    dx: Math.abs(dxPx) * pxToMm,
    dy: Math.abs(dyPx) * pxToMm,
    diagonal: Math.hypot(dxPx, dyPx) * pxToMm,
  }
})
const measurementLabelStyle = computed(() => {
  if (!measurementRect.value) return { display: 'none' }
  const container = compositeContainer.value?.getBoundingClientRect()
  const baseLeft = measurementRect.value.left + measurementRect.value.width + 8
  const baseTop = measurementRect.value.top - 48
  const maxLeft = container ? container.width - 120 : baseLeft
  const left = Math.min(Math.max(0, baseLeft), maxLeft)
  const top = baseTop < 0 ? measurementRect.value.top + measurementRect.value.height + 8 : baseTop
  return { left: `${left}px`, top: `${top}px` }
})

const pixiApp = ref(null)
let pixiRoot = null
let pixiCanvas = null
let pixiInitPromise = null
let compositeUpdateToken = 0
let resizeObserver = null

const fmData = computed(() => unref(props.fmResult))

watch(fmData, (val) => {
  console.log('[LayerStackPreview] fmResult updated', { hasFm: Boolean(val) })
}, { immediate: true })

const getFm = () => fmData.value

const getCompositeViewBox = () => getFm()?.compositeViewBox ?? props.boardViewBox
const getUnitsToPx = () => {
  const mmPerUnit = getFm()?.unitMeta?.mmPerUnit ?? 1
  return mmPerUnit * PIXELS_PER_MM
}

const applyViewTransform = () => {
  const app = pixiApp.value
  if (!app || !pixiRoot) return
  pixiRoot.scale.set(viewScale.value)
  pixiRoot.position.set(viewTranslate.x, viewTranslate.y)
}

const resizePixiToHost = () => {
  const app = pixiApp.value
  const host = compositeContainer.value
  if (!app || !host) return
  const width = Math.max(host.clientWidth, 1)
  const height = Math.max(host.clientHeight, 1)
  if (app.renderer.width !== width || app.renderer.height !== height) {
    app.renderer.resize(width, height)
  }
}

const ensurePixiApp = async () => {
  if (pixiApp.value) return pixiApp.value
  if (pixiInitPromise) return pixiInitPromise
  const host = compositeContainer.value
  if (!host) return null
  const width = Math.max(host.clientWidth || 1, 1)
  const height = Math.max(host.clientHeight || 1, 1)
  const resolution = window.devicePixelRatio || 1
  const app = new Application()
  pixiInitPromise = (async () => {
    try {
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution,
        autoDensity: true,
        resizeTo: host,
      })
      const canvasEl = app.canvas ?? app.view
      canvasEl.style.position = 'absolute'
      canvasEl.style.left = '0'
      canvasEl.style.top = '0'
      canvasEl.style.width = '100%'
      canvasEl.style.height = '100%'
      canvasEl.style.pointerEvents = 'none'
      canvasEl.style.userSelect = 'none'
      host.appendChild(canvasEl)
      app.stage.eventMode = 'none'
      pixiRoot = new Container()
      pixiRoot.eventMode = 'none'
      pixiRoot.sortableChildren = true
      app.stage.sortableChildren = true
      app.stage.addChild(pixiRoot)
      resizePixiToHost()
      pixiApp.value = app
      pixiCanvas = canvasEl
      applyViewTransform()
      return app
    } catch (error) {
      try { app.destroy(true) } catch { /* noop */ }
      throw error
    } finally {
      pixiInitPromise = null
    }
  })()
  return pixiInitPromise
}

const destroyPixi = () => {
  const app = pixiApp.value
  if (app) {
    try { app.destroy(true) } catch (err) { console.warn('销毁 Pixi 应用失败', err) }
  }
  if (pixiCanvas?.parentNode) pixiCanvas.parentNode.removeChild(pixiCanvas)
  resetLayerDisplays()
  pixiApp.value = null
  pixiRoot = null
  pixiCanvas = null
  pixiInitPromise = null
}

const layerDisplayCache = new Map()

const disposeLayerDisplay = (layerId, entry, { destroy = true } = {}) => {
  if (!entry) return
  try {
    if (entry.display?.parent) entry.display.parent.removeChild(entry.display)
  } catch (error) {
    console.warn('[LayerStackPreview] detach display failed', { layerId, error })
  }
  if (destroy && entry.display) {
    try {
      entry.display.destroy({ children: true })
    } catch (error) {
      console.warn('[LayerStackPreview] destroy display failed', { layerId, error })
    }
  }
}

const resetLayerDisplays = (destroy = true) => {
  for (const [layerId, entry] of layerDisplayCache.entries()) {
    disposeLayerDisplay(layerId, entry, { destroy })
    layerDisplayCache.delete(layerId)
  }
  pixiRoot?.removeChildren()
}

const updateComposite = async ({ recenter = false } = {}) => {
  const updateStart = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  console.log('[LayerStackPreview] updateComposite triggered', {
    active: props.active,
    recenter,
    layers: props.orderedLayers.length,
    hasFm: Boolean(getFm()),
    tokenPreview: compositeUpdateToken + 1,
  })
  if (!props.active) return
  compositeUpdateToken += 1
  const token = compositeUpdateToken
  const fm = getFm()
  console.time('[composite] ensurePixiApp')
  const app = await ensurePixiApp()
  console.timeEnd('[composite] ensurePixiApp')
  if (!app || token !== compositeUpdateToken) return
  if (!pixiRoot) return
  resizePixiToHost()
  console.time('[composite] rebuildPixi')
  if (!fm) {
    console.timeEnd('[composite] rebuildPixi')
    console.warn('[LayerStackPreview] skip render: fmResult missing')
    resetLayerDisplays(false)
    if (recenter) fitToContainer(true)
    else applyViewTransform()
    return
  }
  const viewBox = getCompositeViewBox()
  const unitsToPx = getUnitsToPx()
  console.log('[LayerStackPreview] render context', { viewBox, unitsToPx })
  const ctx = { viewBox, unitsToPx }
  const plotTrees = fm.plotResult?.plotTreesById ?? {}
  const stackingOrder = props.orderedLayers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => {
      const weightA = Number.isFinite(a.layer?.weight) ? a.layer.weight : 100
      const weightB = Number.isFinite(b.layer?.weight) ? b.layer.weight : 100
      if (weightB !== weightA) return weightB - weightA
      return b.index - a.index
    })
  let zIndex = 0
  const nextActiveIds = new Set()
  const stats = { reused: 0, rebuilt: 0, removed: 0 }
  for (const { layer } of stackingOrder) {
    nextActiveIds.add(layer.id)
    const visible = layer.visible !== false
    const tree = plotTrees[layer.id]
    if (!tree) continue
    const colorValue = parseHexColor(layer.color)
    const layerOpacity = typeof layer.opacity === 'number' ? layer.opacity : 1
    const cached = layerDisplayCache.get(layer.id)
    const needsRebuild = !cached || cached.tree !== tree || cached.color !== colorValue || cached.opacity !== layerOpacity
    if (needsRebuild) {
      disposeLayerDisplay(layer.id, cached)
      const display = createLayerDisplay(tree, ctx, colorValue, layerOpacity)
      if (!display) continue
      display.eventMode = 'none'
      layerDisplayCache.set(layer.id, { display, tree, color: colorValue, opacity: layerOpacity })
      stats.rebuilt += 1
    } else {
      stats.reused += 1
    }
    const entry = layerDisplayCache.get(layer.id)
    if (!entry?.display) continue
    entry.tree = tree
    entry.color = colorValue
    entry.opacity = layerOpacity
    entry.display.zIndex = zIndex++
    entry.display.visible = visible
    if (entry.display.parent !== pixiRoot) pixiRoot.addChild(entry.display)
  }
  for (const [layerId, entry] of layerDisplayCache.entries()) {
    if (nextActiveIds.has(layerId)) continue
    disposeLayerDisplay(layerId, entry)
    layerDisplayCache.delete(layerId)
    stats.removed += 1
  }
  pixiRoot.sortDirty = true
  console.timeEnd('[composite] rebuildPixi')
  if (recenter) fitToContainer(true)
  else applyViewTransform()
  const end = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  const rendererInfo = app?.renderer?.info ? { ...app.renderer.info } : null
  const jsHeap = typeof performance !== 'undefined' && performance.memory ? performance.memory.usedJSHeapSize : null
  console.log('[composite] stats', {
    token,
    durationMs: Number((end - updateStart).toFixed(2)),
    pixiChildren: pixiRoot.children.length,
    reusedDisplays: stats.reused,
    rebuiltDisplays: stats.rebuilt,
    removedDisplays: stats.removed,
    rendererInfo,
    jsHeap,
  })
}

const getActiveContainer = () => compositeContainer.value

const fitToContainer = (center = false) => {
  const el = getActiveContainer()
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0 && props.boardWidthMm > 0 && props.boardHeightMm > 0) {
    const contentW = props.boardWidthMm * PIXELS_PER_MM
    const contentH = props.boardHeightMm * PIXELS_PER_MM
    const margin = 0.3
    const scaleX = (rect.width * (1 - margin)) / contentW
    const scaleY = (rect.height * (1 - margin)) / contentH
    viewScale.value = Math.max(0.05, Math.min(scaleX, scaleY))
    if (center) {
      const drawW = contentW * viewScale.value
      const drawH = contentH * viewScale.value
      const centerX = (rect.width - drawW) / 2
      const centerY = (rect.height - drawH) / 2
      const align = (v) => Math.round(v) + 0.5
      viewTranslate.x = align(centerX)
      viewTranslate.y = align(centerY)
    }
  }
  applyViewTransform()
}

let drag = { active: false, startX: 0, startY: 0, ox: 0, oy: 0 }
const onPointerDown = (event) => {
  if (!props.active) return
  if (measurementOverlayVisible.value) {
    if (event.button !== 0) return
    event.preventDefault()
    const local = getCompositeLocal(event)
    handleMeasurementClick(local)
    return
  }
  drag = { active: true, startX: event.clientX, startY: event.clientY, ox: viewTranslate.x, oy: viewTranslate.y }
  const move = (ev) => {
    if (!drag.active) return
    viewTranslate.x = drag.ox + (ev.clientX - drag.startX)
    viewTranslate.y = drag.oy + (ev.clientY - drag.startY)
    applyViewTransform()
  }
  const up = () => {
    drag.active = false
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

const onWheel = (event) => {
  if (!props.active) return
  const rect = compositeContainer.value?.getBoundingClientRect?.() || { left: 0, top: 0 }
  const mx = event.clientX - rect.left
  const my = event.clientY - rect.top
  const prev = viewScale.value
  const factor = event.deltaY > 0 ? 0.9 : 1.1
  const next = Math.min(20, Math.max(0.05, prev * factor))
  const wx = (mx - viewTranslate.x) / prev
  const wy = (my - viewTranslate.y) / prev
  viewTranslate.x = mx - wx * next
  viewTranslate.y = my - wy * next
  viewScale.value = next
  applyViewTransform()
}

const getCompositeLocal = (event) => {
  const rect = compositeContainer.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))
  return { x, y }
}

const handleMeasurementClick = (local) => {
  if (!measurementStart.value) {
    measurementStart.value = local
    measurementEnd.value = local
  } else {
    measurementStart.value = null
    measurementEnd.value = null
  }
}

const onCompositeMouseMove = (event) => {
  if (!measurementOverlayVisible.value) return
  const local = getCompositeLocal(event)
  crosshair.x = local.x
  crosshair.y = local.y
  crosshair.visible = true
  if (measurementStart.value) measurementEnd.value = local
}

const onCompositeMouseLeave = () => {
  if (!measurementOverlayVisible.value) return
  crosshair.visible = false
}

const exitMeasurementMode = (notifyParent = false) => {
  measurementStart.value = null
  measurementEnd.value = null
  crosshair.visible = false
  if (notifyParent) emit('exit-measurement')
}

const handleResize = () => {
  if (!props.active) return
  resizePixiToHost()
  fitToContainer(true)
}

const observeContainerResize = () => {
  if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') return
  if (!compositeContainer.value) return
  if (!resizeObserver) {
    resizeObserver = new window.ResizeObserver(() => {
      resizePixiToHost()
      if (props.active) fitToContainer(true)
    })
  }
  resizeObserver.observe(compositeContainer.value)
}

watch(compositeContainer, (next, prev) => {
  if (resizeObserver && prev) resizeObserver.unobserve(prev)
  if (next) observeContainerResize()
})

watch(() => props.measurementActive, (active) => {
  if (!active) {
    exitMeasurementMode()
  } else {
    measurementStart.value = null
    measurementEnd.value = null
    crosshair.visible = false
  }
})

const layerSignatureSource = () => {
  const fm = getFm()
  const plotTrees = fm?.plotResult?.plotTreesById ?? {}
  return props.orderedLayers.map((layer, index) => ({
    id: layer.id,
    visible: layer.visible !== false,
    color: layer.color,
    opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
    weight: Number.isFinite(layer.weight) ? layer.weight : 100,
    order: index,
    treeRef: plotTrees[layer.id],
  }))
}

watch(layerSignatureSource, () => {
  console.log('[LayerStackPreview] orderedLayers changed')
  if (!props.active) return
  updateComposite()
})

watch(fmData, () => {
  console.log('[LayerStackPreview] fmResult changed', { hasFm: Boolean(fmData.value) })
  if (!props.active) return
  updateComposite({ recenter: true })
})

watch(() => props.recenterSignal, () => {
  fitToContainer(true)
})

watch(() => props.active, async (active) => {
  if (!active && props.measurementActive) {
    exitMeasurementMode(true)
  }
  if (active) {
    await nextTick()
    resizePixiToHost()
    fitToContainer(true)
    updateComposite({ recenter: true })
  }
})

onMounted(() => {
  console.log('[LayerStackPreview] mounted', {
    hasFm: Boolean(getFm()),
    layers: props.orderedLayers.length,
  })
  nextTick(() => {
    observeContainerResize()
    resizePixiToHost()
    fitToContainer(true)
    updateComposite({ recenter: true })
  })
  if (typeof window !== 'undefined') window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleResize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  destroyPixi()
})
</script>
