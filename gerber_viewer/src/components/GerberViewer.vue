<template>
  <div class="h-screen w-screen bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-100">
    <!-- 上传阶段 -->
    <div v-if="currentStatusIndex === 0" class="h-full flex items-center justify-center p-4">
      <UploadPanel @select="handleUploadFile" />
    </div>

    <!-- 预览阶段 -->
    <div v-else class="h-full flex relative">
      <!-- 预览画布 -->
      <section
        class="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-[#0f1b2d] to-[#050b16]">
        <div
          ref="previewAreaRef"
          class="flex-1 relative overflow-hidden"
          :class="activeView === '3d' ? 'bg-[#0f1220]' : ''"
        >
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
                  <div class="col-span-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex flex-col gap-3">
                    <div class="text-[11px] font-semibold text-gray-300 tracking-wide">材质与颜色</div>
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-[11px] text-gray-300 tracking-wide">表面处理</div>
                      <button
                        class="w-8 h-8 shrink-0 flex items-center justify-center rounded border border-gray-600 hover:bg-gray-800 transition"
                        :title="isPcb3dLayerVisible('surfacefinish') ? '隐藏' : '显示'"
                        @click="togglePcb3dLayerVisibility('surfacefinish')">
                        <span :class="isPcb3dLayerVisible('surfacefinish') ? 'pi pi-eye' : 'pi pi-eye-slash'" />
                      </button>
                    </div>
                    <div class="grid grid-cols-2 gap-2 items-end">
                      <div class="flex flex-col gap-1">
                        <div class="text-[11px] text-gray-400 tracking-wide">方式</div>
                        <select v-model="surfaceFinishType"
                          class="w-full px-2 py-1.5 rounded-md border border-gray-700 bg-gray-950/40 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/60">
                          <option v-for="opt in surfaceFinishOptions" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                          </option>
                        </select>
                      </div>
                      <div class="flex flex-col gap-1">
                        <div class="text-[11px] text-gray-400 tracking-wide">颜色</div>
                        <div class="flex items-center gap-3">
                          <input type="color" v-model="pcb3dColors.surfacefinish"
                            class="w-9 h-7 border border-gray-600 rounded bg-transparent" />
                          <span class="text-[11px] font-mono text-gray-400 uppercase">
                            {{ (pcb3dColors.surfacefinish || '').toUpperCase() }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="h-px bg-white/10"></div>
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
        <LayerStackPreview ref="layerStackPreviewRef" v-show="activeView === 'layers'" :ordered-layers="orderedLayers" :fm-result="fmRef"
          :board-view-box="boardViewBox" :board-width-mm="boardWidthMm" :board-height-mm="boardHeightMm"
          :measurement-active="measurementActive" :recenter-signal="recenterSignal" :active="activeView === 'layers'"
          @exit-measurement="measurementActive = false" @loading-change="handleLayerPreviewLoading"
          @perf-stats="handleLayerPerfEvent" />

        <div v-if="activeView === 'layers' && showLayerPreviewLoading"
          class="viewer-loading-overlay absolute inset-0 z-40 flex items-center justify-center text-white pointer-events-none p-4">
          <div class="viewer-loading-card viewer-loading-card--layer flex items-center gap-6 backdrop-blur"
            :style="layerLoadingOverlay.styleVars">
            <div class="loading-ring"
              :style="[layerLoadingOverlay.styleVars, { '--progress-deg': progressDegrees(layerLoadingOverlay.progress) }]">
              <span class="loading-ring__value">{{ formatPercent(layerLoadingOverlay.progress) }}</span>
            </div>
            <div class="viewer-loading-content space-y-4">
              <div class="space-y-2">
                <p class="viewer-loading-title text-lg font-semibold tracking-[0.3em] uppercase text-white/90">
                  {{ layerLoadingOverlay.title }}
                </p>
                <div class="viewer-loading-meta-row flex flex-wrap items-center gap-2 text-sm text-white/75">
                  <span class="viewer-loading-stage">{{ layerLoadingOverlay.detail }}</span>
                  <span v-if="layerLoadingOverlay.stats" class="viewer-loading-pill viewer-loading-pill--cool">
                    <span class="viewer-pill-label">生成进度</span>
                    <span class="viewer-pill-value">{{ layerLoadingOverlay.stats }}</span>
                  </span>
                </div>
              </div>
              <div class="viewer-progress-bar h-2 rounded-full bg-white/5 overflow-hidden">
                <span class="viewer-progress-fill"
                  :style="{ width: formatPercent(layerLoadingOverlay.progress) }" />
              </div>
            </div>
          </div>
        </div>

        <!-- 3D 视图 -->
        <Pcb3dPreview ref="pcb3dRef" v-show="activeView === '3d'" :model-data="pcb3dModel" :thickness="boardThicknessUnits"
          :active="activeView === '3d'" container-width="100%"
          container-height="100%" :display-width="previewSize.width"
          :display-height="previewSize.height" :explosion-active="explosionActive"
          :explosion-spacing-multiplier="explosionSpacing" :border-color="pcb3dColors.core"
          :core-color="pcb3dColors.core" :layer-colors="pcb3dColors" :layer-visibility="pcb3dVisibility"
          :surface-finish-type="surfaceFinishType"
          :layer-simplify-tolerances-mm="layerSimplifyTolerancesMm"
          :fitPadding="1.55"
          :drillLimit="drillLimit"
          @loading-change="handlePcb3dLoading"
          @perf-stats="handleViewerPerfEvent" />

        <div v-if="activeView === '3d' && showPcb3dPreviewLoading"
          class="viewer-loading-overlay absolute inset-0 z-40 flex items-center justify-center text-white pointer-events-none p-4">
          <div class="viewer-loading-card viewer-loading-card--pcb flex items-center gap-6 backdrop-blur"
            :style="pcbLoadingOverlay.styleVars">
            <div class="loading-ring"
              :style="[pcbLoadingOverlay.styleVars, { '--progress-deg': progressDegrees(pcbLoadingOverlay.progress) }]">
              <span class="loading-ring__value">{{ formatPercent(pcbLoadingOverlay.progress) }}</span>
            </div>
            <div class="viewer-loading-content space-y-4">
              <div class="space-y-2">
                <p class="viewer-loading-title text-lg font-semibold tracking-[0.3em] uppercase text-white/90">
                  {{ pcbLoadingOverlay.title }}
                </p>
                <div class="viewer-loading-meta-row flex flex-wrap items-center gap-2 text-sm text-white/75">
                  <span class="viewer-loading-stage">{{ pcbLoadingOverlay.detail }}</span>
                  <span v-if="pcbLoadingOverlay.stats" class="viewer-loading-pill viewer-loading-pill--warm">
                    <span class="viewer-pill-label">生成进度</span>
                    <span class="viewer-pill-value">{{ pcbLoadingOverlay.stats }}</span>
                  </span>
                </div>
              </div>
              <div class="viewer-progress-bar h-2 rounded-full bg-white/5 overflow-hidden">
                <span class="viewer-progress-fill"
                  :style="{ width: formatPercent(pcbLoadingOverlay.progress) }" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeView === 'layers'"
          class="absolute left-4 bottom-4 z-40 flex flex-col items-start gap-3 pointer-events-auto">
          <button v-show="!analysisPanelOpen"
            class="analysis-trigger__button flex items-center gap-2 px-4 py-3 rounded-2xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-100 shadow-[0_12px_35px_rgba(0,0,0,0.45)] hover:bg-cyan-500/30 hover:border-cyan-200/70 transition"
            :aria-pressed="analysisPanelOpen" title="DFM" @click.stop="toggleAnalysisPanel">
            <span class="pi pi-sliders-h text-base"></span>
            <span class="text-xs font-semibold uppercase tracking-[0.3em]">DFM</span>
          </button>
        </div>
        </div>

        <transition name="dfm-drawer" :css="layerPanelTransitionEnabled">
          <div v-if="analysisPanelOpen && activeView === 'layers'" class="dfm-drawer text-sm text-gray-100" @click.stop>
            <div class="dfm-drawer__header">
              <button
                class="dfm-drawer__collapse text-sm text-gray-100 hover:text-white px-3 py-1.5 rounded-md border border-white/20 bg-white/5 flex items-center gap-2"
                @click.stop="closeAnalysisPanel">
                <span class="pi pi-chevron-down text-xs"></span>
                折叠
              </button>
              <button
                class="analysis-panel__action-button analysis-panel__action-button--compact"
                type="button"
                :disabled="analysisPending"
                @click.stop="handleAnalysisAction">
                <span v-if="analysisPending" class="pi pi-spinner pi-spin text-[12px]"></span>
                {{ analysisPending ? 'DFM分析中...' : 'DFM分析' }}
              </button>
            </div>
            <div v-if="analysisError" class="analysis-panel__error">{{ analysisError }}</div>
            <div class="dfm-drawer__body">
              <div class="analysis-panel__rows">
                <div v-for="row in analysisResults" :key="row.key" class="analysis-panel-row">
                  <span class="analysis-panel-row__label">{{ row.label }}</span>
                  <div class="analysis-panel-row__value-row">
                    <span class="analysis-panel-row__value">{{ row.value }}</span>
                    <button
                      v-if="row.key === 'layerCount'"
                      class="analysis-panel-row__view-button"
                      type="button"
                      :disabled="!copperLayerOptions.length"
                      @click.stop="openCopperLayerModal"
                    >
                      <span class="pi pi-search text-[11px]"></span>
                      查看
                    </button>
                    <button
                      v-if="row.key === 'boardSize'"
                      class="analysis-panel-row__view-button"
                      type="button"
                      :disabled="!canViewBoardSizeOverlay"
                      @click.stop="showBoardSizeOverlay"
                    >
                      <span class="pi pi-search text-[11px]"></span>
                      查看
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </transition>
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

      <div
        v-if="copperLayerModalOpen && activeView === 'layers'"
        class="fixed inset-0 z-[80] flex items-center justify-center"
      >
        <div class="absolute inset-0 bg-black/60" @click="closeCopperLayerModal"></div>
        <div
          class="relative w-[980px] max-w-[96vw] max-h-[85vh] bg-gray-900 text-gray-100 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col"
        >
        <div class="px-6 py-3 border-b border-gray-800 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-base font-semibold tracking-wide">
              铜层预览<template v-if="copperLayerOptions.length">（{{ copperLayerOptions.length }}层）</template>
            </div>
            <div class="text-xs text-gray-400 mt-1 truncate">
              选择铜层以查看对应 Gerber 图形
            </div>
          </div>
          <button
            class="px-4 py-2 text-sm border border-gray-600 rounded-lg hover:bg-gray-800 transition"
            @click="closeCopperLayerModal"
          >
            关闭
          </button>
        </div>
        <div class="p-4 flex flex-col gap-3 overflow-hidden flex-1">
          <div v-if="copperLayerOptions.length" class="copper-layer-list">
            <button v-for="entry in copperLayerOptions" :key="entry.id" type="button" class="copper-layer-pill"
              :class="entry.id === selectedCopperLayerId ? 'copper-layer-pill--active' : ''"
              @click="selectedCopperLayerId = entry.id">
              <div class="copper-layer-pill__line">
                <span class="copper-layer-pill__label">{{ entry.label }}</span>
                <span class="copper-layer-pill__filename" :title="entry.filename">{{ entry.filename }}</span>
              </div>
            </button>
          </div>
          <div v-else class="text-sm text-gray-400 py-10 text-center">
            未检测到铜层文件。
          </div>
          <div class="flex-1 min-h-[280px] flex items-center justify-center overflow-hidden">
            <div class="copper-preview-square overflow-hidden">
              <div class="w-full h-full pointer-events-none">
                <LayerStackPreview v-if="selectedCopperPreviewLayers.length" :ordered-layers="selectedCopperPreviewLayers"
                  :fm-result="fmRef" :board-view-box="boardViewBox" :board-width-mm="boardWidthMm"
                  :board-height-mm="boardHeightMm" :measurement-active="false"
                  :recenter-signal="copperPreviewRecenterSignal" :active="copperLayerModalOpen" />
              </div>
            </div>
          </div>
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
import UploadPanel from './UploadPanel.vue'
import LayerStackPreview from './LayerStackPreview.vue'
import Pcb3dPreview from './Pcb3dPreview.vue'
import { orderLayerWeight, randomHexColor } from '../libs/gerber_stack'
import { resolveBoardOutlineDescriptor } from '../libs/3d/boardOutline'
import { buildAnalysisPayload, runAnalysisJob } from '../libs/analyze'
import {
  buildPipelineFromMemoryLayers,
  broadcastCompute3dGlobals,
  enqueueComputeEnigAreaJob,
  enqueueComputeFlyingProbeCountJob,
  enqueueComputePcb3dJob,
  enqueueComputeProjectSummaryJob,
  enqueueComputeTraceDataJob,
  disposeComputePool,
  resetComputeProject,
} from '../libs/compute'

const resetIcon = new URL('../assets/resetting.svg', import.meta.url).href
const measureIcon = new URL('../assets/measurement.svg', import.meta.url).href

const clampPercentValue = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric <= 0) return 0
  if (numeric >= 1) return 1
  return numeric
}

const formatPercent = (value) => `${Math.round(clampPercentValue(value) * 100)}%`
const progressDegrees = (value) => `${Math.round(clampPercentValue(value) * 360)}deg`
const lerp = (a, b, t) => a + (b - a) * t
const progressToAccent = (progress) => {
  const t = clampPercentValue(progress)
  const hue = lerp(190, 130, t)
  const sat = lerp(78, 70, t)
  const light = lerp(58, 55, t)
  const secondaryHue = Math.max(110, hue - 12)
  const toHsl = (h, s, l, alpha = 1) => `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${alpha})`
  return {
    primary: toHsl(hue, sat, light),
    secondary: toHsl(secondaryHue, Math.min(96, sat + 8), Math.max(42, light - 6)),
    glow: toHsl(hue, sat, Math.min(85, light + 20), 0.35),
    text: toHsl(hue, Math.min(95, sat + 10), Math.min(90, light + 22)),
  }
}
const buildOverlayStyles = (progress) => {
  const accent = progressToAccent(progress)
  return {
    '--viewer-accent-from': accent.primary,
    '--viewer-accent-to': accent.secondary,
    '--viewer-pill-glow': accent.glow,
    '--viewer-progress-color': accent.text,
  }
}

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
const layerPreviewLoadingState = reactive({
  active: false,
  progress: 0,
  detail: '',
  message: '',
  completed: null,
  total: null,
})
const orderedLayers = reactive([])
const memoryLayers = ref([])
const fmRef = ref(null)
const boardOutlineDescriptor = ref(null)
const boardViewBox = ref([0, 0, 0, 0])
const boardWidthMm = ref(0)
const boardHeightMm = ref(0)
const layerStackPreviewRef = ref(null)
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

const PCB3D_MODEL_FLUSH_ACTIVE_MS = 220
let pcb3dModelFlushHandle = null
let pcb3dModelDirty = false
const cancelPcb3dModelFlush = () => {
  if (pcb3dModelFlushHandle) {
    clearTimeout(pcb3dModelFlushHandle)
    pcb3dModelFlushHandle = null
  }
  pcb3dModelDirty = false
}
const flushPcb3dModel = () => {
  if (!pcb3dModelDirty || componentDestroyed) return
  pcb3dModelDirty = false
  pcb3dModel.version += 1
}
const schedulePcb3dModelFlush = ({ immediate = false } = {}) => {
  if (componentDestroyed) return
  pcb3dModelDirty = true
  if (pcb3dModelFlushHandle) return
  const delay = immediate ? 0 : activeView.value === '3d' ? PCB3D_MODEL_FLUSH_ACTIVE_MS : 0
  pcb3dModelFlushHandle = setTimeout(() => {
    pcb3dModelFlushHandle = null
    flushPcb3dModel()
  }, delay)
}
const defaultPcb3dColors = Object.freeze({
  copper: '#cc9933',
  soldermask: '#004200',
  surfacefinish: '#D0D0D6',
  silkscreen: '#ffffff',
  core: '#292900',
})
const pcb3dColors = reactive({ ...defaultPcb3dColors })
const defaultPcb3dVisibility = Object.freeze({
  copper: true,
  soldermask: true,
  surfacefinish: true,
  silkscreen: true,
  core: true,
})
const pcb3dVisibility = reactive({ ...defaultPcb3dVisibility })
const surfaceFinishOptions = Object.freeze([
  { value: 'leadfree-hasl', label: '无铅喷锡', color: '#D0D0D6' },
  { value: 'enig', label: '沉金', color: '#dabf01' },
  { value: 'osp', label: 'OSP', color: '#B37589' },
  { value: 'immersion-tin', label: '沉锡', color: '#C0C2C4' },
  { value: 'immersion-silver', label: '沉银', color: '#D8D8D8' },
])
const surfaceFinishType = ref('leadfree-hasl')
watch(
  surfaceFinishType,
  (next, prev) => {
    const selected = surfaceFinishOptions.find((opt) => opt.value === next)
    if (!selected?.color) return
    const normalizeHex = (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : ''
    const previous = surfaceFinishOptions.find((opt) => opt.value === prev)
    const currentColor = normalizeHex(pcb3dColors.surfacefinish)
    const previousColor = normalizeHex(previous?.color)
    if (!previousColor || !currentColor || currentColor === previousColor) {
      pcb3dColors.surfacefinish = selected.color
    }
  },
  { immediate: true }
)
const defaultLayerSimplifyTolerancesMm = Object.freeze({
  copper: 0.01,
  soldermask: 0.01,
  surfacefinish: 0.01,
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
      if (pcb3dModelDirty) {
        schedulePcb3dModelFlush({ immediate: true })
      }
      startSilentInnerCopperBuildIfIdle()
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
const canExplode = computed(() => {
  if (explosionActive.value) return true
  if (pcb3dModel.layers.length === 0) return false
  if (isPcb3dLoading.value) return false
  return innerCopperBuildState.pending === 0
})
const downloadMenuOpen = ref(false)
const defaultAnalysisRows = Object.freeze([
  { key: 'layerCount', label: 'PCB层数', defaultValue: '待解析' },
  { key: 'boardSize', label: 'PCB尺寸', defaultValue: '待解析' },
  { key: 'minTraceWidth', label: '最小线宽', defaultValue: '待解析' },
  { key: 'minSpacing', label: '最小间距', defaultValue: '待解析' },
  { key: 'enigArea', label: '沉金面积', defaultValue: '待解析' },
  { key: 'flyingProbeCount', label: '飞针点数', defaultValue: '待解析' },
  { key: 'minDrill', label: '最小孔径', defaultValue: '待解析' },
  { key: 'drillCount', label: '钻孔数量', defaultValue: '待解析' },
])
const analysisPanelOpen = ref(false)
const analysisResults = ref([])
const getDefaultAnalysisValue = (key) => {
  const row = defaultAnalysisRows.find((entry) => entry.key === key)
  return row?.defaultValue ?? '待解析'
}
const resetAnalysisResults = () => {
  analysisResults.value = defaultAnalysisRows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.defaultValue ?? '待解析',
  }))
}
resetAnalysisResults()
const toggleAnalysisPanel = () => {
  analysisPanelOpen.value = !analysisPanelOpen.value
}
const closeAnalysisPanel = () => {
  analysisPanelOpen.value = false
}

const copperLayerModalOpen = ref(false)
const selectedCopperLayerId = ref(null)
const copperPreviewRecenterSignal = ref(0)
const normalizeCopperSide = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return normalized || 'null'
}
const buildCopperLayerOptions = () => {
  const fmLayers = fmRef.value?.plotResult?.layers ?? []
  const indexById = new Map(fmLayers.map((layer, index) => [layer.id, index]))
  const isCopperLayer = (layer) => String(layer?.type || '').toLowerCase() === 'copper'
  const copperLayers = orderedLayers.filter(isCopperLayer)

  const byIndex = (a, b) => {
    const aIndex = Number.isFinite(Number(a?.sourceIndex)) ? Number(a.sourceIndex) : (indexById.get(a.id) ?? 0)
    const bIndex = Number.isFinite(Number(b?.sourceIndex)) ? Number(b.sourceIndex) : (indexById.get(b.id) ?? 0)
    return aIndex - bIndex
  }
  const getInnerIndex = (layer) => {
    const parsed = Number(layer?.innerCopperIndex)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
    return extractInnerCopperIndexFromFilename(layer?.filename) ?? Infinity
  }
  const byInnerIndex = (a, b) => {
    const delta = getInnerIndex(a) - getInnerIndex(b)
    if (delta !== 0) return delta
    return byIndex(a, b)
  }

  const topLayers = copperLayers.filter((layer) => normalizeCopperSide(layer.side) === 'top').sort(byIndex)
  const innerLayers = copperLayers.filter((layer) => normalizeCopperSide(layer.side) === 'inner').sort(byInnerIndex)
  const bottomLayers = copperLayers.filter((layer) => normalizeCopperSide(layer.side) === 'bottom').sort(byIndex)

  const usedIds = new Set()
  const options = []
  topLayers.forEach((layer, index) => {
    usedIds.add(layer.id)
    const suffix = topLayers.length > 1 ? ` ${index + 1}` : ''
    options.push({
      id: layer.id,
      label: `Top Copper${suffix}`,
      filename: layer.filename,
      layer,
    })
  })
  innerLayers.forEach((layer, index) => {
    usedIds.add(layer.id)
    const innerIndex = getInnerIndex(layer)
    const labelIndex = Number.isFinite(innerIndex) && innerIndex !== Infinity ? innerIndex : index + 1
    options.push({
      id: layer.id,
      label: `Inner${labelIndex} Copper`,
      filename: layer.filename,
      layer,
    })
  })
  bottomLayers.forEach((layer, index) => {
    usedIds.add(layer.id)
    const suffix = bottomLayers.length > 1 ? ` ${index + 1}` : ''
    options.push({
      id: layer.id,
      label: `Bottom Copper${suffix}`,
      filename: layer.filename,
      layer,
    })
  })

  const remaining = copperLayers
    .filter((layer) => !usedIds.has(layer.id))
    .sort(byIndex)
  remaining.forEach((layer, index) => {
    options.push({
      id: layer.id,
      label: `Copper ${index + 1}`,
      filename: layer.filename,
      layer,
    })
  })

  return options
}
const copperLayerOptions = computed(() => buildCopperLayerOptions())
const selectedCopperPreviewLayers = computed(() => {
  const selected = copperLayerOptions.value.find((entry) => entry.id === selectedCopperLayerId.value)
  const layer = selected?.layer
  if (!layer) return []
  return [
    {
      id: layer.id,
      side: layer.side,
      type: layer.type,
      weight: layer.weight,
      color: layer.color,
      visible: true,
      opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
      filename: layer.filename,
    },
  ]
})
const openCopperLayerModal = () => {
  copperLayerModalOpen.value = true
  const first = copperLayerOptions.value[0]
  selectedCopperLayerId.value = first?.id ?? null
  copperPreviewRecenterSignal.value += 1
}
const closeCopperLayerModal = () => {
  copperLayerModalOpen.value = false
}
watch(selectedCopperLayerId, () => {
  if (!copperLayerModalOpen.value) return
  copperPreviewRecenterSignal.value += 1
})
watch(copperLayerOptions, (next) => {
  if (!copperLayerModalOpen.value) return
  const selected = selectedCopperLayerId.value
  if (selected && next.some((entry) => entry.id === selected)) return
  selectedCopperLayerId.value = next[0]?.id ?? null
  copperPreviewRecenterSignal.value += 1
})
watch(copperLayerModalOpen, (open) => {
  if (!open) return
  const first = copperLayerOptions.value[0]
  selectedCopperLayerId.value = first?.id ?? null
  copperPreviewRecenterSignal.value += 1
})
const analysisPending = ref(false)
const analysisError = ref(null)
let analysisJobSeq = 0
const updateAnalysisValue = (key, value) => {
  const target = analysisResults.value.find((entry) => entry.key === key)
  if (target) target.value = value
}
const formatDimensionValue = (value) => {
  if (!Number.isFinite(value)) return null
  if (value >= 100) return value.toFixed(1)
  if (value >= 10) return value.toFixed(2)
  return value.toFixed(2)
}
const formatBoardSizeValue = (size) => {
  if (!size) return '待解析'
  const width = formatDimensionValue(size.widthMm)
  const height = formatDimensionValue(size.heightMm)
  if (!width || !height) return '待解析'
  return `${width}mm × ${height}mm`
}

const normalizeBounds = (value) => {
  if (!Array.isArray(value) || value.length < 4) return null
  const [x1, y1, x2, y2] = value.map((entry) => Number(entry))
  if (![x1, y1, x2, y2].every((entry) => Number.isFinite(entry))) return null
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  const maxX = Math.max(x1, x2)
  const maxY = Math.max(y1, y2)
  if (maxX <= minX || maxY <= minY) return null
  return [minX, minY, maxX, maxY]
}

const mergeBounds = (current, candidate) => {
  const next = normalizeBounds(candidate)
  if (!next) return current
  if (!current) return next
  return [
    Math.min(current[0], next[0]),
    Math.min(current[1], next[1]),
    Math.max(current[2], next[2]),
    Math.max(current[3], next[3]),
  ]
}

const boundsToViewBox = (bounds) => {
  const normalized = normalizeBounds(bounds)
  if (!normalized) return null
  const [minX, , maxX, maxY] = normalized
  return [minX, -maxY, maxX - minX, normalized[3] - normalized[1]]
}

const collectOutlineBounds = (fm) => {
  const layers = fm?.plotResult?.layers ?? []
  const plotTrees = fm?.plotResult?.plotTreesById ?? {}
  let bounds = null
  for (const layer of layers) {
    if (String(layer?.type || '').toLowerCase() !== 'outline') continue
    bounds = mergeBounds(bounds, plotTrees?.[layer.id]?.size)
  }
  return bounds
}

const resolveBoardSizeOverlayPayload = computed(() => {
  const fm = fmRef.value
  if (!fm) return null
  const boardShapeBounds = normalizeBounds(boardOutlineDescriptor.value?.bounds)
  const outlineBounds = collectOutlineBounds(fm)
  const resolvedBounds = boardShapeBounds ?? outlineBounds
  if (!resolvedBounds) return null
  const viewBox = boundsToViewBox(resolvedBounds)
  if (!viewBox) return null
  const mmScale = Number(unitMmPerUnit.value)
  const mmPerUnit = Number.isFinite(mmScale) && mmScale > 0 ? mmScale : 1
  const widthMm = (resolvedBounds[2] - resolvedBounds[0]) * mmPerUnit
  const heightMm = (resolvedBounds[3] - resolvedBounds[1]) * mmPerUnit
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) return null
  return {
    viewBox,
    widthMm,
    heightMm,
    source: boardShapeBounds ? 'board-shape' : outlineBounds ? 'outline' : 'fallback',
  }
})

const canViewBoardSizeOverlay = computed(() => Boolean(resolveBoardSizeOverlayPayload.value))

const showBoardSizeOverlay = () => {
  if (activeView.value !== 'layers') return
  const payload = resolveBoardSizeOverlayPayload.value
  if (!payload) return
  layerStackPreviewRef.value?.showBoardSizeOverlay?.(payload)
}
const formatTraceWidthValue = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '待解析'
  const mils = value / 0.0254
  return `${mils.toFixed(3)} mil`
}
const clearTraceMetrics = () => {
  updateAnalysisValue('minTraceWidth', getDefaultAnalysisValue('minTraceWidth'))
}
const formatAreaMm2Value = (value) => {
  if (!Number.isFinite(value) || value < 0) return null
  if (value >= 10000) return value.toFixed(0)
  if (value >= 1000) return value.toFixed(1)
  if (value >= 100) return value.toFixed(2)
  return value.toFixed(2)
}
const formatPercentValue = (value) => {
  if (!Number.isFinite(value)) return null
  return value.toFixed(2)
}
const clearEnigMetrics = () => {
  updateAnalysisValue('enigArea', getDefaultAnalysisValue('enigArea'))
}
const clearFlyingProbeMetrics = () => {
  updateAnalysisValue('flyingProbeCount', getDefaultAnalysisValue('flyingProbeCount'))
}
const formatFlyingProbeCountValue = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return getDefaultAnalysisValue('flyingProbeCount')
  return `${Math.round(numeric)}`
}
const formatEnigAreaValue = ({ areaMm2, percent } = {}) => {
  const area = formatAreaMm2Value(areaMm2)
  const ratio = formatPercentValue(percent)
  if (!area || !ratio) return getDefaultAnalysisValue('enigArea')
  return `${area} mm² (${ratio}%)`
}
const runEnigAreaAnalysis = async () => {
  const fm = fmRef.value
  const projectId = fm?.__compute?.projectId ?? null
  const boardOutline = toRaw(boardOutlineDescriptor.value)
  let boardPolygons = boardOutline?.polygons ?? null
  const boardBounds = Array.isArray(boardOutline?.bounds) ? boardOutline.bounds : null
  if (!Array.isArray(boardPolygons) || boardPolygons.length === 0) {
    const bounds = Array.isArray(boardOutline?.bounds) ? boardOutline.bounds : null
    if (bounds && bounds.length >= 4) {
      const [x1, y1, x2, y2] = bounds.map((value) => Number(value))
      if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
        const minX = Math.min(x1, x2)
        const minY = Math.min(y1, y2)
        const maxX = Math.max(x1, x2)
        const maxY = Math.max(y1, y2)
        if (maxX > minX && maxY > minY) {
          boardPolygons = [
            [
              [
                [minX, minY],
                [maxX, minY],
                [maxX, maxY],
                [minX, maxY],
                [minX, minY],
              ],
            ],
          ]
        }
      }
    }
  }
  if (!projectId || !Array.isArray(boardPolygons) || boardPolygons.length === 0) return null

  const normalizeType = (value) => String(value || '').toLowerCase()
  const normalizeSide = (value) => String(value || '').toLowerCase()
  const basename = (value) => {
    const raw = String(value || '')
    const parts = raw.split(/[\\/]/)
    return (parts[parts.length - 1] || raw).toLowerCase()
  }
  const hasToken = (name, token) => {
    if (!name || !token) return false
    const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(String(name))
  }
  const inferSideFromFilename = (filename) => {
    const name = basename(filename)
    if (!name) return null
    if (hasToken(name, 'top') || hasToken(name, 'front')) return 'top'
    if (hasToken(name, 'bot') || hasToken(name, 'bottom') || hasToken(name, 'back')) return 'bottom'
    if (name.endsWith('.gtl') || name.endsWith('.gts') || name.endsWith('.gto') || name.endsWith('.gtp')) return 'top'
    if (name.endsWith('.gbl') || name.endsWith('.gbs') || name.endsWith('.gbo') || name.endsWith('.gbp')) return 'bottom'
    if (hasToken(name, 'f_cu') || hasToken(name, 'f.mask') || hasToken(name, 'f_mask') || hasToken(name, 'f.paste') || hasToken(name, 'f_paste') || hasToken(name, 'f.silks') || hasToken(name, 'f_silks')) return 'top'
    if (hasToken(name, 'b_cu') || hasToken(name, 'b.mask') || hasToken(name, 'b_mask') || hasToken(name, 'b.paste') || hasToken(name, 'b_paste') || hasToken(name, 'b.silks') || hasToken(name, 'b_silks')) return 'bottom'
    return null
  }
  const inferTypeFromFilename = (filename) => {
    const name = basename(filename)
    if (!name) return null
    if (name.endsWith('.gtl') || name.endsWith('.gbl')) return 'copper'
    if (name.endsWith('.gts') || name.endsWith('.gbs')) return 'soldermask'
    if (name.includes('soldermask') || name.includes('solder_mask') || hasToken(name, 'mask')) return 'soldermask'
    if (name.includes('copper') || hasToken(name, 'cu')) return 'copper'
    return null
  }
  const classifyLayer = (layer) => {
    const rawType = normalizeType(layer?.type)
    const inferredType = inferTypeFromFilename(layer?.filename)
    const rawSide = normalizeSide(layer?.side)
    const inferredSide = inferSideFromFilename(layer?.filename)
    return {
      type: rawType || inferredType || '',
      side: rawSide || inferredSide || '',
    }
  }
  const isCopperLayer = (type) => {
    const normalized = String(type || '').toLowerCase()
    return normalized === 'copper' || normalized.includes('copper')
  }
  const isSoldermaskLayer = (type) => {
    const normalized = String(type || '').toLowerCase()
    return normalized === 'soldermask' || normalized.includes('soldermask') || normalized === 'mask'
  }
  const fmLayers = fm?.plotResult?.layers ?? []

  const copperTopIds = fmLayers
    .filter((layer) => {
      const {type, side} = classifyLayer(layer)
      return isCopperLayer(type) && side === 'top'
    })
    .map((layer) => layer.id)
  const copperBottomIds = fmLayers
    .filter((layer) => {
      const {type, side} = classifyLayer(layer)
      return isCopperLayer(type) && side === 'bottom'
    })
    .map((layer) => layer.id)
  const maskTopIds = fmLayers
    .filter((layer) => {
      const {type, side} = classifyLayer(layer)
      return isSoldermaskLayer(type) && side === 'top'
    })
    .map((layer) => layer.id)
  const maskBottomIds = fmLayers
    .filter((layer) => {
      const {type, side} = classifyLayer(layer)
      return isSoldermaskLayer(type) && side === 'bottom'
    })
    .map((layer) => layer.id)

  const drillLayerIds = fmLayers
    .filter((layer) => normalizeType(layer?.type) === 'drill')
    .map((layer) => layer.id)

  const canComputeProbeTop = maskTopIds.length > 0
  const canComputeProbeBottom = maskBottomIds.length > 0
  const canComputeProbe = canComputeProbeTop || canComputeProbeBottom

  const canComputeEnigTop = copperTopIds.length > 0 && maskTopIds.length > 0
  const canComputeEnigBottom = copperBottomIds.length > 0 && maskBottomIds.length > 0
  const canComputeEnig = canComputeEnigTop || canComputeEnigBottom

  if (!canComputeEnig && !canComputeProbe) {
    console.warn('[GerberViewer] DFM analysis skipped: missing soldermask layers', {
      copperTop: copperTopIds.length,
      copperBottom: copperBottomIds.length,
      maskTop: maskTopIds.length,
      maskBottom: maskBottomIds.length,
      layers: fmLayers.map((layer) => ({
        id: layer?.id ?? null,
        filename: layer?.filename ?? null,
        type: layer?.type ?? null,
        side: layer?.side ?? null,
        classified: classifyLayer(layer),
      })),
    })
    return null
  }

  const mmPerUnit = unitMmPerUnit.value

  const holeWallPayload =
    drillLayerIds.length > 0 && canComputeEnigTop && canComputeEnigBottom
      ? {
          copperTopLayerIds: copperTopIds,
          copperBottomLayerIds: copperBottomIds,
          soldermaskTopLayerIds: maskTopIds,
          soldermaskBottomLayerIds: maskBottomIds,
          boardThicknessMm: resolvedBoardThicknessMm.value,
        }
      : null
  const holeWallComputeSide = holeWallPayload ? (canComputeEnigTop ? 'top' : canComputeEnigBottom ? 'bottom' : null) : null

  const enigJobForSide = (side) => {
    if (side === 'top') {
      if (!canComputeEnigTop) return Promise.resolve(null)
      return enqueueComputeEnigAreaJob({
        projectId,
        side,
        copperLayerIds: copperTopIds,
        soldermaskLayerIds: maskTopIds,
        drillLayerIds,
        holeWall: side === holeWallComputeSide ? holeWallPayload : undefined,
        mmPerUnit,
        boardBounds,
        boardPolygons,
      })
    }
    if (!canComputeEnigBottom) return Promise.resolve(null)
    return enqueueComputeEnigAreaJob({
      projectId,
      side,
      copperLayerIds: copperBottomIds,
      soldermaskLayerIds: maskBottomIds,
      drillLayerIds,
      holeWall: side === holeWallComputeSide ? holeWallPayload : undefined,
      mmPerUnit,
      boardBounds,
      boardPolygons,
    })
  }

  const probeJob = () => {
    if (!canComputeProbe) return Promise.resolve(null)
    return enqueueComputeFlyingProbeCountJob({
      projectId,
      soldermaskTopLayerIds: maskTopIds,
      soldermaskBottomLayerIds: maskBottomIds,
      drillLayerIds,
      mmPerUnit,
      boardBounds,
      boardPolygons,
    })
  }

  const [topEnigResult, bottomEnigResult, probeResult] = await Promise.allSettled([
    enigJobForSide('top'),
    enigJobForSide('bottom'),
    probeJob(),
  ])

  const unwrap = (settled) => {
    if (!settled) return { value: null, error: null }
    if (settled.status === 'fulfilled') return { value: settled.value, error: null }
    const reason = settled.reason
    const error = reason instanceof Error ? reason : new Error(reason?.message || String(reason || 'ENIG analysis failed'))
    return { value: null, error }
  }
  const topEnigOutcome = unwrap(topEnigResult)
  const bottomEnigOutcome = unwrap(bottomEnigResult)
  const probeOutcome = unwrap(probeResult)

  if (topEnigOutcome.error) console.warn('[GerberViewer] ENIG top analysis failed', topEnigOutcome.error)
  if (bottomEnigOutcome.error) console.warn('[GerberViewer] ENIG bottom analysis failed', bottomEnigOutcome.error)
  if (probeOutcome.error) console.warn('[GerberViewer] flying probe analysis failed', probeOutcome.error)

  const top = topEnigOutcome.value
  const bottom = bottomEnigOutcome.value
  const probe = probeOutcome.value

  const enig = (() => {
    if (!top && !bottom) return null
    const boardAreaMm2 = Number(top?.boardAreaMm2 ?? bottom?.boardAreaMm2 ?? 0)
    const planarAreaMm2 = Number(top?.enigAreaMm2 ?? 0) + Number(bottom?.enigAreaMm2 ?? 0)
    const holeWallAreaMm2 = Number(top?.holeWall?.holeWallEnigAreaMm2 ?? bottom?.holeWall?.holeWallEnigAreaMm2 ?? 0)
    const totalAreaMm2 = planarAreaMm2 + holeWallAreaMm2
    const percent = boardAreaMm2 > 0 ? (totalAreaMm2 / boardAreaMm2) * 100 : 0
    return { areaMm2: totalAreaMm2, percent, boardAreaMm2, holeWallAreaMm2, top, bottom }
  })()

  const flyingProbeCount = (() => {
    if (!probe) return null
    const total = Number(probe?.flyingProbeCount ?? 0)
    return Number.isFinite(total) && total >= 0 ? total : null
  })()

  if (!enig && flyingProbeCount === null) return null
  return { enig, flyingProbeCount }
}
const applyAnalysisResult = (result) => {
  if (!analysisResults.value.length) return
  const layerCount = Number(result?.copperLayerCount)
  updateAnalysisValue(
    'layerCount',
    Number.isFinite(layerCount) && layerCount >= 0 ? `${layerCount}` : '待解析'
  )
  updateAnalysisValue('boardSize', formatBoardSizeValue(result?.boardSize))
  if (Number.isFinite(result?.minTraceWidth)) {
    updateAnalysisValue('minTraceWidth', formatTraceWidthValue(result.minTraceWidth))
  }
}
const runAnalysis = ({ includeTraceMetrics = false } = {}) => {
  if (!includeTraceMetrics) {
    clearTraceMetrics()
  }
  if (includeTraceMetrics) {
    analysisPending.value = true
    analysisError.value = null
    clearTraceMetrics()
    clearEnigMetrics()
    clearFlyingProbeMetrics()
  }
  const jobId = ++analysisJobSeq
  return (async () => {
    try {
      let traceDataByLayerId = null
      let enigPromise = null
      if (includeTraceMetrics) {
        enigPromise = runEnigAreaAnalysis()
      }
      if (includeTraceMetrics) {
        const projectId = fmRef.value?.__compute?.projectId ?? null
        const fmLayers = fmRef.value?.plotResult?.layers ?? []
        const copperIds = fmLayers
          .filter((layer) => String(layer?.type || '').toLowerCase() === 'copper')
          .map((layer) => layer.id)
        if (projectId && copperIds.length) {
          const traceResult = await enqueueComputeTraceDataJob({
            projectId,
            layerIds: copperIds,
          })
          traceDataByLayerId = traceResult?.traceDataByLayerId ?? null
        }
      }
      if (jobId !== analysisJobSeq) return
      const payload = buildAnalysisPayload({
        fm: fmRef.value,
        boardOutlineDescriptor: boardOutlineDescriptor.value,
        unitMmPerUnit: unitMmPerUnit.value,
        includeTraceMetrics,
        traceDataByLayerId,
      })
      if (!payload) {
        if (includeTraceMetrics) clearTraceMetrics()
        return
      }
      const analysisPromise = runAnalysisJob(payload)
      const [result, enigResult] = await Promise.all([
        analysisPromise,
        enigPromise
          ? enigPromise.catch((error) => ({ __error: error }))
          : Promise.resolve(null),
      ])
      if (jobId !== analysisJobSeq) return
      applyAnalysisResult(result)
      if (includeTraceMetrics) {
        if (enigResult?.__error) {
          console.error('[GerberViewer] ENIG analysis failed', enigResult.__error)
          analysisError.value = enigResult.__error?.message || '沉金面积解析失败'
          clearEnigMetrics()
          clearFlyingProbeMetrics()
        } else if (enigResult) {
          const enigMetrics = enigResult?.enig ?? null
          if (enigMetrics) {
            updateAnalysisValue(
              'enigArea',
              formatEnigAreaValue({ areaMm2: enigMetrics.areaMm2, percent: enigMetrics.percent })
            )
            if (enablePerfLogs && Number(enigMetrics.areaMm2) === 0) {
              console.warn('[GerberViewer] ENIG area computed as 0', {
                boardAreaMm2: enigMetrics.boardAreaMm2 ?? null,
                top: enigMetrics.top ?? null,
                bottom: enigMetrics.bottom ?? null,
              })
            }
          } else {
            clearEnigMetrics()
          }

          updateAnalysisValue(
            'flyingProbeCount',
            formatFlyingProbeCountValue(enigResult?.flyingProbeCount ?? null)
          )
        } else {
          clearEnigMetrics()
          clearFlyingProbeMetrics()
        }
      }
    } catch (error) {
      if (jobId !== analysisJobSeq) return
      if (includeTraceMetrics) {
        analysisError.value = error?.message || '解析失败'
        console.error('[GerberViewer] analysis worker failed', error)
        clearTraceMetrics()
        clearEnigMetrics()
        clearFlyingProbeMetrics()
      }
    } finally {
      if (jobId === analysisJobSeq && includeTraceMetrics) {
        analysisPending.value = false
      }
    }
  })()
}
const handleAnalysisAction = () => {
  runAnalysis({ includeTraceMetrics: true })
}
const previewAreaRef = ref(null)
const previewSize = reactive({ width: 0, height: 0 })
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
  surfaceFinishType.value = 'leadfree-hasl'
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
const recordWorkerJobStart = (jobId, payload) => {
  workerDebugLog.jobs.push({
    jobId,
    timestamp: Date.now(),
    perfSessionId: pipelinePerfSession.id,
    layerId: payload.layerId,
    type: payload.type,
    side: payload.side ?? null,
    outline: Boolean(payload.outline),
    hasSyntheticOutline:
      Array.isArray(payload.syntheticOutlineRegions) && payload.syntheticOutlineRegions.length > 0,
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
  } else if (!success) {
    entry.errorMessage = message || 'unknown worker failure'
  }
  if (entry.perfSessionId && entry.perfSessionId === pipelinePerfSession.id) {
    recordWorkerPerfMetrics(entry, result, success, message)
    markPerfWorkerJobComplete()
  }
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
const layerLoadingOverlay = computed(() => {
  const completed = Number.isFinite(layerPreviewLoadingState.completed)
    ? layerPreviewLoadingState.completed
    : null
  const total = Number.isFinite(layerPreviewLoadingState.total)
    ? layerPreviewLoadingState.total
    : null
  const stats =
    completed !== null && total && total > 0 ? `${Math.min(completed, total)}/${total} 层` : null
  const fallbackDetail = layerPreviewLoadingState.message
    || (isLayerLoading.value ? '正在解析叠层数据' : '刷新图层视图')
  const detail = layerPreviewLoadingState.detail || fallbackDetail
  let progress = clampPercentValue(layerPreviewLoadingState.progress)
  if (isLayerLoading.value && progress <= 0.05) progress = 0.12
  if (!layerPreviewLoadingState.active && isLayerLoading.value) progress = Math.max(progress, 0.1)
  if (isLayerRenderLoading.value && progress <= 0) progress = 0.05
  return {
    title: '叠层初始化构建',
    detail,
    progress,
    stats,
    styleVars: buildOverlayStyles(progress),
  }
})
const pcbWorkerProgress = computed(() => {
  const total = pcbModelJobs.total
  if (total <= 0) {
    if (workerLoading.value) return 0.05
    if (viewerLoading.value) return 0.95
    return 1
  }
  const completed = Math.max(0, total - pcbModelJobs.pending)
  const ratio = completed / Math.max(1, total)
  return clampPercentValue(ratio)
})
const pcbLoadingOverlay = computed(() => {
  const total = pcbModelJobs.total
  const completed = Math.max(0, total - pcbModelJobs.pending)
  const stats = total > 0 ? `${completed}/${total} 层` : null
  let progress = pcbWorkerProgress.value
  let detail = ''
  if (workerLoading.value) {
    detail = stats ? `几何数据生成中（${stats}）` : '几何数据生成中'
    if (progress <= 0.05) progress = 0.05
  } else if (viewerLoading.value) {
    detail = '同步 3D 场景'
    progress = progress >= 1 ? 0.95 : Math.max(progress, 0.9)
  } else if (isLayerLoading.value) {
    detail = '等待叠层数据完成'
    progress = Math.max(progress, 0.6)
  } else {
    detail = '准备完成'
    progress = 1
  }
  return {
    title: 'PCB 3D 模型构建',
    detail,
    progress: clampPercentValue(progress),
    stats,
    styleVars: buildOverlayStyles(progress),
  }
})

// 设置面板
const isSettingsOpen = ref(false)
const editableLayers = reactive([])
const defaultLayerColors = {
  copper: '#f2c55b',
  soldermask: '#1c7a2a',
  surfacefinish: '#D0D0D6',
  silkscreen: '#ffffff',
  drill: '#333333',
  outline: '#bfa782',
}
const structural3dTypes = new Set(['copper', 'soldermask', 'silkscreen'])
const normalizeLayerType = (value) => {
  if (typeof value !== 'string') return ''
  return value.toLowerCase()
}
const normalizeLayerSide = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase()
  return normalized === 'top' || normalized === 'bottom' ? normalized : null
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
  const size = plotResult.plotTreesById[layer.id]?.size
  if (!size) return true
  if (hasPositiveBounds(size)) return true
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
const pcbWorkerQueue = []
let pcbWorkerActive = 0
let activeComputeProjectId = null
let pcbModelBuildSeq = 0
let activePcbModelBuildId = 0
let pendingInnerCopperBuild = null
const innerCopperLayerCache = new Map()
const innerCopperBuildState = reactive({
  buildId: 0,
  pending: 0,
  total: 0,
})
const resetInnerCopperBuildState = () => {
  innerCopperBuildState.buildId = 0
  innerCopperBuildState.pending = 0
  innerCopperBuildState.total = 0
}
const markInnerCopperBuildJobComplete = (buildId) => {
  if (innerCopperBuildState.buildId !== buildId) return
  innerCopperBuildState.pending = Math.max(0, innerCopperBuildState.pending - 1)
}

const assignQueuedWorkerJobs = () => {
  if (!activeComputeProjectId) return
  while (pcbWorkerActive < pcbWorkerConcurrency) {
    const nextJob = pcbWorkerQueue.shift()
    if (!nextJob) break
    const { jobId, payload, projectId } = nextJob
    pcbWorkerActive += 1
    enqueueComputePcb3dJob({ projectId, payload })
      .then((result) => {
        const entry = pcbWorkerJobs.get(jobId)
        if (entry) {
          pcbWorkerJobs.delete(jobId)
          entry.resolve(result)
        }
      })
      .catch((error) => {
        const entry = pcbWorkerJobs.get(jobId)
        if (entry) {
          pcbWorkerJobs.delete(jobId)
          entry.reject(error)
        }
      })
      .finally(() => {
        pcbWorkerActive = Math.max(0, pcbWorkerActive - 1)
        assignQueuedWorkerJobs()
      })
  }
}

const disposePcbWorkers = () => {
  pcbWorkerQueue.splice(0)
  pcbWorkerJobs.forEach((entry) => entry.reject?.(new Error('pcb build cancelled')))
  pcbWorkerJobs.clear()
  pcbWorkerActive = 0
  activeComputeProjectId = null
  activePcbModelBuildId = 0
  cancelPcb3dModelFlush()
}

const getLayerColor = (layerId, type) => {
  const matched = orderedLayers.find((layer) => layer.id === layerId)
  if (matched?.color) return matched.color
  return defaultLayerColors[type] || '#ffffff'
}

const resetPcbModelState = () => {
  cancelPcb3dModelFlush()
  pcb3dModel.layers = []
  pcb3dModel.version += 1
}

let componentDestroyed = false

const updateWorkerLoading = () => {
  if (componentDestroyed) return
  workerLoading.value = pcbModelJobs.pending > 0
}

const queueWorkerJob = (projectId, payload, { silent = false } = {}) => {
  const jobId = ++pcbWorkerSeq
  if (!silent) {
    pcbModelJobs.pending += 1
    updateWorkerLoading()
    recordWorkerJobStart(jobId, payload)
  }
  const startTime = performance.now()
  if (enablePerfLogs) {
    console.log('[GerberViewer] queue worker job', {
      jobId,
      layerId: payload.layerId,
      type: payload.type,
      side: payload.side,
      silent,
    })
  }
  return new Promise((resolve, reject) => {
    pcbWorkerJobs.set(jobId, {
      resolve: (result) => {
        if (!silent) {
          pcbModelJobs.pending = Math.max(0, pcbModelJobs.pending - 1)
          updateWorkerLoading()
          recordWorkerJobResult(jobId, { success: true, result })
        }
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
        if (!silent) {
          pcbModelJobs.pending = Math.max(0, pcbModelJobs.pending - 1)
          updateWorkerLoading()
          recordWorkerJobResult(jobId, { success: false, message: error?.message })
        }
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
    pcbWorkerQueue.push({ jobId, projectId, payload })
    activeComputeProjectId = projectId
    assignQueuedWorkerJobs()
  })
}

const applyWorkerLayer = (payload, buildId) => {
  if (!payload || componentDestroyed) return
  if (!buildId || buildId !== activePcbModelBuildId) return
  const fmLayers = fmRef.value?.plotResult?.layers ?? []
  const fmLayer = fmLayers.find((layer) => layer.id === payload.layerId)
  const filename = fmLayer?.filename ?? payload.layerId
  const layers = pcb3dModel.layers.filter((entry) => entry.id !== payload.layerId)
  layers.push({
    id: payload.layerId,
    type: payload.type,
    side: payload.side,
    filename,
    color: payload.color,
    mesh: payload.mesh,
    meshSummary: payload.meshSummary ?? summarizeMeshData(payload.mesh),
  })
  pcb3dModel.layers = layers
  if (activeView.value === '3d') {
    schedulePcb3dModelFlush()
  } else {
    pcb3dModelDirty = true
  }
}

const requestSilentInnerCopperBuild = ({ buildId, projectId, layers, plotResult }) => {
  if (!buildId || !projectId || !Array.isArray(layers) || layers.length === 0) {
    pendingInnerCopperBuild = null
    resetInnerCopperBuildState()
    return
  }
  const eligible = layers.filter((layer) => {
    if (!layer) return false
    if (normalizeLayerType(layer.type) !== 'copper') return false
    if (String(layer.side || '').toLowerCase() !== 'inner') return false
    return layerHasRenderableGeometry(layer, plotResult)
  })
  innerCopperBuildState.buildId = buildId
  innerCopperBuildState.pending = eligible.length
  innerCopperBuildState.total = eligible.length
  pendingInnerCopperBuild = {
    buildId,
    projectId,
    layers: eligible.map((layer) => ({
      id: layer.id,
      type: layer.type,
      side: layer.side ?? null,
    })),
    started: false,
  }
  startSilentInnerCopperBuildIfIdle()
}

const startSilentInnerCopperBuildIfIdle = () => {
  if (componentDestroyed) return
  const snapshot = pendingInnerCopperBuild
  if (!snapshot || snapshot.started) return
  if (pcbModelJobs.pending > 0) return
  if (snapshot.buildId !== activePcbModelBuildId) return
  const existingLayerIds = new Set(pcb3dModel.layers.map((entry) => entry.id))
  const layersToBuild = Array.isArray(snapshot.layers)
    ? snapshot.layers.filter((layer) => layer?.id && !existingLayerIds.has(layer.id))
    : []
  if (innerCopperBuildState.buildId === snapshot.buildId) {
    innerCopperBuildState.pending = layersToBuild.length
    innerCopperBuildState.total = layersToBuild.length
  }
  if (layersToBuild.length === 0) {
    pendingInnerCopperBuild.started = true
    return
  }
  pendingInnerCopperBuild.started = true
  const simplifyTolerancePayload = buildSimplifyTolerancePayload()
  for (const layer of layersToBuild) {
    queueWorkerJob(
      snapshot.projectId,
      {
        layerId: layer.id,
        type: layer.type,
        side: layer.side,
        color: getLayerColor(layer.id, layer.type),
        outline: false,
        simplifyTolerances: simplifyTolerancePayload,
      },
      { silent: true }
    )
      .then((result) => {
        if (snapshot.buildId !== activePcbModelBuildId) return
        if (result?.layerId) innerCopperLayerCache.set(result.layerId, result)
        if (explosionActive.value) applyWorkerLayer(result, snapshot.buildId)
      })
      .catch((error) => {
        console.warn('[GerberViewer] Silent inner copper build failed', error)
      })
      .finally(() => {
        markInnerCopperBuildJobComplete(snapshot.buildId)
      })
  }
}

const applyCachedInnerCopperLayers = () => {
  if (componentDestroyed) return
  if (!explosionActive.value) return
  if (!innerCopperLayerCache.size) return
  const buildId = activePcbModelBuildId
  const existingLayerIds = new Set(pcb3dModel.layers.map((entry) => entry.id))
  for (const result of innerCopperLayerCache.values()) {
    if (!result?.layerId) continue
    if (existingLayerIds.has(result.layerId)) continue
    applyWorkerLayer(result, buildId)
  }
}

const refreshBoardOutlineState = (plotResult) => {
  if (!plotResult) {
    boardOutlineDescriptor.value = null
    return null
  }
  const descriptor = resolveBoardOutlineDescriptor(plotResult)
  boardOutlineDescriptor.value = descriptor ? markRaw(descriptor) : null
  runAnalysis()
  return descriptor
}

const buildPcbModelFromLayers = (layers, boardOutline, plotResult = null, options = {}) => {
  if (!Array.isArray(layers) || layers.length === 0) return false
  const {
    reset = true,
    targetLayerIds = null,
    reason = reset ? 'pcb-model' : 'pcb-model-partial',
    projectId = fmRef.value?.__compute?.projectId ?? null,
  } = options
  if (!projectId) {
    console.warn('[GerberViewer] Missing compute project id; skipping 3D model build')
    return false
  }
  const buildId = ++pcbModelBuildSeq
  const targetLayerSet =
    Array.isArray(targetLayerIds) && targetLayerIds.length > 0
      ? new Set(targetLayerIds)
      : null
  const candidateLayers = targetLayerSet
    ? layers.filter((layer) => targetLayerSet.has(layer.id))
    : layers
  if (!reset && candidateLayers.length === 0) return false
  if (reset) {
    disposePcbWorkers()
    resetPcbModelState()
    innerCopperLayerCache.clear()
    pendingInnerCopperBuild = null
    resetInnerCopperBuildState()
    pcbModelJobs.total = 0
    pcbModelJobs.pending = 0
    updateWorkerLoading()
  }
  activePcbModelBuildId = buildId
  const boardRegions = Array.isArray(boardOutline?.regions) ? boardOutline.regions : undefined
  logBoardScaleSnapshot(reset ? 'buildPcbModelFromLayers' : 'updatePcbModelLayers')
  const simplifyTolerancePayload = buildSimplifyTolerancePayload()
  const layersFor3d = candidateLayers.filter(
    (layer) => isLayerEligibleFor3d(layer) && layerHasRenderableGeometry(layer, plotResult)
  )
  const surfaceFinishJobs = []
  const soldermaskBySide = new Map()
  for (const layer of layersFor3d) {
    const normalizedType = normalizeLayerType(layer?.type)
    if (normalizedType !== 'soldermask') continue
    const side = normalizeLayerSide(layer?.side)
    if (side !== 'top' && side !== 'bottom') continue
    if (!soldermaskBySide.has(side)) {
      soldermaskBySide.set(side, layer.id)
    }
  }
  for (const [side, sourceLayerId] of soldermaskBySide.entries()) {
    surfaceFinishJobs.push({
      layerId: `${sourceLayerId}__surfacefinish__`,
      sourceLayerId,
      type: 'surfacefinish',
      side,
    })
  }
  const hasOutlineLayer = layersFor3d.some((layer) => layer.type === 'outline')
  const syntheticOutlineNeeded =
    reset && !hasOutlineLayer && Array.isArray(boardRegions) && boardRegions.length > 0
  const totalJobs =
    layersFor3d.length + surfaceFinishJobs.length + (syntheticOutlineNeeded ? 1 : 0)
  if (totalJobs === 0) {
    planPerfWorkerJobs(0)
    pcbModelJobs.total = 0
    return false
  }
  planPerfWorkerJobs(totalJobs)
  pcbModelJobs.total = totalJobs
  modelUpdateLockReason.value = reason
  for (const layer of layersFor3d) {
    queueWorkerJob(projectId, {
      layerId: layer.id,
      type: layer.type,
      side: layer.side ?? null,
      color: getLayerColor(layer.id, layer.type),
      outline: layer.type === 'outline',
      simplifyTolerances: simplifyTolerancePayload,
    })
      .then((result) => {
        applyWorkerLayer(result, buildId)
      })
      .catch((error) => {
        console.error('[GerberViewer] PCB worker failed', error)
      })
  }
  for (const job of surfaceFinishJobs) {
    queueWorkerJob(projectId, {
      layerId: job.layerId,
      sourceLayerId: job.sourceLayerId,
      type: job.type,
      side: job.side ?? null,
      color: pcb3dColors.surfacefinish ?? '#dabf01',
      outline: false,
      simplifyTolerances: simplifyTolerancePayload,
    })
      .then((result) => {
        applyWorkerLayer(result, buildId)
      })
      .catch((error) => {
        console.error('[GerberViewer] PCB worker failed', error)
      })
  }
  if (syntheticOutlineNeeded) {
    queueWorkerJob(projectId, {
      layerId: '__synthetic-board-outline__',
      type: 'outline',
      side: 'all',
      color: getLayerColor('__synthetic-board-outline__', 'outline'),
      outline: true,
      syntheticOutlineRegions: boardRegions,
      simplifyTolerances: simplifyTolerancePayload,
    })
      .then((result) => {
        applyWorkerLayer(result, buildId)
      })
      .catch((error) => {
        console.error('[GerberViewer] Synthetic board outline build failed', error)
      })
  }

  if (reset) {
    requestSilentInnerCopperBuild({
      buildId,
      projectId,
      layers: candidateLayers,
      plotResult,
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
const resetLayerPreviewLoadingState = () => {
  layerPreviewLoadingState.active = false
  layerPreviewLoadingState.progress = 1
  layerPreviewLoadingState.detail = ''
  layerPreviewLoadingState.message = ''
  layerPreviewLoadingState.completed = null
  layerPreviewLoadingState.total = null
}
const applyLayerPreviewLoadingPayload = (payload) => {
  layerPreviewLoadingState.active = Boolean(payload.active)
  layerPreviewLoadingState.progress = clampPercentValue(payload.progress ?? 0)
  layerPreviewLoadingState.detail = payload.detail || ''
  layerPreviewLoadingState.message = payload.message || ''
  layerPreviewLoadingState.completed = Number.isFinite(payload.completed)
    ? payload.completed
    : null
  layerPreviewLoadingState.total = Number.isFinite(payload.total)
    ? payload.total
    : null
}
const handleLayerPreviewLoading = (payload) => {
  if (payload && typeof payload === 'object') {
    const active = Boolean(payload.active)
    isLayerRenderLoading.value = active
    applyLayerPreviewLoadingPayload(payload)
    if (!active) resetLayerPreviewLoadingState()
    return
  }
  const active = Boolean(payload)
  isLayerRenderLoading.value = active
  if (!active) {
    resetLayerPreviewLoadingState()
    return
  }
  applyLayerPreviewLoadingPayload({ active: true, progress: 0, detail: '叠层视图刷新中' })
}
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
    disposePcbWorkers()
    await resetComputeProject()
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
      buildPipelineFromMemoryLayers(memoryLayers.value, { drillLimit: drillLimit.value })
    )
    runPerfSync('upload:buildOrderedLayers', () => applyModernResult(pipeline))
    const outlineDescriptor = refreshBoardOutlineState(pipeline.plotResult)
    const computeProjectId = pipeline?.__compute?.projectId ?? null
    await broadcastCompute3dGlobals({
      projectId: computeProjectId,
      boardOutline: outlineDescriptor
        ? { bounds: outlineDescriptor.bounds, regions: outlineDescriptor.regions, polygons: outlineDescriptor.polygons }
        : null,
      drillShapes: pipeline?.__compute?.drillShapes ?? null,
    })
    buildPcbModelFromLayers(
      pipeline.plotResult?.layers,
      outlineDescriptor,
      pipeline.plotResult,
      { reset: true, reason: 'initializing', projectId: computeProjectId }
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
const extractInnerCopperIndexFromFilename = (filename) => {
  const raw = String(filename || '')
  const base = raw.split(/[\\/]/).pop() || raw
  const match = base.match(/\.g(\d+)$/i)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
const isInnerCopperLayer = (layer) => {
  const type = normalizeLayerType(layer?.type)
  const side = typeof layer?.side === 'string' ? layer.side.toLowerCase() : ''
  return type === 'copper' && side === 'inner'
}

const displayLayerName = (layer) => {
  if (layer?.type === 'outline') return 'outline'
  if (layer?.type === 'drill' && (!layer?.side || layer.side === 'all')) return 'drill'
  if ((!layer?.side || layer.side === undefined || layer.side === null) && layer?.type === 'drawing') return 'unknown layer'
  if (isInnerCopperLayer(layer)) {
    const index = Number.isFinite(Number(layer?.innerCopperIndex))
      ? Number(layer.innerCopperIndex)
      : extractInnerCopperIndexFromFilename(layer?.filename)
    return index ? `inner${index} copper` : 'inner copper'
  }
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
  for (let index = 0; index < fmLayers.length; index += 1) {
    const layer = fmLayers[index]
    const retained = keep?.get(layer.filename)
    const color = retained?.color ?? randomHexColor()
    const visible = retained?.visible ?? true
    const opacity = typeof retained?.opacity === 'number' ? retained.opacity : 1
    const innerCopperIndex = isInnerCopperLayer(layer)
      ? extractInnerCopperIndexFromFilename(layer.filename)
      : null
    orderedLayers.push({
      id: layer.id,
      side: layer.side,
      type: layer.type,
      weight: orderLayerWeight(layer.side, layer.type),
      sourceIndex: index,
      innerCopperIndex,
      color,
      visible,
      opacity,
      filename: layer.filename,
    })
  }
  orderedLayers.sort((a, b) => {
    const weightDelta = a.weight - b.weight
    if (weightDelta !== 0) return weightDelta
    if (isInnerCopperLayer(a) && isInnerCopperLayer(b)) {
      const aIdx = Number.isFinite(Number(a.innerCopperIndex)) ? Number(a.innerCopperIndex) : Infinity
      const bIdx = Number.isFinite(Number(b.innerCopperIndex)) ? Number(b.innerCopperIndex) : Infinity
      if (aIdx !== bIdx) return aIdx - bIdx
    }
    const aSource = Number.isFinite(Number(a.sourceIndex)) ? Number(a.sourceIndex) : 0
    const bSource = Number.isFinite(Number(b.sourceIndex)) ? Number(b.sourceIndex) : 0
    return aSource - bSource
  })
  runAnalysis()
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
  const fmLayers = fmRef.value?.plotResult?.layers ?? []
  const changes = collectLayerTypeSideChanges(editableLayers, fmLayers)
  if (isSettingsOpen.value) isSettingsOpen.value = false
  if (changes.length === 0) {
    memoryLayers.value = list
    isLayerLoading.value = false
    finalizePerfSessionIfIdle()
    return
  }
  let jobsQueued = false
  try {
    const currentProjectId = fmRef.value?.__compute?.projectId ?? null
    const drillGroupingChanged = changes.some((change) => {
      const prev = normalizeLayerType(change?.prev?.type)
      const next = normalizeLayerType(change?.next?.type)
      return prev.includes('drill') !== next.includes('drill')
    })
    const outlineGroupingChanged = changes.some((change) => {
      const prev = normalizeLayerType(change?.prev?.type)
      const next = normalizeLayerType(change?.next?.type)
      return prev.includes('outline') !== next.includes('outline')
    })

    if (!currentProjectId || drillGroupingChanged || outlineGroupingChanged) {
      disposePcbWorkers()
      await resetComputeProject()
      const pipeline = await runPerfAsync('settings:pipeline', () =>
        buildPipelineFromMemoryLayers(list, { drillLimit: drillLimit.value })
      )
      applyModernResult(pipeline, { preserveVisuals: true })
      recenterSignal.value += 1
      const outlineDescriptor = refreshBoardOutlineState(pipeline.plotResult)
      const computeProjectId = pipeline?.__compute?.projectId ?? null
      await broadcastCompute3dGlobals({
        projectId: computeProjectId,
        boardOutline: outlineDescriptor
          ? {
              bounds: outlineDescriptor.bounds,
              regions: outlineDescriptor.regions,
              polygons: outlineDescriptor.polygons,
            }
          : null,
        drillShapes: pipeline?.__compute?.drillShapes ?? null,
      })
      jobsQueued = Boolean(
        buildPcbModelFromLayers(
          pipeline.plotResult?.layers,
          outlineDescriptor,
          pipeline.plotResult,
          { reset: true, reason: 'settings-rebuild', projectId: computeProjectId }
        )
      )
      memoryLayers.value = list
      if (!jobsQueued) finalizePerfSessionIfIdle()
      return
    }

    const editedById = new Map(
      editableLayers.map((entry) => [entry.id, { type: entry.type ?? undefined, side: entry.side ?? undefined }])
    )
    const nextLayers = fmLayers.map((layer) => {
      const edited = editedById.get(layer.id)
      if (!edited) return layer
      return { ...layer, type: edited.type, side: edited.side }
    })
    const fileUnits = fmRef.value?.unitMeta?.units === 'in' ? 'in' : 'mm'
    const summary = await runPerfAsync('settings:summary', () =>
      enqueueComputeProjectSummaryJob({
        projectId: currentProjectId,
        layers: nextLayers,
        plotTreesById: fmRef.value?.plotResult?.plotTreesById,
        fileUnits,
        drillLimit: drillLimit.value,
      })
    )

    const nextFm = {
      ...(fmRef.value || {}),
      plotResult: {
        ...(fmRef.value?.plotResult || {}),
        layers: nextLayers,
        boardShape: summary?.boardShape ?? null,
      },
      boardViewBox: summary?.boardViewBox ?? fmRef.value?.boardViewBox ?? [0, 0, 0, 0],
      compositeViewBox: summary?.compositeViewBox ?? fmRef.value?.compositeViewBox ?? [0, 0, 0, 0],
      compositeWidthMm: summary?.compositeWidthMm ?? fmRef.value?.compositeWidthMm ?? '0mm',
      compositeHeightMm: summary?.compositeHeightMm ?? fmRef.value?.compositeHeightMm ?? '0mm',
      unitMeta: summary?.unitMeta ?? fmRef.value?.unitMeta,
      __compute: {
        ...(fmRef.value?.__compute || {}),
        projectId: currentProjectId,
        drillShapes: summary?.drillShapes ?? fmRef.value?.__compute?.drillShapes ?? null,
        drillStats: summary?.drillStats ?? fmRef.value?.__compute?.drillStats ?? null,
      },
    }

    applyModernResult(nextFm, { preserveVisuals: true })
    recenterSignal.value += 1
    const outlineDescriptor = refreshBoardOutlineState(nextFm.plotResult)
    await broadcastCompute3dGlobals({
      projectId: currentProjectId,
      boardOutline: outlineDescriptor
        ? { bounds: outlineDescriptor.bounds, regions: outlineDescriptor.regions, polygons: outlineDescriptor.polygons }
        : null,
      drillShapes: nextFm?.__compute?.drillShapes ?? null,
    })

    jobsQueued = Boolean(
      buildPcbModelFromLayers(nextFm.plotResult?.layers, outlineDescriptor, nextFm.plotResult, {
        reset: true,
        reason: 'settings-meta',
        projectId: currentProjectId,
      })
    )
    memoryLayers.value = list
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
      if (activeView.value === '3d') {
        schedulePcb3dModelFlush()
      } else {
        pcb3dModelDirty = true
      }
    }
  }
)

watch(
  [() => boardThicknessUnits.value, () => unitMmPerUnit.value],
  () => {
    logBoardScaleSnapshot('scale-change')
  }
)

watch(currentStatusIndex, (value) => {
  if (value === 0) {
    closeAnalysisPanel()
    closeCopperLayerModal()
    resetAnalysisResults()
    boardOutlineDescriptor.value = null
    analysisError.value = null
    analysisPending.value = false
  }
})

watch(activeView, (value) => {
  if (value === '3d') {
    closeAnalysisPanel()
    closeCopperLayerModal()
    if (pcb3dModelDirty) schedulePcb3dModelFlush({ immediate: true })
    return
  }
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
  if (active) {
    applyCachedInnerCopperLayers()
    return
  }
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
  disposeComputePool()
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

.viewer-loading-overlay {
  background: rgba(0, 0, 0, 0.55);
}

.viewer-loading-card {
  --viewer-accent-from: #3fd3ff;
  --viewer-accent-to: #7167ff;
  --viewer-pill-glow: rgba(68, 177, 255, 0.35);
  --viewer-progress-color: #f5fbff;
  width: min(580px, 92vw);
  padding: 1.75rem 2.4rem;
  border-radius: 1.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(145deg, rgba(6, 15, 34, 0.92), rgba(5, 10, 20, 0.98));
  box-shadow:
    0 25px 80px rgba(0, 0, 0, 0.6),
    0 0 35px rgba(63, 211, 255, 0.12);
  position: relative;
  overflow: hidden;
  animation: viewerCardPulse 8s ease-in-out infinite;
}

.viewer-loading-card::before {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 1.65rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
  pointer-events: none;
}

.viewer-loading-card::after {
  content: '';
  position: absolute;
  inset: -40% -10% auto;
  height: 140%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.08), transparent 60%);
  opacity: 0.5;
  pointer-events: none;
}

.viewer-loading-card--pcb {
  --viewer-accent-from: #ffb347;
  --viewer-accent-to: #ff5f8f;
  --viewer-pill-glow: rgba(255, 179, 71, 0.35);
  box-shadow:
    0 25px 90px rgba(0, 0, 0, 0.65),
    0 0 55px rgba(255, 179, 71, 0.25);
}

.viewer-loading-title {
  letter-spacing: 0.35em;
  text-transform: uppercase;
  text-shadow:
    0 0 20px rgba(255, 255, 255, 0.35),
    0 0 35px rgba(63, 211, 255, 0.3),
    0 0 50px rgba(63, 211, 255, 0.15);
}

.loading-ring {
  --progress-deg: 0deg;
  position: relative;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, rgba(6, 16, 34, 0.85) 62%, transparent 64%),
    conic-gradient(
      var(--viewer-accent-from) calc(var(--progress-deg, 0deg) - 6deg),
      var(--viewer-accent-to) var(--progress-deg, 0deg),
      rgba(255, 255, 255, 0.06) 0deg
    );
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 30px rgba(0, 0, 0, 0.55),
    0 0 50px rgba(63, 211, 255, 0.2),
    inset 0 0 25px rgba(0, 0, 0, 0.65);
  animation: viewerRingGlow 5s ease-in-out infinite;
}

.viewer-loading-card--pcb .loading-ring {
  box-shadow:
    0 0 30px rgba(0, 0, 0, 0.55),
    0 0 50px rgba(255, 179, 71, 0.2),
    inset 0 0 25px rgba(0, 0, 0, 0.65);
}

.loading-ring::before {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(10, 23, 47, 0.95), rgba(4, 9, 18, 0.95));
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
}

.loading-ring::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.08);
  mix-blend-mode: screen;
}

.loading-ring__value {
  position: relative;
  font-size: 1rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--viewer-progress-color);
  text-shadow: 0 0 15px rgba(0, 0, 0, 0.45), 0 0 25px var(--viewer-progress-color);
}

.viewer-loading-meta-row {
  min-height: 1.75rem;
}

.viewer-loading-stage {
  font-size: 0.9rem;
  letter-spacing: 0.05em;
}

.viewer-loading-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.75rem;
  border-radius: 999px;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 0 20px var(--viewer-pill-glow);
}

.viewer-loading-pill--cool {
  color: #d8f5ff;
}

.viewer-loading-pill--warm {
  color: #ffe3c4;
}

.viewer-pill-label {
  font-weight: 600;
  opacity: 0.65;
}

.viewer-pill-value {
  font-weight: 700;
}

.viewer-progress-bar {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.35);
}

.viewer-progress-fill {
  display: block;
  height: 100%;
  transition: width 0.45s ease;
  background: linear-gradient(90deg, var(--viewer-accent-from), var(--viewer-accent-to));
  border-radius: 999px;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.35);
}

@keyframes viewerCardPulse {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@keyframes viewerRingGlow {
  0%,
  100% {
    filter: drop-shadow(0 0 12px rgba(63, 211, 255, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 18px rgba(63, 211, 255, 0.5));
  }
}

.dfm-drawer {
  --dfm-drawer-max-height: min(280px, 30vh);
  width: 100%;
  max-height: var(--dfm-drawer-max-height);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(155deg, rgba(3, 9, 22, 0.92), rgba(8, 20, 40, 0.84));
  box-shadow:
    0 -18px 45px rgba(0, 0, 0, 0.7),
    0 0 25px rgba(45, 196, 255, 0.15);
  backdrop-filter: blur(18px) saturate(140%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dfm-drawer__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.dfm-drawer__collapse {
  justify-self: start;
  white-space: nowrap;
}

.dfm-drawer__body {
  flex: 1;
  overflow: auto;
  padding: 0.85rem 1rem 1rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(34, 211, 238, 0.35) rgba(255, 255, 255, 0.05);
}

.dfm-drawer__body::-webkit-scrollbar {
  width: 8px;
}

.dfm-drawer__body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 999px;
}

.dfm-drawer__body::-webkit-scrollbar-thumb {
  background: rgba(34, 211, 238, 0.28);
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.04);
}

.dfm-drawer__body::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.4);
}

.analysis-panel__rows {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0;
  overflow: hidden;
}

@media (min-width: 520px) {
  .analysis-panel__rows {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 780px) {
  .analysis-panel__rows {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1080px) {
  .analysis-panel__rows {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.analysis-panel-row {
  background: rgba(3, 9, 22, 0.62);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.6rem 0.85rem;
  min-height: 2.85rem;
}

.analysis-panel-row__label {
  color: rgba(255, 255, 255, 0.62);
  font-size: 0.78rem;
  line-height: 1.15;
}

.analysis-panel-row__value {
  color: #e8fbff;
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}

.analysis-panel-row__value-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.analysis-panel-row__value-row .analysis-panel-row__value {
  flex: 1;
  min-width: 0;
}

.analysis-panel-row__view-button {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.55rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(236, 254, 255, 0.9);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.analysis-panel-row__view-button:hover {
  background: rgba(34, 211, 238, 0.14);
  border-color: rgba(34, 211, 238, 0.4);
  transform: translateY(-1px);
}

.analysis-panel-row__view-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.analysis-panel__action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  border: none;
  border-radius: 0.95rem;
  padding: 0.55rem 0.95rem;
  background: linear-gradient(120deg, #22d3ee, #0ea5e9);
  color: #05121f;
  font-size: 0.86rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  box-shadow: 0 12px 28px rgba(14, 165, 233, 0.28);
  cursor: pointer;
  transition: filter 0.2s ease, transform 0.2s ease;
}

.analysis-panel__action-button:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.analysis-panel__action-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  filter: none;
  transform: none;
}

.analysis-panel__action-button--compact {
  white-space: nowrap;
  justify-self: center;
  width: clamp(170px, 52vw, 380px);
  padding-inline: 1.8rem;
  text-align: center;
}

.analysis-panel__error {
  padding: 0.25rem 0.2rem 0 0.2rem;
  font-size: 0.78rem;
  line-height: 1.2;
  color: rgba(253, 186, 116, 0.95);
  letter-spacing: 0.02em;
  text-align: center;
}

.copper-layer-pill {
  text-align: left;
  padding: 0.45rem 0.7rem;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  width: 100%;
}

.copper-layer-pill__line {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.copper-layer-pill__label {
  color: rgba(34, 211, 238, 0.95);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.copper-layer-pill__filename {
  margin-left: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.76rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.copper-layer-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
  transform: translateY(-1px);
}

.copper-layer-pill--active {
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.55);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.22), 0 18px 40px rgba(0, 0, 0, 0.35);
}

.copper-layer-list {
  height: clamp(150px, 24vh, 220px);
  overflow-y: auto;
  padding-right: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(34, 211, 238, 0.35) rgba(255, 255, 255, 0.05);
}

.copper-layer-list::-webkit-scrollbar {
  width: 8px;
}

.copper-layer-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 999px;
}

.copper-layer-list::-webkit-scrollbar-thumb {
  background: rgba(34, 211, 238, 0.28);
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.04);
}

.copper-layer-list::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.4);
}

.copper-preview-square {
  width: min(100%, 54vh);
  aspect-ratio: 1 / 1;
  border-radius: 0.85rem;
  border: 2px solid rgba(34, 211, 238, 0.28);
  background: rgba(0, 0, 0, 0.12);
  box-shadow:
    inset 0 0 0 1px rgba(34, 211, 238, 0.18),
    0 20px 52px rgba(0, 0, 0, 0.45);
}

.dfm-drawer-enter-active,
.dfm-drawer-leave-active {
  transition: max-height 0.26s ease, opacity 0.22s ease, transform 0.26s ease;
}

.dfm-drawer-enter-from,
.dfm-drawer-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(14px);
}
</style>
