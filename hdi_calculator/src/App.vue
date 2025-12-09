<script setup>
import { ref } from 'vue'
import StackPreview from './components/StackPreview.vue'

const LAYER_OPTIONS = [4, 6, 8, 10, 12]

const showDialog = ref(true)
const layers = ref(6)
const language = 'en'
const lastResult = ref(null)
const headerSummary = ref({
  stageDisplay: '0',
  title: 'No HDI order detected',
  description: 'Add laser vias to determine HDI order',
  layers: layers.value,
  laserCount: 0,
  totalHoles: 0,
  stage: null
})

const openDialog = () => {
  showDialog.value = true
}

const closeDialog = () => {
  showDialog.value = false
}

const handleSummaryChange = summary => {
  headerSummary.value = summary
}

const handleConfirm = ({ layers: confirmedLayers, stage }) => {
  lastResult.value = { layers: confirmedLayers, stage }
  closeDialog()
}
</script>

<template>
  <div class="app-shell">
    <div class="intro-card">
      <p class="eyebrow">HDI Stack Preview</p>
      <h1>Configure layer counts and via stacks to evaluate HDI order</h1>
      <p class="subtitle">StackPreview handles the calculation logic while this shell simply presents the component.</p>

      <div class="actions">
        <button class="btn-primary" type="button" @click="openDialog">Open StackPreview</button>
        <p v-if="lastResult" class="result-text">
          Latest result: {{ lastResult.layers }} layers · Order {{ lastResult.stage ?? 'Not detected' }}
        </p>
      </div>
    </div>

    <transition name="fade">
      <div v-if="showDialog" class="modal-backdrop">
        <div class="modal">
          <div class="modal-header">
            <div class="header-left">
              <h2>StackPreview</h2>
              <p>Determine HDI order based on via architecture</p>
            </div>
            <div class="status-panel">
              <div class="panel-select">
                <div class="control-label-row">
                  <label class="control-label">PCB Layers</label>
                  <span>LAYERS</span>
                </div>
                <select v-model.number="layers" class="control-select">
                  <option v-for="option in LAYER_OPTIONS" :key="option" :value="option">
                    {{ option }}-layer
                  </option>
                </select>
              </div>

              <div class="panel-summary" v-if="headerSummary">
                <div class="order-badge">{{ headerSummary.stageDisplay }}</div>
                <div class="summary-copy">
                  <div class="summary-title">{{ headerSummary.title }}</div>
                  <div class="summary-meta">
                    Layers {{ headerSummary.layers }} · Laser vias {{ headerSummary.laserCount }} · Total vias {{ headerSummary.totalHoles }}
                  </div>
                </div>
              </div>
            </div>
            <button class="btn-close" type="button" @click="closeDialog">×</button>
          </div>
          <div class="modal-body">
            <StackPreview
              class="stack-component"
              v-model:layers="layers"
              v-model:language="language"
              @summary-change="handleSummaryChange"
              @confirm="handleConfirm"
            />
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: linear-gradient(120deg, #e2e8f0, #f8fafc);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #0f172a;
}

.intro-card {
  background: #ffffff;
  padding: 32px;
  border-radius: 24px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
  max-width: 520px;
}

.eyebrow {
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.2em;
  margin-bottom: 8px;
}

h1 {
  font-size: 28px;
  margin: 0 0 10px;
}

.subtitle {
  font-size: 15px;
  color: #475569;
  margin: 0 0 20px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-primary {
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(124, 58, 237, 0.3);
}

.result-text {
  font-size: 13px;
  color: #0f172a;
  background: #eef2ff;
  padding: 10px 12px;
  border-radius: 10px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  z-index: 10;
}

.modal {
  width: min(1100px, 96vw);
  height: 90vh;
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 20px;
  border-bottom: 1px solid #e2e8f0;
  padding: 14px 24px;
}

.header-left {
  flex: 1;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}

.header-left p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

.status-panel {
  display: flex;
  align-items: stretch;
  gap: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 12px 16px;
}

.panel-select {
  width: 220px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.control-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.control-label-row span {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.control-label {
  font-size: 12px;
  color: #475569;
  font-weight: 600;
}

.control-select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 14px;
  background: #ffffff;
}

.panel-summary {
  display: flex;
  gap: 10px;
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 10px 18px;
  min-width: 280px;
}

.panel-summary .order-badge {
  min-width: 56px;
  height: 56px;
  border-radius: 18px;
  background: radial-gradient(circle at 30% 30%, #fcd34d, #f59e0b);
  color: #0f172a;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 12px;
  box-sizing: border-box;
}

.summary-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.summary-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-meta {
  font-size: 12px;
  color: #94a3b8;
}

.btn-close {
  border: none;
  background: none;
  font-size: 28px;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  margin-left: auto;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  background: #f1f5f9;
  display: flex;
  flex-direction: column;
}

.stack-component {
  height: 100%;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
