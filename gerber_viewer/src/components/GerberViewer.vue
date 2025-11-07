<template>
  <div class="h-screen w-screen flex">
    <!-- Left panel: controls -->
    <div :class="currentStatusIndex===0 ? 'flex-1 p-0 overflow-hidden flex items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-black' : 'w-80 shrink-0 border-r border-gray-700 p-4 overflow-y-auto bg-gradient-to-b from-gray-900 to-gray-800 text-gray-100'">
      <!-- Upload panel -->
      <div v-if="currentStatusIndex === 0" class="h-full flex items-center justify-center">
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

      <!-- Controls panel -->
      <div v-else class="space-y-6">
        <div>
          <h3 class="text-sm font-semibold mb-2">Gerber预览</h3>
          <div class="flex gap-2">
            <button class="px-2 py-1 rounded border border-gray-600" :class="{ 'bg-cyan-600 text-white': viewTab==='layers' }" @click="viewTab='layers'">layers</button>
            <button class="px-2 py-1 rounded border border-gray-600" :class="{ 'bg-cyan-600 text-white': viewTab==='top' }" @click="viewTab='top'">top</button>
            <button class="px-2 py-1 rounded border border-gray-600" :class="{ 'bg-cyan-600 text-white': viewTab==='bottom' }" @click="viewTab='bottom'">bottom</button>
          </div>
        </div>

        <div v-if="viewTab==='top' || viewTab==='bottom'">
          <h3 class="text-sm font-semibold mb-2">{{ viewTab }} 颜色</h3>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="flex items-center gap-2">copper <input type="color" v-model="boardColors[viewTab].copper" @input="updateBoardPreview(viewTab)"/></label>
            <label class="flex items-center gap-2">soldermask <input type="color" v-model="boardColors[viewTab].soldermask" @input="updateBoardPreview(viewTab)"/></label>
            <label class="flex items-center gap-2">silkscreen <input type="color" v-model="boardColors[viewTab].silkscreen" @input="updateBoardPreview(viewTab)"/></label>
            <label class="flex items-center gap-2">solderpaste <input type="color" v-model="boardColors[viewTab].solderpaste" @input="updateBoardPreview(viewTab)"/></label>
          </div>
        </div>

        <div v-if="viewTab==='layers'">
          <h3 class="text-sm font-semibold mb-2">图层列表</h3>
          <div class="mb-2 flex items-center gap-2">
            <button class="px-2 py-1 border rounded" @click="setAllVisible(true)">全部显示</button>
            <button class="px-2 py-1 border rounded" @click="setAllVisible(false)">全部隐藏</button>
            <button class="ml-auto px-2 py-1 border rounded" @click="openSettings()">设置</button>
          </div>
          <div class="mb-2 text-xs text-gray-300 flex items-center gap-2">
            <label class="flex items-center gap-1 select-none cursor-pointer">
              <input type="checkbox" v-model="showFilenames" /> 显示文件名
            </label>
          </div>
          <div>
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
    </div>

    <!-- Right panel: canvas -->
    <div class="flex-1 relative overflow-hidden bg-gradient-to-br from-gray-800 via-gray-900 to-black" v-show="currentStatusIndex !== 0">
      <div class="h-full w-full">
        <div v-show="viewTab==='top'" ref="topContainer" class="h-full w-full overflow-hidden bg-transparent select-none" @wheel.prevent="onWheel" @mousedown="onPointerDown">
          <div :style="transformStyle" class="origin-top-left">
            <div v-html="topSvg"></div>
          </div>
        </div>
        <div v-show="viewTab==='bottom'" ref="bottomContainer" class="h-full w-full overflow-hidden bg-transparent select-none" @wheel.prevent="onWheel" @mousedown="onPointerDown">
          <div :style="transformStyle" class="origin-top-left">
            <div v-html="bottomSvg"></div>
          </div>
        </div>
        <div v-show="viewTab==='layers'" class="h-full w-full">
          <div
            ref="compositeContainer"
            class="h-full w-full bg-transparent select-none relative overflow-hidden"
            @wheel.prevent="onWheel"
            @mousedown="onPointerDown"
          ></div>
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
import { fromMemoryLayers, stringifySvg } from '@tracespace/core'
import { CLEAR } from '@tracespace/parser'
import {
  Application,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
} from 'pixi.js'
import {
  IMAGE_SHAPE,
  IMAGE_PATH,
  IMAGE_REGION,
  CIRCLE,
  RECTANGLE,
  POLYGON,
  OUTLINE,
  LAYERED_SHAPE,
  LINE,
} from '@tracespace/plotter'

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
const boardColors = reactive({ top: { ...defaultBoard }, bottom: { ...defaultBoard } })

// Base board SVGs for recolor
let baseTopEl = null
let baseBottomEl = null

// View state
const compositeContainer = ref(null)
const topContainer = ref(null)
const bottomContainer = ref(null)
const viewScale = ref(1)
const viewTranslate = reactive({ x: 0, y: 0 })
const viewTab = ref('layers')

const PIXELS_PER_MM = 96 / 25.4
const LAYER_RT_OVERSAMPLE = 4
const LAYER_RT_EDGE_PAD = 6
const MAX_RT_DIMENSION = 8192
const SCALE_REPAINT_FACTOR = 1.2
const pixiApp = ref(null)
let pixiRoot = null
let pixiCanvas = null
let pixiInitPromise = null
let compositeUpdateToken = 0
let pixiInitLogged = false
let lastCompositeScale = 1
let scheduledScaleUpdate = null

let boardViewBox = [0, 0, 0, 0]
let boardWidthMm = 0
let boardHeightMm = 0

// Ordered layers for stacking view
const orderedLayers = reactive([])
const showFilenames = ref(false)
const isSettingsOpen = ref(false)
const editableLayers = reactive([])

const transformStyle = computed(() => ({
  transform: `translate(${viewTranslate.x}px, ${viewTranslate.y}px) scale(${viewScale.value})`,
}))

// Upload handler
const handleUploadFile = async (file) => {
  const formData = new FormData()
  formData.append('UploadFile', file, file.name)

  const res = await axios.post(
    'http://localhost:5256/api/PCBParse/Parse?Mode=0',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', accept: '*/*' } },
  )

  const result = res.data.Data
  memoryLayers.value = result.Items || []
  const fm = await fromMemoryLayers(memoryLayers.value)
  const { renderLayersResult, renderBoardResult, plotResult } = fm

  fmRef.value = fm

  baseTopEl = renderBoardResult.top
  baseBottomEl = renderBoardResult.bottom
  boardViewBox = renderLayersResult.boardShapeRender.viewBox
  console.groupCollapsed('[GerberViewer] fromMemoryLayers')
  try {
    console.log('layer count', renderLayersResult.layers.length)
    console.log('board viewBox', boardViewBox)
    console.log('composite viewBox', fm.compositeViewBox)
    console.log('composite width/height mm', fm.compositeWidthMm, fm.compositeHeightMm)
    console.log('unit meta', fm.unitMeta)
    console.log('plot tree keys', Object.keys(plotResult?.plotTreesById ?? {}))
  } finally {
    console.groupEnd()
  }

  const wAttr = (baseTopEl?.properties?.width ?? '').toString()
  const hAttr = (baseTopEl?.properties?.height ?? '').toString()
  boardWidthMm = parseFloat(wAttr.replace('mm', '')) || boardViewBox[2]
  boardHeightMm = parseFloat(hAttr.replace('mm', '')) || boardViewBox[3]

  updateBoardPreview('top')
  updateBoardPreview('bottom')

  const orderWeight = (side, type) => {
    const s = side || ''
    const t = type || ''
    const map = {
      'top:solderpaste': 1,
      'top:silkscreen': 2,
      'top:soldermask': 3,
      'top:copper': 4,
      'inner:copper': 5,
      'bottom:copper': 6,
      'bottom:soldermask': 7,
      'bottom:silkscreen': 8,
      'bottom:solderpaste': 9,
      'all:outline': 10,
      'all:drill': 11,
      'null:drawing': 12,
    }
    const key = `${s || 'null'}:${t}`
    return map[key] ?? 100
  }

  orderedLayers.splice(0)
  for (const l of renderLayersResult.layers) {
    orderedLayers.push({
      id: l.id,
      side: l.side,
      type: l.type,
      weight: orderWeight(l.side, l.type),
      color: randomHexColor(),
      visible: true,
      filename: l.filename,
      opacity: typeof l.opacity === 'number' ? l.opacity : 1,
      plotTree: plotResult?.plotTreesById?.[l.id],
    })
  }
  orderedLayers.sort((a, b) => a.weight - b.weight)
  currentStatusIndex.value = 1
  viewTab.value = 'layers'
  await nextTick()
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
    topSvg.value = stringifySvg(clone)
  }
  if (side === 'bottom' && baseBottomEl) {
    const clone = deepClone(baseBottomEl)
    applyBoardColorsLocal(clone, boardColors.bottom)
    clone.properties = clone.properties || {}
    clone.properties.preserveAspectRatio = 'xMidYMid meet'
    if (clone.properties.style) delete clone.properties.style
    bottomSvg.value = stringifySvg(clone)
  }
}

function randomHexColor() {
  const n = () => Math.floor(Math.random() * 256)
  const toHex = (v) => v.toString(16).padStart(2, '0')
  return `#${toHex(n())}${toHex(n())}${toHex(n())}`
}

function parseHexColor(input) {
  if (typeof input !== 'string') return 0xffffff
  const hex = input.trim().replace(/^#/, '')
  if (hex.length === 3) {
    const [r, g, b] = hex
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16)
  }
  if (hex.length === 6) {
    const value = Number.parseInt(hex, 16)
    return Number.isNaN(value) ? 0xffffff : value
  }
  return 0xffffff
}

function scheduleCompositeUpdate(extra = {}) {
  if (viewTab.value !== 'layers') return
  const currentScale = viewScale.value || 1
  if (scheduledScaleUpdate) return
  if (Math.abs(currentScale - lastCompositeScale) <= Number.EPSILON) return
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return

  scheduledScaleUpdate = requestAnimationFrame(() => {
    scheduledScaleUpdate = null
    updateComposite(extra)
  })
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
    console.log('[GerberViewer] resizePixiToHost', { width, height })
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
      if (!pixiInitLogged) {
        console.log('[GerberViewer] Pixi initialized', { width, height, resolution })
        pixiInitLogged = true
      }
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

function toXY(position) {
  return [position[0], position[1]]
}

function positionsClose(a, b, eps = 1e-6) {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps
}

function mapSvgPoint(x, y, ctx) {
  const [vx, vy] = ctx.viewBox
  return {
    x: (x - vx) * ctx.unitsToPx,
    y: (y - vy) * ctx.unitsToPx,
  }
}

function mapRawPoint(x, y, ctx) {
  return mapSvgPoint(x, -y, ctx)
}

function approximateArcPoints(segment, ctx) {
  const startAngle = segment.start[2]
  const endAngle = segment.end[2]
  let sweep = endAngle - startAngle
  if (!Number.isFinite(sweep)) return []
  const startXY = toXY(segment.start)
  const endXY = toXY(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startXY, endXY)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []
  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const [cx, cy] = segment.center
  const radius = segment.radius
  const points = []
  for (let i = 1; i < steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    const px = cx + radius * Math.cos(angle)
    const py = cy + radius * Math.sin(angle)
    points.push(mapRawPoint(px, py, ctx))
  }
  return points
}

function drawSegments(graphics, segments, ctx, { closePath }) {
  if (!Array.isArray(segments) || segments.length === 0) return
  graphics.beginPath()
  let currentEnd = null
  let subpathStart = null
  for (const segment of segments) {
    const startRaw = toXY(segment.start)
    if (!currentEnd || !positionsClose(currentEnd.raw, startRaw)) {
      if (closePath && currentEnd && subpathStart && !positionsClose(currentEnd.raw, subpathStart.raw)) {
        graphics.lineTo(subpathStart.point.x, subpathStart.point.y)
      }
      const startPoint = mapRawPoint(startRaw[0], startRaw[1], ctx)
      graphics.moveTo(startPoint.x, startPoint.y)
      subpathStart = { raw: startRaw, point: startPoint }
    }
    if (segment.type === LINE) {
      const endRaw = toXY(segment.end)
      const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
      graphics.lineTo(endPoint.x, endPoint.y)
      currentEnd = { raw: endRaw, point: endPoint }
    } else {
      const arcPoints = approximateArcPoints(segment, ctx)
      for (const p of arcPoints) graphics.lineTo(p.x, p.y)
      const endRaw = toXY(segment.end)
      const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
      graphics.lineTo(endPoint.x, endPoint.y)
      currentEnd = { raw: endRaw, point: endPoint }
    }
  }
  if (closePath && subpathStart && currentEnd && !positionsClose(currentEnd.raw, subpathStart.raw)) {
    graphics.lineTo(subpathStart.point.x, subpathStart.point.y)
  }
  if (closePath) graphics.closePath()
}

function applyFill(graphics) {
  graphics.fill({ color: 0xffffff })
}

function applyStroke(graphics, width) {
  graphics.stroke({ width, color: 0xffffff, alignment: 0.5 })
}

function drawRegion(graphics, node, ctx) {
  drawSegments(graphics, node.segments, ctx, { closePath: true })
  applyFill(graphics)
}

function drawPath(graphics, node, ctx) {
  drawSegments(graphics, node.segments, ctx, { closePath: false })
  const widthPxRaw = (node.width ?? 0) * ctx.unitsToPx
  const strokeWidth = Math.max(widthPxRaw, 0.75)
  applyStroke(graphics, strokeWidth)
}

function drawPolygon(graphics, points, ctx) {
  if (!Array.isArray(points) || points.length === 0) return
  graphics.beginPath()
  const first = mapRawPoint(points[0][0], points[0][1], ctx)
  graphics.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i++) {
    const pt = mapRawPoint(points[i][0], points[i][1], ctx)
    graphics.lineTo(pt.x, pt.y)
  }
  graphics.lineTo(first.x, first.y)
  graphics.closePath()
}

function renderShape(solid, eraser, shape, ctx, forceErase = false) {
  if (!shape) return
  if (shape.type === LAYERED_SHAPE) {
    for (const sub of shape.shapes || []) {
      const subErase = forceErase || sub?.erase === true
      renderShape(solid, eraser, sub, ctx, subErase)
    }
    return
  }

  const target = forceErase || shape?.erase === true ? eraser : solid

  switch (shape.type) {
    case CIRCLE: {
      const center = mapSvgPoint(shape.cx, -shape.cy, ctx)
      const radius = Math.max(shape.r * ctx.unitsToPx, 0)
      target.circle(center.x, center.y, radius)
      applyFill(target)
      break
    }
    case RECTANGLE: {
      const topLeft = mapSvgPoint(shape.x, -shape.y - shape.ySize, ctx)
      const width = shape.xSize * ctx.unitsToPx
      const height = shape.ySize * ctx.unitsToPx
      const radius = Math.max((shape.r ?? 0) * ctx.unitsToPx, 0)
      target.roundRect(topLeft.x, topLeft.y, width, height, radius)
      applyFill(target)
      break
    }
    case POLYGON: {
      drawPolygon(target, shape.points, ctx)
      applyFill(target)
      break
    }
    case OUTLINE: {
      drawSegments(target, shape.segments, ctx, { closePath: true })
      const outlineWidth = Math.max(ctx.unitsToPx * 0.05, 0.8)
      applyStroke(target, outlineWidth)
      break
    }
    default:
      break
  }
}

function renderGraphic(solid, eraser, graphic, ctx) {
  if (!graphic) return
  const polarity = graphic.polarity ?? 'dark'
  const polarityIsClear = polarity === CLEAR || polarity === 'clear'
  const isEraseGraphic = graphic.erase === true
  const isClear = polarityIsClear || isEraseGraphic
  const target = isClear ? eraser : solid
  switch (graphic.type) {
    case IMAGE_SHAPE:
      renderShape(solid, eraser, graphic.shape, ctx, isClear)
      break
    case IMAGE_PATH:
      drawPath(target, graphic, ctx)
      break
    case IMAGE_REGION:
      drawRegion(target, graphic, ctx)
      break
    default:
      break
  }
}

function createLayerDisplay(tree, ctx, colorValue, opacity = 1, renderer, scaleHint = 1) {
  console.debug('[GerberViewer] createLayerDisplay', {
    id: tree?.id,
    childCount: tree?.children?.length ?? 0,
    colorValue: colorValue?.toString(16),
    opacity,
  })
  if (!renderer) {
    console.warn('[GerberViewer] createLayerDisplay: renderer unavailable')
    return null
  }
  const layerContainer = new Container()
  layerContainer.eventMode = 'none'

  const chunks = []
  const unitsToPx = ctx?.unitsToPx ?? 1
  const [, , viewWidth = 0, viewHeight = 0] = ctx?.viewBox ?? []
  const widthPx = Math.max(1, Math.ceil(Math.abs(viewWidth * unitsToPx)))
  const heightPx = Math.max(1, Math.ceil(Math.abs(viewHeight * unitsToPx)))
  const edgePadding = LAYER_RT_EDGE_PAD
  const paddedWidthPx = widthPx + edgePadding * 2
  const paddedHeightPx = heightPx + edgePadding * 2

  const createChunk = () => {
    const solid = new Graphics()
    solid.eventMode = 'none'
    solid.tint = colorValue
    solid.alpha = 1

    const eraser = new Graphics()
    eraser.eventMode = 'none'
    eraser.blendMode = 'erase'
    eraser.tint = 0xffffff

    const chunk = new Container()
    chunk.eventMode = 'none'
    chunk.addChild(solid)
    chunk.addChild(eraser)
    chunk.position.set(edgePadding, edgePadding)

    const state = {
      container: chunk,
      solid,
      eraser,
      hasClear: false,
    }

    chunks.push(state)
    return state
  }

  let chunk = null

  for (const graphic of tree.children || []) {
    const polarity = graphic.polarity ?? 'dark'
    const polarityIsClear = polarity === CLEAR || polarity === 'clear'
    const isClear = polarityIsClear || graphic.erase === true

    if (!chunk) chunk = createChunk()

    if (!isClear && chunk.hasClear) {
      // Clear特性已经作用在当前chunk上，新出现的dark图形需要开启新的chunk
      chunk = createChunk()
    }

    renderGraphic(chunk.solid, chunk.eraser, graphic, ctx)

    if (isClear) chunk.hasClear = true
  }

  const maxDimension = Math.max(paddedWidthPx, paddedHeightPx)
  const rendererResolution = renderer.resolution ?? 1
  const targetResolution = Math.max(rendererResolution, scaleHint) * LAYER_RT_OVERSAMPLE
  const maxAllowedResolution = Math.max(1, Math.floor(MAX_RT_DIMENSION / Math.max(1, maxDimension)))
  const renderResolution = Math.max(1, Math.min(targetResolution, maxAllowedResolution))

  for (const state of chunks) {
    const renderTexture = RenderTexture.create({
      width: paddedWidthPx,
      height: paddedHeightPx,
      resolution: renderResolution,
      antialias: false,
    })
    renderTexture.baseTexture.scaleMode = 'nearest'

    renderer.render(state.container, {renderTexture, clear: true})
    state.container.destroy({children: true})

    const sprite = new Sprite(renderTexture)
    sprite.eventMode = 'none'
    sprite.alpha = opacity
    sprite.x = -edgePadding
    sprite.y = -edgePadding
    layerContainer.addChild(sprite)
  }

  return layerContainer
}

async function updateComposite({ recenter = false } = {}) {
  if (scheduledScaleUpdate !== null) {
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      cancelAnimationFrame(scheduledScaleUpdate)
    }
    scheduledScaleUpdate = null
  }
  compositeUpdateToken += 1
  const token = compositeUpdateToken
  const fm = fmRef.value
  const app = await ensurePixiApp()
  if (!app || token !== compositeUpdateToken) return
  if (!pixiRoot) return
  resizePixiToHost()
  console.groupCollapsed('[GerberViewer] updateComposite', { recenter, token, viewTab: viewTab.value })
  const removed = pixiRoot.removeChildren()
  for (const child of removed) {
    if (typeof child?.destroy === 'function') {
      try {
        child.destroy({children: true, texture: true, baseTexture: true})
      } catch (error) {
        console.warn('[GerberViewer] failed to destroy previous display object', error)
      }
    }
  }
  if (!fm) {
    console.warn('[GerberViewer] updateComposite: fmRef missing')
    if (recenter) fitToContainer(true)
    else applyViewTransform()
    console.groupEnd()
    return
  }
  const viewBox = getCompositeViewBox()
  const unitsToPx = getUnitsToPx()
  console.log('viewBox', viewBox, 'unitsToPx', unitsToPx)
  console.log('orderedLayers', orderedLayers.length)
  const ctx = { viewBox, unitsToPx }
  const plotTrees = fm.plotResult?.plotTreesById ?? {}
  const sorted = [...orderedLayers].sort((a, b) => b.weight - a.weight)
  let zIndex = 0
  const renderer = app.renderer
  const currentScale = viewScale.value || 1
  const scaleHint = currentScale * SCALE_REPAINT_FACTOR
  lastCompositeScale = currentScale
  for (const layer of sorted) {
    if (!layer.visible) continue
    const tree = layer.plotTree ?? plotTrees[layer.id]
    if (!tree) {
      console.warn('[GerberViewer] missing plot tree', layer.id, layer.filename)
      continue
    }
    layer.plotTree = tree
    const colorValue = parseHexColor(layer.color)
    const layerOpacity = typeof layer.opacity === 'number' ? layer.opacity : 1
    const display = createLayerDisplay(tree, ctx, colorValue, layerOpacity, renderer, scaleHint)
    if (!display) continue
    display.zIndex = zIndex++
    pixiRoot.addChild(display)
  }
  console.log('layer graphics added', zIndex)
  if (recenter) fitToContainer(true)
  else applyViewTransform()
  console.groupEnd()
}

function getActiveContainer() {
  if (viewTab.value === 'top') return topContainer.value
  if (viewTab.value === 'bottom') return bottomContainer.value
  return compositeContainer.value
}

function fitToContainer(center = false) {
  const el = getActiveContainer()
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    const mmW = (viewTab.value === 'layers' && fmRef.value?.compositeWidthMm)
      ? parseFloat(String(fmRef.value.compositeWidthMm).replace('mm', ''))
      : boardWidthMm
    const mmH = (viewTab.value === 'layers' && fmRef.value?.compositeHeightMm)
      ? parseFloat(String(fmRef.value.compositeHeightMm).replace('mm', ''))
      : boardHeightMm
    const contentW = mmW * PIXELS_PER_MM
    const contentH = mmH * PIXELS_PER_MM
    const margin = 0.3
    const scaleX = (rect.width * (1 - margin)) / contentW
    const scaleY = (rect.height * (1 - margin)) / contentH
    viewScale.value = Math.max(0.05, Math.min(scaleX, scaleY))
    console.log('[GerberViewer] fitToContainer', {
      rect,
      mmW,
      mmH,
      contentW,
      contentH,
      scaleX,
      scaleY,
      chosenScale: viewScale.value,
      centerRequested: center,
    })
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
  scheduleCompositeUpdate({recenter: center})
}

let drag = { active: false, startX: 0, startY: 0, ox: 0, oy: 0 }
function onPointerDown(e) {
  drag = { active: true, startX: e.clientX, startY: e.clientY, ox: viewTranslate.x, oy: viewTranslate.y }
  const move = (ev) => {
    if (!drag.active) return
    viewTranslate.x = drag.ox + (ev.clientX - drag.startX)
    viewTranslate.y = drag.oy + (ev.clientY - drag.startY)
    applyViewTransform()
    scheduleCompositeUpdate()
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
  scheduleCompositeUpdate()
}

function setAllVisible(v) {
  for (const l of orderedLayers) l.visible = v
  updateComposite()
}

const handleResize = () => {
  resizePixiToHost()
  fitToContainer(true)
}
if (typeof window !== 'undefined') window.addEventListener('resize', handleResize)
watch(viewTab, async (tab) => {
  await nextTick()
  if (tab === 'layers') {
    await ensurePixiApp()
    await updateComposite()
  }
  resizePixiToHost()
  fitToContainer(true)
})

onMounted(() => {
  if (viewTab.value === 'layers') {
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

function applySettings() {
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
  fromMemoryLayers(list).then(async (fm) => {
    fmRef.value = fm
    const { renderLayersResult, renderBoardResult, plotResult } = fm
    baseTopEl = renderBoardResult.top
    baseBottomEl = renderBoardResult.bottom
    boardViewBox = renderLayersResult.boardShapeRender.viewBox
    const wAttr = (baseTopEl?.properties?.width ?? '').toString()
    const hAttr = (baseTopEl?.properties?.height ?? '').toString()
    boardWidthMm = parseFloat(wAttr.replace('mm', '')) || boardViewBox[2]
    boardHeightMm = parseFloat(hAttr.replace('mm', '')) || boardViewBox[3]
    const keep = new Map(orderedLayers.map((l) => [l.filename, { color: l.color, visible: l.visible, opacity: l.opacity }]))
    orderedLayers.splice(0)
    const orderWeight = (side, type) => {
      const s = side || ''
      const t = type || ''
      const map = {
        'top:solderpaste': 1,
        'top:silkscreen': 2,
        'top:soldermask': 3,
        'top:copper': 4,
        'inner:copper': 5,
        'bottom:copper': 6,
        'bottom:soldermask': 7,
        'bottom:silkscreen': 8,
        'bottom:solderpaste': 9,
        'all:outline': 10,
        'all:drill': 11,
        'null:drawing': 12,
      }
      const key = `${s || 'null'}:${t}`
      return map[key] ?? 100
    }
    for (const l of renderLayersResult.layers) {
      const kv = keep.get(l.filename) || { color: randomHexColor(), visible: true, opacity: 1 }
      orderedLayers.push({
        id: l.id,
        side: l.side,
        type: l.type,
        weight: orderWeight(l.side, l.type),
        color: kv.color,
        visible: kv.visible,
        opacity: typeof kv.opacity === 'number' ? kv.opacity : 1,
        filename: l.filename,
        plotTree: plotResult?.plotTreesById?.[l.id],
      })
    }
    orderedLayers.sort((a, b) => a.weight - b.weight)
    updateBoardPreview('top')
    updateBoardPreview('bottom')
    await updateComposite()
    memoryLayers.value = list
    isSettingsOpen.value = false
  })
}
</script>

<style lang="scss" scoped></style>
