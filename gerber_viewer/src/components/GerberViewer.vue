<template>
  <div class="h-screen w-screen flex relative">
    <!-- Left panel: controls -->
    <div
      class="relative bg-linear-to-b from-gray-900 to-gray-800 text-gray-100 border-r border-gray-700 transition-all duration-300 ease-in-out"
      :class="currentStatusIndex===0 ? 'flex-1 flex items-center justify-center' : 'shrink-0'"
      :style="panelStyle"
    >
      <!-- Upload panel -->
      <div v-if="currentStatusIndex === 0" class="h-full flex items-center justify-center p-4">
        <div
          @dblclick="receiveFileOnDbClick"
          @drop.prevent="receiveFileOnDrop"
          :class="{ 'is-dragover': isDragOver }"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          class="w-[560px] h-[360px] max-w-[90vw] flex flex-col items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10 hover:ring-cyan-400/50 transition cursor-pointer backdrop-blur-sm"
        >
          <span class="pi pi-file-arrow-up text-cyan-300" style="font-size: 64px;"></span>
          <p class="text-[18px] mt-6 font-bold text-gray-100">上传PCB文件</p>
          <p class="text-[12px] mt-3 text-gray-300">支持 Gerber压缩包(.zip/.rar/.7z) .PCBDoc .kicad_pcb</p>
        </div>
      </div>

      <!-- Layer manager -->
      <div v-else class="h-full flex flex-col" v-show="isLayerPanelOpen">
        <div class="p-4 flex flex-col flex-1 overflow-y-auto space-y-4">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold flex-1">图层列表</h3>
            <button class="px-2 py-1 border rounded" @click="openSettings()">设置</button>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-300 flex-wrap">
            <button class="px-2 py-1 border rounded text-gray-100" @click="setAllVisible(true)">全部显示</button>
            <button class="px-2 py-1 border rounded text-gray-100" @click="setAllVisible(false)">全部隐藏</button>
            <label class="flex items-center gap-1 select-none cursor-pointer ml-auto">
              <input type="checkbox" v-model="showFilenames" /> 显示文件名
            </label>
          </div>
          <div class="space-y-2">
            <div v-for="layer in orderedLayers" :key="layer.id" class="py-2 border-b border-gray-700 flex items-center gap-2">
              <button class="w-8 h-8 shrink-0 flex items-center justify-center rounded border border-gray-600 hover:bg-gray-700" :title="layer.visible ? '隐藏' : '显示'" @click="layer.visible=!layer.visible; updateComposite()">
                <span :class="layer.visible ? 'pi pi-eye' : 'pi pi-eye-slash'" />
              </button>
              <div class="flex-1 min-w-0">
                <div class="text-xs truncate">{{ displayLayerName(layer) }}</div>
                <div v-if="showFilenames" class="text-[10px] text-gray-400 truncate mt-1" :title="layer.filename">{{ layer.filename }}</div>
              </div>
              <input class="w-10 h-6" type="color" v-model="layer.color" @input="updateComposite()"/>
            </div>
          </div>
        </div>
      </div>

      <input ref="fileInput" type="file" hidden @change="receiveFileOnInput" />

      <div
        v-if="currentStatusIndex !== 0"
        class="absolute inset-y-0 right-0 z-40 flex items-center pr-0 pointer-events-none"
      >
        <div class="pointer-events-auto" v-if="isLayerPanelOpen">
          <button
            class="flex h-11 w-8 translate-x-full items-center justify-center rounded-r-full border-2 border-[#0092b8] border-l-0 bg-white text-[#0092b8] shadow-lg transition hover:bg-[#0092b8] hover:text-white focus:outline-none"
            @click="toggleLayerPanel"
          >
            <span class="pi pi-angle-left"></span>
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="currentStatusIndex !== 0 && !isLayerPanelOpen"
      class="absolute left-0 top-1/2 z-30 flex h-11 w-8 -translate-y-1/2 items-center justify-center rounded-r-full border-2 border-l-0 border-[#0092b8] bg-white text-[#0092b8] shadow-lg transition hover:bg-[#0092b8] hover:text-white focus:outline-none"
      @click="toggleLayerPanel"
    >
      <span class="pi pi-angle-right"></span>
    </button>

    <!-- Right panel: canvas -->
    <div
      ref="previewContainer"
      class="flex-1 relative overflow-hidden bg-gradient-to-br from-gray-800 via-gray-900 to-black"
      v-show="currentStatusIndex !== 0"
    >
      <div class="absolute top-4 right-4 z-20">
        <div class="inline-flex overflow-hidden rounded-full border-2 border-[#0092b8] bg-white shadow">
          <button
            v-for="mode in viewModeOptions"
            :key="mode.value"
            class="px-5 py-2 text-sm font-semibold uppercase tracking-wide transition-colors focus:outline-none"
            :class="viewMode===mode.value ? 'bg-[#0092b8] text-white' : 'bg-white text-[#0092b8]'"
            @click="viewMode = mode.value"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>

      <div
        v-if="viewMode==='2d' || viewMode==='3d'"
        class="absolute top-4 left-4 z-20 bg-gray-900/70 backdrop-blur rounded-lg border border-gray-700 p-3 text-xs text-gray-100 space-y-2"
      >
        <div class="font-semibold uppercase tracking-wide">{{ viewMode }} 颜色</div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2">copper
            <input
              type="color"
              v-model="boardColors[viewMode === '3d' ? 'bottom' : 'top'].copper"
              @input="updateBoardPreview(viewMode === '3d' ? 'bottom' : 'top')"
            />
          </label>
          <label class="flex items-center gap-2">soldermask
            <input
              type="color"
              v-model="boardColors[viewMode === '3d' ? 'bottom' : 'top'].soldermask"
              @input="updateBoardPreview(viewMode === '3d' ? 'bottom' : 'top')"
            />
          </label>
          <label class="flex items-center gap-2">silkscreen
            <input
              type="color"
              v-model="boardColors[viewMode === '3d' ? 'bottom' : 'top'].silkscreen"
              @input="updateBoardPreview(viewMode === '3d' ? 'bottom' : 'top')"
            />
          </label>
          <label class="flex items-center gap-2">solderpaste
            <input
              type="color"
              v-model="boardColors[viewMode === '3d' ? 'bottom' : 'top'].solderpaste"
              @input="updateBoardPreview(viewMode === '3d' ? 'bottom' : 'top')"
            />
          </label>
        </div>
      </div>

      <div class="absolute top-4 left-4 z-30 space-y-2" v-if="viewMode==='layers'">
        <div class="flex gap-2">
          <button
            class="px-2 py-1 bg-gray-900/80 text-white uppercase text-[11px] tracking-wide border border-white/30 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800"
            title="重置视图"
            @click="resetCompositeSize"
          >
            <img :src="resetIcon" alt="reset" class="w-6 h-6" />
          </button>
          <button
            class="px-2 py-1 uppercase text-[11px] tracking-wide border flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-colors"
            :class="measurementMode ? 'bg-[#0092b8] text-white border-[#3fd3ff] drop-shadow-[0_0_12px_rgba(0,146,184,0.8)]' : 'bg-gray-900/80 text-white border-white/30 hover:bg-gray-800'"
            title="尺寸测量"
            @click="toggleMeasurementMode"
          >
            <img :src="measureIcon" alt="measurement" class="w-6 h-6" />
          </button>
        </div>
      </div>

      <div class="h-full w-full">
        <div v-show="viewMode==='2d'" ref="topContainer" class="h-full w-full overflow-hidden bg-transparent select-none" @wheel.prevent="onWheel" @mousedown="onPointerDown">
          <div :style="transformStyle" class="origin-top-left">
            <div v-html="topSvg"></div>
          </div>
        </div>
        <div v-show="viewMode==='3d'" ref="bottomContainer" class="h-full w-full overflow-hidden bg-transparent select-none" @wheel.prevent="onWheel" @mousedown="onPointerDown">
          <div :style="transformStyle" class="origin-top-left">
            <div v-html="bottomSvg"></div>
          </div>
        </div>
        <div v-show="viewMode==='layers'" class="h-full w-full">
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
              <div
                v-if="crosshair.visible"
                class="absolute inset-0"
              >
                <div
                  class="absolute w-px bg-white/70"
                  :style="{ left: `${crosshair.x}px`, top: '0', height: '100%' }"
                ></div>
                <div
                  class="absolute h-px bg-white/70"
                  :style="{ top: `${crosshair.y}px`, left: '0', width: '100%' }"
                ></div>
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
                DX: {{ measurementValues.dx.toFixed(2) }}mm<br/>
                DY: {{ measurementValues.dy.toFixed(2) }}mm<br/>
                D: {{ measurementValues.diagonal.toFixed(2) }}mm
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Settings Modal -->
  <div v-if="isSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="isSettingsOpen=false"></div>
    <div class="relative bg-gray-900 text-gray-100 w-[720px] max-w-[95vw] max-h-[80vh] rounded-lg border border-gray-700 shadow-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div class="font-semibold">图层设置</div>
        <button class="px-2 py-1 border rounded" @click="isSettingsOpen=false">关闭</button>
      </div>
      <div class="p-4 overflow-auto max-h-[60vh] space-y-3">
        <div v-for="item in editableLayers" :key="item.id" class="border border-gray-700 rounded p-3 flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium truncate">{{ item.filename }}</div>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-300">type</label>
            <select v-model="item.type" class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs" @change="item.side = coerceSideForType(item.type, item.side)">
              <option value="copper">copper</option>
              <option value="soldermask">soldermask</option>
              <option value="silkscreen">silkscreen</option>
              <option value="solderpaste">solderpaste</option>
              <option value="drill">drill</option>
              <option value="outline">outline</option>
              <option value="drawing">drawing</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-300">side</label>
            <select v-model="item.side" class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
              <option v-for="opt in allowedSides(item.type)" :key="(opt ?? 'na')" :value="opt">{{ opt ?? 'n/a' }}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="p-3 border-t border-gray-700 flex items-center justify-end gap-2">
        <button class="px-3 py-1 border rounded" @click="isSettingsOpen=false">取消</button>
        <button class="px-3 py-1 border rounded bg-cyan-600 text-white" @click="applySettings()">保存</button>
      </div>
    </div>
  </div>
</template>


<script setup>
import { ref, reactive, computed, nextTick, watch, toRaw, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { fromMemoryLayers } from '@tracespace/core'
import { Application, Container } from 'pixi.js'
import { fromMemoryLayers as legacyFromMemoryLayers, stringifySvg as legacyStringifySvg } from '../libs/tracespace_svg/tracespace-core'
import { createLayerDisplay, parseHexColor, randomHexColor, orderLayerWeight } from '../libs/gerber_stack'
const resetIcon = new URL('../assets/resetting.svg', import.meta.url).href
const measureIcon = new URL('../assets/measurement.svg', import.meta.url).href

// Status and basic refs
const currentStatusIndex = ref(0)
const fileInput = ref(null)
const isDragOver = ref(true)

// SVG outputs
const topSvg = ref('')
const bottomSvg = ref('')

// Layer data & renderer results
const fmRef = ref(null)
const memoryLayers = ref([])

// Board colors
const defaultBoard = { copper: '#cc9933', soldermask: '#004200', silkscreen: '#ffffff', solderpaste: '#999999' }
// PCB 前后板的默认配色，可在设置面板中实时调整
const boardColors = reactive({ top: { ...defaultBoard }, bottom: { ...defaultBoard } })

// Base board SVGs for recolor
let baseTopEl = null
let baseBottomEl = null

// 视图状态（缩放、平移、模式、测量等）
const compositeContainer = ref(null)
const topContainer = ref(null)
const bottomContainer = ref(null)
const previewContainer = ref(null)
const viewScale = ref(1)
const viewTranslate = reactive({ x: 0, y: 0 })
const viewMode = ref('layers')
const viewModeOptions = [
  { label: 'Layers', value: 'layers' },
  { label: '2D', value: '2d' },
  { label: '3D', value: '3d' },
]
const isLayerPanelOpen = ref(true)
const layerPanelPreference = ref(null)
const measurementMode = ref(false)
const measurementStart = ref(null)
const measurementEnd = ref(null)
const crosshair = reactive({ x: 0, y: 0, visible: false })

const PIXELS_PER_MM = 96 / 25.4
const pixiApp = ref(null)
let pixiRoot = null
let pixiCanvas = null
let pixiInitPromise = null
let compositeUpdateToken = 0

let boardViewBox = [0, 0, 0, 0]
let boardWidthMm = 0
let boardHeightMm = 0
let legacyBoardUpdateToken = 0

function updateBoardDimensionsFromBase() {
  const fallbackWidth = Array.isArray(boardViewBox) ? boardViewBox[2] || 0 : 0
  const fallbackHeight = Array.isArray(boardViewBox) ? boardViewBox[3] || 0 : 0
  const parseDim = (attr, fallback) => {
    const numeric = parseFloat(String(attr ?? '').replace('mm', ''))
    return Number.isFinite(numeric) ? numeric : fallback
  }
  const widthAttr = baseTopEl?.properties?.width ?? baseBottomEl?.properties?.width
  const heightAttr = baseTopEl?.properties?.height ?? baseBottomEl?.properties?.height
  boardWidthMm = parseDim(widthAttr, fallbackWidth)
  boardHeightMm = parseDim(heightAttr, fallbackHeight)
}

async function refreshLegacyBoardRenders(layers) {
  const token = ++legacyBoardUpdateToken
  if (!Array.isArray(layers) || layers.length === 0) {
    baseTopEl = null
    baseBottomEl = null
    topSvg.value = ''
    bottomSvg.value = ''
    boardWidthMm = 0
    boardHeightMm = 0
    return
  }
  try {
    const legacyResult = await legacyFromMemoryLayers(layers)
    if (token !== legacyBoardUpdateToken) return
    const { renderBoardResult, renderLayersResult } = legacyResult || {}
    baseTopEl = renderBoardResult?.top ?? null
    baseBottomEl = renderBoardResult?.bottom ?? null
    if (renderLayersResult?.boardShapeRender?.viewBox) {
      boardViewBox = renderLayersResult.boardShapeRender.viewBox
    }
    updateBoardDimensionsFromBase()
    updateBoardPreview('top')
    updateBoardPreview('bottom')
  } catch (error) {
    if (token !== legacyBoardUpdateToken) return
    console.error('[GerberViewer] legacy board render failed', error)
  }
}

// Ordered layers for stacking view
const orderedLayers = reactive([])
const showFilenames = ref(false)
const isSettingsOpen = ref(false)
const editableLayers = reactive([])

const transformStyle = computed(() => ({
  transform: `translate(${viewTranslate.x}px, ${viewTranslate.y}px) scale(${viewScale.value})`,
}))
const panelStyle = computed(() => {
  if (currentStatusIndex.value === 0) return {}
  const width = isLayerPanelOpen.value ? '20rem' : '0px'
  return { width, flexBasis: width }
})
// 测量框与数值计算，基于当前缩放值换算为毫米
const measurementOverlayVisible = computed(() => viewMode.value === 'layers' && measurementMode.value)
const measurementRect = computed(() => {
  if (!measurementStart.value || !measurementEnd.value) return null
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
  if (!measurementStart.value || !measurementEnd.value) return null
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
  return {
    left: `${left}px`,
    top: `${top}px`,
  }
})

// 上传并解析 PCB 文件，拉起渲染流程
const handleUploadFile = async (file) => {
  const formData = new FormData()
  formData.append('UploadFile', file, file.name)

  const res = await axios.post(
    'http://10.168.8.251:5004/api/PCBParse/Parse?Mode=0',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', accept: '*/*' } },
  )

  const result = res.data.Data
  memoryLayers.value = result.Items || []
  const legacyBoardPromise = refreshLegacyBoardRenders(memoryLayers.value)
  const fm = await fromMemoryLayers(memoryLayers.value)
  const { renderLayersResult, plotResult } = fm

  fmRef.value = fm

  boardViewBox = renderLayersResult.boardShapeRender.viewBox
  await legacyBoardPromise

  orderedLayers.splice(0)
  for (const l of renderLayersResult.layers) {
    orderedLayers.push({
      id: l.id,
      side: l.side,
      type: l.type,
      weight: orderLayerWeight(l.side, l.type),
      color: randomHexColor(),
      visible: true,
      filename: l.filename,
      opacity: typeof l.opacity === 'number' ? l.opacity : 1,
      plotTree: plotResult?.plotTreesById?.[l.id],
    })
  }
  orderedLayers.sort((a, b) => a.weight - b.weight)
  currentStatusIndex.value = 1
  viewMode.value = 'layers'
  await nextTick()
  syncLayerPanelToViewport()
  schedulePreviewRefresh('upload complete')
  await updateComposite({ recenter: true })
}

// Receive files
const receiveFileOnInput = (e) => {
  const selected = e.target.files?.[0] || null
  if (selected) handleUploadFile(selected)
}
const receiveFileOnDrop = (e) => {
  const selected = e.dataTransfer?.files?.[0] || null
  if (selected) handleUploadFile(selected)
}
const receiveFileOnDbClick = () => fileInput.value?.click()

// Helpers
function deepClone(input, seen = new WeakMap()) {
  const el = (typeof input === 'object' && input !== null && input.__v_isReactive) ? toRaw(input) : input
  if (el === null || typeof el !== 'object') return el
  if (seen.has(el)) return seen.get(el)
  try { if (typeof window !== 'undefined' && typeof window.structuredClone === 'function') { return window.structuredClone(el) } } catch {}
  if (Array.isArray(el)) { const out = new Array(el.length); seen.set(el, out); for (let i=0;i<el.length;i++) out[i]=deepClone(el[i], seen); return out }
  const out = {}; seen.set(el, out); for (const [k,v] of Object.entries(el)) { if (k==='parent' || k==='__v_isReactive' || k==='__v_skip') continue; out[k]=deepClone(v, seen) } ; return out
}

// 复用旧版 tracespace 渲染结果，对 SVG 逐节点染色
function applyBoardColorsLocal(root, colors) {
  const all = []
  const stack = [root]
  while (stack.length) {
    const n = stack.pop()
    all.push(n)
    for (const k of n.children || []) if (k && k.type === 'element') stack.push(k)
  }
  for (const g of all.filter((n) => n.tagName === 'g' && typeof n.properties?.mask === 'string' && n.properties.mask.startsWith('url(#drill-'))) {
    if (colors.copper) {
      const ch = Array.isArray(g.children) ? g.children : []
      for (const k of ch) if (k.tagName === 'g') { k.properties = k.properties || {}; k.properties.color = colors.copper }
    }
  }
  for (const g of all.filter((n) => n.tagName === 'g' && typeof n.properties?.mask === 'string' && n.properties.mask.startsWith('url(#resist-'))) {
    const ch = Array.isArray(g.children) ? g.children : []
    for (const c of ch) {
      if (c.tagName === 'rect' && colors.soldermask) { c.properties = c.properties || {}; c.properties.fill = colors.soldermask }
      if (c.tagName === 'g' && colors.silkscreen) { c.properties = c.properties || {}; c.properties.color = colors.silkscreen }
    }
  }
  if (colors.solderpaste) {
    for (const n of all) if (n.tagName === 'g' && typeof n.properties?.color === 'string' && n.properties.color === '#999') n.properties.color = colors.solderpaste
  }
}

function updateBoardPreview(side) {
  if (side === 'top' && baseTopEl) {
    const clone = deepClone(baseTopEl)
    applyBoardColorsLocal(clone, boardColors.top)
    clone.properties = clone.properties || {}
    clone.properties.preserveAspectRatio = 'xMidYMid meet'
    if (clone.properties.style) delete clone.properties.style
    topSvg.value = legacyStringifySvg(clone)
  }
  if (side === 'bottom' && baseBottomEl) {
    const clone = deepClone(baseBottomEl)
    applyBoardColorsLocal(clone, boardColors.bottom)
    clone.properties = clone.properties || {}
    clone.properties.preserveAspectRatio = 'xMidYMid meet'
    if (clone.properties.style) delete clone.properties.style
    bottomSvg.value = legacyStringifySvg(clone)
  }
}

function getCompositeViewBox() {
  return fmRef.value?.compositeViewBox ?? boardViewBox
}

function getUnitsToPx() {
  const mmPerUnit = fmRef.value?.unitMeta?.mmPerUnit ?? 1
  return mmPerUnit * PIXELS_PER_MM
}

function applyViewTransform() {
  const app = pixiApp.value
  if (!app || !pixiRoot) return
  pixiRoot.scale.set(viewScale.value)
  pixiRoot.position.set(viewTranslate.x, viewTranslate.y)
}

function resizePixiToHost() {
  const app = pixiApp.value
  const host = compositeContainer.value
  if (!app || !host) return
  const width = Math.max(host.clientWidth, 1)
  const height = Math.max(host.clientHeight, 1)
  if (app.renderer.width !== width || app.renderer.height !== height) {
    app.renderer.resize(width, height)
  }
}

async function ensurePixiApp() {
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

// 根据当前可见的图层状态刷新 Pixi 渲染树
async function updateComposite({ recenter = false } = {}) {
  compositeUpdateToken += 1
  const token = compositeUpdateToken
  const fm = fmRef.value
  const app = await ensurePixiApp()
  if (!app || token !== compositeUpdateToken) return
  if (!pixiRoot) return
  resizePixiToHost()
  const removed = pixiRoot.removeChildren()
  for (const child of removed) {
    if (typeof child?.destroy === 'function') {
      try {
        child.destroy({children: true})
      } catch (error) {
        console.warn('[GerberViewer] failed to destroy previous display object', error)
      }
    }
  }
  if (!fm) {
    console.warn('[GerberViewer] updateComposite: fmRef missing')
    if (recenter) fitToContainer(true)
    else applyViewTransform()
    return
  }
  const viewBox = getCompositeViewBox()
  const unitsToPx = getUnitsToPx()
  const ctx = { viewBox, unitsToPx }
  const plotTrees = fm.plotResult?.plotTreesById ?? {}
  const stackingOrder = orderedLayers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => {
      const weightA = Number.isFinite(a.layer?.weight) ? a.layer.weight : 100
      const weightB = Number.isFinite(b.layer?.weight) ? b.layer.weight : 100
      if (weightB !== weightA) return weightB - weightA
      return b.index - a.index
    })
  let zIndex = 0
  for (const { layer } of stackingOrder) {
    if (!layer.visible) continue
    const tree = layer.plotTree ?? plotTrees[layer.id]
    if (!tree) {
      console.warn('[GerberViewer] missing plot tree', layer.id, layer.filename)
      continue
    }
    layer.plotTree = tree
    const colorValue = parseHexColor(layer.color)
    const layerOpacity = typeof layer.opacity === 'number' ? layer.opacity : 1
    const display = createLayerDisplay(tree, ctx, colorValue, layerOpacity)
    if (!display) continue
    display.zIndex = zIndex++
    pixiRoot.addChild(display)
  }
  if (recenter) fitToContainer(true)
  else applyViewTransform()
}

function getActiveContainer() {
  if (viewMode.value === '2d') return topContainer.value
  if (viewMode.value === '3d') return bottomContainer.value
  return compositeContainer.value
}

function fitToContainer(center = false) {
  const el = getActiveContainer()
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    const mmW = (viewMode.value === 'layers' && fmRef.value?.compositeWidthMm)
      ? parseFloat(String(fmRef.value.compositeWidthMm).replace('mm', ''))
      : boardWidthMm
    const mmH = (viewMode.value === 'layers' && fmRef.value?.compositeHeightMm)
      ? parseFloat(String(fmRef.value.compositeHeightMm).replace('mm', ''))
      : boardHeightMm
    const contentW = mmW * PIXELS_PER_MM
    const contentH = mmH * PIXELS_PER_MM
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
function onPointerDown(e) {
  if (measurementOverlayVisible.value) {
    if (e.button !== 0) return
    e.preventDefault()
    const local = getCompositeLocal(e)
    handleMeasurementClick(local)
    return
  }
  drag = { active: true, startX: e.clientX, startY: e.clientY, ox: viewTranslate.x, oy: viewTranslate.y }
  const move = (ev) => {
    if (!drag.active) return
    viewTranslate.x = drag.ox + (ev.clientX - drag.startX)
    viewTranslate.y = drag.oy + (ev.clientY - drag.startY)
    applyViewTransform()
  }
  const up = () => { drag.active = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function onWheel(e) {
  const c = getActiveContainer()
  const rect = c?.getBoundingClientRect?.() || { left: 0, top: 0 }
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const prev = viewScale.value
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  const next = Math.min(20, Math.max(0.05, prev * factor))
  const wx = (mx - viewTranslate.x) / prev
  const wy = (my - viewTranslate.y) / prev
  viewTranslate.x = mx - wx * next
  viewTranslate.y = my - wy * next
  viewScale.value = next
  applyViewTransform()
}

function setAllVisible(v) {
  for (const l of orderedLayers) l.visible = v
  updateComposite()
}

function resetCompositeSize() {
  fitToContainer(true)
}

function toggleMeasurementMode() {
  if (measurementMode.value) {
    exitMeasurementMode()
    return
  }
  measurementMode.value = true
  measurementStart.value = null
  measurementEnd.value = null
  crosshair.visible = false
}

function exitMeasurementMode() {
  measurementMode.value = false
  measurementStart.value = null
  measurementEnd.value = null
  crosshair.visible = false
}

function getCompositeLocal(event) {
  const rect = compositeContainer.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))
  return { x, y }
}

function handleMeasurementClick(local) {
  if (!measurementStart.value) {
    measurementStart.value = local
    measurementEnd.value = local
  } else {
    measurementStart.value = null
    measurementEnd.value = null
  }
}

function onCompositeMouseMove(e) {
  if (!measurementOverlayVisible.value) return
  const local = getCompositeLocal(e)
  crosshair.x = local.x
  crosshair.y = local.y
  crosshair.visible = true
  if (measurementStart.value) measurementEnd.value = local
}

function onCompositeMouseLeave() {
  if (!measurementOverlayVisible.value) return
  crosshair.visible = false
}

// 统一通过 requestAnimationFrame 推迟计算，避免布局抖动
const runAfterLayout = (cb) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    setTimeout(cb, 16)
    return
  }
  window.requestAnimationFrame(() => window.requestAnimationFrame(cb))
}

const schedulePreviewRefresh = (reason = 'unknown') => {
  runAfterLayout(() => {
    resizePixiToHost()
    fitToContainer(true)
  })
}

function toggleLayerPanel() {
  const next = !isLayerPanelOpen.value
  isLayerPanelOpen.value = next
  layerPanelPreference.value = next
}

const syncLayerPanelToViewport = () => {
  if (currentStatusIndex.value === 0) {
    isLayerPanelOpen.value = true
    return
  }
  if (layerPanelPreference.value !== null) return
  const width = previewContainer.value?.clientWidth ?? 0
  if (!width) return
  const next = width >= 700
  if (isLayerPanelOpen.value !== next) {
    isLayerPanelOpen.value = next
    schedulePreviewRefresh('auto panel toggle')
    runAfterLayout(() => {
      resizePixiToHost()
      fitToContainer(true)
    })
  }
}

const handleResize = () => {
  resizePixiToHost()
  fitToContainer(true)
  syncLayerPanelToViewport()
}
if (typeof window !== 'undefined') window.addEventListener('resize', handleResize)
watch(viewMode, async (mode) => {
  await nextTick()
  if (mode === 'layers') {
    await ensurePixiApp()
    await updateComposite()
  }
  schedulePreviewRefresh('viewMode change')
  if (mode !== 'layers' && measurementMode.value) exitMeasurementMode()
})

watch(currentStatusIndex, (idx) => {
  if (idx === 0) {
    layerPanelPreference.value = null
    isLayerPanelOpen.value = true
    if (measurementMode.value) exitMeasurementMode()
  }
  nextTick(() => {
    if (idx !== 0) syncLayerPanelToViewport()
    schedulePreviewRefresh('status change')
  })
})

watch(isLayerPanelOpen, () => {
  schedulePreviewRefresh('panel toggle')
  runAfterLayout(() => {
    resizePixiToHost()
    fitToContainer(true)
  })
})

onMounted(() => {
  nextTick(() => {
    syncLayerPanelToViewport()
    schedulePreviewRefresh('mounted')
  })
  if (viewMode.value === 'layers') {
    ensurePixiApp().then(() => updateComposite())
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleResize)
  const app = pixiApp.value
  if (app) {
    try {
      app.destroy(true)
    } catch (err) {
      console.warn('Failed to destroy pixi application', err)
    }
  }
  if (pixiCanvas?.parentNode) pixiCanvas.parentNode.removeChild(pixiCanvas)
  pixiApp.value = null
  pixiRoot = null
  pixiCanvas = null
  pixiInitPromise = null
})

// Layer naming and settings
function displayLayerName(layer) {
  if (layer?.type === 'outline') return 'outline'
  if (layer?.type === 'drill' && (!layer?.side || layer.side === 'all')) return 'drill'
  if ((!layer?.side || layer.side === undefined || layer.side === null) && layer?.type === 'drawing') return 'unknown layer'
  const s = layer.side || 'n/a'
  const t = layer.type || 'unknown'
  return `${s} ${t}`
}

function openSettings() {
  editableLayers.splice(0)
  for (const l of orderedLayers) editableLayers.push({ filename: l.filename, id: l.id, type: l.type, side: l.side })
  isSettingsOpen.value = true
}

function allowedSides(type) {
  switch (type) {
    case 'outline': return ['all']
    case 'drill': return ['all']
    case 'drawing': return [undefined]
    case 'soldermask':
    case 'solderpaste':
    case 'silkscreen':
      return ['top', 'bottom']
    case 'copper':
      return ['top', 'bottom', 'inner']
    default:
      return [undefined]
  }
}

function coerceSideForType(type, side) {
  const opts = allowedSides(type)
  if (opts.includes(side)) return side
  return opts[0]
}

async function applySettings() {
  const list = (memoryLayers.value || []).map((x) => ({ ...x }))
  for (const e of editableLayers) e.side = coerceSideForType(e.type, e.side)
  const keyFor = (t, s) => {
    if (t === 'outline') return 'all:outline'
    if (['copper', 'soldermask', 'silkscreen', 'solderpaste'].includes(t) && (s === 'top' || s === 'bottom')) return `${s}:${t}`
    return null
  }
  const seen = new Map()
  for (let i = 0; i < editableLayers.length; i++) {
    const e = editableLayers[i]
    const key = keyFor(e.type, e.side)
    if (!key) continue
    if (seen.has(key)) {
      const prev = editableLayers[seen.get(key)]
      prev.type = 'drawing'
      prev.side = undefined
    }
    seen.set(key, i)
  }
  for (const e of editableLayers) {
    const target = list.find((it) => it.filename === e.filename)
    if (target) { target.type = e.type; target.side = e.side }
  }
  const legacyBoardPromise = refreshLegacyBoardRenders(list)
  try {
    const fm = await fromMemoryLayers(list)
    fmRef.value = fm
    const { renderLayersResult, plotResult } = fm
    boardViewBox = renderLayersResult.boardShapeRender.viewBox
    const keep = new Map(orderedLayers.map((l) => [l.filename, { color: l.color, visible: l.visible, opacity: l.opacity }]))
    orderedLayers.splice(0)
    for (const l of renderLayersResult.layers) {
      const kv = keep.get(l.filename) || { color: randomHexColor(), visible: true, opacity: 1 }
      orderedLayers.push({
        id: l.id,
        side: l.side,
        type: l.type,
        weight: orderLayerWeight(l.side, l.type),
        color: kv.color,
        visible: kv.visible,
        opacity: typeof kv.opacity === 'number' ? kv.opacity : 1,
        filename: l.filename,
        plotTree: plotResult?.plotTreesById?.[l.id],
      })
    }
    orderedLayers.sort((a, b) => a.weight - b.weight)
    await legacyBoardPromise
    await updateComposite()
    memoryLayers.value = list
    isSettingsOpen.value = false
  } catch (error) {
    console.error('[GerberViewer] applySettings failed', error)
  }
}
</script>

<style lang="scss" scoped></style>
