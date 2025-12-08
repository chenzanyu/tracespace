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
            <div class="layer-list-scroll flex flex-col flex-1 overflow-y-auto px-4 pb-4">
              <div class="sticky top-0 -mx-4 px-4 py-3 bg-gradient-to-b from-gray-900 to-gray-800 border-b border-gray-800 z-10">
                <div class="flex items-center gap-2 text-xs text-gray-300 flex-wrap">
                  <button class="px-2 py-1 border rounded text-gray-100" @click="setAllVisible(true)">全部显示</button>
                  <button class="px-2 py-1 border rounded text-gray-100" @click="setAllVisible(false)">全部隐藏</button>
                  <label class="flex items-center gap-1 select-none cursor-pointer ml-auto">
                    <input type="checkbox" v-model="showFilenames" /> 显示文件名
                  </label>
                </div>
              </div>
              <div class="space-y-2 mt-3">
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
                class="px-4 py-3.5 rounded-md bg-gray-900/80 text-white border border-white/30 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
                title="显示设置" @click.stop="toggleDisplayMenu">
                <span class="pi pi-palette text-lg"></span>
              </button>
              <div v-if="displayMenuOpen"
                class="absolute left-0 mt-3 ml-2 w-[320px] rounded-xl border border-gray-700 bg-gray-900/95 text-sm text-white shadow-xl z-50 px-3 py-2.5 space-y-3"
                style="transform: translateX(0)" @click.stop>
                <div class="text-xs font-semibold text-gray-300 tracking-wide">3D 显示设置</div>
                <div class="grid grid-cols-2 gap-2">
                  <div v-for="item in pcb3dColorOptions" :key="item.key"
                    class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex flex-col gap-1">
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
                title="导出" @click.stop="toggleDownloadMenu">
                <span class="pi pi-download"></span>
              </button>
              <div v-if="downloadMenuOpen"
                class="absolute mt-2 w-56 rounded-md border border-gray-700 bg-gray-900/95 text-sm text-white shadow-xl z-50 overflow-hidden">
                <button class="block w-full text-left px-3 py-2 hover:bg-gray-800 border-b border-gray-800/60"
                  @click.stop="downloadPcbAsset('image-current')">
                  导出图片
                </button>
                <button class="block w-full text-left px-3 py-2 hover:bg-gray-800"
                  @click.stop="downloadPcbAsset('gltf')">
                  导出 glTF 模型
                </button>
              </div>
            </div>

            <button
              class="px-4 py-3 rounded-md bg-gray-900/80 text-white border border-white/30 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:bg-gray-800 transition"
              title="性能监控" @click="openPerfModal">
              <span class="pi pi-chart-line text-lg"></span>
              <span class="text-xs font-semibold uppercase tracking-wide">性能</span>
            </button>
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
          @perf-stats="handleLayerPerfEvent" />

        <div v-if="activeView === 'layers' && showLayerPreviewLoading"
          class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/50 text-white pointer-events-none">
          <div class="loading-spinner"></div>
          <div class="text-center space-y-1">
            <p class="text-sm tracking-wide uppercase text-white/70">loading</p>
            <p class="text-base font-semibold">层叠预览准备中…</p>
          </div>
        </div>

        <!-- 3D 视图 -->
        <Pcb3dPreview ref="pcb3dRef" v-show="activeView === '3d'" :model-data="pcb3dModel" :thickness="boardThicknessUnits"
          :active="activeView === '3d'" :container-width="previewContainerWidth"
          :container-height="previewContainerHeight" :display-width="previewSize.width"
          :display-height="previewSize.height" :explosion-active="explosionActive"
          :explosion-spacing-multiplier="explosionSpacing" :border-color="pcb3dColors.core"
          :core-color="pcb3dColors.core" :layer-colors="pcb3dColors" :layer-visibility="pcb3dVisibility"
          :layer-simplify-tolerances-mm="layerSimplifyTolerancesMm"
          :fitPadding="1.55"
          :drillLimit="drillLimit"
          @loading-change="handlePcb3dLoading"
          @perf-stats="handleViewerPerfEvent" />

        <div v-if="activeView === '3d' && showPcb3dPreviewLoading"
          class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/50 text-white pointer-events-none">
          <div class="loading-spinner"></div>
          <div class="text-center space-y-1">
            <p class="text-sm tracking-wide uppercase text-white/70">loading</p>
            <p class="text-base font-semibold">3D 预览生成中…</p>
          </div>
        </div>
      </section>
    </div>

    <!-- 设置弹窗 -->
    <div v-if="isSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="isSettingsOpen = false"></div>
      <div
        class="relative bg-gray-900 text-gray-100 w-[900px] max-w-[92vw] max-h-[85vh] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div class="text-lg font-semibold tracking-wide">图层设置</div>
          <button
            class="px-4 py-2 text-sm border border-gray-600 rounded-lg hover:bg-gray-800 transition"
            @click="isSettingsOpen = false">
            关闭
          </button>
        </div>
        <div class="p-6 overflow-auto max-h-[65vh] space-y-4">
          <div
            v-for="item in editableLayers"
            :key="item.id"
            class="rounded-xl p-4 md:p-5 flex flex-wrap items-center gap-4 transition-all"
            :class="duplicateLayerIds.has(item.id) ? 'border border-rose-500 bg-rose-500/10 shadow-[0_0_0_1px_rgba(244,63,94,0.4)]' : 'border border-gray-700'"
          >
            <div class="flex-1 min-w-[240px] space-y-1">
              <div class="text-sm font-semibold truncate">{{ item.filename }}</div>
              <div
                v-if="duplicateLayerIds.has(item.id)"
                class="text-sm font-semibold text-rose-300 tracking-wide"
              >
                唯一层冲突
              </div>
            </div>
            <div class="flex items-center gap-3">
              <label class="text-sm text-gray-300 uppercase tracking-wide">type</label>
              <select
                v-model="item.type"
                class="settings-select bg-gray-800/90 border border-gray-700 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                @change="item.side = coerceSideForType(item.type, item.side)">
                <option value="copper">copper</option>
                <option value="soldermask">soldermask</option>
                <option value="solderpaste">solderpaste</option>
                <option value="silkscreen">silkscreen</option>
                <option value="drill">drill</option>
                <option value="outline">outline</option>
                <option value="drawing">drawing</option>
              </select>
            </div>
            <div class="flex items-center gap-3">
              <label class="text-sm text-gray-300 uppercase tracking-wide">side</label>
              <select
                v-model="item.side"
                class="settings-select bg-gray-800/90 border border-gray-700 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
                <option v-for="opt in allowedSides(item.type)" :key="(opt ?? 'na')" :value="opt">{{ opt ?? 'n/a' }}
                </option>
              </select>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-700 flex flex-col gap-3">
          <div v-if="settingsSaveDisabledReason" class="text-sm text-amber-400 text-right leading-relaxed">
            {{ settingsSaveDisabledReason }}
          </div>
          <div class="flex items-center justify-end gap-3">
            <button
              class="px-4 py-2 text-sm border border-gray-600 rounded-lg hover:bg-gray-800 transition"
              @click="isSettingsOpen = false">
              取消
            </button>
            <button
              class="px-5 py-2.5 text-sm font-semibold border border-transparent rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition"
              :class="{ 'opacity-50 cursor-not-allowed': settingsSaveDisabledReason }"
              :disabled="Boolean(settingsSaveDisabledReason)"
              @click="applySettings">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="perfModalOpen" class="fixed inset-0 z-[90] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/60" @click="closePerfModal"></div>
      <div
        class="relative w-[1100px] max-w-[96vw] max-h-[85vh] bg-gray-900 text-gray-100 rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <div class="text-base font-semibold">性能监控</div>
            <div class="text-xs text-gray-400 mt-1">
              来源：{{ perfSourceLabel }} · {{ formatPerfTimestamp(pipelinePerfSummary.startedAt) }}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 text-xs border border-gray-600 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!hasPerfData" @click="exportPerfJson">
              导出 JSON
            </button>
            <button class="px-3 py-1.5 text-xs border border-gray-600 rounded hover:bg-gray-800" @click="closePerfModal">
              关闭
            </button>
          </div>
        </div>
        <div class="p-5 overflow-y-auto flex-1 space-y-6">
          <template v-if="hasPerfData">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div class="bg-white/5 border border-white/5 rounded-lg p-3">
                <div class="uppercase tracking-wide text-[11px] text-gray-400">总耗时</div>
                <div class="text-lg font-semibold mt-1">
                  {{ formatPerfDuration(pipelinePerfSummary.totalDurationMs) }}
                </div>
              </div>
              <div class="bg-white/5 border border-white/5 rounded-lg p-3">
                <div class="uppercase tracking-wide text-[11px] text-gray-400">Worker 数</div>
                <div class="text-lg font-semibold mt-1">
                  {{ pipelinePerfSummary.completedWorkerJobs }} / {{ pipelinePerfSummary.expectedWorkerJobs }}
                </div>
              </div>
              <div class="bg-white/5 border border-white/5 rounded-lg p-3">
                <div class="uppercase tracking-wide text-[11px] text-gray-400">累计顶点</div>
                <div class="text-lg font-semibold mt-1">
                  {{ pipelinePerfSummary.totalVertices.toLocaleString() }}
                </div>
              </div>
              <div class="bg-white/5 border border-white/5 rounded-lg p-3">
                <div class="uppercase tracking-wide text-[11px] text-gray-400">Worker 峰值内存</div>
                <div class="text-lg font-semibold mt-1">
                  {{ formatPerfMemory(pipelinePerfSummary.peakWorkerMemoryBytes) }}
                </div>
              </div>
            </div>
            <div class="text-[11px] text-gray-400 flex flex-wrap gap-4">
              <span>文件：{{ pipelinePerfSession.meta?.fileName ?? '—' }}</span>
              <span v-if="pipelinePerfSession.meta?.fileSize">
                大小：{{ formatPerfMemory(pipelinePerfSession.meta.fileSize) }}
              </span>
              <span v-if="longestWorkerJob">
                最慢 Worker：{{ longestWorkerJob.label }} · {{ formatPerfDuration(longestWorkerJob.durationMs) }}
              </span>
            </div>

            <div v-if="pipelinePerfSession.stages.length" class="space-y-2">
              <div class="text-sm font-semibold">Tracespace 管线</div>
              <div class="space-y-2">
                <div v-for="stage in pipelinePerfSession.stages" :key="stage.id"
                  class="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                  <div class="flex items-center justify-between text-sm font-medium">
                    <span>{{ formatPerfPhase(stage.phase) }}</span>
                    <span>{{ formatPerfDuration(stage.durationMs) }}</span>
                  </div>
                  <div class="text-[11px] text-gray-400 flex flex-wrap gap-3 mt-1">
                    <span>Δ内存：{{ formatPerfMemory(stage.memoryDeltaBytes) }}</span>
                    <span v-if="stage.memoryEndUsedBytes">
                      结束：{{ formatPerfMemory(stage.memoryEndUsedBytes) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="pipelinePerfSession.layerStages.length" class="space-y-2">
              <div class="text-sm font-semibold">层叠预览</div>
              <div class="space-y-2">
                <div v-for="stage in pipelinePerfSession.layerStages" :key="stage.id"
                  class="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                  <div class="flex items-center justify-between text-sm font-medium">
                    <span>{{ resolvePerfStageLabel(stage.stage) }}</span>
                    <span>{{ formatPerfDuration(stage.durationMs) }}</span>
                  </div>
                  <div class="text-[11px] text-gray-400 flex flex-wrap gap-3 mt-1">
                    <span v-if="stage.meta?.layerCount != null">层：{{ stage.meta.layerCount }}</span>
                    <span v-if="stage.meta?.pixiChildren != null">Pixi 对象：{{ stage.meta.pixiChildren }}</span>
                    <span>Δ内存：{{ formatPerfMemory(stage.memoryDeltaBytes) }}</span>
                    <span v-if="stage.meta?.jsHeapUsedBytes != null">
                      JS Heap：{{ formatPerfMemory(stage.meta.jsHeapUsedBytes) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="workerPerfRows.length" class="space-y-2">
              <div class="text-sm font-semibold">Worker 阶段</div>
              <div class="space-y-2">
                <div v-for="job in workerPerfRows" :key="job.id"
                  class="bg-gray-900/80 border border-white/5 rounded-lg px-3 py-2">
                  <div class="flex items-center justify-between text-sm font-semibold">
                    <span>{{ job.label }}</span>
                    <span :class="job.success ? '' : 'text-red-300'">
                      {{ job.success ? formatPerfDuration(job.durationMs) : '失败' }}
                    </span>
                  </div>
                  <div class="text-[11px] text-gray-400 flex flex-wrap gap-3 mt-1">
                    <span>顶点：{{ job.vertexCount.toLocaleString() }}</span>
                    <span>块：{{ job.chunkCount }}</span>
                    <span>峰值：{{ formatPerfMemory(job.peakMemoryBytes) }}</span>
                    <span v-if="job.computeDurationMs != null">
                      纯计算：{{ formatPerfDuration(job.computeDurationMs) }}
                    </span>
                  </div>
                  <div v-if="job.timeline?.length" class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div v-for="stage in job.timeline" :key="`${job.id}-${stage.index}`"
                      class="bg-white/5 rounded px-2 py-1">
                      <div class="text-[11px] text-gray-400">{{ resolvePerfStageLabel(stage.name) }}</div>
                      <div class="text-xs font-semibold text-white">{{ formatPerfDuration(stage.durationMs) }}</div>
                      <div class="text-[10px] text-gray-500">Δ{{ formatPerfMemory(stage.memoryDeltaBytes) }}</div>
                    </div>
                  </div>
                  <div v-if="!job.success && job.errorMessage" class="text-[11px] text-red-300 mt-1">
                    {{ job.errorMessage }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="pipelinePerfSession.viewerStages.length" class="space-y-2">
              <div class="text-sm font-semibold">3D 装配阶段</div>
              <div class="space-y-2">
                <div v-for="entry in pipelinePerfSession.viewerStages" :key="entry.id"
                  class="bg-gray-900/80 border border-white/5 rounded-lg px-3 py-2">
                  <div class="flex items-center justify-between text-sm font-medium">
                    <span>{{ resolvePerfStageLabel(entry.stage) }}</span>
                    <span>{{ formatPerfDuration(entry.durationMs) }}</span>
                  </div>
                  <div class="text-[11px] text-gray-400 flex flex-wrap gap-3 mt-1">
                    <span>层数：{{ entry.meta?.layerCount ?? '—' }}</span>
                    <span>顶点：{{ entry.meta?.vertexCount != null ? entry.meta.vertexCount.toLocaleString() : '—' }}</span>
                    <span>Δ内存：{{ formatPerfMemory(entry.memoryDeltaBytes) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <p v-else class="text-sm text-center text-gray-400 py-12">
            还没有性能数据。请先上传或重新保存设置以触发 3D 处理。
          </p>
        </div>
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
import {
  ref,
  reactive,
  nextTick,
  watch,
  computed,
  onMounted,
  onBeforeUnmount,
  markRaw,
  toRaw,
} from 'vue'
import axios from 'axios'
import { fromMemoryLayers, fromParsedLayers } from '@tracespace/core'
import UploadPanel from './UploadPanel.vue'
import LayerStackPreview from './LayerStackPreview.vue'
import Pcb3dPreview from './Pcb3dPreview.vue'
import {
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  CIRCLE,
  RECTANGLE,
  POLYGON,
  LAYERED_SHAPE,
  OUTLINE,
  ARC,
  LINE,
} from '@tracespace/plotter'
import { orderLayerWeight, randomHexColor } from '../libs/gerber_stack'
import { resolveBoardOutlineDescriptor } from '../libs/3d/boardOutline'

const resetIcon = new URL('../assets/resetting.svg', import.meta.url).href
const measureIcon = new URL('../assets/measurement.svg', import.meta.url).href

// 状态
const currentStatusIndex = ref(0)
const activeView = ref('layers')
const measurementActive = ref(false)
const recenterSignal = ref(0)
const enablePerfLogs = import.meta.env?.DEV ?? false
const props = defineProps({
  boardThicknessMm: {
    type: Number,
    default: 1.6,
  },
})

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
const unitMmPerUnit = ref(1)
const resolvedBoardThicknessMm = computed(() => {
  const provided = Number(props.boardThicknessMm)
  if (Number.isFinite(provided) && provided > 0) {
    return provided
  }
  return defaultBoardThicknessMm
})
const boardThicknessUnits = computed(() => {
  const normalizedMm = resolvedBoardThicknessMm.value
  const mmPerUnit = Number(unitMmPerUnit.value)
  if (!Number.isFinite(mmPerUnit) || mmPerUnit <= 0) return normalizedMm
  return normalizedMm / mmPerUnit
})
const logBoardScaleSnapshot = (source) => {
  if (!enablePerfLogs) return
  try {
    console.log('[GerberViewer] board scale snapshot', {
      source,
      unitMmPerUnit: unitMmPerUnit.value,
      thicknessUnits: boardThicknessUnits.value,
      boardWidthMm: boardWidthMm.value,
      boardHeightMm: boardHeightMm.value,
      viewBox: boardViewBox.value,
    })
  } catch (error) {
    console.warn('[GerberViewer] Failed to log board scale snapshot', error)
  }
}
const buildSimplifyTolerancePayload = () => {
  const mmPerUnit = Number(unitMmPerUnit.value)
  const unitScale = Number.isFinite(mmPerUnit) && mmPerUnit > 0 ? mmPerUnit : 1
  const payload = {}
  Object.entries(layerSimplifyTolerancesMm).forEach(([key, value]) => {
    const mmValue = Number(value)
    if (Number.isFinite(mmValue) && mmValue >= 0) {
      payload[key] = mmValue / unitScale
    }
  })
  return payload
}
const pcb3dModel = reactive({
  layers: [],
  version: 0,
})
const defaultPcb3dColors = Object.freeze({
  copper: '#cc9933',
  soldermask: '#004200',
  silkscreen: '#ffffff',
  core: '#292900',
})
const pcb3dColors = reactive({ ...defaultPcb3dColors })
const defaultPcb3dVisibility = Object.freeze({
  copper: true,
  soldermask: true,
  silkscreen: true,
  core: true,
})
const pcb3dVisibility = reactive({ ...defaultPcb3dVisibility })
const defaultLayerSimplifyTolerancesMm = Object.freeze({
  copper: 0.02,
  soldermask: 0.02,
  silkscreen: 0.01,
  drill: 0.01,
  outline: 0.01,
})
const layerSimplifyTolerancesMm = reactive({ ...defaultLayerSimplifyTolerancesMm })
const pcb3dColorOptions = [
  { key: 'copper', label: '铜层', toggleable: true },
  { key: 'soldermask', label: '阻焊', toggleable: true },
  { key: 'silkscreen', label: '丝印', toggleable: true },
  { key: 'core', label: '芯板', toggleable: false },
]
const drillLimit = ref(500)
const displayMenuOpen = ref(false)
const pcbModelJobs = reactive({ pending: 0, total: 0 })
const modelUpdateLockReason = ref(null)
watch(
  () => pcbModelJobs.pending,
  (pending) => {
    if (pending === 0) {
      modelUpdateLockReason.value = null
    }
  }
)
const workerLoading = ref(false)
const viewerLoading = ref(false)
const isPcb3dLoading = computed(() => workerLoading.value || viewerLoading.value)
const viewOptions = [
  { label: 'Layers', value: 'layers' },
  { label: '3D', value: '3d' },
]
const explosionActive = ref(false)
const explosionSpacing = ref(8)
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
const maxDebugEntries = 50
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
const toPoint = (position) => [
  Number(position?.[0]) || 0,
  Number(position?.[1]) || 0,
]
const extendBoundsWithPoint = (bounds, point) => {
  if (!point) return bounds
  if (!bounds) {
    return {
      minX: point[0],
      maxX: point[0],
      minY: point[1],
      maxY: point[1],
    }
  }
  return {
    minX: Math.min(bounds.minX, point[0]),
    maxX: Math.max(bounds.maxX, point[0]),
    minY: Math.min(bounds.minY, point[1]),
    maxY: Math.max(bounds.maxY, point[1]),
  }
}
const positionsClose = (a, b, eps = 1e-6) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps
const approximateArcPointsForBounds = (segment) => {
  const startAngle = Number(segment?.start?.[2])
  const endAngle = Number(segment?.end?.[2])
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return []
  let sweep = endAngle - startAngle
  const startRaw = toPoint(segment.start)
  const endRaw = toPoint(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startRaw, endRaw)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []
  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const center = toPoint(segment.center)
  const radius = Number(segment.radius) || 0
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = startAngle + (sweep * i) / steps
    points.push([
      center[0] + radius * Math.cos(angle),
      center[1] + radius * Math.sin(angle),
    ])
  }
  return points
}
const boundsFromSegments = (segments) => {
  if (!Array.isArray(segments) || segments.length === 0) return null
  let bounds = null
  for (const segment of segments) {
    bounds = extendBoundsWithPoint(bounds, toPoint(segment.start))
    bounds = extendBoundsWithPoint(bounds, toPoint(segment.end))
    if (segment.type === ARC) {
      const arcPoints = approximateArcPointsForBounds(segment)
      for (const pt of arcPoints) {
        bounds = extendBoundsWithPoint(bounds, pt)
      }
    }
  }
  return bounds
}
const shapeBounds = (shape) => {
  if (!shape) return null
  switch (shape.type) {
    case CIRCLE:
      return {
        minX: shape.cx - shape.r,
        minY: shape.cy - shape.r,
        maxX: shape.cx + shape.r,
        maxY: shape.cy + shape.r,
      }
    case RECTANGLE:
      return {
        minX: shape.x,
        minY: shape.y,
        maxX: shape.x + shape.width,
        maxY: shape.y + shape.height,
      }
    case POLYGON: {
      const entries = Array.isArray(shape.points) ? shape.points : []
      let bounds = null
      for (const point of entries) {
        bounds = extendBoundsWithPoint(bounds, toPoint(point))
      }
      return bounds
    }
    case LAYERED_SHAPE: {
      let merged = null
      for (const sub of shape.shapes || []) {
        const subBounds = shapeBounds(sub)
        if (subBounds) {
          merged = merged
            ? {
                minX: Math.min(merged.minX, subBounds.minX),
                minY: Math.min(merged.minY, subBounds.minY),
                maxX: Math.max(merged.maxX, subBounds.maxX),
                maxY: Math.max(merged.maxY, subBounds.maxY),
              }
            : subBounds
        }
      }
      return merged
    }
    case OUTLINE:
      return boundsFromSegments(shape.segments)
    default:
      return null
  }
}
const elementBounds = (element) => {
  if (!element) return null
  if (element.type === IMAGE_PATH || element.type === IMAGE_REGION) {
    return boundsFromSegments(element.segments)
  }
  if (element.type === IMAGE_SHAPE) {
    return shapeBounds(element.shape)
  }
  return null
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
const perfModalOpen = ref(false)
const pipelinePerfSession = reactive({
  id: 0,
  source: '',
  startedAt: 0,
  completedAt: 0,
  expectedWorkerJobs: null,
  completedWorkerJobs: 0,
  meta: {},
  stages: [],
  layerStages: [],
  workerJobs: [],
  viewerStages: [],
})
let perfSessionSeq = 0
const bytesInMegabyte = 1024 * 1024
const getPerfNow = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now())
const hasPerfData = computed(
  () =>
    pipelinePerfSession.stages.length > 0 ||
    pipelinePerfSession.layerStages.length > 0 ||
    pipelinePerfSession.workerJobs.length > 0 ||
    pipelinePerfSession.viewerStages.length > 0
)
const captureMemorySnapshot = () => {
  if (typeof performance === 'undefined' || !performance.memory) return null
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory
  if (!Number.isFinite(usedJSHeapSize)) return null
  return {
    usedBytes: usedJSHeapSize,
    totalBytes: totalJSHeapSize,
    limitBytes: jsHeapSizeLimit,
  }
}
const computeMemoryDelta = (start, end) => {
  if (!start || !end) return null
  if (!Number.isFinite(start.usedBytes) || !Number.isFinite(end.usedBytes)) return null
  return end.usedBytes - start.usedBytes
}
const resetPerfCollections = () => {
  pipelinePerfSession.stages.splice(0)
  pipelinePerfSession.layerStages.splice(0)
  pipelinePerfSession.workerJobs.splice(0)
  pipelinePerfSession.viewerStages.splice(0)
}
const startPerfSession = (source, meta = {}) => {
  pipelinePerfSession.id = ++perfSessionSeq
  pipelinePerfSession.source = source
  pipelinePerfSession.meta = meta
  pipelinePerfSession.startedAt = Date.now()
  pipelinePerfSession.completedAt = 0
  pipelinePerfSession.expectedWorkerJobs = null
  pipelinePerfSession.completedWorkerJobs = 0
  resetPerfCollections()
}
const planPerfWorkerJobs = (count) => {
  if (!pipelinePerfSession.id) return
  pipelinePerfSession.expectedWorkerJobs = count
  pipelinePerfSession.completedWorkerJobs = 0
  if (count === 0) {
    finalizePerfSessionIfIdle()
  }
}
const finalizePerfSessionIfIdle = () => {
  if (!pipelinePerfSession.id) return
  const expected = pipelinePerfSession.expectedWorkerJobs
  if (expected == null) return
  if (expected === 0 || pipelinePerfSession.completedWorkerJobs >= expected) {
    const now = Date.now()
    pipelinePerfSession.completedAt = Math.max(pipelinePerfSession.completedAt || 0, now)
  }
}
const markPerfWorkerJobComplete = () => {
  if (!pipelinePerfSession.id || pipelinePerfSession.expectedWorkerJobs == null) return
  pipelinePerfSession.completedWorkerJobs = Math.min(
    pipelinePerfSession.expectedWorkerJobs,
    pipelinePerfSession.completedWorkerJobs + 1
  )
  finalizePerfSessionIfIdle()
}
const inferPerfCategory = (phase) => {
  if (!phase) return 'general'
  const idx = phase.indexOf(':')
  return idx > 0 ? phase.slice(0, idx) : phase
}
const recordPerfStageMeasurement = (phase, durationMs, memoryStart, memoryEnd, meta = {}) => {
  if (!pipelinePerfSession.id) return
  pipelinePerfSession.stages.push({
    id: `${pipelinePerfSession.id}-stage-${pipelinePerfSession.stages.length + 1}`,
    phase,
    category: inferPerfCategory(phase),
    durationMs: Number.isFinite(durationMs) ? Number(durationMs.toFixed(2)) : null,
    memoryStartUsedBytes: memoryStart?.usedBytes ?? null,
    memoryEndUsedBytes: memoryEnd?.usedBytes ?? null,
    memoryDeltaBytes: computeMemoryDelta(memoryStart, memoryEnd),
    timestamp: Date.now(),
    meta,
  })
}
const describeWorkerLayer = (entry) => {
  if (!entry) return 'layer job'
  const side = entry.side ?? 'n/a'
  return `${side} ${entry.type || 'unknown'}`
}
const recordWorkerPerfMetrics = (entry, result, success, message) => {
  if (!pipelinePerfSession.id) return
  const summary = result?.meshSummary ?? summarizeMeshData(result?.mesh)
  const common = {
    id: `${pipelinePerfSession.id}-worker-${entry.jobId}`,
    jobId: entry.jobId,
    type: entry.type,
    side: entry.side ?? null,
    label: describeWorkerLayer(entry),
    vertexCount: summary?.totalVertices ?? 0,
    chunkCount: summary?.chunkCount ?? summary?.geometryCount ?? 0,
  }
  const timeline = Array.isArray(result?.metrics?.timeline)
    ? result.metrics.timeline.map((stage, index) => {
        const { memoryStart, memoryEnd, ...rest } = stage || {}
        return {
          ...rest,
          index,
          memoryDeltaBytes: computeMemoryDelta(memoryStart, memoryEnd),
          memoryStartUsedBytes: memoryStart?.usedBytes ?? null,
          memoryEndUsedBytes: memoryEnd?.usedBytes ?? null,
        }
      })
    : []
  const wallDuration =
    Number.isFinite(entry.completedAt) && Number.isFinite(entry.timestamp)
      ? Math.max(0, entry.completedAt - entry.timestamp)
      : result?.metrics?.totalDurationMs ?? null
  const computeDuration =
    result?.metrics?.totalDurationMs ??
    timeline.reduce((sum, stage) => sum + (stage.durationMs || 0), 0)
  if (!success) {
    pipelinePerfSession.workerJobs.push({
      ...common,
      success: false,
      startedAt: Number.isFinite(entry.timestamp) ? entry.timestamp : null,
      completedAt: Number.isFinite(entry.completedAt) ? entry.completedAt : null,
      durationMs: wallDuration,
      computeDurationMs: computeDuration || null,
      errorMessage: message || entry.errorMessage || 'worker failure',
    })
    return
  }
  pipelinePerfSession.workerJobs.push({
    ...common,
    success: true,
    startedAt: Number.isFinite(entry.timestamp) ? entry.timestamp : null,
    completedAt: Number.isFinite(entry.completedAt) ? entry.completedAt : null,
    durationMs: wallDuration,
    computeDurationMs: computeDuration || null,
    peakMemoryBytes: result?.metrics?.peakMemoryBytes ?? null,
    timeline,
  })
}
const formatPerfDuration = (value) => {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${value.toFixed(1)} ms`
}
const formatPerfMemory = (bytes) => {
  if (!Number.isFinite(bytes)) return '—'
  if (Math.abs(bytes) >= bytesInMegabyte) return `${(bytes / bytesInMegabyte).toFixed(2)} MB`
  if (Math.abs(bytes) >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes.toFixed(0)} B`
}
const formatPerfTimestamp = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString(undefined, { hour12: false })
}
const formatPerfPhase = (phase) => {
  if (!phase) return '—'
  return phase.replace(':', ' › ')
}
const perfStageLabelMap = {
  plot: 'Gerber plot',
  'clip-polygons': '裁剪区域',
  'filter-image-tree': '图形过滤',
  'plot-drills': '钻孔绘制',
  'render-three': 'Three.js 网格',
  'collect-mesh': 'TypedArray 拷贝',
  'three:rebuildModel': '场景装配',
  'layers:update-composite': 'Pixi 渲染',
  'layers:pixi-init': 'Pixi 初始化',
  'drill:passthrough': '钻孔占位',
}
const resolvePerfStageLabel = (value) => perfStageLabelMap[value] ?? value
const computeStageEndTimestamp = (timestamp) => {
  if (!Number.isFinite(timestamp)) return null
  return timestamp
}
const deriveSessionEndTimestamp = () => {
  let latest = Number.isFinite(pipelinePerfSession.completedAt) ? pipelinePerfSession.completedAt : 0
  const considerTimestamp = (timestamp) => {
    const end = computeStageEndTimestamp(timestamp)
    if (end != null) latest = Math.max(latest, end)
  }
  pipelinePerfSession.stages.forEach((stage) => considerTimestamp(stage.timestamp))
  pipelinePerfSession.layerStages.forEach((stage) => considerTimestamp(stage.timestamp))
  pipelinePerfSession.viewerStages.forEach((stage) => considerTimestamp(stage.timestamp))
  pipelinePerfSession.workerJobs.forEach((job) => {
    if (Number.isFinite(job.completedAt)) {
      considerTimestamp(job.completedAt)
      return
    }
    if (Number.isFinite(job.startedAt) && Number.isFinite(job.durationMs)) {
      considerTimestamp(job.startedAt + job.durationMs)
    }
  })
  return latest || null
}
const pipelinePerfSummary = computed(() => {
  const totalVertices = pipelinePerfSession.workerJobs.reduce((sum, job) => sum + (job.vertexCount || 0), 0)
  const peakWorkerMemory = pipelinePerfSession.workerJobs.reduce(
    (max, job) => Math.max(max, job.peakMemoryBytes ?? 0),
    0
  )
  const derivedCompletedAt = deriveSessionEndTimestamp() || Date.now()
  const totalDurationMs = pipelinePerfSession.startedAt
    ? Math.max(0, derivedCompletedAt - pipelinePerfSession.startedAt)
    : 0
  const expectedWorkerJobs = Number.isFinite(pipelinePerfSession.expectedWorkerJobs)
    ? pipelinePerfSession.expectedWorkerJobs
    : pipelinePerfSession.workerJobs.length
  const completedWorkerJobs = Math.min(
    expectedWorkerJobs,
    pipelinePerfSession.completedWorkerJobs ?? pipelinePerfSession.workerJobs.length
  )
  return {
    totalVertices,
    peakWorkerMemoryBytes: peakWorkerMemory || null,
    totalDurationMs,
    startedAt: pipelinePerfSession.startedAt,
    workerJobCount: pipelinePerfSession.workerJobs.length,
    expectedWorkerJobs,
    completedWorkerJobs,
  }
})
const workerPerfRows = computed(() =>
  pipelinePerfSession.workerJobs.slice().sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
)
const longestWorkerJob = computed(() => workerPerfRows.value[0] || null)
const perfSourceLabel = computed(() => {
  if (!pipelinePerfSession.source) return '未知'
  return pipelinePerfSession.source === 'settings' ? '设置' : '上传'
})
const openPerfModal = () => {
  perfModalOpen.value = true
}
const closePerfModal = () => {
  perfModalOpen.value = false
}
const cloneStageEntry = (stage) => {
  if (!stage) return null
  const base = { ...stage }
  if (stage.meta) base.meta = { ...stage.meta }
  return base
}
const cloneWorkerJob = (job) => {
  if (!job) return null
  return {
    ...job,
    timeline: Array.isArray(job.timeline)
      ? job.timeline.map((entry) => {
          const cloned = { ...entry }
          if (entry?.meta) cloned.meta = { ...entry.meta }
          return cloned
        })
      : [],
  }
}
const buildPerfReportJson = () => {
  if (!hasPerfData.value) return null
  const summary = pipelinePerfSummary.value
  const payload = {
    sessionId: pipelinePerfSession.id,
    source: pipelinePerfSession.source,
    startedAt: pipelinePerfSession.startedAt,
    completedAt: pipelinePerfSession.completedAt || null,
    exportedAt: Date.now(),
    meta: pipelinePerfSession.meta ? { ...pipelinePerfSession.meta } : {},
    summary: {
      totalDurationMs: summary.totalDurationMs,
      totalVertices: summary.totalVertices,
      peakWorkerMemoryBytes: summary.peakWorkerMemoryBytes,
      workerJobs: {
        completed: summary.completedWorkerJobs,
        expected: summary.expectedWorkerJobs,
      },
    },
    tracespaceStages: pipelinePerfSession.stages.map((stage) => cloneStageEntry(stage)),
    layerPreviewStages: pipelinePerfSession.layerStages.map((stage) => cloneStageEntry(stage)),
    workerJobs: pipelinePerfSession.workerJobs.map((job) => cloneWorkerJob(job)),
    viewerStages: pipelinePerfSession.viewerStages.map((stage) => cloneStageEntry(stage)),
  }
  return JSON.stringify(payload, null, 2)
}
const exportPerfJson = () => {
  if (!hasPerfData.value) return
  const json = buildPerfReportJson()
  if (!json) return
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const timestamp = new Date().toISOString().replace(/[:\\.]/g, '-')
  const filename = `pcb-perf-report-${pipelinePerfSession.id || 'session'}-${timestamp}.json`
  triggerFileDownload(blob, filename)
}
const perfLabel = (phase) => `[perf][GerberViewer] ${phase}`
const runPerfSync = (phase, fn, options = {}) => {
  const label = perfLabel(phase)
  const start = getPerfNow()
  const memoryStart = captureMemorySnapshot()
  if (enablePerfLogs) console.time(label)
  try {
    return fn()
  } finally {
    const durationMs = getPerfNow() - start
    const memoryEnd = captureMemorySnapshot()
    if (enablePerfLogs) console.timeEnd(label)
    recordPerfStageMeasurement(phase, durationMs, memoryStart, memoryEnd, options.meta)
  }
}
const runPerfAsync = async (phase, fn, options = {}) => {
  const label = perfLabel(phase)
  const start = getPerfNow()
  const memoryStart = captureMemorySnapshot()
  if (enablePerfLogs) console.time(label)
  try {
    return await fn()
  } finally {
    const durationMs = getPerfNow() - start
    const memoryEnd = captureMemorySnapshot()
    if (enablePerfLogs) console.timeEnd(label)
    recordPerfStageMeasurement(phase, durationMs, memoryStart, memoryEnd, options.meta)
  }
}
const logPerf = (phase, payload) => {
  if (enablePerfLogs) console.log(perfLabel(phase), payload)
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
const countDrillShapesInPayload = (payload) => {
  if (!payload) return 0
  if (Array.isArray(payload)) return payload.length
  if (
    typeof payload === 'object'
    && payload.format === DRILL_SHAPE_FORMAT_IMAGE_TREES
    && Array.isArray(payload.imageTrees)
  ) {
    return payload.imageTrees.length
  }
  return 0
}
const recordWorkerJobStart = (jobId, payload) => {
  workerDebugLog.jobs.push({
    jobId,
    timestamp: Date.now(),
    perfSessionId: pipelinePerfSession.id,
    layerId: payload.layerId,
    type: payload.type,
    side: payload.side ?? null,
    outline: Boolean(payload.outline),
    hasParseTree: Boolean(payload.parseTree),
    parseTreeSummary: summarizeParseTree(payload.parseTree),
    drillShapeCount: countDrillShapesInPayload(payload.drillShapes),
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
  if (entry.perfSessionId && entry.perfSessionId === pipelinePerfSession.id) {
    recordWorkerPerfMetrics(entry, result, success, message)
    markPerfWorkerJobComplete()
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
  if (!canExplode.value || !explosionActive.value) return
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
    if (type === 'image-current') {
      const exportFn = pcb3dRef.value?.exportCurrentImage
      if (typeof exportFn !== 'function') throw new Error('截图导出不可用')
      const blob = await exportFn()
      if (!blob) throw new Error('图片导出失败')
      triggerFileDownload(blob, 'pcb-preview-current.png')
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
const showLayerPreviewLoading = computed(() => isLayerLoading.value || isLayerRenderLoading.value)
const showPcb3dPreviewLoading = computed(() => isLayerLoading.value || isPcb3dLoading.value)

// 设置面板
const isSettingsOpen = ref(false)
const editableLayers = reactive([])
const defaultLayerColors = {
  copper: '#f2c55b',
  soldermask: '#1c7a2a',
  silkscreen: '#ffffff',
  drill: '#333333',
  outline: '#bfa782',
}
const structural3dTypes = new Set(['copper', 'soldermask', 'silkscreen'])
const DRILL_SHAPE_FORMAT_IMAGE_TREES = 'drill-image-trees'
const normalizeLayerType = (value) => {
  if (typeof value !== 'string') return ''
  return value.toLowerCase()
}
const normalizeLayerSide = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase()
  return normalized === 'top' || normalized === 'bottom' ? normalized : null
}
const shouldLayerUseDrillShapes = (layerType) => {
  const normalized = normalizeLayerType(layerType)
  if (!normalized) return false
  return normalized !== 'drill'
}
const isLayerEligibleFor3d = (layer) => {
  if (!layer) return false
  const type = normalizeLayerType(layer.type)
  if (!type) return false
  if (type === 'outline' || type === 'drill') return true
  if (!structural3dTypes.has(type)) return false
  const side = normalizeLayerSide(layer.side)
  return side === 'top' || side === 'bottom'
}

const hasPositiveBounds = (size) => {
  if (!Array.isArray(size) || size.length < 4) return false
  const [minX, minY, maxX, maxY] = size
  const width = Math.abs(Number(maxX) - Number(minX))
  const height = Math.abs(Number(maxY) - Number(minY))
  return Number.isFinite(width) && Number.isFinite(height) && (width > 0 || height > 0)
}

const layerHasRenderableGeometry = (layer, plotResult) => {
  if (!layer || !plotResult || !plotResult.plotTreesById) return true
  const tree = plotResult.plotTreesById[layer.id]
  if (!tree) return true
  const childCount = Array.isArray(tree.children) ? tree.children.length : 0
  if (childCount > 0) return true
  if (hasPositiveBounds(tree.size)) return true
  console.warn('[GerberViewer] Skipping 3D layer with no geometry', {
    id: layer.id,
    type: layer.type,
    side: layer.side,
  })
  return false
}
const detectWorkerConcurrency = () => {
  const envValue = Number(import.meta.env?.VITE_PCB_WORKER_CONCURRENCY)
  if (Number.isFinite(envValue) && envValue >= 1) return Math.floor(envValue)
  const navCores = typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency) : NaN
  if (Number.isFinite(navCores) && navCores > 0) {
    return Math.max(1, Math.min(4, Math.floor(navCores / 2)))
  }
  return 2
}
const pcbWorkerConcurrency = detectWorkerConcurrency()
let pcbWorkerSeq = 0
const pcbWorkerJobs = new Map()
const workerJobQueue = []
const pcbWorkerPool = []

const createPcbWorker = () =>
  new Worker(new URL('../workers/pcbModel.worker.js', import.meta.url), { type: 'module' })

const assignQueuedWorkerJobs = () => {
  for (const instance of pcbWorkerPool) {
    if (instance.busy) continue
    const nextJob = workerJobQueue.shift()
    if (!nextJob) break
    instance.busy = true
    instance.currentJobId = nextJob.jobId
    instance.worker.postMessage({
      jobId: nextJob.jobId,
      action: 'build-layer',
      payload: nextJob.payload,
    })
  }
}

const handleWorkerInstanceMessage = (instance, event) => {
  const { jobId, success, result, message } = event.data || {}
  if (jobId) {
    const entry = pcbWorkerJobs.get(jobId)
    if (entry) {
      pcbWorkerJobs.delete(jobId)
      if (success) entry.resolve(result)
      else {
        console.error('[GerberViewer] PCB worker failure detail', message)
        entry.reject(new Error(message || 'worker error'))
      }
    }
  }
  instance.busy = false
  instance.currentJobId = null
  assignQueuedWorkerJobs()
}

const handleWorkerInstanceError = (instance, event) => {
  const details =
    event?.message || event?.error?.message || event?.error?.stack || 'Unknown worker error'
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
  const failedJobId = instance.currentJobId
  if (failedJobId && pcbWorkerJobs.has(failedJobId)) {
    const entry = pcbWorkerJobs.get(failedJobId)
    pcbWorkerJobs.delete(failedJobId)
    entry.reject(new Error(details || 'worker error'))
  }
  instance.worker.terminate()
  const index = pcbWorkerPool.indexOf(instance)
  if (index >= 0) pcbWorkerPool.splice(index, 1)
  const replacement = spawnWorkerInstance()
  if (replacement) {
    pcbWorkerPool.push(replacement)
  }
  assignQueuedWorkerJobs()
}

const spawnWorkerInstance = () => {
  try {
    const worker = createPcbWorker()
    const instance = { worker, busy: false, currentJobId: null }
    worker.onmessage = (event) => handleWorkerInstanceMessage(instance, event)
    worker.onerror = (event) => handleWorkerInstanceError(instance, event)
    return instance
  } catch (error) {
    console.error('[GerberViewer] Failed to spawn worker', error)
    return null
  }
}

const ensureWorkerPool = () => {
  if (pcbWorkerPool.length >= pcbWorkerConcurrency) return
  while (pcbWorkerPool.length < pcbWorkerConcurrency) {
    const instance = spawnWorkerInstance()
    if (!instance) break
    pcbWorkerPool.push(instance)
  }
}

const disposePcbWorkers = () => {
  pcbWorkerPool.splice(0).forEach((instance) => {
    instance.worker.terminate()
  })
  pcbWorkerJobs.clear()
  workerJobQueue.splice(0)
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

let componentDestroyed = false

const updateWorkerLoading = () => {
  if (componentDestroyed) return
  workerLoading.value = pcbModelJobs.pending > 0
}

const queueWorkerJob = (payload) => {
  const jobId = ++pcbWorkerSeq
  pcbModelJobs.pending += 1
  updateWorkerLoading()
  recordWorkerJobStart(jobId, payload)
  const startTime = performance.now()
  if (enablePerfLogs) {
    console.log('[GerberViewer] queue worker job', {
      jobId,
      layerId: payload.layerId,
      type: payload.type,
      side: payload.side,
    })
  }
  return new Promise((resolve, reject) => {
    pcbWorkerJobs.set(jobId, {
      resolve: (result) => {
        pcbModelJobs.pending = Math.max(0, pcbModelJobs.pending - 1)
        updateWorkerLoading()
        recordWorkerJobResult(jobId, { success: true, result })
        if (enablePerfLogs) {
          console.log('[GerberViewer] worker job finished', {
            jobId,
            layerId: payload.layerId,
            type: payload.type,
            durationMs: Number((performance.now() - startTime).toFixed(2)),
          })
        }
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
    workerJobQueue.push({ jobId, payload })
    ensureWorkerPool()
    assignQueuedWorkerJobs()
  })
}

const applyWorkerLayer = (payload) => {
  if (!payload || componentDestroyed) return
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

const refreshBoardOutlineState = (plotResult) => {
  if (!plotResult) return null
  return resolveBoardOutlineDescriptor(plotResult)
}

const limitDrillImageEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { entries: [], limitedStats: null }
  }
  const totalElements = entries.reduce((sum, entry) => {
    const count = Array.isArray(entry.tree?.children) ? entry.tree.children.length : 0
    return sum + count
  }, 0)
  if (totalElements === 0) {
    return { entries, limitedStats: null }
  }
  let limit = Number(drillLimit.value)
  if (!Number.isFinite(limit)) limit = Infinity
  if (limit === Infinity || limit >= totalElements) {
    return { entries, limitedStats: { applied: false, total: totalElements } }
  }
  limit = Math.max(0, Math.floor(limit))
  if (limit <= 0) {
    return {
      entries: [],
      limitedStats: {
        applied: true,
        total: totalElements,
        kept: 0,
        dropped: totalElements,
      },
    }
  }
  const flattened = []
  entries.forEach((entry, entryIndex) => {
    const children = Array.isArray(entry.tree?.children) ? entry.tree.children : []
    children.forEach((child, childIndex) => {
      const bounds = elementBounds(child)
      const spanX = bounds ? Math.abs(bounds.maxX - bounds.minX) : 0
      const spanY = bounds ? Math.abs(bounds.maxY - bounds.minY) : 0
      const maxEdge = Math.max(spanX, spanY, 0)
      flattened.push({
        entryIndex,
        childIndex,
        maxEdge,
      })
    })
  })
  flattened.sort((a, b) => {
    if (b.maxEdge === a.maxEdge) return a.entryIndex - b.entryIndex
    return b.maxEdge - a.maxEdge
  })
  const keepSlice = flattened.slice(0, limit)
  const keepMap = new Map()
  keepSlice.forEach(({ entryIndex, childIndex }) => {
    if (!keepMap.has(entryIndex)) keepMap.set(entryIndex, new Set())
    keepMap.get(entryIndex).add(childIndex)
  })
  const filteredEntries = entries
    .map((entry, index) => {
      const allowed = keepMap.get(index)
      if (!allowed || allowed.size === 0) return null
      const children = Array.isArray(entry.tree?.children) ? entry.tree.children : []
      const filteredChildren = children.filter((_, idx) => allowed.has(idx))
      if (!filteredChildren.length) return null
      return {
        layerId: entry.layerId,
        tree: {
          ...entry.tree,
          children: filteredChildren,
        },
      }
    })
    .filter(Boolean)
  const dropped = totalElements - keepSlice.length
  return {
    entries: filteredEntries,
    limitedStats: {
      applied: true,
      total: totalElements,
      kept: keepSlice.length,
      dropped,
      limit,
    },
  }
}

const buildDrillShapePayload = (drillLayers, plotTreesById, parseTreesById) => {
  if (!Array.isArray(drillLayers) || drillLayers.length === 0) return undefined
  const imageEntries = []
  const fallbackParseTrees = []
  for (const layer of drillLayers) {
    if (!layer?.id) continue
    const cachedTree = plotTreesById?.[layer.id]
    if (cachedTree && Array.isArray(cachedTree.children) && cachedTree.children.length) {
      imageEntries.push({layerId: layer.id, tree: cachedTree})
    } else {
      const layerParseTree = parseTreesById?.[layer.id]
      if (layerParseTree) fallbackParseTrees.push(layerParseTree)
    }
  }
  const { entries: limitedEntries, limitedStats } = limitDrillImageEntries(imageEntries)
  if (limitedEntries.length) {
    if (limitedStats && limitedStats.applied) {
      console.info('[GerberViewer] Drill geometry limited', limitedStats)
    }
    return {
      format: DRILL_SHAPE_FORMAT_IMAGE_TREES,
      version: 1,
      layerIds: limitedEntries.map(entry => entry.layerId),
      imageTrees: limitedEntries.map(entry => entry.tree),
    }
  }
  return fallbackParseTrees.length ? fallbackParseTrees : undefined
}

const buildPcbModelFromLayers = (
  layers,
  parseTreesById,
  boardOutline,
  plotResult = null,
  options = {}
) => {
  if (!Array.isArray(layers) || layers.length === 0) return false
  const {
    reset = true,
    targetLayerIds = null,
    reason = reset ? 'pcb-model' : 'pcb-model-partial',
  } = options
  const targetLayerSet =
    Array.isArray(targetLayerIds) && targetLayerIds.length > 0
      ? new Set(targetLayerIds)
      : null
  const candidateLayers = targetLayerSet
    ? layers.filter((layer) => targetLayerSet.has(layer.id))
    : layers
  if (!reset && candidateLayers.length === 0) return false
  if (reset) {
    resetPcbModelState()
    pcbModelJobs.total = 0
    pcbModelJobs.pending = 0
    updateWorkerLoading()
  }
  const plotTreesById = plotResult?.plotTreesById ?? null
  const boardRegions = Array.isArray(boardOutline?.regions) ? boardOutline.regions : undefined
  const boardBounds = Array.isArray(boardOutline?.bounds) ? boardOutline.bounds : undefined
  const boardPolygons = Array.isArray(boardOutline?.polygons) ? boardOutline.polygons : undefined
  logBoardScaleSnapshot(reset ? 'buildPcbModelFromLayers' : 'updatePcbModelLayers')
  const simplifyTolerancePayload = buildSimplifyTolerancePayload()
  const drillLayers = layers.filter((layer) => {
    const type = String(layer?.type || '').toLowerCase()
    return type.includes('drill')
  })
  const layersFor3d = candidateLayers.filter(
    (layer) => isLayerEligibleFor3d(layer) && layerHasRenderableGeometry(layer, plotResult)
  )
  const hasOutlineLayer = layersFor3d.some((layer) => layer.type === 'outline')
  const syntheticOutlineNeeded =
    reset && !hasOutlineLayer && Array.isArray(boardRegions) && boardRegions.length > 0
  const totalJobs = layersFor3d.length + (syntheticOutlineNeeded ? 1 : 0)
  if (totalJobs === 0) {
    planPerfWorkerJobs(0)
    pcbModelJobs.total = 0
    return false
  }
  planPerfWorkerJobs(totalJobs)
  pcbModelJobs.total = totalJobs
  modelUpdateLockReason.value = reason
  const drillShapePayload = buildDrillShapePayload(drillLayers, plotTreesById, parseTreesById)
  for (const layer of layersFor3d) {
    const drillShapes =
      drillShapePayload && shouldLayerUseDrillShapes(layer.type) ? drillShapePayload : undefined
    queueWorkerJob({
      layerId: layer.id,
      parseTree: parseTreesById?.[layer.id],
      plotTree: plotTreesById?.[layer.id],
      type: layer.type,
      side: layer.side ?? null,
      color: getLayerColor(layer.id, layer.type),
      outline: layer.type === 'outline',
      boardShapeRegions: boardRegions,
      boardShapePolygons: boardPolygons,
      boardClipRegions: boardRegions,
      drillShapes,
      boardBounds,
      simplifyTolerances: simplifyTolerancePayload,
    })
      .then((result) => {
        applyWorkerLayer(result)
      })
      .catch((error) => {
        console.error('[GerberViewer] PCB worker failed', error)
      })
  }
  if (syntheticOutlineNeeded) {
    queueWorkerJob({
      layerId: '__synthetic-board-outline__',
      parseTree: null,
      plotTree: null,
      type: 'outline',
      side: 'all',
      color: getLayerColor('__synthetic-board-outline__', 'outline'),
      outline: true,
      boardShapeRegions: boardRegions,
      boardShapePolygons: boardPolygons,
      boardClipRegions: boardRegions,
      drillShapes: drillShapePayload,
      boardBounds,
      syntheticOutlineRegions: boardRegions,
      simplifyTolerances: simplifyTolerancePayload,
    })
      .then((result) => {
        applyWorkerLayer(result)
      })
      .catch((error) => {
        console.error('[GerberViewer] Synthetic board outline build failed', error)
      })
  }
  return true
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
const handleLayerPerfEvent = (payload) => {
  if (!payload || !pipelinePerfSession.id) return
  pipelinePerfSession.layerStages.push({
    id: `${pipelinePerfSession.id}-layer-${pipelinePerfSession.layerStages.length + 1}`,
    stage: payload.stage,
    durationMs: Number.isFinite(payload.durationMs) ? Number(payload.durationMs.toFixed(2)) : null,
    memoryStartUsedBytes: payload.memoryStart?.usedBytes ?? null,
    memoryEndUsedBytes: payload.memoryEnd?.usedBytes ?? null,
    memoryDeltaBytes:
      payload.memoryDeltaBytes ?? computeMemoryDelta(payload.memoryStart, payload.memoryEnd),
    meta: payload.meta ?? {},
    timestamp: payload.timestamp ?? Date.now(),
  })
  finalizePerfSessionIfIdle()
}
const handleViewerPerfEvent = (payload) => {
  if (!payload || !pipelinePerfSession.id) return
  pipelinePerfSession.viewerStages.push({
    id: `${pipelinePerfSession.id}-viewer-${pipelinePerfSession.viewerStages.length + 1}`,
    stage: payload.stage,
    durationMs: payload.durationMs ?? null,
    memoryStartUsedBytes: payload.memoryStart?.usedBytes ?? null,
    memoryEndUsedBytes: payload.memoryEnd?.usedBytes ?? null,
    memoryDeltaBytes:
      payload.memoryDeltaBytes ?? computeMemoryDelta(payload.memoryStart, payload.memoryEnd),
    meta: payload.meta ?? {},
    timestamp: payload.timestamp ?? Date.now(),
  })
  finalizePerfSessionIfIdle()
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
  currentStatusIndex.value = 1
  activeView.value = 'layers'
  startPerfSession('upload', {
    fileName: file?.name ?? null,
    fileSize: file?.size ?? null,
  })
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
    const pipeline = await runPerfAsync('upload:pipeline', () =>
      fromMemoryLayers(memoryLayers.value)
    )
    runPerfSync('upload:buildOrderedLayers', () => applyModernResult(pipeline))
    const outlineDescriptor = refreshBoardOutlineState(pipeline.plotResult)
    buildPcbModelFromLayers(
      pipeline.plotResult?.layers,
      pipeline.parseTreesById,
      outlineDescriptor,
      pipeline.plotResult,
      { reset: true, reason: 'initializing' }
    )
    logPerf('upload:layers-ready', {
      count: orderedLayers.length,
      boardViewBox: boardViewBox.value,
      boardWidthMm: boardWidthMm.value,
      boardHeightMm: boardHeightMm.value,
    })
    isLayerPanelOpen.value = false
    recenterSignal.value += 1
  } catch (error) {
    console.error('[GerberViewer] handleUploadFile failed', error)
    currentStatusIndex.value = 0
    throw error
  } finally {
    isLayerLoading.value = false
    finalizePerfSessionIfIdle()
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
  fmRef.value = markRaw(fm)
  const mmPerUnit = Number(fm?.unitMeta?.mmPerUnit)
  unitMmPerUnit.value = Number.isFinite(mmPerUnit) && mmPerUnit > 0 ? mmPerUnit : 1
  const boardViewBoxSource = Array.isArray(fm.boardViewBox)
    ? fm.boardViewBox
    : fm.compositeViewBox
  boardViewBox.value = Array.isArray(boardViewBoxSource) ? boardViewBoxSource : [0, 0, 0, 0]
  if (Array.isArray(boardViewBox.value) && boardViewBox.value.length >= 4) {
    const widthUnits = boardViewBox.value[2] || 0
    const heightUnits = boardViewBox.value[3] || 0
    const mmScale = unitMmPerUnit.value || 1
    boardWidthMm.value = widthUnits * mmScale
    boardHeightMm.value = heightUnits * mmScale
  }
  logBoardScaleSnapshot('applyModernResult')
  const keep = preserveVisuals
    ? new Map(orderedLayers.map((layer) => [layer.filename, { color: layer.color, visible: layer.visible, opacity: layer.opacity }]))
    : null
  orderedLayers.splice(0)
  const fmLayers = fm.plotResult?.layers ?? []
  for (const layer of fmLayers) {
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

const collectLayerTypeSideChanges = (editedEntries, fmLayers) => {
  if (!Array.isArray(editedEntries) || !Array.isArray(fmLayers)) return []
  const baseline = new Map(
    fmLayers.map((layer) => [layer.id, { type: layer.type, side: layer.side }])
  )
  const changes = []
  for (const entry of editedEntries) {
    if (!entry?.id) continue
    const snapshot = baseline.get(entry.id)
    if (!snapshot) continue
    const nextType = entry.type ?? undefined
    const nextSide = entry.side ?? undefined
    if (snapshot.type === nextType && snapshot.side === nextSide) continue
    changes.push({
      id: entry.id,
      filename: entry.filename,
      prev: snapshot,
      next: { type: nextType, side: nextSide },
    })
  }
  return changes
}

const layerConfigEligibleFor3d = (type, side) => {
  const normalizedType = normalizeLayerType(type)
  if (!normalizedType) return false
  if (normalizedType.includes('drill') || normalizedType === 'outline') return true
  if (!structural3dTypes.has(normalizedType) && normalizedType !== 'copper') return false
  const normalizedSide = normalizeLayerSide(side)
  return normalizedSide === 'top' || normalizedSide === 'bottom'
}

const changeAffectsPcbModel = (change) => {
  if (!change) return false
  return (
    layerConfigEligibleFor3d(change.prev?.type, change.prev?.side) ||
    layerConfigEligibleFor3d(change.next?.type, change.next?.side)
  )
}

const uniquenessKeyForLayer = (type, side) => {
  const normalizedType = normalizeLayerType(type)
  if (!normalizedType) return null
  if (normalizedType === 'outline') return 'outline'
  const needsSideUniqueness = ['copper', 'soldermask', 'silkscreen', 'solderpaste'].includes(normalizedType)
  if (!needsSideUniqueness) return null
  const normalizedSide = normalizeLayerSide(side)
  if (normalizedSide === 'top' || normalizedSide === 'bottom') {
    return `${normalizedSide}:${normalizedType}`
  }
  return null
}

const describeLayerKey = (key) => {
  if (key === 'outline') return 'outline'
  if (!key) return 'layer'
  const [side, type] = key.split(':')
  return `${side} ${type}`
}

const layerUniquenessSummary = computed(() => {
  const buckets = new Map()
  for (const entry of editableLayers) {
    const key = uniquenessKeyForLayer(entry.type, entry.side)
    if (!key) continue
    const set = buckets.get(key) ?? new Set()
    set.add(entry.id)
    buckets.set(key, set)
  }
  const duplicateIds = new Set()
  const duplicateKeys = []
  for (const [key, set] of buckets.entries()) {
    if (set.size > 1) {
      duplicateKeys.push(key)
      set.forEach(id => duplicateIds.add(id))
    }
  }
  return {
    duplicateIds,
    message: duplicateKeys.length ? `以下层必须唯一：${duplicateKeys.map(describeLayerKey).join('，')}` : null,
  }
})

const duplicateLayerIds = computed(() => layerUniquenessSummary.value.duplicateIds)
const layerSettingsValidationError = computed(() => layerUniquenessSummary.value.message)

const buildParsedLayerCache = (fm) => {
  if (!fm?.plotResult?.layers || !fm?.parseTreesById) return null
  const colorMap = new Map(
    orderedLayers.map((layer) => [layer.id, { color: layer.color, opacity: layer.opacity }])
  )
  const parsed = []
  for (const layer of fm.plotResult.layers) {
    const sourceTree = fm.parseTreesById?.[layer.id]
    if (!sourceTree) continue
    const rawTree = toRaw(sourceTree)
    const parseTree = rawTree ? JSON.parse(JSON.stringify(rawTree)) : null
    if (!parseTree) continue
    const visual = colorMap.get(layer.id)
    parsed.push({
      id: layer.id,
      filename: layer.filename,
      type: layer.type,
      side: layer.side,
      parseTree,
      color: visual?.color,
      opacity: typeof visual?.opacity === 'number' ? visual.opacity : undefined,
    })
  }
  return parsed.length > 0 ? parsed : null
}

const rebuildPipelineFromCache = (fm) => {
  const parsedLayers = buildParsedLayerCache(fm)
  if (!parsedLayers) return null
  return runPerfSync('settings:cache-pipeline', () => fromParsedLayers(parsedLayers))
}

const settingsSaveDisabledReason = computed(() => {
  if (modelUpdateLockReason.value) {
    return '3D模型正在构建，完成后才能再次保存'
  }
  if (pcbModelJobs.pending > 0) {
    return '等待3D模型构建完成后再保存'
  }
  if (isLayerLoading.value) {
    return '正在保存...'
  }
  if (layerSettingsValidationError.value) {
    return layerSettingsValidationError.value
  }
  return null
})

const applySettings = async () => {
  if (settingsSaveDisabledReason.value) return
  isLayerLoading.value = true
  startPerfSession('settings', { reason: 'settings-panel' })
  const list = (memoryLayers.value || []).map((x) => ({ ...x }))
  for (const entry of editableLayers) entry.side = coerceSideForType(entry.type, entry.side)
  for (const entry of editableLayers) {
    const target = list.find((it) => it.filename === entry.filename)
    if (target) {
      target.type = entry.type
      target.side = entry.side
    }
  }
  const fm = fmRef.value
  const hasCachedPipeline = Boolean(fm?.plotResult?.layers?.length)
  let jobsQueued = false
  if (isSettingsOpen.value) {
    isSettingsOpen.value = false
  }
  try {
    if (!hasCachedPipeline) {
      const pipeline = await runPerfAsync('settings:pipeline', () =>
        fromMemoryLayers(list)
      )
      applyModernResult(pipeline, { preserveVisuals: true })
      const outlineDescriptor = refreshBoardOutlineState(pipeline.plotResult)
      jobsQueued = Boolean(
        buildPcbModelFromLayers(
          pipeline.plotResult?.layers,
          pipeline.parseTreesById,
          outlineDescriptor,
          pipeline.plotResult,
          { reset: true, reason: 'settings-full-rebuild' }
        )
      )
      recenterSignal.value += 1
      memoryLayers.value = list
      if (!jobsQueued) finalizePerfSessionIfIdle()
      return
    }
    const fmLayers = fm.plotResult?.layers ?? []
    const changes = collectLayerTypeSideChanges(editableLayers, fmLayers)
    if (changes.length === 0) {
      memoryLayers.value = list
      isSettingsOpen.value = false
      finalizePerfSessionIfIdle()
      return
    }
    const structuralChanges = changes.filter(changeAffectsPcbModel)
    const changeMap = new Map(changes.map((change) => [change.id, change]))
    for (const layer of fmLayers) {
      const change = changeMap.get(layer.id)
      if (change) {
        layer.type = change.next.type
        layer.side = change.next.side
      }
    }
    memoryLayers.value = list
    if (structuralChanges.length > 0) {
      const rebuiltPipeline = rebuildPipelineFromCache(fm)
      if (rebuiltPipeline) {
        applyModernResult(rebuiltPipeline, { preserveVisuals: true })
        recenterSignal.value += 1
        const outlineDescriptor = refreshBoardOutlineState(rebuiltPipeline.plotResult)
        jobsQueued = Boolean(
          buildPcbModelFromLayers(
            rebuiltPipeline.plotResult?.layers,
            rebuiltPipeline.parseTreesById,
            outlineDescriptor,
            rebuiltPipeline.plotResult,
            { reset: true, reason: 'settings-structural-rebuild' }
          )
        )
        if (!jobsQueued) finalizePerfSessionIfIdle()
        return
      } else {
        console.warn('[GerberViewer] Failed to rebuild pipeline from cache, falling back to stale geometry')
      }
    }
    applyModernResult(fm, { preserveVisuals: true })
    recenterSignal.value += 1
    const removedLayerIds = changes
      .filter(
        (change) =>
          layerConfigEligibleFor3d(change.prev?.type, change.prev?.side) &&
          !layerConfigEligibleFor3d(change.next?.type, change.next?.side)
      )
      .map((change) => change.id)
    if (removedLayerIds.length > 0) {
      const removeSet = new Set(removedLayerIds)
      const nextLayers = pcb3dModel.layers.filter((layer) => !removeSet.has(layer.id))
      if (nextLayers.length !== pcb3dModel.layers.length) {
        pcb3dModel.layers = nextLayers
        pcb3dModel.version += 1
      }
    }
    const outlineDescriptor = refreshBoardOutlineState(fm.plotResult)
    if (structuralChanges.length > 0) {
      jobsQueued = Boolean(
        buildPcbModelFromLayers(
          fm.plotResult?.layers ?? [],
          fm.parseTreesById,
          outlineDescriptor,
          fm.plotResult,
          { reset: true, reason: 'settings-structural-rebuild' }
        )
      )
    } else {
      const layerIds = changes.map((change) => change.id)
      jobsQueued = Boolean(
        buildPcbModelFromLayers(
          fm.plotResult?.layers ?? [],
          fm.parseTreesById,
          outlineDescriptor,
          fm.plotResult,
          { reset: false, targetLayerIds: layerIds, reason: 'settings-update' }
        )
      )
    }
    if (!jobsQueued) finalizePerfSessionIfIdle()
  } catch (error) {
    console.error('[GerberViewer] applySettings failed', error)
    if (!jobsQueued) finalizePerfSessionIfIdle()
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

watch(
  [() => boardThicknessUnits.value, () => unitMmPerUnit.value],
  () => {
    logBoardScaleSnapshot('scale-change')
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

watch(explosionActive, (active) => {
  if (!active) {
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
  componentDestroyed = true
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updatePreviewSize)
    window.removeEventListener('click', handleGlobalClick)
  }
  if (previewResizeObserver) {
    previewResizeObserver.disconnect()
    previewResizeObserver = null
  }
  disposePcbWorkers()
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

.layer-list-scroll {
  scrollbar-width: none;
}

.layer-list-scroll::-webkit-scrollbar {
  display: none;
}

.settings-select option {
  font-size: 15px;
  padding: 0.35rem 0.5rem;
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
