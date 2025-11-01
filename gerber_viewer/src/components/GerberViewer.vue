<template>
    <div class=" h-screen w-screen flex items-center justify-center">

        <div v-if="currentStatusIndex == 0" @dblclick="receiveFileOnDbClick" @drop.prevent="receiveFileOnDrop"
            :class="{ 'is-dragover': isDragOver }" @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            class="h-[70vh] w-[50vw] flex flex-col items-center justify-center border border-green-500 border-dashed rounded-2xl min-w-[500px] min-h-[220px] bg-[#f8fafc]">
            <span class="pi pi-file-arrow-up text-blue-500" style="font-size: 60px;"></span>

            <p class="text-[16px] mt-6 font-bold">上传PCB文件</p>
            <p class="text-[12px] mt-3 text-gray-600">支持 Gerber压缩包(.zip/.rar/.7z) .PCBDoc .kicad_pcb文件</p>
        </div>

        <div v-if="currentStatusIndex == 1">
            <div v-html="topSvg"></div>
            <!-- <div v-html="bottomSvg"></div> -->

            <div v-for="layer in layers" class="flex justify-center items-center">
                <p>{{ layer.name }}</p>
                <div v-html="layer.svg"></div>
            </div>
        </div>

        <!-- 隐藏文件选择框：双击或“上传文件”按钮触发 -->
        <input ref="fileInput" type="file" hidden @change="receiveFileOnInput" />
    </div>
</template>

<script setup>

import { ref, computed } from 'vue'
import axios from 'axios'
import { read, plot, renderLayers, renderBoard, fromMemoryLayers, stringifySvg } from '@tracespace/core'


const statusList = [
    {
        index: 0,
        name: '上传PCB文件'
    },

    {
        index: 1,
        name: 'PCB预览'
    }
]

const currentStatusIndex = ref(0)
const currentStatus = computed(() => statusList[currentStatusIndex.value])


const fileInput = ref(null)
//是否允许拖动
const isDragOver = ref(true)

const topSvg = ref(null)
const bottomSvg = ref(null)
const layers = ref([])


//文件上传处理
const handleUploadFile = async (file) => {
    try {
        const formData = new FormData()
        formData.append('UploadFile', file, file.name)

        try {
            const res = await axios.post(
                'http://localhost:5003/api/PCBParse/Parse?Mode=0',
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'accept': '*/*'
                    }
                }
            )
            const result = res.data.Data
            const { renderLayersResult, renderBoardResult } = await fromMemoryLayers(result.Items)
            console.log(renderLayersResult)
            console.log(renderBoardResult)
            topSvg.value = stringifySvg(renderBoardResult.top)
            bottomSvg.value = stringifySvg(renderBoardResult.bottom)
            for(const currentLayer of renderLayersResult.layers){
                const currentRenderById = renderLayersResult.rendersById[currentLayer.id]
                const currentLayerSvg = stringifySvg(currentRenderById)
                const layerItem = {
                    svg: currentLayerSvg,
                    name: currentLayer.filename,
                    type: currentLayer.type,
                    side: currentLayer.side
                }
                layers.value.push(layerItem)
            }
            currentStatusIndex.value = 1
        }
        catch (error) {
            console.error(error)
        }

    }
    catch (e) {
        console.error(e)
    }
}

//接收文件_input
const receiveFileOnInput = (e) => {
    const selected = e.target.files?.[0] || null
    handleUploadFile(selected)
}

//接收文件_drop
const receiveFileOnDrop = (e) => {
    const selected = e.dataTransfer?.files?.[0] || null
    handleUploadFile(selected)
}

//接收文件_dbclick
const receiveFileOnDbClick = () => fileInput.value?.click()

</script>

<style lang="scss" scoped></style>