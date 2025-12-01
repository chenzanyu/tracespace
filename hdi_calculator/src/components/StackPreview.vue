<script setup>
import { computed, reactive, ref, watch } from 'vue'

const COLORS = {
  copper: '#d68c04',
  pp: '#ffffb8',
  core: '#e0c855',
  drill: '#d68c04'
}

const props = defineProps({
  layers: {
    type: Number,
    required: true,
    validator: value => [4, 6, 8, 10, 12].includes(value)
  },
  language: {
    type: String,
    default: 'en',
    validator: value => ['en', 'zh'].includes(value)
  }
})

const LAYER_OPTIONS = [4, 6, 8, 10, 12]

const TRANSLATIONS = {
  en: {
    headings: {
      viaDefinition: 'Via Definition',
      stacking: 'Stacking',
      configuredVias: 'Configured Vias'
    },
    form: {
      viaType: 'Via Type',
      laserVia: 'Laser Via',
      mechanicalDrill: 'Mechanical Drill',
      startLayer: 'Start Layer',
      endLayer: 'End Layer',
      allowStack: 'Allow stacking from this via'
    },
    actions: {
      addVia: 'Add Via',
      clear: 'Clear',
      confirm: 'Confirm'
    },
    indicators: {
      stackFlag: 'Stack',
      emptyTip: 'No via structures defined yet'
    },
    hole: {
      range: (start, end) => `L${start} -> L${end}`
    },
    errors: {
      missingLayers: 'Please provide both start and end layers.',
      sameLayer: 'Start and end layers must differ.',
      invalidMinimum: 'Layer numbers must be greater than 0.',
      exceedMax: ({ max }) => `Layer numbers cannot exceed ${max}.`,
      laserAdjacent: 'Laser vias may only connect adjacent layers.'
    },
    stage: {
      none: 'No HDI order detected',
      anylayer: 'Any-layer HDI',
      order: order => {
        const suffixMap = { 1: 'st', 2: 'nd', 3: 'rd' }
        const suffix = suffixMap[order] || 'th'
        return `${order}${suffix}-order HDI`
      },
      descriptionNone: 'Add laser vias to determine HDI order',
      descriptionAnylayer: 'High-density any-layer stack structure',
      descriptionOrder: order => `${order} + N + ${order}`
    },
    layerLabels: {
      top: 'Top',
      bottom: 'Bot',
      middle: index => `L${index}`,
      core: 'Core',
      pp: 'PP'
    }
  },
  zh: {
    headings: {
      viaDefinition: '孔配置',
      stacking: '堆叠',
      configuredVias: '已配置孔'
    },
    form: {
      viaType: '孔类型',
      laserVia: '激光孔',
      mechanicalDrill: '机械孔',
      startLayer: '起始层',
      endLayer: '结束层',
      allowStack: '允许从此孔继续堆叠'
    },
    actions: {
      addVia: '添加孔',
      clear: '清空',
      confirm: '确认'
    },
    indicators: {
      stackFlag: '堆叠',
      emptyTip: '尚未配置任何孔'
    },
    hole: {
      range: (start, end) => `第${start}层 -> 第${end}层`
    },
    errors: {
      missingLayers: '请输入起始层和终止层。',
      sameLayer: '起始层与终止层必须不同。',
      invalidMinimum: '层号必须大于 0。',
      exceedMax: ({ max }) => `层号不能超过 ${max}。`,
      laserAdjacent: '激光孔仅可连接相邻层。'
    },
    stage: {
      none: '未检测到 HDI 阶数',
      anylayer: '任意层互联 HDI',
      order: order => `${order} 阶 HDI`,
      descriptionNone: '请添加激光孔以判定 HDI 阶数',
      descriptionAnylayer: '任意层互联堆叠结构',
      descriptionOrder: order => `${order} + N + ${order}`
    },
    layerLabels: {
      top: '顶层',
      bottom: '底层',
      middle: index => `第${index}层`,
      core: '芯板',
      pp: 'pp'
    }
  }
}

const emit = defineEmits(['update:layers', 'confirm', 'summary-change'])

const i18n = computed(() => TRANSLATIONS[props.language] ?? TRANSLATIONS.en)

const layerCount = ref(props.layers)
watch(
  () => props.layers,
  value => {
    if (LAYER_OPTIONS.includes(value)) layerCount.value = value
  }
)

watch(layerCount, value => {
  if (LAYER_OPTIONS.includes(value)) emit('update:layers', value)
})

const holeForm = reactive({
  type: 'laser',
  startLayer: 1,
  endLayer: 2,
  stacked: false
})

const holes = ref([])
const errorState = ref(null)
const errorMessage = computed(() => {
  if (!errorState.value) return ''
  const entry = i18n.value.errors[errorState.value.key]
  if (typeof entry === 'function') return entry(errorState.value.args || {})
  return entry || ''
})
const setError = (key, args = {}) => {
  errorState.value = { key, args }
}
const clearError = () => {
  errorState.value = null
}
const formatHoleRange = (start, end) => i18n.value.hole.range(start, end)
const activeHoleId = ref(null)
let nextHoleId = 1

const resetHoleForm = () => {
  holeForm.type = 'laser'
  holeForm.startLayer = 1
  holeForm.endLayer = Math.min(2, layerCount.value)
  holeForm.stacked = false
}

const addHole = () => {
  clearError()
  const { startLayer, endLayer, type, stacked } = holeForm
  const maxLayer = layerCount.value

  if (!startLayer || !endLayer) {
    setError('missingLayers')
    return
  }
  if (startLayer === endLayer) {
    setError('sameLayer')
    return
  }
  if (startLayer < 1 || endLayer < 1) {
    setError('invalidMinimum')
    return
  }
  if (startLayer > maxLayer || endLayer > maxLayer) {
    setError('exceedMax', { max: maxLayer })
    return
  }
  if (type === 'laser' && Math.abs(startLayer - endLayer) !== 1) {
    setError('laserAdjacent')
    return
  }

  holes.value.push({
    id: nextHoleId++,
    type,
    startLayer,
    endLayer,
    stacked
  })
  resetHoleForm()
}

const removeHole = id => {
  holes.value = holes.value.filter(h => h.id !== id)
}

const clearHoles = () => {
  holes.value = []
}

watch(layerCount, value => {
  holes.value = holes.value.filter(h => h.startLayer <= value && h.endLayer <= value)
  if (holeForm.startLayer > value) holeForm.startLayer = value
  if (holeForm.endLayer > value) holeForm.endLayer = Math.min(value, Math.max(holeForm.startLayer + 1, 2))
})

watch(
  () => ({ ...holeForm }),
  () => {
    if (errorState.value) clearError()
  }
)

const visualLayers = computed(() => {
  const results = []
  const total = layerCount.value
  const labels = i18n.value.layerLabels
  for (let i = 1; i <= total; i += 1) {
    results.push({
      id: `cu-${i}`,
      label: i === 1 ? labels.top : i === total ? labels.bottom : labels.middle(i),
      type: 'copper',
      copperIndex: i
    })
    if (i < total) {
      const isCore = i % 2 === 0
      results.push({
        id: `die-${i}`,
        label: '',
        type: 'dielectric',
        material: isCore ? 'Core' : 'PP',
        materialLabel: isCore ? labels.core : labels.pp
      })
    }
  }
  return results
})

const isCompact = computed(() => layerCount.value > 8)
const H_COPPER = computed(() => (isCompact.value ? 12 : 16))
const H_DIELECTRIC = computed(() => (isCompact.value ? 24 : 36))

const LAYER_WIDTH = 320
const PADDING_TOP = 4
const PADDING_LEFT = 20
const TEXT_AREA_WIDTH = 140

const renderedLayers = computed(() => {
  let currentY = PADDING_TOP
  return visualLayers.value.map(layer => {
    const height = layer.type === 'copper' ? H_COPPER.value : H_DIELECTRIC.value
    const fill =
      layer.type === 'copper'
        ? COLORS.copper
        : layer.material === 'Core'
        ? COLORS.core
        : COLORS.pp

    const result = {
      ...layer,
      y: currentY,
      height,
      bottomY: currentY + height,
      midY: currentY + height / 2,
      fill
    }
    currentY += height
    return result
  })
})

const viewBoxWidth = computed(() => PADDING_LEFT + LAYER_WIDTH + TEXT_AREA_WIDTH)
const viewBoxHeight = computed(() => {
  const last = renderedLayers.value[renderedLayers.value.length - 1]
  return last ? last.bottomY + 12 : 260
})

const renderedVias = computed(() => {
  const groups = []
  const processedIds = new Set()
  const sorted = [...holes.value].sort((a, b) => a.startLayer - b.startLayer)

  sorted.forEach(hole => {
    if (processedIds.has(hole.id)) return
    const stack = [hole]
    processedIds.add(hole.id)
    let currentEnd = hole.endLayer
    let hasNext = true
    while (hasNext) {
      const next = sorted.find(h => !processedIds.has(h.id) && h.startLayer === currentEnd && h.stacked)
      if (next) {
        stack.push(next)
        processedIds.add(next.id)
        currentEnd = next.endLayer
      } else {
        hasNext = false
      }
    }
    groups.push(stack)
  })

  const vias = []
  const contentCenterX = PADDING_LEFT + LAYER_WIDTH / 2
  const stepX = isCompact.value ? 26 : 34
  const startX = contentCenterX - ((groups.length - 1) * stepX) / 2

  groups.forEach((group, idx) => {
    const centerX = startX + idx * stepX
    group.forEach(hole => {
      const start = renderedLayers.value.find(l => l.copperIndex === hole.startLayer)
      const end = renderedLayers.value.find(l => l.copperIndex === hole.endLayer)
      if (!start || !end) return
      const yTop = Math.min(start.y, end.y)
      const yBottom = Math.max(start.bottomY, end.bottomY)
      vias.push({
        id: hole.id,
        x: centerX - 10,
        y: yTop,
        width: 20,
        height: yBottom - yTop,
        label: hole.type === 'laser' ? 'L' : 'M',
        fill: COLORS.drill,
        isActive: activeHoleId.value === hole.id
      })
    })
  })
  return vias
})

const laserCount = computed(() => holes.value.filter(h => h.type === 'laser').length)

const hdiOrderNumber = computed(() => {
  const lasers = holes.value.filter(h => h.type === 'laser')
  if (lasers.length === 0) return 0

  const adjacency = new Map()
  lasers.forEach(hole => {
    if (!adjacency.has(hole.startLayer)) adjacency.set(hole.startLayer, [])
    if (!adjacency.has(hole.endLayer)) adjacency.set(hole.endLayer, [])
    adjacency.get(hole.startLayer).push(hole.endLayer)
    adjacency.get(hole.endLayer).push(hole.startLayer)
  })

  const depthFirst = (current, visited) => {
    let maxDepth = 0
    const neighbors = adjacency.get(current) || []
    neighbors.forEach(next => {
      const edgeKey = current < next ? `${current}-${next}` : `${next}-${current}`
      if (!visited.has(edgeKey)) {
        visited.add(edgeKey)
        maxDepth = Math.max(maxDepth, 1 + depthFirst(next, visited))
        visited.delete(edgeKey)
      }
    })
    return maxDepth
  }

  let maxChain = 0
  for (const key of adjacency.keys()) {
    maxChain = Math.max(maxChain, depthFirst(key, new Set()))
  }

  return maxChain
})

const maxSupportedOrder = computed(() => {
  if (layerCount.value <= 4) return 1
  if (layerCount.value === 6) return 2
  return 3
})

const stageValue = computed(() => {
  const order = hdiOrderNumber.value
  if (order === 0) return null
  if (order > maxSupportedOrder.value) return 'anylayer'
  if (order > 3) return 'anylayer'
  return `${order}`
})

const stageDisplay = computed(() => stageValue.value ?? '0')

const stageTitle = computed(() => {
  const stage = stageValue.value
  if (stage === null) return i18n.value.stage.none
  if (stage === 'anylayer') return i18n.value.stage.anylayer
  return i18n.value.stage.order(Number(stage))
})

const stageDescription = computed(() => {
  const stage = stageValue.value
  if (stage === null) return i18n.value.stage.descriptionNone
  if (stage === 'anylayer') return i18n.value.stage.descriptionAnylayer
  return i18n.value.stage.descriptionOrder(hdiOrderNumber.value)
})

const summaryInfo = computed(() => ({
  stage: stageValue.value,
  stageDisplay: stageDisplay.value,
  title: stageTitle.value,
  description: stageDescription.value,
  layers: layerCount.value,
  laserCount: laserCount.value,
  totalHoles: holes.value.length
}))

watch(summaryInfo, value => emit('summary-change', value), { immediate: true })

const handleConfirm = () => {
  emit('confirm', { layers: layerCount.value, stage: stageValue.value })
}
</script>

<template>
  <div class="stack-shell">
    <div class="stack-wrapper">
      <section class="panel settings">
        <div class="card">
          <div class="card-header">
            <h3>{{ i18n.headings.viaDefinition }}</h3>
            <span class="muted">{{ i18n.headings.stacking }}</span>
          </div>
          <div class="form-grid">
            <label class="label">{{ i18n.form.viaType }}</label>
            <select v-model="holeForm.type" class="input-select">
              <option value="laser">{{ i18n.form.laserVia }}</option>
              <option value="mechanical">{{ i18n.form.mechanicalDrill }}</option>
            </select>

            <label class="label">{{ i18n.form.startLayer }}</label>
            <input v-model.number="holeForm.startLayer" type="number" min="1" :max="layerCount" class="input-number" />

            <label class="label">{{ i18n.form.endLayer }}</label>
            <input v-model.number="holeForm.endLayer" type="number" min="1" :max="layerCount" class="input-number" />
          </div>

          <label class="checkbox">
            <input v-model="holeForm.stacked" type="checkbox" />
            <span>{{ i18n.form.allowStack }}</span>
          </label>

          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

          <button class="btn" type="button" @click="addHole">{{ i18n.actions.addVia }}</button>
        </div>

        <div class="card hole-card">
          <div class="card-header">
            <h3>{{ i18n.headings.configuredVias }} ({{ holes.length }})</h3>
            <button v-if="holes.length" class="btn-link" type="button" @click="clearHoles">{{ i18n.actions.clear }}</button>
          </div>

          <div v-if="holes.length" class="hole-list">
            <div
              v-for="hole in holes"
              :key="hole.id"
              class="hole-item"
              :class="{ active: activeHoleId === hole.id }"
              @mouseenter="activeHoleId = hole.id"
              @mouseleave="activeHoleId = null"
            >
              <div class="hole-info">
                <span class="hole-badge" :class="hole.type">{{ hole.type === 'laser' ? 'L' : 'M' }}</span>
                <span class="hole-text">{{ formatHoleRange(hole.startLayer, hole.endLayer) }}</span>
                <span v-if="hole.stacked" class="stack-flag">{{ i18n.indicators.stackFlag }}</span>
              </div>
              <button class="btn-remove" type="button" @click="removeHole(hole.id)">×</button>
            </div>
          </div>
          <div v-else class="empty-tip">{{ i18n.indicators.emptyTip }}</div>
        </div>
      </section>

      <section class="panel preview">
        <div class="card canvas-card">
          <svg :width="viewBoxWidth" :height="viewBoxHeight" :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`" class="stackup-svg">
            <g v-for="layer in renderedLayers" :key="layer.id">
              <rect :x="PADDING_LEFT" :y="layer.y" :width="LAYER_WIDTH" :height="layer.height" :fill="layer.fill" rx="2" />
              <text
                v-if="layer.type === 'copper'"
                :x="PADDING_LEFT + LAYER_WIDTH + 12"
                :y="layer.midY"
                dy="0.35em"
                class="label-copper"
              >
                {{ layer.label }}
              </text>
              <text
                v-else
                :x="PADDING_LEFT + LAYER_WIDTH + 12"
                :y="layer.midY"
                dy="0.35em"
                class="label-material"
                :class="layer.material"
              >
                {{ layer.materialLabel ?? layer.material }}
              </text>
            </g>

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
              <text :x="via.x + via.width / 2" :y="via.y + via.height / 2" dy="0.35em" class="via-text">
                {{ via.label }}
              </text>
            </g>
          </svg>
        </div>
      </section>
    </div>

      <div class="stack-footer">
        <button class="btn confirm" type="button" @click="handleConfirm">{{ i18n.actions.confirm }}</button>
      </div>
  </div>
</template>

<style scoped>
.stack-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
}

.stack-wrapper {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 16px;
  align-items: stretch;
  min-height: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.settings {
  width: 300px;
  flex-shrink: 0;
}

.preview {
  flex: 1;
  min-height: 0;
}

.card {
  background: #ffffff;
  border-radius: 10px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-header h3 {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
}

.muted {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.label {
  display: block;
  font-size: 11px;
  color: #475569;
  margin-bottom: 4px;
  font-weight: 600;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-items: center;
}

.input-select,
.input-number {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
  color: #0f172a;
  background: #f8fafc;
}

.input-number::-webkit-outer-spin-button,
.input-number::-webkit-inner-spin-button {
  margin: 0;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #475569;
  margin: 10px 0;
}

.error-text {
  font-size: 11px;
  color: #dc2626;
  background: #fef2f2;
  border-radius: 6px;
  padding: 6px;
  border: 1px solid #fecaca;
  margin-bottom: 6px;
}

.btn {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 34px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb, #6366f1);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.btn:hover {
  box-shadow: 0 8px 16px rgba(79, 70, 229, 0.25);
  transform: translateY(-1px);
}

.btn-link {
  background: none;
  border: none;
  color: #2563eb;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.hole-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.hole-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  padding-right: 2px;
}

.hole-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.hole-item.active {
  border-color: #6366f1;
  background: #eef2ff;
}

.hole-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hole-badge {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 22px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 700;
  color: #1f2937;
}

.hole-badge.laser {
  background: #fef3c7;
  color: #b45309;
}

.hole-badge.mechanical {
  background: #e0e7ff;
  color: #312e81;
}

.hole-text {
  font-size: 12px;
  color: #0f172a;
}

.stack-flag {
  font-size: 10px;
  color: #16a34a;
  background: #dcfce7;
  padding: 0 5px;
  border-radius: 5px;
}

.btn-remove {
  border: none;
  background: none;
  color: #94a3b8;
  font-size: 17px;
  cursor: pointer;
}

.empty-tip {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 12px;
}

.canvas-card {
  padding: 16px 24px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.stackup-svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

.label-copper {
  font-size: 12px;
  font-weight: 700;
  fill: #0f172a;
}

.label-material {
  font-size: 11px;
  fill: #475569;
}

.label-material.Core {
  fill: #a16207;
}

.label-material.PP {
  fill: #6b7280;
}

.via-shape {
  stroke: #ffffff;
  stroke-width: 1.5px;
  fill-opacity: 0.9;
  transition: fill 0.2s ease;
}

.via-shape.active {
  fill: #dc2626 !important;
}

.via-text {
  font-size: 10px;
  fill: #fff;
  font-weight: 700;
  text-anchor: middle;
}

.stack-footer {
  border-top: 1px solid #e2e8f0;
  padding: 12px 16px;
  background: #ffffff;
  display: flex;
  justify-content: flex-end;
}

.stack-footer .btn.confirm {
  width: auto;
  padding: 0 24px;
}
</style>
