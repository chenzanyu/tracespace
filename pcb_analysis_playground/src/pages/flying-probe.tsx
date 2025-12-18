import {fromMemoryLayers} from '@tracespace/core'
import type {FromMemoryLayersResult, MemoryLayerInput} from '@tracespace/core'
import type {ImageTree} from '@tracespace/plotter'
import type {JSX} from 'preact/jsx-runtime'
import {useMemo, useState} from 'preact/hooks'

import {parseGerberArchiveViaBackend} from '../api/pcb-parse'
import {runFlyingProbeAnalysis, type BoardSide, type FlyingProbeAnalysisResult} from '../analysis/flying-probe'
import {PixiLayerViewer, type PixiLayer} from '../pixi/pixi-layer-viewer'
import {ROUTE_HASH} from '../router'

type PerfGroup = 'overview' | 'top' | 'bottom'
type PerfRow = {key: string; label: string; ms: number; group: PerfGroup; meta?: Record<string, unknown>}

const DEFAULT_ENDPOINT = 'http://localhost:5004/api/PCBParse/Parse?Mode=0'

const FLYING_STEP_LABELS: Record<string, string> = {
  'geos:init': '初始化 GEOS',
  'board:bounds': '计算外接矩形',
  'board:outline': '构建轮廓几何',
  'board:clip': '构建裁剪区域（外接矩形）',
  'layer:drill': '构建钻孔几何（并集）',
  'mask:top:islands': '统计阻焊开窗岛（点数）',
  'mask:bottom:islands': '统计阻焊开窗岛（点数）',
  'mask:top:union': '构建阻焊开窗几何（并集 + 裁剪）',
  'mask:bottom:union': '构建阻焊开窗几何（并集 + 裁剪）',
  'mask:union': '合并开窗（Top ∪ Bottom）',
  'drill:count': '统计参与计算钻孔',
  'geojson:export': '导出 GeoJSON',
}

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

const formatMs = (value: number): string => {
  if (!Number.isFinite(value)) return '-'
  if (value < 10) return `${value.toFixed(2)}ms`
  if (value < 1000) return `${value.toFixed(1)}ms`
  return `${(value / 1000).toFixed(2)}s`
}

const formatNumber = (value: number, digits = 0): string => {
  if (!Number.isFinite(value)) return '-'
  return value.toFixed(digits)
}

const formatDimension = (valueMm: number): string => {
  if (!Number.isFinite(valueMm)) return '-'
  if (valueMm >= 100) return valueMm.toFixed(1)
  if (valueMm >= 10) return valueMm.toFixed(2)
  return valueMm.toFixed(2)
}

const normalizeLayerType = (value: string | undefined): MemoryLayerInput['type'] => {
  const type = (value ?? '').toLowerCase()
  switch (type) {
    case 'copper':
    case 'soldermask':
    case 'silkscreen':
    case 'solderpaste':
    case 'outline':
    case 'drill':
    case 'drawing':
      return type
    default:
      return undefined
  }
}

const normalizeLayerSide = (value: string | undefined): MemoryLayerInput['side'] => {
  const side = (value ?? '').toLowerCase()
  switch (side) {
    case 'top':
    case 'bottom':
    case 'inner':
    case 'all':
      return side
    default:
      return undefined
  }
}

const isImageTree = (value: ImageTree | undefined): value is ImageTree => Boolean(value)

const buildViewerLayers = (
  analysis: FlyingProbeAnalysisResult,
  coreResult: FromMemoryLayersResult,
  side: BoardSide
): PixiLayer[] => {
  const plotTreesById = coreResult.plotResult.plotTreesById
  const result = analysis.result

  const treesByIds = (ids: string[]): ImageTree[] => ids.map(id => plotTreesById[id]).filter(isImageTree)
  const drillTrees = treesByIds(analysis.drills.layerIds)
  const outlineTrees = coreResult.plotResult.layers
    .filter(layer => layer.type === 'outline')
    .map(layer => plotTreesById[layer.id])
    .filter(isImageTree)

  const sideLabel = side === 'top' ? '顶层' : '底层'
  const maskLayerIds = side === 'top' ? analysis.soldermask.top.layerIds : analysis.soldermask.bottom.layerIds

  return [
    {
      id: 'outline-gerber',
      label: '轮廓层（Gerber）',
      color: '#f5f7ff',
      opacity: 0.95,
      visible: false,
      source: {kind: 'plotTrees', trees: outlineTrees},
    },
    {
      id: 'board-outline',
      label: '轮廓层（多边形）',
      color: '#f5f7ff',
      opacity: 0.95,
      visible: true,
      source: {
        kind: 'geojson',
        geometry: result.geometries.boardOutline,
        display: {fill: false, stroke: true, strokeWidthPx: 2},
      },
    },
    {
      id: 'board-clip',
      label: '裁剪区域（外接矩形）',
      color: '#8fa8ff',
      opacity: 0.22,
      visible: true,
      source: {kind: 'geojson', geometry: result.geometries.boardClip},
    },
    ...(drillTrees.length
      ? [
          {
            id: 'drill-raw',
            label: '钻孔层（Gerber）',
            color: '#ff6b6b',
            opacity: 0.35,
            visible: true,
            source: {kind: 'plotTrees', trees: drillTrees},
          },
        ]
      : []),
    ...(result.geometries.drill
      ? [
          {
            id: 'drill-geom',
            label: '钻孔（并集）',
            color: '#ff6b6b',
            opacity: 0.18,
            visible: false,
            source: {kind: 'geojson', geometry: result.geometries.drill},
          },
        ]
      : []),
    {
      id: `${side}-mask-raw`,
      label: `${sideLabel}阻焊层（Gerber）`,
      color: '#2d74ff',
      opacity: 0.28,
      visible: false,
      source: {kind: 'plotTrees', trees: treesByIds(maskLayerIds)},
    },
    {
      id: `${side}-mask-open`,
      label: `${sideLabel}阻焊开窗（并集 + 裁剪）`,
      color: '#2d74ff',
      opacity: 0.4,
      visible: true,
      source: {
        kind: 'geojson',
        geometry: side === 'top' ? result.geometries.maskTopOpen : result.geometries.maskBottomOpen,
      },
    },
    {
      id: 'mask-open-union',
      label: '开窗合并（Top ∪ Bottom）',
      color: '#ffd166',
      opacity: 0.32,
      visible: true,
      source: {kind: 'geojson', geometry: result.geometries.maskOpenUnion},
    },
    {
      id: 'drill-selected',
      label: '参与计算的钻孔（Drill ∩ 开窗）',
      color: '#24c4ff',
      opacity: 0.6,
      visible: true,
      source: {kind: 'geojson', geometry: result.geometries.drillSelected},
    },
  ]
}

const sumMs = (rows: PerfRow[]): number => rows.reduce((acc, row) => acc + (Number(row.ms) || 0), 0)

const TimingList = ({rows}: {rows: PerfRow[]}): JSX.Element => {
  const sorted = [...rows].sort((a, b) => b.ms - a.ms)
  const max = Math.max(1, ...sorted.map(row => row.ms))
  if (sorted.length === 0) {
    return <p class="empty-note">暂无耗时数据（上传后显示）。</p>
  }
  return (
    <div class="timing-list">
      {sorted.map(row => (
        <div class="timing-row" key={row.key}>
          <div class="timing-label" title={row.label}>
            {row.label}
          </div>
          <div class="timing-bar">
            <div class="timing-bar__fill" style={{width: `${Math.max(0, Math.min(100, (row.ms / max) * 100))}%`}} />
          </div>
          <div class="timing-ms">{formatMs(row.ms)}</div>
        </div>
      ))}
    </div>
  )
}

const groupForDebugStep = (step: string): PerfGroup => {
  if (step.startsWith('mask:top:')) return 'top'
  if (step.startsWith('mask:bottom:')) return 'bottom'
  return 'overview'
}

export function FlyingProbePage(): JSX.Element {
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coreResult, setCoreResult] = useState<FromMemoryLayersResult | null>(null)
  const [analysis, setAnalysis] = useState<FlyingProbeAnalysisResult | null>(null)
  const [activeSide, setActiveSide] = useState<BoardSide>('top')
  const [viewerLayers, setViewerLayers] = useState<PixiLayer[]>([])
  const [perfRows, setPerfRows] = useState<PerfRow[]>([])
  const [rawBackend, setRawBackend] = useState<unknown>(null)

  const viewBox = coreResult?.compositeViewBox ?? null
  const mmPerUnit = analysis?.mmPerUnit ?? coreResult?.unitMeta?.mmPerUnit ?? 1

  const derivedMetrics = useMemo(() => {
    const drillLayerIds = analysis?.drills.layerIds ?? []
    const drillFilenames =
      coreResult && drillLayerIds.length
        ? coreResult.plotResult.layers.filter(layer => drillLayerIds.includes(layer.id)).map(layer => layer.filename)
        : []

    const topMaskLayerIds = analysis?.soldermask.top.layerIds ?? []
    const bottomMaskLayerIds = analysis?.soldermask.bottom.layerIds ?? []
    const topMaskFilenames =
      coreResult && topMaskLayerIds.length
        ? coreResult.plotResult.layers.filter(layer => topMaskLayerIds.includes(layer.id)).map(layer => layer.filename)
        : []
    const bottomMaskFilenames =
      coreResult && bottomMaskLayerIds.length
        ? coreResult.plotResult.layers.filter(layer => bottomMaskLayerIds.includes(layer.id)).map(layer => layer.filename)
        : []

    const boardWidthMm = coreResult ? (coreResult.boardViewBox?.[2] ?? 0) * mmPerUnit : Number.NaN
    const boardHeightMm = coreResult ? (coreResult.boardViewBox?.[3] ?? 0) * mmPerUnit : Number.NaN

    return {
      drillFilenames,
      topMaskFilenames,
      bottomMaskFilenames,
      boardWidthMm,
      boardHeightMm,
    }
  }, [analysis, coreResult, mmPerUnit])

  const perfGroups = useMemo(() => {
    const overview = perfRows.filter(row => row.group === 'overview')
    const top = perfRows.filter(row => row.group === 'top')
    const bottom = perfRows.filter(row => row.group === 'bottom')
    return {
      overview: {rows: overview, totalMs: sumMs(overview)},
      top: {rows: top, totalMs: sumMs(top)},
      bottom: {rows: bottom, totalMs: sumMs(bottom)},
    }
  }, [perfRows])

  const updateLayerVisibility = (id: string, visible: boolean) => {
    setViewerLayers(current => current.map(layer => (layer.id === id ? {...layer, visible} : layer)))
  }

  const handleUpload = async (file: File) => {
    setBusy(true)
    setError(null)
    setCoreResult(null)
    setAnalysis(null)
    setViewerLayers([])
    setPerfRows([])
    setRawBackend(null)

    const nextPerf: PerfRow[] = []
    const record = (key: string, label: string, ms: number, group: PerfGroup, meta?: Record<string, unknown>) => {
      nextPerf.push({key, label, ms, group, meta})
    }

    try {
      const uploadStart = nowMs()
      const parsed = await parseGerberArchiveViaBackend({endpoint, file})
      record('upload:api', '上传并调用后端解析', nowMs() - uploadStart, 'overview', {layers: parsed.layers.length})
      setRawBackend(parsed.raw)

      const coreStart = nowMs()
      const memoryLayers: MemoryLayerInput[] = parsed.layers.map(layer => ({
        filename: layer.filename,
        gerber: layer.gerber,
        type: normalizeLayerType(layer.type),
        side: normalizeLayerSide(layer.side),
      }))
      const core = await fromMemoryLayers(memoryLayers)
      record('core:fromMemoryLayers', '前端解析/绘图', nowMs() - coreStart, 'overview', {
        layers: core.plotResult.layers.length,
      })
      setCoreResult(core)

      const analysisStart = nowMs()
      const result = await runFlyingProbeAnalysis({coreResult: core})
      record('analysis:flying-probe', '飞针点数计算（Top + Bottom）', nowMs() - analysisStart, 'overview')
      setAnalysis(result)

      setActiveSide('top')
      setViewerLayers(buildViewerLayers(result, core, 'top'))

      const timingRows: PerfRow[] = result.result.timings.map(sample => {
        const group = groupForDebugStep(sample.step)
        const prefix = group === 'top' ? '顶层' : group === 'bottom' ? '底层' : '总体'
        const label = FLYING_STEP_LABELS[sample.step] ?? sample.step
        return {
          key: `flying:${sample.step}`,
          label: `${prefix}：${label}`,
          ms: sample.ms,
          group,
          meta: sample.meta,
        }
      })

      setPerfRows([...nextPerf, ...timingRows])
    } catch (err) {
      console.error('[pcb_analysis_playground] upload failed', err)
      setError(err instanceof Error ? err.message : String(err))
      setPerfRows(nextPerf)
    } finally {
      setBusy(false)
    }
  }

  const onPickFile: JSX.GenericEventHandler<HTMLInputElement> = event => {
    const input = event.currentTarget
    const file = input.files?.[0] ?? null
    if (file) void handleUpload(file)
    input.value = ''
  }

  const handleSideChange = (side: BoardSide) => {
    setActiveSide(side)
    if (analysis && coreResult) setViewerLayers(buildViewerLayers(analysis, coreResult, side))
  }

  return (
    <div class="app page">
      <div class="topbar">
        <div class="topbar-left">
          <a class="back-link" href={ROUTE_HASH.home}>
            返回主页
          </a>
          <div class="topbar-title">飞针点数测试</div>
        </div>

        <div class="topbar-right">
          <input
            class="endpoint-input"
            value={endpoint}
            onInput={e => setEndpoint((e.currentTarget as HTMLInputElement).value)}
            placeholder={DEFAULT_ENDPOINT}
            spellcheck={false}
          />
          <label class={`file-picker ${busy ? 'file-picker--busy' : ''}`}>
            <span>{busy ? '解析中…' : '上传Gerber'}</span>
            <input type="file" onChange={onPickFile} disabled={busy} />
          </label>
        </div>
      </div>

      {error && (
        <div class="error">
          <strong>失败：</strong> {error}
        </div>
      )}

      <div class="enig-grid">
        <div class="enig-left">
          <div class="panel panel--compact">
            <div class="side-tabs">
              <button
                class={activeSide === 'top' ? 'side-tab side-tab--active' : 'side-tab'}
                type="button"
                onClick={() => handleSideChange('top')}
              >
                顶层
              </button>
              <button
                class={activeSide === 'bottom' ? 'side-tab side-tab--active' : 'side-tab'}
                type="button"
                onClick={() => handleSideChange('bottom')}
              >
                底层
              </button>
            </div>

            {viewerLayers.length > 0 && (
              <div class="layer-toggles layer-toggles--compact">
                {viewerLayers.map(layer => (
                  <label class="layer-toggle" key={layer.id}>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={e => updateLayerVisibility(layer.id, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span class="layer-swatch" style={{background: layer.color}} />
                    <span class="layer-label">{layer.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div class="viewer-card">
            <PixiLayerViewer viewBox={viewBox} mmPerUnit={mmPerUnit} layers={viewerLayers} />
          </div>
        </div>

        <div class="enig-right">
          <div class="panel">
            <h2 class="panel-title">数据明细</h2>
            <dl class="details-grid">
              <dt>尺寸（mm）</dt>
              <dd>
                {formatDimension(derivedMetrics.boardWidthMm)} × {formatDimension(derivedMetrics.boardHeightMm)}
              </dd>
              <dt>阻焊图形数（顶层）</dt>
              <dd>{analysis ? formatNumber(analysis.soldermask.top.graphicCount) : '-'}</dd>
              <dt>阻焊图形数（底层）</dt>
              <dd>{analysis ? formatNumber(analysis.soldermask.bottom.graphicCount) : '-'}</dd>
              <dt>钻孔层（Gerber）</dt>
              <dd>
                {analysis
                  ? derivedMetrics.drillFilenames.length > 0
                    ? `${derivedMetrics.drillFilenames.length}（${derivedMetrics.drillFilenames.join(', ')}）`
                    : '0'
                  : '-'}
              </dd>
              <dt>阻焊层（顶层）</dt>
              <dd>
                {analysis
                  ? derivedMetrics.topMaskFilenames.length > 0
                    ? `${derivedMetrics.topMaskFilenames.length}（${derivedMetrics.topMaskFilenames.join(', ')}）`
                    : '0'
                  : '-'}
              </dd>
              <dt>阻焊层（底层）</dt>
              <dd>
                {analysis
                  ? derivedMetrics.bottomMaskFilenames.length > 0
                    ? `${derivedMetrics.bottomMaskFilenames.length}（${derivedMetrics.bottomMaskFilenames.join(', ')}）`
                    : '0'
                  : '-'}
              </dd>
              <dt>点数（顶层开窗岛）</dt>
              <dd>{analysis ? formatNumber(analysis.result.debug.maskTopCount) : '-'}</dd>
              <dt>点数（底层开窗岛）</dt>
              <dd>{analysis ? formatNumber(analysis.result.debug.maskBottomCount) : '-'}</dd>
              <dt>钻孔总数</dt>
              <dd>{analysis ? formatNumber(analysis.result.debug.drillTotalCount) : '-'}</dd>
              <dt>参与计算钻孔数</dt>
              <dd>{analysis ? formatNumber(analysis.result.debug.drillCount) : '-'}</dd>
              <dt>飞针点数（合计）</dt>
              <dd>{analysis ? formatNumber(analysis.result.flyingProbeCount) : '-'}</dd>
            </dl>

            <div class="formula">
              <div class="formula-title">计算公式</div>
              <code class="formula-line">maskTopCount = Count(TopMaskOpenIslands，不与 Drill 相交)</code>
              <code class="formula-line">maskBottomCount = Count(BottomMaskOpenIslands，不与 Drill 相交)</code>
              <code class="formula-line">drillCount = Count( DrillHoles ∩ (MaskOpenTop ∪ MaskOpenBottom) )</code>
              <code class="formula-line">total = maskTopCount + maskBottomCount + drillCount</code>
            </div>
          </div>

          <div class="panel">
            <h2 class="panel-title">耗时明细</h2>

            <div class="timing-group">
              <div class="timing-group__title">总览（{formatMs(perfGroups.overview.totalMs)}）</div>
              <TimingList rows={perfGroups.overview.rows} />
            </div>

            <div class="timing-group">
              <div class="timing-group__title">顶层（{formatMs(perfGroups.top.totalMs)}）</div>
              <TimingList rows={perfGroups.top.rows} />
            </div>

            <div class="timing-group">
              <div class="timing-group__title">底层（{formatMs(perfGroups.bottom.totalMs)}）</div>
              <TimingList rows={perfGroups.bottom.rows} />
            </div>
          </div>

          {rawBackend && (
            <details class="raw-details">
              <summary>后端原始返回（Raw）</summary>
              <pre>{JSON.stringify(rawBackend, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

