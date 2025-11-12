<template>
  <div
    class="w-[560px] h-[360px] max-w-[90vw] flex flex-col items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10 hover:ring-cyan-400/50 transition cursor-pointer backdrop-blur-sm"
    :class="{ 'ring-cyan-400/70': dragOver }"
    @dblclick="triggerSelect"
    @drop.prevent="handleDrop"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
  >
    <span class="pi pi-file-arrow-up text-cyan-300" style="font-size: 64px;"></span>
    <p class="text-[18px] mt-6 font-bold text-gray-100">上传PCB文件</p>
    <p class="text-[12px] mt-3 text-gray-300">支持 Gerber压缩包(.zip/.rar/.7z) .PCBDoc .kicad_pcb</p>
    <input ref="fileInput" type="file" class="hidden" @change="handleInput" />
  </div>
</template>

<script setup>
/**
 * 上传面板：负责处理拖拽、双击选择并把文件交给父组件。
 * 解析逻辑全部放在父组件中，便于复用以及单元测试。
 */
import { ref } from 'vue'

const emit = defineEmits(['select'])

const fileInput = ref(null)
const dragOver = ref(false)

const triggerSelect = () => fileInput.value?.click()

const extractFile = (fileList) => {
  if (!fileList || fileList.length === 0) return null
  return fileList[0]
}

const handleInput = (event) => {
  const file = extractFile(event.target.files)
  if (file) emit('select', file)
  event.target.value = ''
}

const handleDrop = (event) => {
  dragOver.value = false
  const file = extractFile(event.dataTransfer?.files)
  if (file) emit('select', file)
}
</script>
