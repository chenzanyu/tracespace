<template>
  <div class="h-screen w-screen bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-100">
    <!-- 上传阶段 -->
    <div v-if="currentStatusIndex === 0" class="h-full flex items-center justify-center p-4">
      <UploadPanel @select="handleUploadFile" />
    </div>

    <!-- 预览阶段 -->
    <div v-else class="h-full flex relative">
      <!-- 预览画布 -->
      <section
        ref="previewAreaRef"
        class="flex-1 relative overflow-hidden bg-gradient-to-br from-[#0f1b2d] to-[#050b16]"
      >
        <transition name="layer-panel-fade" :css="layerPanelTransitionEnabled">
          <aside v-if="layerPanelVisible"
            class="absolute inset-y-0 left-0 w-80 border-r border-gray-800 bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col z-30 shadow-[0_20px_40px_rgba(0,0,0,0.55)]">
            <div class="p-4 flex items-center gap-2 border-b border-gray-800">
              <h3 class="text-sm font-semibold flex-1">图层列表</h3>
              <button
                class="text-sm text-gray-100 hover:text-white px-3 py-1.5 rounded-md border border-white/20 bg-white/5"
                @click="collapseLayerPanel">
                折叠
              </button>
            </div>
            <div class="p-4 flex flex-col flex-1 overflow-y-auto space-y-4">
              <div class="flex items-center gap-2 text-xs text-gray-300 flex-wrap">
                <button class="px-2 py-1 border rounded text-gray-100" @click="setAllVisible(true)">全部显示</button>
                <button class="px-2 py-1 border rounded text-gray-100" @click="setAllVisible(false)">全部隐藏</button>
                <label class="flex items-center gap-1 select-none cursor-pointer ml-auto">
                  <input type="checkbox" v-model="showFilenames" /> 显示文件名
                </label>
              </div>
              <div class="space-y-2">
                <div v-for="layer in orderedLayers" :key="layer.id"
                  class="py-2 border-b border-gray-800 flex items-center gap-2">
                  <button
                    class="w-8 h-8 shrink-0 flex items-center justify-center rounded border border-gray-600 hover:bg-gray-700"
                    :title="layer.visible ? '隐藏' : '显示'" @click="layer.visible = !layer.visible">
                    <span :class="layer.visible ? 'pi pi-eye' : 'pi pi-eye-slash'" />
                  </button>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs truncate">{{ displayLayerName(layer) }}</div>
                    <div v-if="showFilenames" class="text-[10px] text-gray-400 truncate mt-1" :title="layer.filename">{{
                      layer.filename }}</div>
                  </div>
                  <input class="w-10 h-6" type="color" v-model="layer.color" />
                </div>
              </div>
            </div>
          </aside>
        </transition>
        <!-- 顶部按钮 -->
        <div class="absolute top-4 z-40 flex flex-wrap gap-2" :style="topControlsOffset">
          <template v-if="activeView === 'layers'">
            <button v-if="!isLayerPanelOpen"
              class="px-3 py-2 rounded-md bg-gray-900/80 text-white text-sm border border-white/30 shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition flex items-center gap-2"
              @click="openLayerPanel">
              图层列表
            </button>
            <button
              class="px-3.5 py-2 rounded-md bg-gray-900/80 text-white border border-white/30 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
              title="设置" @click="openSettings">
              <span class="pi pi-cog text-lg"></span>
            </button>
            <button
              class="px-2.5 py-2 rounded-md bg-gray-900/80 text-white uppercase text-[11px] tracking-wide border border-white/30 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
              title="重置视图" @click="resetCompositeSize">
              <img :src="resetIcon" alt="reset layers view" class="w-6 h-6" />
            </button>
            <button
              class="px-2.5 py-2 rounded-md uppercase text-[11px] tracking-wide border flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition"
              :class="measurementActive ? 'bg-[#0092b8] text-white border-[#3fd3ff] drop-shadow-[0_0_12px_rgba(0,146,184,0.8)]' : 'bg-gray-900/80 text-white border-white/30 hover:bg-gray-800'"
              title="尺寸测量" @click="toggleMeasurementMode" :disabled="activeView !== 'layers'">
              <img :src="measureIcon" alt="measurement" class="w-6 h-6" />
            </button>
          </template>
          <template v-else-if="activeView === '3d'">
            <button
              class="px-2.5 py-2 rounded-md bg-gray-900/80 text-white uppercase text-[11px] tracking-wide border border-white/30 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
              title="重置 3D 视图" @click="resetPcb3dView">
              <img :src="resetIcon" alt="reset 3d view" class="w-6 h-6" />
            </button>
            <button
              class="px-3.5 py-2 rounded-md uppercase text-[11px] tracking-wide border flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition"
              :class="canExplode
                ? (explosionActive
                  ? 'bg-[#0092b8] text-white border-[#3fd3ff] drop-shadow-[0_0_12px_rgba(0,146,184,0.8)]'
                  : 'bg-gray-900/80 text-white border-white/30 hover:bg-gray-800')
                : 'bg-gray-900/50 text-white border-white/10 opacity-60 cursor-not-allowed'"
              title="展开/还原模型" :disabled="!canExplode" @click="toggleExplosion"
            >
              <span class="pi pi-sitemap text-lg"></span>
            </button>
            <div class="relative">
              <button
                class="px-3.5 py-3 rounded-md bg-gray-900/80 text-white text-[15px] border border-white/30 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
                title="下载 3D 模型" @click.stop="toggleDownloadMenu">
                <span class="pi pi-download"></span>
              </button>
              <div
                v-if="downloadMenuOpen"
                class="absolute mt-2 w-44 rounded-md border border-gray-700 bg-gray-900/95 text-sm text-white shadow-xl z-50"
              >
                <button class="block w-full text-left px-3 py-2 hover:bg-gray-800" @click.stop="downloadPcbAsset('gltf')">
                  下载 glTF 模型
                </button>
                <button class="block w-full text-left px-3 py-2 hover:bg-gray-800" @click.stop="downloadPcbAsset('svg')">
                  下载 SVG（顶/底）
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- 视图切换 -->
        <div class="absolute top-4 right-4 z-40 flex flex-col items-end gap-2">
          <div class="inline-flex overflow-hidden rounded-full border-2 border-[#0092b8] bg-white shadow">
            <button v-for="mode in viewOptions" :key="mode.value"
              class="px-5 py-2 text-sm font-semibold uppercase tracking-wide transition-colors focus:outline-none"
              :class="activeView === mode.value ? 'bg-[#0092b8] text-white' : 'bg-white text-[#0092b8]'"
              @click="setActiveView(mode.value)">
              {{ mode.label }}
            </button>
          </div>
        </div>

        <!-- 层叠视图 -->
        <LayerStackPreview v-show="activeView === 'layers'" :ordered-layers="orderedLayers" :fm-result="fmRef"
          :board-view-box="boardViewBox" :board-width-mm="boardWidthMm" :board-height-mm="boardHeightMm"
          :measurement-active="measurementActive" :recenter-signal="recenterSignal" :active="activeView === 'layers'"
          @exit-measurement="measurementActive = false" @loading-change="handleLayerPreviewLoading" />

        <!-- 3D 视图 -->
        <Pcb3dPreview
          ref="pcb3dRef"
          v-show="activeView === '3d'"
          :top-svg="topSvg"
          :bottom-svg="bottomSvg"
          :thickness="boardThickness"
          :active="activeView === '3d'"
          :container-width="previewContainerWidth"
          :container-height="previewContainerHeight"
          :display-width="previewSize.width"
          :display-height="previewSize.height"
          :explosion-active="explosionActive"
          :explosion-layers="explosionLayers"
          borderColor="#eae276"
          core-color="#eae276"
          :fitPadding="1.55"
          @loading-change="handlePcb3dLoading" />
      </section>
    </div>

    <!-- 设置弹窗 -->
    <div v-if="isSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="isSettingsOpen = false"></div>
      <div
        class="relative bg-gray-900 text-gray-100 w-[720px] max-w-[95vw] max-h-[80vh] rounded-lg border border-gray-700 shadow-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div class="font-semibold">图层设置</div>
          <button class="px-2 py-1 border rounded" @click="isSettingsOpen = false">关闭</button>
        </div>
        <div class="p-4 overflow-auto max-h-[60vh] space-y-3">
          <div v-for="item in editableLayers" :key="item.id"
            class="border border-gray-700 rounded p-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium truncate">{{ item.filename }}</div>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-xs text-gray-300">type</label>
              <select v-model="item.type" class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                @change="item.side = coerceSideForType(item.type, item.side)">
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
                <option v-for="opt in allowedSides(item.type)" :key="(opt ?? 'na')" :value="opt">{{ opt ?? 'n/a' }}
                </option>
              </select>
            </div>
          </div>
        </div>
        <div class="p-3 border-t border-gray-700 flex items-center justify-end gap-2">
          <button class="px-3 py-1 border rounded" @click="isSettingsOpen = false">取消</button>
          <button class="px-3 py-1 border rounded bg-cyan-600 text-white" @click="applySettings">保存</button>
        </div>
      </div>
    </div>

    <div v-if="showLoadingOverlay"
      class="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-black/60 backdrop-blur-sm text-white">
      <div class="loading-spinner"></div>
      <div class="text-center space-y-1">
        <p class="text-sm tracking-wide uppercase text-white/70">loading</p>
        <p class="text-lg font-semibold">{{ loadingMessage }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * GerberViewer 预览总组件：
 * - 管理上传、图层列表、测量工具等共享状态
 * - 调用 LayerStackPreview（Pixi）与 Pcb3dPreview（Three）渲染
 * - 负责旧版 tracespace 结果到新版组件的数据转换
 */
import { ref, reactive, nextTick, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { runHybridPipeline } from '@tracespace/hybrid-core'
import { stringifySvg as legacyStringifySvg } from '@tracespace/legacy-core'
import UploadPanel from './UploadPanel.vue'
import LayerStackPreview from './LayerStackPreview.vue'
import Pcb3dPreview from './Pcb3dPreview.vue'
import { orderLayerWeight, randomHexColor } from '../libs/gerber_stack'

const resetIcon = new URL('../assets/resetting.svg', import.meta.url).href
const measureIcon = new URL('../assets/measurement.svg', import.meta.url).href

// 状态
const currentStatusIndex = ref(0)
const activeView = ref('layers')
const measurementActive = ref(false)
const recenterSignal = ref(0)
const isLayerPanelOpen = ref(false)
const layerPanelTransitionEnabled = ref(true)
const showFilenames = ref(false)
const isLayerLoading = ref(false)
const isLayerRenderLoading = ref(false)
const isPcb3dLoading = ref(false)
const orderedLayers = reactive([])
const memoryLayers = ref([])
const fmRef = ref(null)
const boardViewBox = ref([0, 0, 0, 0])
const boardWidthMm = ref(0)
const boardHeightMm = ref(0)
const pcb3dRef = ref(null)
const topSvg = ref('')
const bottomSvg = ref('')
const boardThickness = ref(0.016)
const viewOptions = [
  { label: 'Layers', value: 'layers' },
  { label: '3D', value: '3d' },
]
const explosionLayers = ref([])
const explosionActive = ref(false)
const canExplode = computed(() => explosionLayers.value.length > 0)
const downloadMenuOpen = ref(false)
const previewAreaRef = ref(null)
const previewSize = reactive({ width: 0, height: 0 })
const previewContainerWidth = computed(() => (previewSize.width > 0 ? `${previewSize.width}px` : '100%'))
const previewContainerHeight = computed(() => (previewSize.height > 0 ? `${previewSize.height}px` : '100%'))
let previewResizeObserver = null
const boardOutlineColor = computed(() => {
  const outlineLayer = orderedLayers.find((layer) => layer.type === 'outline')
  if (outlineLayer?.color) return outlineLayer.color
  return '#e8e8e8'
})

const enablePerfLogs = import.meta.env?.DEV ?? false
const perfLabel = (phase) => `[perf][GerberViewer] ${phase}`
const runPerfSync = (phase, fn) => {
  if (!enablePerfLogs) return fn()
  console.time(perfLabel(phase))
  try {
    return fn()
  } finally {
    console.timeEnd(perfLabel(phase))
  }
}
const runPerfAsync = async (phase, fn) => {
  if (!enablePerfLogs) return fn()
  console.time(perfLabel(phase))
  try {
    return await fn()
  } finally {
    console.timeEnd(perfLabel(phase))
  }
}
const logPerf = (phase, payload) => {
  if (enablePerfLogs) console.log(perfLabel(phase), payload)
}
const explosionLayerTypes = new Set(['copper', 'soldermask', 'silkscreen', 'solderpaste', 'drill'])
const triggerFileDownload = (blob, filename) => {
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
const stripXmlDeclaration = (svg) => {
  if (typeof svg !== 'string') return ''
  return svg.replace(/<\?xml[^>]*?>/gi, '').trim()
}
const toggleDownloadMenu = (event) => {
  event?.stopPropagation?.()
  downloadMenuOpen.value = !downloadMenuOpen.value
}
const handleGlobalClick = () => {
  downloadMenuOpen.value = false
}
const toggleExplosion = () => {
  if (!canExplode.value) return
  explosionActive.value = !explosionActive.value
}
const downloadSvgPair = () => {
  const targets = [
    { data: topSvg.value, suffix: 'top' },
    { data: bottomSvg.value, suffix: 'bottom' },
  ]
  let success = false
  for (const target of targets) {
    if (!target.data) continue
    const sanitized = stripXmlDeclaration(target.data)
    if (!sanitized) continue
    const blob = new Blob([sanitized], { type: 'image/svg+xml;charset=utf-8' })
    triggerFileDownload(blob, `pcb-${target.suffix}.svg`)
    success = true
  }
  return success
}
const downloadPcbAsset = async (type) => {
  try {
    if (type === 'gltf') {
      const blob = await pcb3dRef.value?.exportGltf?.()
      if (!blob) throw new Error('glTF 导出失败')
      triggerFileDownload(blob, 'pcb-preview.glb')
      return
    }
    if (type === 'svg') {
      if (!downloadSvgPair()) throw new Error('缺少 SVG 数据')
      return
    }
    throw new Error(`未知导出类型: ${type}`)
  } catch (error) {
    console.error('[GerberViewer] 导出失败', error)
  } finally {
    downloadMenuOpen.value = false
  }
}
const updatePreviewSize = () => {
  const el = previewAreaRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = Math.max(0, Math.round(rect.width || 0))
  const height = Math.max(0, Math.round(rect.height || 0))
  if (width !== previewSize.width || height !== previewSize.height) {
    previewSize.width = width
    previewSize.height = height
  }
}
const observePreviewArea = () => {
  if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') return
  if (!previewAreaRef.value) return
  if (!previewResizeObserver) {
    previewResizeObserver = new window.ResizeObserver(() => { updatePreviewSize() })
  }
  previewResizeObserver.observe(previewAreaRef.value)
}

const layerPanelVisible = computed(() => activeView.value === 'layers' && isLayerPanelOpen.value)
const topControlsOffset = computed(() => ({
  left: layerPanelVisible.value ? 'calc(20rem + 1rem)' : '1rem',
}))
const showLoadingOverlay = computed(() => isLayerLoading.value || isLayerRenderLoading.value || isPcb3dLoading.value)
const loadingMessage = computed(() => '加载中')

// 设置面板
const isSettingsOpen = ref(false)
const editableLayers = reactive([])

let baseTopEl = null
let baseBottomEl = null
let legacyBoardUpdateToken = 0

const setActiveView = (mode) => {
  if (mode === activeView.value) return
  if (mode !== 'layers' && measurementActive.value) measurementActive.value = false
  const transitionsDisabled = (activeView.value === 'layers' && mode !== 'layers')
    || (activeView.value !== 'layers' && mode === 'layers')
  if (transitionsDisabled) layerPanelTransitionEnabled.value = false
  activeView.value = mode
  if (transitionsDisabled) {
    nextTick(() => { layerPanelTransitionEnabled.value = true })
  }
  if (mode !== '3d') {
    downloadMenuOpen.value = false
    explosionActive.value = false
  }
}

const openLayerPanel = () => { isLayerPanelOpen.value = true }
const collapseLayerPanel = () => { isLayerPanelOpen.value = false }
const handlePcb3dLoading = (loading) => { isPcb3dLoading.value = loading }
const handleLayerPreviewLoading = (loading) => { isLayerRenderLoading.value = loading }

const toggleMeasurementMode = () => {
  if (activeView.value !== 'layers') return
  measurementActive.value = !measurementActive.value
}

const resetCompositeSize = () => {
  recenterSignal.value += 1
}

const resetPcb3dView = async () => {
  if (activeView.value !== '3d') return
  await pcb3dRef.value?.resetView?.()
}

// 上传处理
const handleUploadFile = async (file) => {
  isLayerLoading.value = true
  try {
    const formData = new FormData()
    formData.append('UploadFile', file, file.name)
    const res = await runPerfAsync('upload:api', () =>
      axios.post(
        'http://localhost:5004/api/PCBParse/Parse?Mode=0',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data', accept: '*/*' } },
      )
    )
    const result = res.data.Data
    memoryLayers.value = result.Items || []
    if (typeof result.Thickness === 'number') boardThickness.value = result.Thickness

    const pipeline = runPerfSync('upload:hybridPipeline', () =>
      runHybridPipeline(memoryLayers.value)
    )
    runPerfSync('upload:buildOrderedLayers', () => applyModernResult(pipeline.modern))
    logPerf('upload:layers-ready', {
      count: orderedLayers.length,
      boardViewBox: boardViewBox.value,
      boardWidthMm: boardWidthMm.value,
      boardHeightMm: boardHeightMm.value,
    })
    currentStatusIndex.value = 1
    isLayerPanelOpen.value = false
    applyLegacyBoardRenders(pipeline.legacy)
    recenterSignal.value += 1
  } catch (error) {
    console.error('[GerberViewer] handleUploadFile failed', error)
    throw error
  } finally {
    isLayerLoading.value = false
  }
}

// 旧版渲染 & 颜色
const updateBoardDimensionsFromBase = () => {
  const fallbackWidth = Array.isArray(boardViewBox.value) ? boardViewBox.value[2] || 0 : 0
  const fallbackHeight = Array.isArray(boardViewBox.value) ? boardViewBox.value[3] || 0 : 0
  const parseDim = (attr, fallback) => {
    const numeric = parseFloat(String(attr ?? '').replace('mm', ''))
    return Number.isFinite(numeric) ? numeric : fallback
  }
  const widthAttr = baseTopEl?.properties?.width ?? baseBottomEl?.properties?.width
  const heightAttr = baseTopEl?.properties?.height ?? baseBottomEl?.properties?.height
  boardWidthMm.value = parseDim(widthAttr, fallbackWidth)
  boardHeightMm.value = parseDim(heightAttr, fallbackHeight)
}

// 工具
const displayLayerName = (layer) => {
  if (layer?.type === 'outline') return 'outline'
  if (layer?.type === 'drill' && (!layer?.side || layer.side === 'all')) return 'drill'
  if ((!layer?.side || layer.side === undefined || layer.side === null) && layer?.type === 'drawing') return 'unknown layer'
  const s = layer.side || 'n/a'
  const t = layer.type || 'unknown'
  return `${s} ${t}`
}

const setAllVisible = (visible) => {
  for (const layer of orderedLayers) layer.visible = visible
}

const openSettings = () => {
  editableLayers.splice(0)
  for (const layer of orderedLayers) editableLayers.push({ filename: layer.filename, id: layer.id, type: layer.type, side: layer.side })
  isSettingsOpen.value = true
}

const allowedSides = (type) => {
  switch (type) {
    case 'outline':
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

const coerceSideForType = (type, side) => {
  const opts = allowedSides(type)
  if (opts.includes(side)) return side
  return opts[0]
}

const applyModernResult = (fm, { preserveVisuals = false } = {}) => {
  if (!fm) return
  fmRef.value = fm
  boardViewBox.value = fm.renderLayersResult.boardShapeRender.viewBox
  const keep = preserveVisuals
    ? new Map(orderedLayers.map((layer) => [layer.filename, { color: layer.color, visible: layer.visible, opacity: layer.opacity }]))
    : null
  orderedLayers.splice(0)
  for (const layer of fm.renderLayersResult.layers) {
    const retained = keep?.get(layer.filename)
    const color = retained?.color ?? randomHexColor()
    const visible = retained?.visible ?? true
    const opacity = typeof retained?.opacity === 'number' ? retained.opacity : 1
    orderedLayers.push({
      id: layer.id,
      side: layer.side,
      type: layer.type,
      weight: orderLayerWeight(layer.side, layer.type),
      color,
      visible,
      opacity,
      filename: layer.filename,
    })
  }
  orderedLayers.sort((a, b) => a.weight - b.weight)
}

const updateExplosionLayersFromLegacy = (renderLayersResult) => {
  if (!renderLayersResult) {
    explosionLayers.value = []
    explosionActive.value = false
    return
  }
  const entries = []
  const rendersById = renderLayersResult.rendersById || {}
  for (const layer of renderLayersResult.layers || []) {
    if (!layer?.type || !explosionLayerTypes.has(layer.type)) continue
    const node = rendersById[layer.id]
    if (!node) continue
    entries.push({
      id: layer.id,
      type: layer.type,
      side: layer.side || null,
      svg: legacyStringifySvg(node),
    })
  }
  explosionLayers.value = entries
  explosionActive.value = false
}

const commitLegacyBoardResult = (legacyResult, token) => {
  if (token !== legacyBoardUpdateToken) return
  if (!legacyResult) {
    baseTopEl = null
    baseBottomEl = null
    topSvg.value = ''
    bottomSvg.value = ''
    boardWidthMm.value = 0
    boardHeightMm.value = 0
    explosionLayers.value = []
    explosionActive.value = false
    return
  }
  const { renderBoardResult, renderLayersResult } = legacyResult || {}
  baseTopEl = renderBoardResult?.top ?? null
  baseBottomEl = renderBoardResult?.bottom ?? null
  if (renderLayersResult?.boardShapeRender?.viewBox) {
    boardViewBox.value = renderLayersResult.boardShapeRender.viewBox
  }
  updateBoardDimensionsFromBase()
  if (baseTopEl) topSvg.value = legacyStringifySvg(baseTopEl)
  else topSvg.value = ''
  if (baseBottomEl) bottomSvg.value = legacyStringifySvg(baseBottomEl)
  else bottomSvg.value = ''
  updateExplosionLayersFromLegacy(renderLayersResult)
}

const applyLegacyBoardRenders = (legacyResult) => {
  const token = ++legacyBoardUpdateToken
  commitLegacyBoardResult(legacyResult, token)
}

const applySettings = async () => {
  isLayerLoading.value = true
  const list = (memoryLayers.value || []).map((x) => ({ ...x }))
  for (const entry of editableLayers) entry.side = coerceSideForType(entry.type, entry.side)
  const keyFor = (t, s) => {
    if (t === 'outline') return 'all:outline'
    if (['copper', 'soldermask', 'silkscreen', 'solderpaste'].includes(t) && (s === 'top' || s === 'bottom')) return `${s}:${t}`
    return null
  }
  const seen = new Map()
  for (let i = 0; i < editableLayers.length; i++) {
    const entry = editableLayers[i]
    const key = keyFor(entry.type, entry.side)
    if (!key) continue
    if (seen.has(key)) {
      const prev = editableLayers[seen.get(key)]
      prev.type = 'drawing'
      prev.side = undefined
    }
    seen.set(key, i)
  }
  for (const entry of editableLayers) {
    const target = list.find((it) => it.filename === entry.filename)
    if (target) { target.type = entry.type; target.side = entry.side }
  }
  try {
    const pipeline = runPerfSync('settings:hybridPipeline', () =>
      runHybridPipeline(list)
    )
    applyModernResult(pipeline.modern, { preserveVisuals: true })
    applyLegacyBoardRenders(pipeline.legacy)
    recenterSignal.value += 1
    memoryLayers.value = list
    isSettingsOpen.value = false
  } catch (error) {
    console.error('[GerberViewer] applySettings failed', error)
  } finally {
    isLayerLoading.value = false
  }
}

onMounted(() => {
  nextTick(() => {
    updatePreviewSize()
    observePreviewArea()
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updatePreviewSize)
    window.addEventListener('click', handleGlobalClick)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updatePreviewSize)
    window.removeEventListener('click', handleGlobalClick)
  }
  if (previewResizeObserver) {
    previewResizeObserver.disconnect()
    previewResizeObserver = null
  }
})
</script>

<style scoped>
.layer-panel-fade-enter-active,
.layer-panel-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.layer-panel-fade-enter-from,
.layer-panel-fade-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.loading-spinner {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.15);
  border-top-color: #3fd3ff;
  border-right-color: #3fd3ff;
  animation: viewer-spin 0.9s linear infinite;
}

@keyframes viewer-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
