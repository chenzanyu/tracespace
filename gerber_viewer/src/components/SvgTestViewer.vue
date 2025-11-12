<template>
  <div class="min-h-screen bg-gray-900 text-gray-100 flex flex-col py-8 px-6 gap-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold">Svg Test Viewer</h1>
      <p class="text-sm text-gray-400">
        上传 PCB 文件并使用 legacy tracespace-core 生成独立的 top/bottom SVG 以验证渲染效果。
      </p>
    </header>

    <section>
      <div
        class="border-2 border-dashed border-cyan-500/50 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition hover:border-cyan-400"
        :class="{ 'bg-cyan-500/10': isDragOver }"
        @click="triggerFileInput"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
      >
        <span class="pi pi-file-arrow-up text-4xl text-cyan-400"></span>
        <p class="text-base font-medium">拖拽或点击选择 Gerber 压缩包</p>
        <p class="text-xs text-gray-400">支持 .zip/.rar/.7z/.pcbdoc/.kicad_pcb</p>
        <input ref="fileInput" type="file" class="hidden" @change="handleFileChange" />
      </div>
      <div class="mt-3 text-sm text-yellow-400" v-if="statusMessage">{{ statusMessage }}</div>
      <div class="mt-2 text-sm text-red-400" v-if="errorMessage">{{ errorMessage }}</div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-2 gap-4" v-if="hasBoard">
      <div class="bg-gray-800 rounded-xl p-4 space-y-4">
        <h2 class="text-lg font-semibold flex items-center justify-between">
          Top
          <button class="text-xs text-cyan-300 hover:underline" @click="resetColors('top')">重置颜色</button>
        </h2>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">copper</span>
            <input type="color" v-model="boardColors.top.copper" />
          </label>
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">soldermask</span>
            <input type="color" v-model="boardColors.top.soldermask" />
          </label>
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">silkscreen</span>
            <input type="color" v-model="boardColors.top.silkscreen" />
          </label>
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">solderpaste</span>
            <input type="color" v-model="boardColors.top.solderpaste" />
          </label>
        </div>
        <div class="bg-white rounded-lg overflow-hidden min-h-[320px] flex items-center justify-center">
          <div v-if="topSvg" class="w-full h-full [&>svg]:w-full [&>svg]:h-full" v-html="topSvg"></div>
          <p v-else class="text-gray-500 text-sm">未生成 top SVG</p>
        </div>
      </div>

      <div class="bg-gray-800 rounded-xl p-4 space-y-4">
        <h2 class="text-lg font-semibold flex items-center justify-between">
          Bottom
          <button class="text-xs text-cyan-300 hover:underline" @click="resetColors('bottom')">重置颜色</button>
        </h2>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">copper</span>
            <input type="color" v-model="boardColors.bottom.copper" />
          </label>
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">soldermask</span>
            <input type="color" v-model="boardColors.bottom.soldermask" />
          </label>
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">silkscreen</span>
            <input type="color" v-model="boardColors.bottom.silkscreen" />
          </label>
          <label class="flex items-center gap-2">
            <span class="w-16 text-gray-400">solderpaste</span>
            <input type="color" v-model="boardColors.bottom.solderpaste" />
          </label>
        </div>
        <div class="bg-white rounded-lg overflow-hidden min-h-[320px] flex items-center justify-center">
          <div v-if="bottomSvg" class="w-full h-full [&>svg]:w-full [&>svg]:h-full" v-html="bottomSvg"></div>
          <p v-else class="text-gray-500 text-sm">未生成 bottom SVG</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, toRaw } from 'vue'
import axios from 'axios'
import { fromMemoryLayers as legacyFromMemoryLayers, stringifySvg as legacyStringifySvg } from '../libs/tracespace-core.js'

const fileInput = ref(null)
const isDragOver = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')
const topSvg = ref('')
const bottomSvg = ref('')
const defaultBoard = { copper: '#cc9933', soldermask: '#004200', silkscreen: '#ffffff', solderpaste: '#999999' }
const boardColors = reactive({
  top: { ...defaultBoard },
  bottom: { ...defaultBoard },
})
const hasBoard = computed(() => Boolean(topSvg.value || bottomSvg.value))

let baseTopEl = null
let baseBottomEl = null

function triggerFileInput() {
  fileInput.value?.click()
}

function resetColors(side) {
  boardColors[side].copper = defaultBoard.copper
  boardColors[side].soldermask = defaultBoard.soldermask
  boardColors[side].silkscreen = defaultBoard.silkscreen
  boardColors[side].solderpaste = defaultBoard.solderpaste
}

function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (file) receiveFile(file)
  event.target.value = ''
}

function handleDrop(event) {
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) receiveFile(file)
}

async function receiveFile(file) {
  statusMessage.value = `正在上传 ${file.name}...`
  errorMessage.value = ''
  try {
    const formData = new FormData()
    formData.append('UploadFile', file, file.name)
    const res = await axios.post('http://10.168.8.251:5004/api/PCBParse/Parse?Mode=0', formData, {
      headers: { 'Content-Type': 'multipart/form-data', accept: '*/*' },
    })
    const items = res.data?.Data?.Items ?? []
    if (!items.length) {
      resetBoard()
      statusMessage.value = 'API 返回为空，无法生成 SVG'
      return
    }
    await renderLegacyBoard(items)
    statusMessage.value = `完成渲染：共 ${items.length} 个图层`
  } catch (err) {
    console.error('[SvgTestViewer] 上传失败', err)
    errorMessage.value = err?.message ?? '上传失败'
    resetBoard()
  }
}

async function renderLegacyBoard(layers) {
  if (!Array.isArray(layers) || layers.length === 0) {
    resetBoard()
    return
  }
  const fm = await legacyFromMemoryLayers(layers)
  baseTopEl = fm?.renderBoardResult?.top ?? null
  baseBottomEl = fm?.renderBoardResult?.bottom ?? null
  updateBoardPreview('top')
  updateBoardPreview('bottom')
}

function resetBoard() {
  baseTopEl = null
  baseBottomEl = null
  topSvg.value = ''
  bottomSvg.value = ''
}

function updateBoardPreview(side) {
  if (side === 'top') {
    if (baseTopEl) {
      const clone = deepClone(baseTopEl)
      applyBoardColorsLocal(clone, boardColors.top)
      normalizeBoardSvgProps(clone)
      topSvg.value = legacyStringifySvg(clone)
    } else {
      topSvg.value = ''
    }
  }
  if (side === 'bottom') {
    if (baseBottomEl) {
      const clone = deepClone(baseBottomEl)
      applyBoardColorsLocal(clone, boardColors.bottom)
      normalizeBoardSvgProps(clone)
      bottomSvg.value = legacyStringifySvg(clone)
    } else {
      bottomSvg.value = ''
    }
  }
}

function normalizeBoardSvgProps(node) {
  if (!node || node.type !== 'element') return
  node.properties = node.properties || {}
  node.properties.preserveAspectRatio = 'xMidYMid meet'
  if (node.properties.style) delete node.properties.style
}

watch(
  () => boardColors.top,
  () => updateBoardPreview('top'),
  { deep: true },
)

watch(
  () => boardColors.bottom,
  () => updateBoardPreview('bottom'),
  { deep: true },
)

function deepClone(input, seen = new WeakMap()) {
  const el = toRaw(input)
  if (el === null || typeof el !== 'object') return el
  if (seen.has(el)) return seen.get(el)
  try {
    if (typeof window !== 'undefined' && typeof window.structuredClone === 'function') return window.structuredClone(el)
  } catch {}
  if (Array.isArray(el)) {
    const out = new Array(el.length)
    seen.set(el, out)
    for (let i = 0; i < el.length; i++) out[i] = deepClone(el[i], seen)
    return out
  }
  const out = {}
  seen.set(el, out)
  for (const [k, v] of Object.entries(el)) {
    if (k === 'parent' || k === '__v_isReactive' || k === '__v_skip') continue
    out[k] = deepClone(v, seen)
  }
  return out
}

function applyBoardColorsLocal(root, colors) {
  if (!root) return
  const stack = [root]
  const all = []
  while (stack.length) {
    const node = stack.pop()
    all.push(node)
    for (const child of node.children || []) if (child && child.type === 'element') stack.push(child)
  }
  for (const group of all.filter((n) => n.tagName === 'g' && typeof n.properties?.mask === 'string' && n.properties.mask.startsWith('url(#drill-'))) {
    if (!colors.copper) continue
    for (const child of group.children || []) {
      if (child.tagName === 'g') {
        child.properties = child.properties || {}
        child.properties.color = colors.copper
      }
    }
  }
  for (const group of all.filter((n) => n.tagName === 'g' && typeof n.properties?.mask === 'string' && n.properties.mask.startsWith('url(#resist-'))) {
    for (const child of group.children || []) {
      if (child.tagName === 'rect' && colors.soldermask) {
        child.properties = child.properties || {}
        child.properties.fill = colors.soldermask
      }
      if (child.tagName === 'g' && colors.silkscreen) {
        child.properties = child.properties || {}
        child.properties.color = colors.silkscreen
      }
    }
  }
  if (colors.solderpaste) {
    for (const node of all) {
      if (node.tagName === 'g' && typeof node.properties?.color === 'string' && node.properties.color === '#999') {
        node.properties.color = colors.solderpaste
      }
    }
  }
}
</script>

<style scoped>
.pi {
  font-family: 'primeicons';
}
</style>
