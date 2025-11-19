<script setup>
import { computed } from 'vue'

const props = defineProps({
  visualLayers: { type: Array, required: true },
  holes: { type: Array, required: true },
  activeHoleId: { type: Number, default: null },
  colors: { 
    type: Object, 
    default: () => ({ copper: '#d68c04', pp: '#ffffb8', core: '#e0c855', drill: '#d68c04' }) 
  }
})

// --- 尺寸动态计算 ---
// 当层数大于 8 层时，启用紧凑模式
const isCompact = computed(() => props.visualLayers.length > 8)

// 根据是否紧凑模式返回高度
const H_COPPER = computed(() => isCompact.value ? 12 : 16)
const H_DIELECTRIC = computed(() => isCompact.value ? 28 : 40)

const LAYER_WIDTH = 360    
const PADDING_TOP = 0 // 设为0，让外部 padding 控制对齐
const PADDING_LEFT = 10
const TEXT_AREA_WIDTH = 160

// 1. 计算层坐标
const renderedLayers = computed(() => {
  let currentY = PADDING_TOP
  return props.visualLayers.map((layer) => {
    const height = layer.type === 'copper' ? H_COPPER.value : H_DIELECTRIC.value
    
    let fill = ''
    if (layer.type === 'copper') fill = props.colors.copper
    else fill = layer.material === 'Core' ? props.colors.core : props.colors.pp

    const obj = {
      ...layer,
      y: currentY,
      height,
      bottomY: currentY + height,
      midY: currentY + height / 2,
      fill
    }
    currentY += height
    return obj
  })
})

// 2. SVG 尺寸
const viewBoxWidth = computed(() => PADDING_LEFT + LAYER_WIDTH + TEXT_AREA_WIDTH)
const viewBoxHeight = computed(() => {
  const last = renderedLayers.value[renderedLayers.value.length - 1]
  return last ? last.bottomY + 10 : 300
})

// 3. 钻孔渲染
const renderedVias = computed(() => {
  const groups = [] 
  const processedIds = new Set()
  const sortedHoles = [...props.holes].sort((a, b) => a.startLayer - b.startLayer)

  sortedHoles.forEach(hole => {
    if (processedIds.has(hole.id)) return
    const group = [hole]
    processedIds.add(hole.id)
    let currentEnd = hole.endLayer
    let found = true
    while(found) {
      const nextHole = sortedHoles.find(h => !processedIds.has(h.id) && h.startLayer === currentEnd && h.stacked)
      if (nextHole) { group.push(nextHole); processedIds.add(nextHole.id); currentEnd = nextHole.endLayer }
      else { found = false }
    }
    groups.push(group)
  })

  const vias = []
  const contentCenterX = PADDING_LEFT + (LAYER_WIDTH / 2)
  // 紧凑模式下稍微减小孔间距
  const stepX = isCompact.value ? 30 : 36 
  const startX = contentCenterX - ((groups.length - 1) * stepX) / 2

  groups.forEach((group, groupIndex) => {
    const xCenter = startX + groupIndex * stepX
    
    group.forEach(hole => {
      const startObj = renderedLayers.value.find(l => l.copperIndex === hole.startLayer)
      const endObj = renderedLayers.value.find(l => l.copperIndex === hole.endLayer)
      if (!startObj || !endObj) return

      const yTop = Math.min(startObj.y, endObj.y)
      const yBottom = Math.max(startObj.bottomY, endObj.bottomY)

      vias.push({
        id: hole.id,
        x: xCenter - 10, 
        y: yTop,
        width: 20,       
        height: yBottom - yTop,
        isActive: props.activeHoleId === hole.id,
        label: hole.type === 'laser' ? 'L' : 'M',
        fill: props.colors.drill 
      })
    })
  })
  return vias
})
</script>

<template>
  <svg 
    :width="viewBoxWidth"
    :height="viewBoxHeight"
    :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`" 
    class="stackup-svg"
  >
    <!-- 1. 绘制层板 -->
    <g v-for="layer in renderedLayers" :key="layer.id">
      <rect
        :x="PADDING_LEFT"
        :y="layer.y"
        :width="LAYER_WIDTH"
        :height="layer.height"
        :fill="layer.fill"
        stroke="none"
      />
      
      <g class="labels" transform="translate(8, 0)">
        <text 
          v-if="layer.type === 'copper'"
          :x="PADDING_LEFT + LAYER_WIDTH" 
          :y="layer.midY" 
          dy="0.35em" 
          class="label-copper"
        >{{ layer.label }}</text>

        <text 
          v-if="layer.type === 'dielectric'"
          :x="PADDING_LEFT + LAYER_WIDTH" 
          :y="layer.midY" 
          dy="0.32em" 
          class="label-material"
          :class="layer.material"
        >{{ layer.material }}</text>
      </g>
    </g>

    <!-- 2. 绘制钻孔 -->
    <g v-for="via in renderedVias" :key="via.id">
      <rect
        :x="via.x"
        :y="via.y"
        :width="via.width"
        :height="via.height"
        class="via-shape"
        :class="{ active: via.isActive }"
        :fill="via.fill"
      />
      <text
        :x="via.x + via.width/2"
        :y="via.y + via.height/2"
        class="via-text"
        dy="0.35em"
      >
        {{ via.label }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.stackup-svg {
  display: block;
  flex-shrink: 0; 
}

.label-copper {
  font-size: 15px; 
  font-weight: 700; 
  fill: #000000; 
  font-family: sans-serif;
}

.label-material {
  font-size: 13px; 
  font-family: monospace;
  font-weight: 600;
}
.label-material.Core { fill: #a08616; }
.label-material.PP { fill: #afa309; }

.via-shape {
  stroke: #ffffff;
  stroke-width: 1px;
  transition: all 0.1s;
}
.via-shape.active {
  fill: #dc2626 !important;
  stroke: #fee2e2;
}

.via-text {
  font-size: 11px; 
  fill: white;
  text-anchor: middle;
  font-family: sans-serif;
  font-weight: 700;
  pointer-events: none;
}
</style>