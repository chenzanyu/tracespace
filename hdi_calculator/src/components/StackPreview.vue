<script setup>
import { computed } from 'vue'

const props = defineProps({
  visualLayers: {
    type: Array,
    required: true,
  },
  holes: {
    type: Array,
    required: true,
  },
})

const COPPER_HEIGHT = 16
const DIELECTRIC_HEIGHT = 8
const GAP = 5
const VIEW_WIDTH = 320

const layoutLayers = computed(() => {
  let cursor = 6
  return props.visualLayers.map(layer => {
    const height = layer.type === 'copper' ? COPPER_HEIGHT : DIELECTRIC_HEIGHT
    const positioned = { ...layer, y: cursor, height }
    cursor += height + GAP
    return positioned
  })
})

const totalHeight = computed(() => {
  if (layoutLayers.value.length === 0) return 140
  const last = layoutLayers.value[layoutLayers.value.length - 1]
  return last.y + last.height + GAP
})

const copperCenters = computed(() => {
  const centers = new Map()
  layoutLayers.value.forEach(layer => {
    if (layer.type === 'copper' && typeof layer.copperIndex === 'number') {
      centers.set(layer.copperIndex, layer.y + layer.height / 2)
    }
  })
  return centers
})

const viaShapes = computed(() =>
  props.holes
    .map(hole => {
      const startY = copperCenters.value.get(hole.startLayer)
      const endY = copperCenters.value.get(hole.endLayer)
      if (startY === undefined || endY === undefined) return null
      const top = Math.min(startY, endY)
      const bottom = Math.max(startY, endY)
      const dynamicWidth = Math.max(7, Math.abs(startY - endY) / 6 + 5)
      const centerX = 115
      const topWidth = hole.type === 'through' ? dynamicWidth : dynamicWidth - 2
      const bottomWidth = dynamicWidth + 4
      const path = [
        `M ${centerX - topWidth} ${top - 4}`,
        `L ${centerX + topWidth} ${top - 4}`,
        `L ${centerX + bottomWidth} ${bottom + 4}`,
        `L ${centerX - bottomWidth} ${bottom + 4}`,
        'Z',
      ].join(' ')
      return {
        id: hole.id,
        path,
        type: hole.type,
        label: hole.name,
        labelY: (top + bottom) / 2,
      }
    })
    .filter(Boolean)
)
</script>

<template>
  <div class="stack-preview">
    <svg
      class="stack-preview__svg"
      :viewBox="`0 0 ${VIEW_WIDTH} ${totalHeight}`"
      role="img"
      aria-label="HDI layer preview"
    >
      <g v-for="layer in layoutLayers" :key="layer.id">
        <rect
          class="stack-preview__layer"
          :class="'stack-preview__layer--' + layer.type"
          x="20"
          :y="layer.y"
          width="150"
          :height="layer.height"
          rx="4"
          ry="4"
        />
        <text
          class="stack-preview__label"
          :x="190"
          :y="layer.y + layer.height / 2 + 4"
        >
          {{ layer.label }}
        </text>
      </g>

      <g v-for="via in viaShapes" :key="via.id">
        <path
          class="stack-preview__via"
          :class="'stack-preview__via--' + via.type"
          :d="via.path"
        />
        <text class="stack-preview__via-label" x="240" :y="via.labelY + 4">
          {{ via.label }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.stack-preview {
  border-radius: 16px;
  background: linear-gradient(135deg, #fff, #fdf2f8);
  box-shadow: 0 20px 45px rgb(15 23 42 / 8%);
  padding: 1.5rem;
}

.stack-preview__svg {
  width: 100%;
  height: auto;
}

.stack-preview__layer {
  stroke: rgb(100 116 139 / 30%);
  stroke-width: 1;
}

.stack-preview__layer--copper {
  fill: #f97316;
}

.stack-preview__layer--dielectric {
  fill: #fde047;
}

.stack-preview__label {
  font-size: 0.82rem;
  fill: #475569;
}

.stack-preview__via {
  fill: #92400e;
  opacity: 0.85;
  stroke: #78350f;
  stroke-width: 1;
}

.stack-preview__via--microvia,
.stack-preview__via--stacked {
  fill: #b45309;
}

.stack-preview__via--blind {
  fill: #0ea5e9;
  stroke: #0369a1;
}

.stack-preview__via--buried {
  fill: #8b5cf6;
  stroke: #6d28d9;
}

.stack-preview__via--through {
  fill: #57534e;
  stroke: #44403c;
}

.stack-preview__via-label {
  font-size: 0.76rem;
  fill: #1f2937;
}
</style>
