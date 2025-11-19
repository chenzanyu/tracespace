<script setup>
import { computed, reactive, ref, watch } from 'vue'
import StackPreview from './components/StackPreview.vue'

// --- 配置常量 ---
const ALLOWED_LAYERS = [4, 6, 8, 10, 12]

// --- 显式颜色配置 ---
const VIEW_COLORS = {
  copper: '#d68c04',   // 铜层
  pp: '#ffffb8',       // PP
  core: '#e0c855',     // Core
  drill: '#d68c04',    // 钻孔
}

// --- 状态管理 ---
const layerForm = reactive({
  totalLayers: 6, 
})

const holeForm = reactive({
  startLayer: 1,
  endLayer: 2,
  type: 'laser',
  stacked: false,
})

const activeHoleId = ref(null)
const errorMessage = ref('')
let nextHoleId = 1

// 初始数据
const holes = ref([
  { id: nextHoleId++, type: 'laser', startLayer: 1, endLayer: 2, stacked: true },
  { id: nextHoleId++, type: 'mechanical', startLayer: 2, endLayer: 5, stacked: false },
])

// --- 核心算法：HDI 阶数计算 ---
const hdiAnalysis = computed(() => {
  const lasers = holes.value.filter(h => h.type === 'laser')
  
  // 1. 构建邻接表
  const adj = new Map()
  lasers.forEach(h => {
    if (!adj.has(h.startLayer)) adj.set(h.startLayer, [])
    if (!adj.has(h.endLayer)) adj.set(h.endLayer, [])
    adj.get(h.startLayer).push(h.endLayer)
    adj.get(h.endLayer).push(h.startLayer)
  })

  // 2. DFS 寻找最长链路 (阶数)
  const getDepth = (current, visitedEdges) => {
    let maxD = 0
    const neighbors = adj.get(current) || []
    neighbors.forEach(next => {
      const edgeId = current < next ? `${current}-${next}` : `${next}-${current}`
      if (!visitedEdges.has(edgeId)) {
        visitedEdges.add(edgeId)
        maxD = Math.max(maxD, 1 + getDepth(next, visitedEdges))
        visitedEdges.delete(edgeId)
      }
    })
    return maxD
  }

  let maxChainLength = 0
  for (const [startLayer] of adj) {
    maxChainLength = Math.max(maxChainLength, getDepth(startLayer, new Set()))
  }

  // 3. 生成描述文本
  let title = ''
  let sub = ''

  if (maxChainLength === 0) {
    title = '通孔板 / 多层板'
    sub = 'Standard Through-Hole'
  } else {
    // 标题
    if (maxChainLength === 1) title = '一阶 HDI'
    else if (maxChainLength === 2) title = '二阶 HDI'
    else if (maxChainLength >= 3) title = `${maxChainLength}阶 HDI`
    
    // 描述改为 X+N+X 格式
    // 这里假设对称结构，直接用 maxChainLength 作为阶数
    sub = `${maxChainLength} + N + ${maxChainLength}`
  }

  return { title, sub }
})

// --- 视图层数据生成 ---
const visualLayers = computed(() => {
  const arr = []
  const total = layerForm.totalLayers
  for (let i = 1; i <= total; i++) {
    arr.push({
      id: `cu-${i}`,
      label: i === 1 ? 'Top' : (i === total ? 'Bot' : `L${i}`),
      type: 'copper',
      copperIndex: i
    })
    if (i < total) {
      const isCore = (i % 2 === 0) 
      arr.push({
        id: `d-${i}`,
        label: '',
        type: 'dielectric',
        material: isCore ? 'Core' : 'PP'
      })
    }
  }
  return arr
})

// --- 交互与校验 ---
const addHole = () => {
  errorMessage.value = ''
  const { startLayer, endLayer, type, stacked } = holeForm
  const total = layerForm.totalLayers

  if (!startLayer || !endLayer) { errorMessage.value = '请输入层号'; return }
  if (startLayer <= 0 || endLayer <= 0) { errorMessage.value = '层号需 > 0'; return }
  if (startLayer > total || endLayer > total) { errorMessage.value = `层号不能 > ${total}`; return }
  if (startLayer === endLayer) { errorMessage.value = '起止层不能相同'; return }

  if (type === 'laser') {
    if (Math.abs(startLayer - endLayer) !== 1) {
      errorMessage.value = '激光孔只能连接相邻层 (如 L1-L2)'
      return
    }
  }
  
  holes.value.push({ 
    id: nextHoleId++, 
    type, 
    startLayer, 
    endLayer, 
    stacked 
  })
}

const removeHole = (id) => {
  holes.value = holes.value.filter(h => h.id !== id)
}

const clearAllHoles = () => {
  holes.value = []
  errorMessage.value = ''
}

watch(() => layerForm.totalLayers, (val) => {
  holes.value = holes.value.filter(h => h.startLayer <= val && h.endLayer <= val)
  errorMessage.value = ''
})
watch(holeForm, () => { if (errorMessage.value) errorMessage.value = '' })
</script>

<template>
  <div class="hdi-container">
    <!-- 左侧设置面板 -->
    <div class="panel-settings">
      
      <div class="result-card">
        <div class="result-title">{{ hdiAnalysis.title }}</div>
        <div class="result-sub">{{ hdiAnalysis.sub }}</div>
      </div>

      <div class="control-group">
        <label class="label-title">PCB 层数</label>
        <select v-model.number="layerForm.totalLayers" class="input-select">
          <option v-for="n in ALLOWED_LAYERS" :key="n" :value="n">{{ n }} 层板</option>
        </select>
      </div>

      <div class="control-group">
        <label class="label-title">添加钻孔</label>
        <div class="add-box">
          <select v-model="holeForm.type" class="input-select sm-mb">
            <option value="laser">激光钻孔 (Laser)</option>
            <option value="mechanical">机械钻孔 (Mech)</option>
          </select>
          
          <div class="range-row">
            <div class="input-wrapper">
              <span>L</span>
              <input type="number" v-model.number="holeForm.startLayer" min="1" class="input-num">
            </div>
            <span class="arrow">➜</span>
            <div class="input-wrapper">
              <span>L</span>
              <input type="number" v-model.number="holeForm.endLayer" :max="layerForm.totalLayers" class="input-num">
            </div>
            <button @click="addHole" class="btn-add">添加</button>
          </div>

          <div v-if="errorMessage" class="error-text">{{ errorMessage }}</div>

          <label class="check-row">
            <input type="checkbox" v-model="holeForm.stacked"> 
            <span>允许堆叠 (Stacked)</span>
          </label>
        </div>
      </div>

      <div class="list-header">
        <label class="label-title">已添加 ({{ holes.length }})</label>
        <button v-if="holes.length > 0" @click="clearAllHoles" class="btn-clear">清空</button>
      </div>
      
      <!-- 列表优化：Grid 布局，一行两项 -->
      <div class="hole-list">
        <div 
          v-for="h in holes" 
          :key="h.id" 
          class="hole-item"
          @mouseenter="activeHoleId = h.id"
          @mouseleave="activeHoleId = null"
          :class="{ active: activeHoleId === h.id }"
        >
          <div class="hole-info">
            <span class="badge" :class="h.type">{{ h.type === 'laser' ? 'L' : 'M' }}</span>
            <span class="hole-text">{{ h.startLayer }}-{{ h.endLayer }}</span>
            <span v-if="h.stacked" class="badge-stack">叠</span>
          </div>
          <button @click="removeHole(h.id)" class="btn-del">×</button>
        </div>
        <div v-if="holes.length === 0" class="empty-tip">无数据</div>
      </div>

    </div>

    <!-- 右侧预览视图 -->
    <div class="panel-preview">
      <StackPreview 
        :visual-layers="visualLayers" 
        :holes="holes"
        :active-hole-id="activeHoleId"
        :colors="VIEW_COLORS" 
      />
    </div>
  </div>
</template>

<style scoped>
.hdi-container {
  display: flex;
  flex-direction: row;
  height: 100vh;
  background-color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #334155;
  overflow: hidden;
}

/* 左侧面板 */
.panel-settings {
  width: 260px; /* 稍微加宽以容纳一行两列 */
  background: #ffffff;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}

.result-card {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 12px;
  text-align: center;
}
.result-title { color: #1e40af; font-weight: 700; font-size: 16px; margin-bottom: 4px; }
.result-sub { color: #60a5fa; font-size: 13px; font-weight: 600; font-family: monospace; }

.control-group { display: flex; flex-direction: column; gap: 5px; }
.label-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
.input-select { width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; background: white; cursor: pointer; }

.add-box { background: #f1f5f9; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
.sm-mb { margin-bottom: 8px; }
.range-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }

/* 输入框宽度增加 */
.input-wrapper { display: flex; align-items: center; background: white; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; flex: 1; }
.input-wrapper span { background: #f8fafc; padding: 0 6px; font-size: 12px; color: #64748b; border-right: 1px solid #e2e8f0; line-height: 26px; }
.input-num { border: none; width: 100%; text-align: center; font-size: 13px; outline: none; padding: 5px 0; min-width: 30px; }

.arrow { font-size: 12px; color: #94a3b8; }
.btn-add { background: #334155; color: white; border: none; padding: 0 12px; height: 28px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; }
.check-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #475569; cursor: pointer; margin-top: 4px;}

.error-text {
  font-size: 11px; color: #ef4444; background: #fef2f2; padding: 4px 6px; border-radius: 4px; margin-bottom: 6px; border: 1px solid #fecaca;
}

.list-header { display: flex; justify-content: space-between; align-items: center; margin-top: 4px;}
.btn-clear { background: none; border: none; color: #ef4444; font-size: 11px; cursor: pointer; }

/* 列表 Grid 布局优化 */
.hole-list {
  flex: 1;
  overflow-y: auto;
  display: grid; /* 使用 Grid */
  grid-template-columns: 1fr 1fr; /* 两列 */
  gap: 8px; /* 间距 */
  align-content: start;
}

.hole-item {
  display: flex; justify-content: space-between; align-items: center; padding: 6px 8px;
  background: white; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer; transition: all 0.1s;
  min-width: 0; /* 防止 flex 子项溢出 */
}
.hole-item:hover, .hole-item.active { border-color: #3b82f6; background: #eff6ff; }

.hole-info { display: flex; align-items: center; gap: 4px; min-width: 0; }
.badge { font-size: 9px; padding: 1px 3px; border-radius: 3px; font-weight: 700; min-width: 12px; text-align: center; flex-shrink: 0; }
.badge.laser { background: #ffedd5; color: #c2410c; }
.badge.mechanical { background: #e0e7ff; color: #4338ca; }
.hole-text { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge-stack { font-size: 9px; background: #cbd5e1; color: white; padding: 0 2px; border-radius: 2px; flex-shrink: 0; }

.btn-del { background: none; border: none; color: #cbd5e1; font-size: 16px; cursor: pointer; padding: 0; margin-left: 2px; }
.btn-del:hover { color: #ef4444; }

.empty-tip { grid-column: 1 / -1; text-align: center; font-size: 11px; color: #cbd5e1; margin-top: 10px; }

/* 右侧预览区 */
.panel-preview {
  flex: 1;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  /* 顶部内边距与左侧面板内容一致 (左侧有20px padding) */
  padding: 20px 0 0 40px; 
  overflow: auto;
  background: #f8fafc;
}
</style>