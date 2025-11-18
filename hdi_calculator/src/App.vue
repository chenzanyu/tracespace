<script setup>
import { computed, reactive, ref } from 'vue'
import StackPreview from './components/StackPreview.vue'

const MAX_LAYERS = 20
const MIN_LAYERS = 4

const defaultStacks = [
  { name: '4L 原生 HDI (1+N+1)', layers: 6 },
  { name: '6L 两阶 (2+N+2)', layers: 8 },
  { name: '8L 三阶 (3+N+3)', layers: 10 },
]

const layerForm = reactive({
  totalLayers: 8,
  prepregCount: 3,
  dielectricType: 'FR-4',
})

const holeForm = reactive({
  name: 'Laser 1-2',
  startLayer: 1,
  endLayer: 2,
  type: 'microvia',
  stacked: true,
})

let holeId = 1
const holes = ref([
  {
    id: holeId++,
    name: 'Laser 1-2',
    type: 'microvia',
    startLayer: 1,
    endLayer: 2,
    stacked: true,
  },
  {
    id: holeId++,
    name: 'Buried 3-6',
    type: 'buried',
    startLayer: 3,
    endLayer: 6,
    stacked: false,
  },
])

const copperLayers = computed(() =>
  Array.from({ length: layerForm.totalLayers }, (_, index) => {
    if (index === 0) return 'Top Copper'
    if (index === layerForm.totalLayers - 1) return 'Bottom Copper'
    return `Inner ${index}`
  })
)

const visualLayers = computed(() => {
  const visuals = []
  copperLayers.value.forEach((layerName, index) => {
    visuals.push({
      id: `${layerName}-copper`,
      label: layerName,
      type: 'copper',
      copperIndex: index + 1,
    })
    if (index < copperLayers.value.length - 1) {
      visuals.push({
        id: `${layerName}-dielectric`,
        label: index % 2 === 0 ? 'PP' : 'Core',
        type: 'dielectric',
      })
    }
  })
  return visuals
})

const addHole = () => {
  if (holeForm.startLayer >= holeForm.endLayer) return
  holes.value.push({
    id: holeId++,
    name: holeForm.name,
    type: holeForm.type,
    startLayer: holeForm.startLayer,
    endLayer: holeForm.endLayer,
    stacked: holeForm.stacked,
  })
}

const removeHole = id => {
  holes.value = holes.value.filter(hole => hole.id !== id)
}

const resetHoleForm = () => {
  holeForm.name = 'Laser 1-2'
  holeForm.startLayer = 1
  holeForm.endLayer = 2
  holeForm.type = 'microvia'
  holeForm.stacked = true
}

const hdiLevel = computed(() => {
  const microviaCount = holes.value.filter(
    hole => hole.type === 'microvia'
  ).length
  if (microviaCount === 0) return '传统过孔板'
  if (microviaCount <= 2) return '一阶 HDI'
  if (microviaCount <= 4) return '二阶 HDI'
  return '三阶及以上 HDI'
})

const holeOptions = [
  { label: '激光过孔 (Microvia)', value: 'microvia' },
  { label: '盲孔 (Blind Via)', value: 'blind' },
  { label: '埋孔 (Buried Via)', value: 'buried' },
  { label: '通孔 (Through)', value: 'through' },
]

const fillFromPreset = preset => {
  layerForm.totalLayers = preset.layers
  holeForm.startLayer = 1
  holeForm.endLayer = Math.min(2, preset.layers)
}

const limitedLayers = computed(() =>
  Math.min(Math.max(layerForm.totalLayers, MIN_LAYERS), MAX_LAYERS)
)
</script>

<template>
  <div class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">HDI Stackup Assistant</p>
        <h1>快速评估 HDI 阶数与钻孔结构</h1>
        <p class="subtitle">
          选择层数与过孔组合后，系统自动识别 HDI 阶数并生成堆叠图。
        </p>
        <div class="hero__buttons">
          <button
            v-for="preset in defaultStacks"
            :key="preset.name"
            class="ghost"
            @click="fillFromPreset(preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>

      <div class="hero__summary">
        <p class="summary-title">当前判断</p>
        <p class="summary-value">{{ hdiLevel }}</p>
        <p class="summary-meta">
          层数: {{ limitedLayers }} · 钻孔结构: {{ holes.length }} 组
        </p>
      </div>
    </header>

    <main class="layout">
      <section class="panel">
        <h2>层数设置</h2>

        <div class="form-grid">
          <label>
            总层数
            <input
              v-model.number="layerForm.totalLayers"
              type="number"
              :min="MIN_LAYERS"
              :max="MAX_LAYERS"
            />
          </label>

          <label>
            PP 张数
            <input v-model.number="layerForm.prepregCount" type="number" min="1" />
          </label>

          <label>
            介质类型
            <select v-model="layerForm.dielectricType">
              <option value="FR-4">FR-4</option>
              <option value="BT">BT</option>
              <option value="PI">PI</option>
            </select>
          </label>
        </div>
      </section>

      <section class="panel">
        <h2>钻孔结构</h2>

        <form
          class="hole-form"
          @submit.prevent="
            addHole();
            resetHoleForm();
          "
        >
          <label>
            名称
            <input v-model="holeForm.name" />
          </label>

          <label>
            起始层
            <input v-model.number="holeForm.startLayer" type="number" min="1" />
          </label>

          <label>
            终止层
            <input v-model.number="holeForm.endLayer" type="number" :max="limitedLayers" />
          </label>

          <label>
            类型
            <select v-model="holeForm.type">
              <option v-for="option in holeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="checkbox">
            <input v-model="holeForm.stacked" type="checkbox" />
            允许堆叠
          </label>

          <button type="submit">添加结构</button>
        </form>

        <div class="hole-list">
          <article v-for="hole in holes" :key="hole.id" class="hole-card">
            <div>
              <p class="hole-card__title">{{ hole.name }}</p>
              <p class="hole-card__meta">
                {{ hole.startLayer }} → {{ hole.endLayer }}
              </p>
              <span class="pill" :class="hole.type">
                {{ holeOptions.find(option => option.value === hole.type)?.label }}
              </span>
              <span v-if="hole.stacked" class="pill stacked">堆叠</span>
            </div>
            <button class="ghost" @click="removeHole(hole.id)">删除</button>
          </article>
        </div>
      </section>

      <section class="panel panel--preview">
        <h2>堆叠与过孔预览</h2>

        <StackPreview :visual-layers="visualLayers" :holes="holes" />
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
}

.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2rem;
  align-items: center;
  margin-bottom: 2rem;
}

.hero__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
}

.hero__summary {
  background: linear-gradient(135deg, #f97316, #facc15);
  color: #fff;
  border-radius: 16px;
  padding: 1.5rem;
  min-width: 250px;
  box-shadow: 0 20px 40px rgb(249 115 22 / 35%);
}

.summary-title {
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 0.18em;
  opacity: 0.85;
}

.summary-value {
  font-size: 1.75rem;
  margin: 0.5rem 0;
  font-weight: 700;
}

.summary-meta {
  opacity: 0.9;
  font-size: 0.9rem;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.85rem;
  color: #f97316;
}

h1 {
  margin: 0.75rem 0;
  font-size: 2.4rem;
  color: #0f172a;
}

.subtitle {
  color: #475569;
  font-size: 1rem;
  max-width: 620px;
}

.layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.panel {
  background: rgb(255 255 255 / 90%);
  border-radius: 18px;
  padding: 1.5rem;
  box-shadow: 0 15px 35px rgb(15 23 42 / 8%);
}

.panel--preview {
  grid-column: 1 / -1;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1.25rem;
}

.hole-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.hole-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hole-card {
  background: #f8fafc;
  border-radius: 12px;
  padding: 0.9rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.hole-card__title {
  font-weight: 600;
  margin: 0;
  color: #0f172a;
}

.hole-card__meta {
  margin: 0.25rem 0;
  color: #475569;
  font-size: 0.9rem;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.ghost {
  background: transparent;
  border: 1px solid rgb(255 255 255 / 35%);
  color: inherit;
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  font-weight: 600;
}

.panel button.ghost {
  border-color: #94a3b8;
  color: #334155;
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .hero__summary {
    width: 100%;
  }
}
</style>
