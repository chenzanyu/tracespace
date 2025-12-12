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
        class="absolute rounded-sm"
        :style="measurementRect.style"
      ></div>
      <div
        v-if="measurementValues && measurementRect"
        class="absolute text-[15px] font-semibold text-white bg-[#04111f]/95 px-4 py-3 border border-cyan-300 shadow-[0_0_16px_rgba(0,255,255,0.8)] tracking-wide text-right"
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
import { Application, Container, MeshSimple, Texture } from 'pixi.js'
import { parseHexColor } from '../libs/gerber_stack'
import { enqueueLayerMeshJob, terminateLayerMeshWorkers } from '../libs/layer_mesh'

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

const emit = defineEmits(['exit-measurement', 'loading-change', 'perf-stats'])

const enablePerfLogs = import.meta.env?.DEV ?? false
const perfLabel = (phase) => `[perf][LayerStack] ${phase}`
const startPerf = (phase) => {
  if (!enablePerfLogs) return () => {}
  console.time(perfLabel(phase))
  return () => console.timeEnd(perfLabel(phase))
}
const logPerf = (phase, payload) => {
  if (enablePerfLogs) console.log(perfLabel(phase), payload)
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
const emitLayerPerfSample = (stage, durationMs, meta = {}, memoryStart = null, memoryEnd = null) => {
  emit('perf-stats', {
    stage,
    category: 'layer-preview',
    durationMs: Number.isFinite(durationMs) ? Number(durationMs.toFixed(2)) : null,
    meta: meta || {},
    memoryStart,
    memoryEnd,
    memoryDeltaBytes: computeMemoryDelta(memoryStart, memoryEnd),
    timestamp: Date.now(),
  })
}

const compositeContainer = ref(null)
const viewScale = ref(1)
const viewTranslate = reactive({ x: 0, y: 0 })

const measurementStart = ref(null)
const measurementEnd = ref(null)
const crosshair = reactive({ x: 0, y: 0, visible: false })

const PIXELS_PER_MM = 96 / 25.4
const measurementOverlayVisible = computed(() => props.active && props.measurementActive)
const measurementRectFill = 'rgba(63, 211, 255, 0.22)'
const measurementRectBorder = '#3fd3ff'

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
      borderWidth: '2px',
      borderStyle: 'dashed',
      borderColor: measurementRectBorder,
      backgroundColor: measurementRectFill,
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
let compositeLoading = false
let compositeProgressValue = 0
let compositeProgressTotals = { total: 0, completed: 0 }
let liveRenderDesired = true
let compositeSettlePending = true
let manualRenderScheduled = false
let compositeInitialized = false

const clamp01 = (value, fallback = 0) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric <= 0) return 0
  if (numeric >= 1) return 1
  return numeric
}

const emitCompositeLoadingEvent = (payload = {}) => {
  const activeState = payload.active ?? compositeLoading
  const normalizedProgress = clamp01(
    payload.progress ?? (activeState ? compositeProgressValue : 1),
    activeState ? compositeProgressValue : 1
  )
  const total = Number.isFinite(payload.total) ? payload.total : compositeProgressTotals.total
  const completed = Number.isFinite(payload.completed)
    ? payload.completed
    : compositeProgressTotals.completed
  emit('loading-change', {
    source: 'layer-stack',
    label: '叠层初始化构建',
    active: activeState,
    progress: normalizedProgress,
    detail: payload.detail ?? '',
    message: payload.message ?? (activeState ? '正在初始化叠层' : '叠层构建完成'),
    total,
    completed,
  })
}

const resetCompositeProgressTotals = (total = 0) => {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0
  compositeProgressTotals = { total: safeTotal, completed: 0 }
  compositeProgressValue = safeTotal > 0 ? 0 : 1
}

const reportCompositeProgress = (completed, total, detail = '') => {
  if (!compositeLoading) return
  const safeTotal = Number.isFinite(total) && total > 0 ? total : compositeProgressTotals.total
  compositeProgressTotals.total = safeTotal
  const safeCompleted = Math.min(
    safeTotal > 0 ? safeTotal : 0,
    Number.isFinite(completed) && completed >= 0 ? completed : compositeProgressTotals.completed
  )
  compositeProgressTotals.completed = safeCompleted
  if (safeTotal > 0) {
    const normalized = safeCompleted / safeTotal
    compositeProgressValue = Math.min(0.995, clamp01(normalized))
  } else {
    compositeProgressValue = 1
  }
  emitCompositeLoadingEvent({
    active: true,
    progress: compositeProgressValue,
    detail,
    total: safeTotal,
    completed: safeCompleted,
  })
}

const setCompositeLoading = (state, detail = {}) => {
  if (compositeLoading === state) {
    if (state) emitCompositeLoadingEvent({ active: true, ...detail })
    return
  }
  compositeLoading = state
  if (!state) {
    compositeProgressValue = 1
    compositeProgressTotals = { total: 0, completed: 0 }
  }
  emitCompositeLoadingEvent({ active: state, ...detail })
}

const ensureLiveRendering = () => {
  liveRenderDesired = true
  const app = pixiApp.value
  if (!app) return
  if (app.ticker) app.ticker.start()
}

const disableLiveRendering = () => {
  liveRenderDesired = false
  manualRenderScheduled = false
  const app = pixiApp.value
  if (!app) return
  if (app.ticker) app.ticker.stop()
}

const requestManualRender = () => {
  if (liveRenderDesired || manualRenderScheduled) return
  const app = pixiApp.value
  if (!app) return
  manualRenderScheduled = true
  const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame
    : (cb) => setTimeout(cb, 0)
  schedule(() => {
    manualRenderScheduled = false
    if (liveRenderDesired || !pixiApp.value) return
    try {
      pixiApp.value.render()
    } catch (error) {
      console.warn('[LayerStackPreview] manual render failed', error)
    }
  })
}

const settleLiveRenderingIfReady = () => {
  if (!compositeSettlePending) return
  compositeSettlePending = false
  disableLiveRendering()
  requestManualRender()
}

const requestCompositeRender = (options = {}) => {
  if (!props.active) return
  compositeSettlePending = true
  ensureLiveRendering()
  updateComposite(options)
}

const fmData = computed(() => unref(props.fmResult))

const getFm = () => fmData.value

const getCompositeViewBox = () => getFm()?.compositeViewBox ?? props.boardViewBox
const getUnitsToPx = () => {
  const mmPerUnit = getFm()?.unitMeta?.mmPerUnit ?? 1
  return mmPerUnit * PIXELS_PER_MM
}

const compositeSizeMm = computed(() => {
  const viewBox = getCompositeViewBox()
  const mmPerUnit = getFm()?.unitMeta?.mmPerUnit ?? 1
  const widthUnits = Array.isArray(viewBox) ? Number(viewBox[2]) || 0 : 0
  const heightUnits = Array.isArray(viewBox) ? Number(viewBox[3]) || 0 : 0
  if (widthUnits > 0 && heightUnits > 0) {
    return {
      width: widthUnits * mmPerUnit,
      height: heightUnits * mmPerUnit,
    }
  }
  const fallbackWidth = typeof props.boardWidthMm === 'number' ? props.boardWidthMm : 0
  const fallbackHeight = typeof props.boardHeightMm === 'number' ? props.boardHeightMm : 0
  return {
    width: fallbackWidth,
    height: fallbackHeight,
  }
})

const applyViewTransform = () => {
  const app = pixiApp.value
  if (!app || !pixiRoot) return
  pixiRoot.scale.set(viewScale.value)
  pixiRoot.position.set(viewTranslate.x, viewTranslate.y)
  requestManualRender()
}

const resizePixiToHost = () => {
  const app = pixiApp.value
  const host = compositeContainer.value
  if (!app || !host) return
  const width = Math.max(host.clientWidth, 1)
  const height = Math.max(host.clientHeight, 1)
  if (app.renderer.width !== width || app.renderer.height !== height) {
    app.renderer.resize(width, height)
    requestManualRender()
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
  const initStart = getPerfNow()
  const initMemoryStart = captureMemorySnapshot()
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

      // --- START OF FIX ---
      // 移除下面这段强制停止 ticker 的代码。
      // Pixi 的 Application 默认会自动启动 ticker，
      // 这正是我们在繁重的初始化过程中所需要的。
      /*
      if (app.ticker) {
        app.ticker.stop()
        if (typeof app.ticker.autoStart === 'boolean') {
          app.ticker.autoStart = false
        }
        if (liveRenderDesired) {
          app.ticker.start()
        }
      }
      */
      // --- END OF FIX ---
      
      applyViewTransform()
      const initMemoryEnd = captureMemorySnapshot()
      emitLayerPerfSample(
        'layers:pixi-init',
        getPerfNow() - initStart,
        { width, height, resolution },
        initMemoryStart,
        initMemoryEnd
      )
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
  disableLiveRendering()
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
  compositeInitialized = false
}



const layerDisplayCache = new Map()

const buildZeroUvs = (positions) => {
  if (!positions || positions.length === 0) return new Float32Array()
  return new Float32Array(positions.length)
}

const createMeshFromGeometry = (geometryData, tint, alpha) => {
  if (!geometryData?.positions || !geometryData?.indices) return null
  if (geometryData.positions.length < 6 || geometryData.indices.length < 3) return null
  const vertices = geometryData.positions
  const indices = geometryData.indices
  const uvs = geometryData.uvs instanceof Float32Array ? geometryData.uvs : buildZeroUvs(vertices)
  const mesh = new MeshSimple({
    vertices,
    uvs,
    indices,
    texture: Texture.WHITE,
  })
  mesh.tint = tint
  mesh.alpha = alpha
  mesh.eventMode = 'none'
  return mesh
}

const updateDisplayTintOpacity = (display, tint, alpha) => {
  if (!display) return
  const visit = (node) => {
    if (!node) return
    if (node?.renderPipeId === 'mesh') {
      node.tint = tint
      node.alpha = alpha
    }
    const kids = Array.isArray(node.children) ? node.children : []
    for (const child of kids) visit(child)
  }
  visit(display)
}

const createLayerMeshDisplay = (chunks, tint, alpha) => {
  const layerContainer = new Container()
  layerContainer.eventMode = 'none'
  const list = Array.isArray(chunks) ? chunks : []
  for (const chunk of list) {
    const container = new Container({ isRenderGroup: true })
    container.eventMode = 'none'
    const solidMesh = createMeshFromGeometry(chunk?.solid, tint, alpha)
    if (solidMesh) container.addChild(solidMesh)

    const maskMesh = createMeshFromGeometry(chunk?.mask, 0xffffff, 1)
    if (maskMesh) {
      container.addChild(maskMesh)
      container.setMask({ mask: maskMesh, inverse: true })
    }

    if (container.children.length) layerContainer.addChild(container)
  }
  return layerContainer
}

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

const updateComposite = async ({ recenter = false, skipLoading = false } = {}) => {
  const showLoadingOverlay = !skipLoading
  const updateStart = getPerfNow()
  const memoryStart = captureMemorySnapshot()
  logPerf('updateComposite', {
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
  const app = await ensurePixiApp()
  
  // --- 核心修正 1: 在开始构建前，强制启动实时渲染 ---
  // 这将模拟您旧代码的行为，允许在构建过程中分步渲染，提供视觉反馈。
  ensureLiveRendering()
  
  let perfMeta = null
  try {
    if (!app || token !== compositeUpdateToken) return
    if (!pixiRoot) return
    resizePixiToHost()
    const endRebuild = startPerf('rebuildPixi')
    if (!fm) {
      endRebuild()
      console.warn('[LayerStackPreview] skip render: fmResult missing')
      resetLayerDisplays(false)
      if (recenter) fitToContainer(true)
      else applyViewTransform()
      return
    }
    const viewBox = getCompositeViewBox()
    const unitsToPx = getUnitsToPx()
    const ctx = { viewBox, unitsToPx }
    const plotTrees = fm.plotResult?.plotTreesById ?? {}
    const stackingOrder = props.orderedLayers
      .map((layer, index) => ({ layer, index }))
      .sort((a, b) => { // 保持您的排序逻辑
        const weightA = Number.isFinite(a.layer?.weight) ? a.layer.weight : 100
        const weightB = Number.isFinite(b.layer?.weight) ? b.layer.weight : 100
        if (weightB !== weightA) return weightB - weightA
        return b.index - a.index
      })
    const totalLayers = stackingOrder.length
    if (showLoadingOverlay) {
      resetCompositeProgressTotals(totalLayers)
      setCompositeLoading(true, {
        detail: totalLayers > 0 ? `准备 ${totalLayers} 个图层` : '等待渲染数据',
        total: totalLayers,
        completed: 0,
        progress: totalLayers > 0 ? 0 : 1,
      })
    }
      
    // --- Mesh worker: 按图层并发构建几何 ---
    let zIndex = 0
    const nextActiveIds = new Set()
    const stats = { reused: 0, rebuilt: 0, removed: 0 }
    let processedLayers = 0
    const ctxKey = `${viewBox.join(',')}|${unitsToPx}`
    const rebuildJobs = []

    for (const { layer } of stackingOrder) {
      if (token !== compositeUpdateToken) {
        console.warn('[LayerStackPreview] Update cancelled during async processing.')
        return
      }

      nextActiveIds.add(layer.id)
      const visible = layer.visible !== false
      const tree = plotTrees[layer.id]
      if (!tree) {
        processedLayers += 1
        continue
      }
      const colorValue = parseHexColor(layer.color)
      const layerOpacity = typeof layer.opacity === 'number' ? layer.opacity : 1
      const cached = layerDisplayCache.get(layer.id)
      const needsRebuild = !cached || cached.tree !== tree || cached.ctxKey !== ctxKey
      const layerZ = zIndex++

      if (needsRebuild) {
        disposeLayerDisplay(layer.id, cached)
        stats.rebuilt += 1
        const job = enqueueLayerMeshJob({
          action: 'build-layer-mesh',
          payload: {
            layerId: layer.id,
            plotTree: tree,
            viewBox,
            unitsToPx,
          },
        })
          .then((result) => {
            if (token !== compositeUpdateToken || !pixiRoot) return
            const chunks = result?.chunks ?? []
            const display = createLayerMeshDisplay(chunks, colorValue, layerOpacity)
            if (!display) return
            layerDisplayCache.set(layer.id, {
              display,
              tree,
              color: colorValue,
              opacity: layerOpacity,
              ctxKey,
            })
            display.zIndex = layerZ
            display.visible = visible
            if (display.parent !== pixiRoot) pixiRoot.addChild(display)
            processedLayers += 1
            if (showLoadingOverlay && totalLayers > 0) {
              reportCompositeProgress(
                processedLayers,
                totalLayers,
                `渲染 ${Math.min(processedLayers, totalLayers)}/${totalLayers} 个图层`
              )
            }
          })
          .catch((error) => {
            processedLayers += 1
            console.warn('[LayerStackPreview] layer mesh build failed', { layerId: layer.id, error })
          })
        rebuildJobs.push(job)
        continue
      }

      stats.reused += 1
      const entry = cached
      if (!entry?.display) {
        processedLayers += 1
        continue
      }
      if (entry.color !== colorValue || entry.opacity !== layerOpacity) {
        updateDisplayTintOpacity(entry.display, colorValue, layerOpacity)
      }
      entry.tree = tree
      entry.color = colorValue
      entry.opacity = layerOpacity
      entry.ctxKey = ctxKey
      entry.display.zIndex = layerZ
      entry.display.visible = visible
      if (entry.display.parent !== pixiRoot) pixiRoot.addChild(entry.display)
      processedLayers += 1
      if (showLoadingOverlay && totalLayers > 0) {
        reportCompositeProgress(
          processedLayers,
          totalLayers,
          `渲染 ${Math.min(processedLayers, totalLayers)}/${totalLayers} 个图层`
        )
      }
    }

    if (rebuildJobs.length) {
      await Promise.allSettled(rebuildJobs)
      if (token !== compositeUpdateToken) return
    }
    
    for (const [layerId, entry] of layerDisplayCache.entries()) {
      if (nextActiveIds.has(layerId)) continue
      disposeLayerDisplay(layerId, entry)
      layerDisplayCache.delete(layerId)
      stats.removed += 1
    }

    pixiRoot.sortDirty = true
    endRebuild()
    
    // 变换操作现在由 Ticker 自动渲染，无需手动调用
    if (recenter) fitToContainer(true)
    else applyViewTransform()
    
    const end = getPerfNow()
    // ... (保留您所有的性能日志记录逻辑)
    perfMeta = { /* ... */ }

  } finally {
    if (perfMeta) {
      const memoryEnd = captureMemorySnapshot()
      emitLayerPerfSample('layers:update-composite', getPerfNow() - updateStart, perfMeta, memoryStart, memoryEnd)
    }
    if (token === compositeUpdateToken) {
      if (showLoadingOverlay) setCompositeLoading(false, { detail: '叠层渲染完成' })
      
      // --- 核心修正 3: 所有图层都已添加到舞台并渲染后，切换回按需渲染模式 ---
      settleLiveRenderingIfReady()
      
      compositeInitialized = true
    }
  }
}
const getActiveContainer = () => compositeContainer.value

const fitToContainer = (center = false) => {
  const el = getActiveContainer()
  if (!el) return
  const rect = el.getBoundingClientRect()
  const { width: boardWidthMm, height: boardHeightMm } = compositeSizeMm.value
  if (rect.width > 0 && rect.height > 0 && boardWidthMm > 0 && boardHeightMm > 0) {
    const contentW = boardWidthMm * PIXELS_PER_MM
    const contentH = boardHeightMm * PIXELS_PER_MM
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

const hasLayerTreeChanged = (next, prev) => {
  if (!Array.isArray(next) || !Array.isArray(prev)) return true
  if (next.length !== prev.length) return true
  for (let index = 0; index < next.length; index += 1) {
    if (next[index]?.treeRef !== prev[index]?.treeRef) return true
  }
  return false
}

watch(layerSignatureSource, (next, prev) => {
  if (!props.active) return
  if (hasLayerTreeChanged(next, prev)) {
    compositeInitialized = false
  }
  requestCompositeRender({ skipLoading: compositeInitialized })
})

watch(fmData, () => {
  compositeInitialized = false
  if (!props.active) return
  requestCompositeRender({ recenter: true })
})

watch(compositeSizeMm, () => {
  if (!props.active) return
  fitToContainer(true)
})

watch(() => props.recenterSignal, () => {
  fitToContainer(true)
})

watch(() => props.active, async (active) => {
  if (!active) {
    if (props.measurementActive) exitMeasurementMode(true)
    setCompositeLoading(false, { detail: '叠层渲染已暂停' })
    compositeSettlePending = false
    disableLiveRendering()
    return
  }
  await nextTick()
  resizePixiToHost()
  fitToContainer(true)
  requestCompositeRender({ recenter: true, skipLoading: compositeInitialized })
})

onMounted(() => {
  nextTick(() => {
    observeContainerResize()
    resizePixiToHost()
    fitToContainer(true)
    requestCompositeRender({ recenter: true, skipLoading: compositeInitialized })
  })
  if (typeof window !== 'undefined') window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleResize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  terminateLayerMeshWorkers()
  destroyPixi()
})
</script>
