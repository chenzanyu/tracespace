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
          <GpuStage v-if="useGpu" :svg="topSvg" :scale="viewScale" :translate="viewTranslate" />
          <div v-else :style="transformStyle" class="origin-top-left">
            <div v-html="topSvg"></div>
          </div>
        </div>
        <div v-show="viewTab==='bottom'" ref="bottomContainer" class="h-full w-full overflow-hidden bg-transparent select-none" @wheel.prevent="onWheel" @mousedown="onPointerDown">
          <GpuStage v-if="useGpu" :svg="bottomSvg" :scale="viewScale" :translate="viewTranslate" />
          <div v-else :style="transformStyle" class="origin-top-left">
            <div v-html="bottomSvg"></div>
          </div>
        </div>
        <div v-show="viewTab==='layers'" class="h-full w-full">
          <div ref="compositeContainer" class="h-full w-full bg-transparent select-none" @wheel.prevent="onWheel" @mousedown="onPointerDown">
            <CanvasStage v-if="useCanvas"
              :layers="orderedLayers"
              :viewBox="fmRef?.value?.compositeViewBox ?? boardViewBox"
              :mmWidth="parseFloat(String(fmRef?.value?.compositeWidthMm || (boardWidthMm + 'mm')).replace('mm',''))"
              :mmHeight="parseFloat(String(fmRef?.value?.compositeHeightMm || (boardHeightMm + 'mm')).replace('mm',''))"
              :scale="viewScale"
              :translate="viewTranslate"
              @ready="() => fitToContainer(true)"
              @resized="() => fitToContainer(true)" />
            <GpuStage v-else-if="useGpu" :svg="compositeSvg" :scale="viewScale" :translate="viewTranslate" />
            <div v-else :style="transformStyle" class="origin-top-left">
              <div v-html="compositeSvg"></div>
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
import { ref, reactive, computed, nextTick, watch, toRaw } from 'vue'
import axios from 'axios'
import { fromMemoryLayers, stringifySvg } from '@tracespace/core'
import GpuStage from './GpuStage.vue'
import CanvasStage from './CanvasStage.vue'

// Status and basic refs
const currentStatusIndex = ref(0)
const fileInput = ref(null)
const isDragOver = ref(true)

// SVG outputs
const topSvg = ref('')
const bottomSvg = ref('')
const compositeSvg = ref('')

// Layer data & renderer results
const layers = ref([])
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

let boardViewBox = [0, 0, 0, 0]
let boardWidthMm = 0
let boardHeightMm = 0

// Ordered layers for stacking view
const orderedLayers = reactive([])
const showFilenames = ref(false)
const isSettingsOpen = ref(false)
const editableLayers = reactive([])
// 渲染开关：优先 Canvas 矢量绘制；GPU 纹理默认关闭
const useCanvas = ref(true)
const useGpu = ref(false)

// Cache for cloned & ID-prefixed layer children per layer
const layerCloneCache = new Map()

const transformStyle = computed(() => ({
  transform: `translate(${viewTranslate.x}px, ${viewTranslate.y}px) scale(${viewScale.value})`,
}))

// Upload handler
const handleUploadFile = async (file) => {
  const formData = new FormData()
  formData.append('UploadFile', file, file.name)

  const res = await axios.post(
    'http://localhost:5003/api/PCBParse/Parse?Mode=0',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', accept: '*/*' } },
  )

  const result = res.data.Data
  memoryLayers.value = result.Items || []
  const fm = await fromMemoryLayers(memoryLayers.value)
  const { renderLayersResult, renderBoardResult } = fm
  fmRef.value = fm

  baseTopEl = renderBoardResult.top
  baseBottomEl = renderBoardResult.bottom
  boardViewBox = renderLayersResult.boardShapeRender.viewBox

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
      element: renderLayersResult.rendersById[l.id],
      filename: l.filename,
    })
  }
  orderedLayers.sort((a, b) => a.weight - b.weight)
  layerCloneCache.clear()
  currentStatusIndex.value = 1
  viewTab.value = 'layers'
  await nextTick()
  fitToContainer(true)
  if (typeof window !== 'undefined') {
    requestAnimationFrame(() => requestAnimationFrame(() => fitToContainer(true)))
  }
  updateComposite()
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

function prefixIds(root, prefix) {
  const idMap = new Map()
  const rewriteUrl = (val) => (typeof val === 'string' ? val.replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${idMap.get(id) ?? prefix + id})`) : val)
  const rewriteHref = (val) => (typeof val === 'string' && val.startsWith('#') ? `#${idMap.get(val.slice(1)) ?? prefix + val.slice(1)}` : val)
  const visit = (node) => {
    if (!node || node.type !== 'element') return
    node.properties = node.properties || {}
    const props = node.properties
    if (typeof props.id === 'string') {
      const oldId = props.id
      const newId = prefix + oldId
      props.id = newId
      idMap.set(oldId, newId)
    }
    for (const k of Object.keys(props)) {
      const v = props[k]
      if (typeof v === 'string') {
        if (k === 'href' || k === 'xlink:href') props[k] = rewriteHref(v)
        else if (['clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'style'].includes(k)) props[k] = rewriteUrl(v)
      }
    }
    const children = Array.isArray(node.children) ? node.children : []
    for (const c of children) visit(c)
  }
  visit(root)
}

function boostOutlineVisibility(root) {
  const stack = [root]
  while (stack.length) {
    const n = stack.pop()
    if (!n || n.type !== 'element') continue
    if (n.tagName === 'path') {
      n.properties = n.properties || {}
      const base = n.properties.style ? String(n.properties.style) + ';' : ''
      n.properties.style = base + [
        'fill:none',
        'stroke:currentColor',
        'stroke-width:0.5px',
        'vector-effect:non-scaling-stroke',
        'stroke-linecap:butt',
        'stroke-linejoin:miter',
        'shape-rendering:crispEdges',
      ].join(';') + ';'
    }
    const kids = Array.isArray(n.children) ? n.children : []
    for (const k of kids) stack.push(k)
  }
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

function buildCompositeSvg() {
  const vb = fmRef.value?.compositeViewBox ?? boardViewBox
  let [x, y, w, h] = vb
  const m = Math.max(w, h) * 0.002
  x = x - m; y = y - m; w = w + 2 * m; h = h + 2 * m
  const root = { type: 'element', tagName: 'svg', properties: {
    version: '1.1', xmlns: 'http://www.w3.org/2000/svg', 'xmlns:xlink': 'http://www.w3.org/1999/xlink',
    viewBox: `${x} ${y} ${w} ${h}`, width: `${fmRef.value?.compositeWidthMm ?? (boardWidthMm + 'mm')}`, height: `${fmRef.value?.compositeHeightMm ?? (boardHeightMm + 'mm')}`,
    preserveAspectRatio: 'xMidYMid meet', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '0', 'fill-rule': 'evenodd', 'clip-rule': 'evenodd', fill: 'currentColor', stroke: 'currentColor',
  }, children: [] }
  const renderOrder = [...orderedLayers].sort((a, b) => b.weight - a.weight)
  for (const layer of renderOrder) {
    if (!layer.visible) continue
    const g = { type: 'element', tagName: 'g', properties: { color: layer.color }, children: [] }
    const src = layer.element
    const rawKids = (src && src.children) ? src.children : []
    let kids = []
    if (Array.isArray(rawKids)) {
      const cached = layerCloneCache.get(layer.id)
      if (cached) {
        kids = deepClone(cached)
      } else {
        const tmp = deepClone(rawKids)
        prefixIds({ type: 'element', tagName: 'g', properties: {}, children: tmp }, `L${layer.id}_`)
        if (layer.type === 'outline') boostOutlineVisibility({ type: 'element', tagName: 'g', properties: {}, children: tmp })
        layerCloneCache.set(layer.id, tmp)
        kids = deepClone(tmp)
      }
    }
    if (kids.length > 0) {
      g.children.push(...kids)
    }
    root.children.push(g)
  }
  return root
}

function updateComposite() {
  const el = buildCompositeSvg()
  compositeSvg.value = stringifySvg(el)
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
    const PX_PER_MM = 96 / 25.4
    const mmW = (viewTab.value === 'layers' && fmRef.value?.compositeWidthMm)
      ? parseFloat(String(fmRef.value.compositeWidthMm).replace('mm', ''))
      : boardWidthMm
    const mmH = (viewTab.value === 'layers' && fmRef.value?.compositeHeightMm)
      ? parseFloat(String(fmRef.value.compositeHeightMm).replace('mm', ''))
      : boardHeightMm
    const contentW = mmW * PX_PER_MM
    const contentH = mmH * PX_PER_MM
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
}

let drag = { active: false, startX: 0, startY: 0, ox: 0, oy: 0 }
function onPointerDown(e) {
  drag = { active: true, startX: e.clientX, startY: e.clientY, ox: viewTranslate.x, oy: viewTranslate.y }
  const move = (ev) => { if (!drag.active) return; viewTranslate.x = drag.ox + (ev.clientX - drag.startX); viewTranslate.y = drag.oy + (ev.clientY - drag.startY) }
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
  const next = Math.min(200, Math.max(0.02, prev * factor))
  const wx = (mx - viewTranslate.x) / prev
  const wy = (my - viewTranslate.y) / prev
  viewTranslate.x = mx - wx * next
  viewTranslate.y = my - wy * next
  viewScale.value = next
}

function setAllVisible(v) {
  for (const l of orderedLayers) l.visible = v
  updateComposite()
}

if (typeof window !== 'undefined') window.addEventListener('resize', () => fitToContainer(true))
watch(viewTab, async () => { await nextTick(); fitToContainer(true); if (typeof window !== 'undefined') requestAnimationFrame(() => fitToContainer(true)) })
watch(orderedLayers, async () => { await nextTick(); if (typeof window !== 'undefined') requestAnimationFrame(() => fitToContainer(true)) }, { deep: true })

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
  fromMemoryLayers(list).then((fm) => {
    fmRef.value = fm
    const { renderLayersResult, renderBoardResult } = fm
    baseTopEl = renderBoardResult.top
    baseBottomEl = renderBoardResult.bottom
    boardViewBox = renderLayersResult.boardShapeRender.viewBox
    const wAttr = (baseTopEl?.properties?.width ?? '').toString()
    const hAttr = (baseTopEl?.properties?.height ?? '').toString()
    boardWidthMm = parseFloat(wAttr.replace('mm', '')) || boardViewBox[2]
    boardHeightMm = parseFloat(hAttr.replace('mm', '')) || boardViewBox[3]
    const keep = new Map(orderedLayers.map((l) => [l.filename, { color: l.color, visible: l.visible }]))
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
      const kv = keep.get(l.filename) || { color: randomHexColor(), visible: true }
      orderedLayers.push({ id: l.id, side: l.side, type: l.type, weight: orderWeight(l.side, l.type), color: kv.color, visible: kv.visible, element: renderLayersResult.rendersById[l.id], filename: l.filename })
    }
    orderedLayers.sort((a, b) => a.weight - b.weight)
    layerCloneCache.clear()
    updateBoardPreview('top')
    updateBoardPreview('bottom')
    updateComposite()
    memoryLayers.value = list
    isSettingsOpen.value = false
  })
}
</script>

<style lang="scss" scoped></style>
