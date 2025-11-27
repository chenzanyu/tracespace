<template>
  <div class="h-screen w-screen bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-100">
    <!-- 上传阶段 -->
    <div v-if="currentStatusIndex === 0" class="h-full flex items-center justify-center p-4">
      <UploadPanel @select="handleUploadFile" />
    </div>

    <!-- 预览阶段 -->
    <div v-else class="h-full flex relative">
      <!-- 预览画布 -->
      <section ref="previewAreaRef"
        class="flex-1 relative overflow-hidden bg-gradient-to-br from-[#0f1b2d] to-[#050b16]">
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
              class="px-3 py-2 rounded-md bg-gray-900/80 text-white uppercase text-[11px] tracking-wide border border-white/30 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
              title="重置 3D 视图" @click="resetPcb3dView">
              <img :src="resetIcon" alt="reset 3d view" class="w-6 h-6" />
            </button>

            <div class="relative">
              <button
                class="px-3.5 py-3 rounded-md bg-gray-900/80 text-white border border-white/30 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
                title="3D 显示设置" @click.stop="toggleDisplayMenu">
                <span class="pi pi-eye text-lg"></span>
              </button>
              <div v-if="displayMenuOpen"
                class="absolute left-0 mt-3 ml-2 w-[320px] rounded-xl border border-gray-700 bg-gray-900/95 text-sm text-white shadow-xl z-50 px-3 py-2.5 space-y-3"
                style="transform: translateX(0)" @click.stop>
                <div class="text-xs font-semibold text-gray-300 tracking-wide">3D 显示设置</div>
                <div class="grid grid-cols-2 gap-2">
                  <div v-for="item in pcb3dColorOptions" :key="item.key"
                    :class="['rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex flex-col gap-1', item.key === 'core' ? 'col-span-2' : '']">
                    <div class="text-[11px] text-gray-300 tracking-wide flex items-center justify-between">
                      <span>{{ item.label }}</span>
                      <button v-if="item.toggleable"
                        class="w-8 h-8 shrink-0 flex items-center justify-center rounded border border-gray-600 hover:bg-gray-800 transition"
                        :title="isPcb3dLayerVisible(item.key) ? '隐藏' : '显示'"
                        @click="togglePcb3dLayerVisibility(item.key)">
                        <span :class="isPcb3dLayerVisible(item.key) ? 'pi pi-eye' : 'pi pi-eye-slash'" />
                      </button>
                    </div>
                    <div class="flex items-center gap-3">
                      <input type="color" v-model="pcb3dColors[item.key]"
                        class="w-9 h-7 border border-gray-600 rounded bg-transparent" />
                      <span class="text-[11px] font-mono text-gray-400 uppercase">
                        {{ (pcb3dColors[item.key] || '').toUpperCase() }}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  class="w-full mt-1 px-3 py-2 text-xs rounded-md border border-white/30 bg-white/5 hover:bg-white/10 transition"
                  @click.stop="resetPcb3dDisplaySettings">
                  恢复默认
                </button>
              </div>
            </div>

            <div class="relative" @mouseenter="showSpacingPanel" @mouseleave="hideSpacingPanel">
              <button
                class="px-3.5 py-3 rounded-md uppercase text-[11px] tracking-wide border flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition"
                :class="canExplode
                  ? (explosionActive
                    ? 'bg-[#0092b8] text-white border-[#3fd3ff] drop-shadow-[0_0_12px_rgba(0,146,184,0.8)]'
                    : 'bg-gray-900/80 text-white border-white/30 hover:bg-gray-800')
                  : 'bg-gray-900/50 text-white border-white/10 opacity-60 cursor-not-allowed'" title="展开/还原模型"
                :disabled="!canExplode" @click="toggleExplosion">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                  <rect x="9" y="4" width="11" height="11" rx="1.5" stroke-linejoin="round"></rect>
                  <rect x="4" y="9" width="11" height="11" rx="1.5" stroke-linejoin="round"></rect>
                </svg>
              </button>
              <transition name="fade">
                <div v-if="spacingPanelVisible"
                  class="absolute left-0 top-full mt-2 w-56 rounded-lg border border-gray-700 bg-gray-900/95 px-3 py-2 text-xs text-gray-100 shadow-xl z-40">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold tracking-wide uppercase text-[10px] text-gray-300">Layer spacing</span>
                    <span class="text-cyan-300 font-semibold">{{ spacingDisplayValue }}</span>
                  </div>
                  <div class="mt-3">
                    <input class="w-full accent-[#0092b8]" type="range" step="0.1" :min="spacingSliderMin"
                      :max="spacingSliderMax" :value="spacingSliderValue"
                      @input="handleSpacingSliderInput($event.target.value)" />
                  </div>
                </div>
              </transition>
            </div>

            <div class="relative">
              <button
                class="px-4 py-3.5 rounded-md bg-gray-900/80 text-white text-[15px] border border-white/30 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
                title="下载 3D 模型" @click.stop="toggleDownloadMenu">
                <span class="pi pi-download"></span>
              </button>
              <div v-if="downloadMenuOpen"
                class="absolute mt-2 w-44 rounded-md border border-gray-700 bg-gray-900/95 text-sm text-white shadow-xl z-50">
                <button class="block w-full text-left px-3 py-2 hover:bg-gray-800"
                  @click.stop="downloadPcbAsset('gltf')">
                  下载 glTF 模型
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
          @exit-measurement="measurementActive = false" @loading-change="handleLayerPreviewLoading"
          @debug-update="handlePixiDebugUpdate" />

        <!-- 3D 视图 -->
        <Pcb3dPreview ref="pcb3dRef" v-show="activeView === '3d'" :model-data="pcb3dModel" :thickness="boardThicknessUnits"
          :active="activeView === '3d'" :container-width="previewContainerWidth"
          :container-height="previewContainerHeight" :display-width="previewSize.width"
          :display-height="previewSize.height" :explosion-active="explosionActive"
          :explosion-spacing-multiplier="explosionSpacing" :border-color="pcb3dColors.core"
          :core-color="pcb3dColors.core" :layer-colors="pcb3dColors" :layer-visibility="pcb3dVisibility"
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
const orderedLayers = reactive([])
const memoryLayers = ref([])
const fmRef = ref(null)
const boardViewBox = ref([0, 0, 0, 0])
const boardWidthMm = ref(0)
const boardHeightMm = ref(0)
const pcb3dRef = ref(null)
const defaultBoardThicknessMm = 1.6
// API historically emitted thickness in meters (e.g. 0.0016 for a 1.6 mm board),
// so treat any value smaller than 0.01 as meters and convert it to millimeters.
const boardThickness = ref(defaultBoardThicknessMm)
const unitMmPerUnit = ref(1)
const meterToMmThreshold = 0.01
const convertThicknessToMillimeters = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  if (numeric < meterToMmThreshold) return numeric * 1000
  return numeric
}
const boardThicknessUnits = computed(() => {
  const mmValue = Number(boardThickness.value)
  const normalizedMm = Number.isFinite(mmValue) && mmValue > 0 ? mmValue : defaultBoardThicknessMm
  const mmPerUnit = Number(unitMmPerUnit.value)
  if (!Number.isFinite(mmPerUnit) || mmPerUnit <= 0) return normalizedMm
  return normalizedMm / mmPerUnit
})
const pcb3dModel = reactive({
  layers: [],
  version: 0,
})
const defaultPcb3dColors = Object.freeze({
  copper: '#cc9933',
  soldermask: '#004200',
  silkscreen: '#ffffff',
  solderpaste: '#b2b2b2',
  core: '#ffffcc',
})
const pcb3dColors = reactive({ ...defaultPcb3dColors })
const defaultPcb3dVisibility = Object.freeze({
  copper: true,
  soldermask: true,
  silkscreen: true,
  solderpaste: false,
  core: true,
})
const pcb3dVisibility = reactive({ ...defaultPcb3dVisibility })
const pcb3dColorOptions = [
  { key: 'copper', label: '铜层', toggleable: true },
  { key: 'soldermask', label: '阻焊', toggleable: true },
  { key: 'silkscreen', label: '丝印', toggleable: true },
  { key: 'solderpaste', label: '助焊', toggleable: true },
  { key: 'core', label: '芯板', toggleable: false },
]
const displayMenuOpen = ref(false)
const pcbModelJobs = reactive({ pending: 0, total: 0 })
const workerLoading = ref(false)
const viewerLoading = ref(false)
const isPcb3dLoading = computed(() => workerLoading.value || viewerLoading.value)
const viewOptions = [
  { label: 'Layers', value: 'layers' },
  { label: '3D', value: '3d' },
]
const explosionActive = ref(false)
const explosionSpacing = ref(2)
const spacingPanelVisible = ref(false)
const spacingPanelInitialized = ref(false)
const spacingSliderValue = ref(explosionSpacing.value)
const spacingSliderMin = 0
const spacingSliderMax = 32
let spacingHideHandle = null
const spacingDisplayValue = computed(() => spacingSliderValue.value.toFixed(1))
const canExplode = computed(() => pcb3dModel.layers.length > 0)
const downloadMenuOpen = ref(false)
const previewAreaRef = ref(null)
const previewSize = reactive({ width: 0, height: 0 })
const previewContainerWidth = computed(() => (previewSize.width > 0 ? `${previewSize.width}px` : '100%'))
const previewContainerHeight = computed(() => (previewSize.height > 0 ? `${previewSize.height}px` : '100%'))
let previewResizeObserver = null
const workerDebugLog = reactive({
  jobs: [],
  errors: [],
})
const pixiLayerDebug = ref([])
const maxDebugEntries = 50
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
const trimDebugEntries = (entries) => {
  while (entries.length > maxDebugEntries) entries.shift()
}
const summarizeParseTree = (tree) => {
  if (!tree) return null
  return {
    filetype: tree.filetype ?? tree.format?.filetype ?? null,
    statements: Array.isArray(tree.statements) ? tree.statements.length : undefined,
    hasBoundingBox: Boolean(tree.boundingBox),
    units: tree.units ?? tree.format?.units ?? null,
  }
}
const computeBoundsFromArray = (arr) => {
  if (!Array.isArray(arr) || arr.length < 3) return null
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < arr.length; i += 3) {
    const x = Number(arr[i]) || 0
    const y = Number(arr[i + 1]) || 0
    const z = Number(arr[i + 2]) || 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  }
}
const summarizeMeshData = (meshData) => {
  if (!meshData) return null
  if (meshData.summary) return meshData.summary
  if (meshData.format === 'buffer-geometry') {
    const chunks = Array.isArray(meshData.chunks) ? meshData.chunks : []
    let totalVertices = 0
    const geometrySummaries = chunks.map((chunk, index) => {
      const vertexCount = chunk?.attributes?.position?.count ?? 0
      totalVertices += vertexCount
      return {
        index,
        vertexCount,
      }
    })
    return {
      geometryCount: chunks.length,
      totalVertices,
      geometries: geometrySummaries,
    }
  }
  return null
}
const toggleDownloadMenu = (event) => {
  event?.stopPropagation?.()
  downloadMenuOpen.value = !downloadMenuOpen.value
}
const toggleDisplayMenu = (event) => {
  event?.stopPropagation?.()
  const nextOpen = !displayMenuOpen.value
  displayMenuOpen.value = nextOpen
  if (nextOpen) {
    spacingPanelVisible.value = false
    if (spacingHideHandle) {
      clearTimeout(spacingHideHandle)
      spacingHideHandle = null
    }
  }
}
const isPcb3dLayerVisible = (key) => {
  const value = pcb3dVisibility[key]
  return typeof value === 'boolean' ? value : true
}
const togglePcb3dLayerVisibility = (key) => {
  if (key === 'core') return
  const next = !isPcb3dLayerVisible(key)
  pcb3dVisibility[key] = next
}
const resetPcb3dDisplaySettings = () => {
  Object.entries(defaultPcb3dColors).forEach(([key, value]) => {
    pcb3dColors[key] = value
  })
  Object.entries(defaultPcb3dVisibility).forEach(([key, value]) => {
    pcb3dVisibility[key] = value
  })
}
const handleGlobalClick = () => {
  downloadMenuOpen.value = false
  displayMenuOpen.value = false
}
const recordWorkerJobStart = (jobId, payload) => {
  workerDebugLog.jobs.push({
    jobId,
    timestamp: Date.now(),
    layerId: payload.layerId,
    type: payload.type,
    side: payload.side ?? null,
    outline: Boolean(payload.outline),
    hasParseTree: Boolean(payload.parseTree),
    parseTreeSummary: summarizeParseTree(payload.parseTree),
    drillShapeCount: Array.isArray(payload.drillShapes) ? payload.drillShapes.length : 0,
  })
  trimDebugEntries(workerDebugLog.jobs)
}
const recordWorkerJobResult = (jobId, { success, message, result }) => {
  const entry = workerDebugLog.jobs.find((job) => job.jobId === jobId)
  if (!entry) return
  entry.completedAt = Date.now()
  entry.success = success
  if (success) {
    entry.meshSummary = result?.meshSummary ?? summarizeMeshData(result?.mesh)
    if (result?.debug) entry.debug = result.debug
  } else if (!success) {
    entry.errorMessage = message || 'unknown worker failure'
  }
}
const recordWorkerError = (detail) => {
  workerDebugLog.errors.push({
    timestamp: Date.now(),
    ...detail,
  })
  trimDebugEntries(workerDebugLog.errors)
}
const toggleExplosion = () => {
  if (!canExplode.value) return
  explosionActive.value = !explosionActive.value
}
const clampSpacingValue = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return explosionSpacing.value
  return Math.min(spacingSliderMax, Math.max(spacingSliderMin, parsed))
}
const applySpacingValue = (value) => {
  const clamped = clampSpacingValue(value)
  explosionSpacing.value = clamped
  spacingSliderValue.value = clamped
}
const clearSpacingHideTimer = () => {
  if (spacingHideHandle) {
    clearTimeout(spacingHideHandle)
    spacingHideHandle = null
  }
}
const showSpacingPanel = () => {
  if (!canExplode.value) return
  if (displayMenuOpen.value) displayMenuOpen.value = false
  clearSpacingHideTimer()
  spacingPanelVisible.value = true
  if (!spacingPanelInitialized.value) {
    spacingSliderValue.value = clampSpacingValue(explosionSpacing.value)
    spacingPanelInitialized.value = true
  } else {
    spacingSliderValue.value = explosionSpacing.value
  }
}
const hideSpacingPanel = () => {
  clearSpacingHideTimer()
  spacingHideHandle = setTimeout(() => {
    spacingPanelVisible.value = false
    spacingHideHandle = null
  }, 3000)
}
const handleSpacingSliderInput = (value) => {
  applySpacingValue(value)
  spacingPanelInitialized.value = true
}
const downloadPcbAsset = async (type) => {
  try {
    if (type === 'gltf') {
      const blob = await pcb3dRef.value?.exportGltf?.()
      if (!blob) throw new Error('glTF 导出失败')
      triggerFileDownload(blob, 'pcb-preview.glb')
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
const supported3dTypes = new Set(['copper', 'soldermask', 'silkscreen', 'solderpaste', 'outline'])
let pcbWorker = null
const pcbWorkerJobs = new Map()
let pcbWorkerSeq = 0
const defaultLayerColors = {
  copper: '#f2c55b',
  soldermask: '#1c7a2a',
  silkscreen: '#ffffff',
  solderpaste: '#b4b8c0',
  drill: '#333333',
  outline: '#bfa782',
}

const createPcbWorker = () =>
  new Worker(new URL('../workers/pcbModel.worker.js', import.meta.url), { type: 'module' })

const handlePcbWorkerMessage = (event) => {
  const { jobId, success, result, message } = event.data || {}
  if (!jobId) return
  const entry = pcbWorkerJobs.get(jobId)
  if (!entry) return
  pcbWorkerJobs.delete(jobId)
  if (success) entry.resolve(result)
  else {
    console.error('[GerberViewer] PCB worker failure detail', message)
    entry.reject(new Error(message || 'worker error'))
  }
}

const disposePcbWorker = () => {
  if (pcbWorker) {
    pcbWorker.terminate()
    pcbWorker = null
  }
  pcbWorkerJobs.clear()
}

const ensurePcbWorker = () => {
  if (!pcbWorker) {
    pcbWorker = createPcbWorker()
    pcbWorker.onmessage = handlePcbWorkerMessage
    pcbWorker.onerror = (event) => {
      const details =
        event?.message ||
        event?.error?.message ||
        event?.error?.stack ||
        'Unknown worker error'
      console.error(
        '[GerberViewer] PCB model worker error',
        details,
        event?.filename,
        event?.lineno,
        event?.colno,
        event?.error
      )
      recordWorkerError({
        message: details,
        filename: event?.filename,
        line: event?.lineno,
        column: event?.colno,
        errorStack: event?.error?.stack,
      })
      if (typeof event?.preventDefault === 'function') {
        event.preventDefault()
      }
    }
  }
  return pcbWorker
}

const getLayerColor = (layerId, type) => {
  const matched = orderedLayers.find((layer) => layer.id === layerId)
  if (matched?.color) return matched.color
  return defaultLayerColors[type] || '#ffffff'
}

const resetPcbModelState = () => {
  pcb3dModel.layers = []
  pcb3dModel.version += 1
}

const updateWorkerLoading = () => {
  workerLoading.value = pcbModelJobs.pending > 0
}

const queueWorkerJob = (payload) => {
  const worker = ensurePcbWorker()
  const jobId = ++pcbWorkerSeq
  pcbModelJobs.pending += 1
  updateWorkerLoading()
  recordWorkerJobStart(jobId, payload)
  const startTime = performance.now()
  console.log('[GerberViewer] queue worker job', {
    jobId,
    layerId: payload.layerId,
    type: payload.type,
    side: payload.side,
  })
  return new Promise((resolve, reject) => {
    pcbWorkerJobs.set(jobId, {
      resolve: (result) => {
        pcbModelJobs.pending = Math.max(0, pcbModelJobs.pending - 1)
        updateWorkerLoading()
        recordWorkerJobResult(jobId, { success: true, result })
        console.log('[GerberViewer] worker job finished', {
          jobId,
          layerId: payload.layerId,
          type: payload.type,
          durationMs: Number((performance.now() - startTime).toFixed(2)),
        })
        resolve(result)
      },
      reject: (error) => {
        pcbModelJobs.pending = Math.max(0, pcbModelJobs.pending - 1)
        updateWorkerLoading()
        recordWorkerJobResult(jobId, { success: false, message: error?.message })
        console.warn('[GerberViewer] worker job failed', {
          jobId,
          layerId: payload.layerId,
          type: payload.type,
          durationMs: Number((performance.now() - startTime).toFixed(2)),
          error: error?.message,
        })
        reject(error)
      },
    })
    worker.postMessage({
      jobId,
      action: 'build-layer',
      payload,
    })
  })
}

const applyWorkerLayer = (payload) => {
  if (!payload) return
  const layers = pcb3dModel.layers.filter((entry) => entry.id !== payload.layerId)
  layers.push({
    id: payload.layerId,
    type: payload.type,
    side: payload.side,
    color: payload.color,
    mesh: payload.mesh,
    meshSummary: payload.meshSummary ?? summarizeMeshData(payload.mesh),
    debug: payload.debug ?? null,
  })
  pcb3dModel.layers = layers
  pcb3dModel.version += 1
}

const buildPcbModelFromParsedLayers = (parsedLayers, boardShape) => {
  resetPcbModelState()
  pcbModelJobs.total = 0
  pcbModelJobs.pending = 0
  updateWorkerLoading()
  if (!Array.isArray(parsedLayers) || parsedLayers.length === 0) return
  const boardRegions = Array.isArray(boardShape?.regions) ? boardShape.regions : undefined
  const boardBounds = Array.isArray(boardShape?.size) ? boardShape.size : undefined
  const drillParseTrees = parsedLayers
    .filter((layer) => {
      const type = String(layer?.type || '').toLowerCase()
      return type.includes('drill') && layer?.parseTree
    })
    .map((layer) => layer.parseTree)
  const layersFor3d = parsedLayers.filter(
    (layer) => layer?.type && supported3dTypes.has(layer.type)
  )
  pcbModelJobs.total = layersFor3d.length
  if (!layersFor3d.length) return
  const drillShapePayload = drillParseTrees.length ? drillParseTrees : undefined
  for (const layer of layersFor3d) {
    queueWorkerJob({
      layerId: layer.id,
      parseTree: layer.parseTree,
      type: layer.type,
      side: layer.side ?? null,
      color: getLayerColor(layer.id, layer.type),
      outline: layer.type === 'outline',
      boardShapeRegions: layer.type === 'outline' ? boardRegions : undefined,
      boardClipRegions: boardRegions,
      drillShapes: drillShapePayload,
      boardBounds,
    })
      .then((result) => {
        applyWorkerLayer(result)
      })
      .catch((error) => {
        console.error('[GerberViewer] PCB worker failed', error)
      })
  }
}

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
const handlePcb3dLoading = (loading) => { viewerLoading.value = loading }
const handleLayerPreviewLoading = (loading) => { isLayerRenderLoading.value = loading }
const handlePixiDebugUpdate = (payload) => {
  pixiLayerDebug.value = Array.isArray(payload) ? payload : []
}

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
    if (typeof result.Thickness === 'number') {
      const normalizedThickness = convertThicknessToMillimeters(result.Thickness)
      boardThickness.value = normalizedThickness ?? defaultBoardThicknessMm
    } else {
      boardThickness.value = defaultBoardThicknessMm
    }

    const pipeline = runPerfSync('upload:hybridPipeline', () =>
      runHybridPipeline(memoryLayers.value)
    )
    runPerfSync('upload:buildOrderedLayers', () => applyModernResult(pipeline.modern))
    buildPcbModelFromParsedLayers(
      pipeline.parsedLayers,
      pipeline.modern?.plotResult?.boardShape
    )
    logPerf('upload:layers-ready', {
      count: orderedLayers.length,
      boardViewBox: boardViewBox.value,
      boardWidthMm: boardWidthMm.value,
      boardHeightMm: boardHeightMm.value,
    })
    currentStatusIndex.value = 1
    isLayerPanelOpen.value = false
    recenterSignal.value += 1
  } catch (error) {
    console.error('[GerberViewer] handleUploadFile failed', error)
    throw error
  } finally {
    isLayerLoading.value = false
  }
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
  const mmPerUnit = Number(fm?.unitMeta?.mmPerUnit)
  unitMmPerUnit.value = Number.isFinite(mmPerUnit) && mmPerUnit > 0 ? mmPerUnit : 1
  boardViewBox.value = fm.renderLayersResult.boardShapeRender.viewBox
  if (Array.isArray(boardViewBox.value) && boardViewBox.value.length >= 4) {
    const widthUnits = boardViewBox.value[2] || 0
    const heightUnits = boardViewBox.value[3] || 0
    const mmScale = unitMmPerUnit.value || 1
    boardWidthMm.value = widthUnits * mmScale
    boardHeightMm.value = heightUnits * mmScale
  }
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
    buildPcbModelFromParsedLayers(
      pipeline.parsedLayers,
      pipeline.modern?.plotResult?.boardShape
    )
    recenterSignal.value += 1
    memoryLayers.value = list
    isSettingsOpen.value = false
  } catch (error) {
    console.error('[GerberViewer] applySettings failed', error)
  } finally {
    isLayerLoading.value = false
  }
}

watch(
  () => orderedLayers.map((layer) => ({ id: layer.id, color: layer.color })),
  (entries) => {
    const colorMap = new Map(entries.map((entry) => [entry.id, entry.color]))
    let changed = false
    const nextLayers = pcb3dModel.layers.map((layer) => {
      const color = colorMap.get(layer.id)
      if (color && color !== layer.color) {
        changed = true
        return { ...layer, color }
      }
      return layer
    })
    if (changed) {
      pcb3dModel.layers = nextLayers
      pcb3dModel.version += 1
    }
  }
)

watch(activeView, (value) => {
  if (value !== '3d') {
    displayMenuOpen.value = false
    spacingPanelVisible.value = false
  }
})

watch(canExplode, (value) => {
  if (!value) {
    spacingPanelVisible.value = false
    spacingPanelInitialized.value = false
    clearSpacingHideTimer()
  }
})

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
  disposePcbWorker()
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
