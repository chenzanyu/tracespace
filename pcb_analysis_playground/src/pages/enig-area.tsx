import {fromMemoryLayers} from '@tracespace/core'
import type {FromMemoryLayersResult, MemoryLayerInput} from '@tracespace/core'
import type {ImageTree} from '@tracespace/plotter'
import type {JSX} from 'preact/jsx-runtime'
import {useMemo, useState} from 'preact/hooks'

import {parseGerberArchiveViaBackend} from '../api/pcb-parse'
import {runEnigAreaAnalysis, type BoardSide, type EnigAreaAnalysisResult} from '../analysis/enig-area'
import {PixiLayerViewer, type PixiLayer} from '../pixi/pixi-layer-viewer'
import {ROUTE_HASH} from '../router'

type PerfGroup = 'overview' | 'top' | 'bottom'
type PerfRow = {key: string; label: string; ms: number; group: PerfGroup; meta?: Record<string, unknown>}

const DEFAULT_ENDPOINT = 'http://localhost:5004/api/PCBParse/Parse?Mode=0'

const ENIG_STEP_LABELS: Record<string, string> = {
  'geos:init': '初始化 GEOS',
  'board:bounds': '计算外接矩形',
  'board:outline': '构建轮廓几何',
  'board:clip': '构建裁剪区域（外接矩形 - 钻孔）',
  'layer:copper': '构建铜层几何（并集）',
  'layer:soldermask': '构建阻焊开窗几何（并集）',
  'clip:copper': '裁剪铜层',
  'clip:soldermask': '裁剪阻焊开窗',
  'area:inputs': '计算输入面积',
  'exposed:intersection': '求交（铜 ∩ 开窗）',
  'area:exposed': '计算沉金面积',
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

const formatNumber = (value: number, digits = 2): string => {
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
  analysis: EnigAreaAnalysisResult,
  coreResult: FromMemoryLayersResult,
  side: BoardSide
): PixiLayer[] => {
  const sideAnalysis = analysis.sides[side]
  const sideResult = sideAnalysis.result
  const plotTreesById = coreResult.plotResult.plotTreesById

  const treesByIds = (ids: string[]): ImageTree[] => ids.map(id => plotTreesById[id]).filter(isImageTree)
  const drillTrees = treesByIds(sideAnalysis.drillLayerIds)
  const outlineTrees = coreResult.plotResult.layers
    .filter(layer => layer.type === 'outline')
    .map(layer => plotTreesById[layer.id])
    .filter(isImageTree)

  const sideLabel = side === 'top' ? '顶层' : '底层'

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
        geometry: sideResult.geometries.boardOutline,
        display: {fill: false, stroke: true, strokeWidthPx: 2},
      },
    },
    {
      id: 'board-clip',
      label: '裁剪区域（外接矩形 - 钻孔）',
      color: '#8fa8ff',
      opacity: 0.22,
      visible: true,
      source: {kind: 'geojson', geometry: sideResult.geometries.boardClip},
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
    {
      id: `${side}-copper-raw`,
      label: `${sideLabel}铜层（Gerber）`,
      color: '#0fd69b',
      opacity: 0.35,
      visible: false,
      source: {kind: 'plotTrees', trees: treesByIds(sideAnalysis.copperLayerIds)},
    },
    {
      id: `${side}-mask-raw`,
      label: `${sideLabel}阻焊层（Gerber）`,
      color: '#2d74ff',
      opacity: 0.28,
      visible: false,
      source: {kind: 'plotTrees', trees: treesByIds(sideAnalysis.soldermaskLayerIds)},
    },
    {
      id: `${side}-copper`,
      label: `${sideLabel}铜层（并集 + 裁剪）`,
      color: '#0fd69b',
      opacity: 0.55,
      visible: true,
      source: {kind: 'geojson', geometry: sideResult.geometries.copper},
    },
    {
      id: `${side}-mask`,
      label: `${sideLabel}阻焊开窗（并集 + 裁剪）`,
      color: '#2d74ff',
      opacity: 0.35,
      visible: true,
      source: {kind: 'geojson', geometry: sideResult.geometries.soldermaskOpen},
    },
    {
      id: `${side}-enig`,
      label: `${sideLabel}沉金面积（铜 ∩ 开窗）`,
      color: '#ffd166',
      opacity: 0.75,
      visible: true,
      source: {kind: 'geojson', geometry: sideResult.geometries.exposed},
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

export function EnigAreaPage(): JSX.Element {
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT)
  const [boardThicknessMmInput, setBoardThicknessMmInput] = useState('1.6')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coreResult, setCoreResult] = useState<FromMemoryLayersResult | null>(null)
  const [analysis, setAnalysis] = useState<EnigAreaAnalysisResult | null>(null)
  const [activeSide, setActiveSide] = useState<BoardSide>('top')
  const [viewerLayers, setViewerLayers] = useState<PixiLayer[]>([])
  const [perfRows, setPerfRows] = useState<PerfRow[]>([])
  const [rawBackend, setRawBackend] = useState<unknown>(null)

  const viewBox = coreResult?.compositeViewBox ?? null
  const mmPerUnit = analysis?.mmPerUnit ?? coreResult?.unitMeta?.mmPerUnit ?? 1

  const derivedMetrics = useMemo(() => {
    const top = analysis?.sides.top?.result ?? null
    const bottom = analysis?.sides.bottom?.result ?? null
    const boardAreaMm2 = top?.boardAreaMm2 ?? bottom?.boardAreaMm2 ?? Number.NaN
    const outlineAreaMm2 = top?.outlineAreaMm2 ?? bottom?.outlineAreaMm2 ?? Number.NaN
    const totals = analysis?.totals ?? null
    const holeWall = analysis?.holeWall ?? null
    const drillLayerIds = analysis?.drills.layerIds ?? []
    const drillFilenames =
      coreResult && drillLayerIds.length
        ? coreResult.plotResult.layers.filter(layer => drillLayerIds.includes(layer.id)).map(layer => layer.filename)
        : []
    const boardThicknessMm = (() => {
      const parsed = Number(boardThicknessMmInput)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
      return holeWall?.boardThicknessMm ?? Number.NaN
    })()
    const holeWallPerimeterMm = holeWall?.holeWallPerimeterMm ?? Number.NaN
    const holeWallEnigAreaMm2 =
      Number.isFinite(holeWallPerimeterMm) && Number.isFinite(boardThicknessMm) && boardThicknessMm > 0
        ? holeWallPerimeterMm * boardThicknessMm
        : Number.NaN
    const enigTotalWithHoleWallMm2 =
      totals && Number.isFinite(holeWallEnigAreaMm2) ? totals.enigTotalMm2 + holeWallEnigAreaMm2 : Number.NaN
    const enigPercentTotalWithHoleWall =
      boardAreaMm2 > 0 && Number.isFinite(enigTotalWithHoleWallMm2)
        ? (enigTotalWithHoleWallMm2 / boardAreaMm2) * 100
        : Number.NaN
    const boardWidthMm = coreResult ? (coreResult.boardViewBox?.[2] ?? 0) * mmPerUnit : Number.NaN
    const boardHeightMm = coreResult ? (coreResult.boardViewBox?.[3] ?? 0) * mmPerUnit : Number.NaN

    return {
      top,
      bottom,
      totals,
      drillLayerIds,
      drillFilenames,
      holeWall,
      boardThicknessMm,
      holeWallPerimeterMm,
      holeWallEnigAreaMm2,
      enigTotalWithHoleWallMm2,
      enigPercentTotalWithHoleWall,
      boardAreaMm2,
      outlineAreaMm2,
      boardWidthMm,
      boardHeightMm,
    }
  }, [analysis, boardThicknessMmInput, coreResult, mmPerUnit])

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
      const thickness = (() => {
        const parsed = Number(boardThicknessMmInput)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
      })()
      const enig = await runEnigAreaAnalysis({coreResult: core, boardThicknessMm: thickness})
      record('analysis:enig', '沉金面积计算（顶层 + 底层）', nowMs() - analysisStart, 'overview')
      setAnalysis(enig)

      setActiveSide('top')
      setViewerLayers(buildViewerLayers(enig, core, 'top'))

      const toTimingRows = (side: BoardSide): PerfRow[] =>
        enig.sides[side].result.timings.map(sample => {
          const prefix = side === 'top' ? '顶层' : '底层'
          const label = ENIG_STEP_LABELS[sample.step] ?? sample.step
          return {
            key: `enig:${side}:${sample.step}`,
            label: `${prefix}：${label}`,
            ms: sample.ms,
            group: side,
            meta: sample.meta,
          }
        })

      setPerfRows([...nextPerf, ...toTimingRows('top'), ...toTimingRows('bottom')])
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
          <div class="topbar-title">沉金面积测试</div>
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
              <dt>轮廓面积（mm²）</dt>
              <dd>{formatNumber(derivedMetrics.outlineAreaMm2)}</dd>
              <dt>外接矩形面积（mm²）</dt>
              <dd>{formatNumber(derivedMetrics.boardAreaMm2)}</dd>
              <dt>板厚（mm）</dt>
              <dd>
                <input
                  class="control-input"
                  style={{maxWidth: '140px'}}
                  value={boardThicknessMmInput}
                  onInput={e => setBoardThicknessMmInput((e.currentTarget as HTMLInputElement).value)}
                  spellcheck={false}
                />
              </dd>
              <dt>钻孔层（Gerber）</dt>
              <dd>
                {analysis
                  ? derivedMetrics.drillFilenames.length > 0
                    ? `${derivedMetrics.drillFilenames.length}（${derivedMetrics.drillFilenames.join(', ')}）`
                    : '0'
                  : '-'}
              </dd>
              <dt>沉金（顶层）</dt>
              <dd>
                {formatNumber(derivedMetrics.top?.enigAreaMm2 ?? Number.NaN)} mm²（
                {formatNumber(derivedMetrics.top?.enigAreaPercent ?? Number.NaN)}%）
              </dd>
              <dt>沉金（底层）</dt>
              <dd>
                {formatNumber(derivedMetrics.bottom?.enigAreaMm2 ?? Number.NaN)} mm²（
                {formatNumber(derivedMetrics.bottom?.enigAreaPercent ?? Number.NaN)}%）
              </dd>
              <dt>沉金（合计）</dt>
              <dd>
                {formatNumber(derivedMetrics.totals?.enigTotalMm2 ?? Number.NaN)} mm²（
                {formatNumber(derivedMetrics.totals?.enigPercentTotal ?? Number.NaN)}%）
              </dd>
              <dt>孔壁周长（mm）</dt>
              <dd>{formatNumber(derivedMetrics.holeWallPerimeterMm ?? Number.NaN)}</dd>
              <dt>沉金（孔壁）</dt>
              <dd>{formatNumber(derivedMetrics.holeWallEnigAreaMm2 ?? Number.NaN)} mm²</dd>
              <dt>沉金（含孔壁合计）</dt>
              <dd>
                {formatNumber(derivedMetrics.enigTotalWithHoleWallMm2 ?? Number.NaN)} mm²（
                {formatNumber(derivedMetrics.enigPercentTotalWithHoleWall ?? Number.NaN)}%）
              </dd>
            </dl>

            {(derivedMetrics.top || derivedMetrics.bottom) && (
              <details class="details-extra">
                <summary>更多中间量</summary>
                <dl class="details-grid details-grid--dense">
                  <dt>顶层铜层面积（mm²）</dt>
                  <dd>{formatNumber(derivedMetrics.top?.debug.copperAreaMm2 ?? Number.NaN)}</dd>
                  <dt>顶层阻焊开窗面积（mm²）</dt>
                  <dd>{formatNumber(derivedMetrics.top?.debug.soldermaskOpenAreaMm2 ?? Number.NaN)}</dd>
                  <dt>底层铜层面积（mm²）</dt>
                  <dd>{formatNumber(derivedMetrics.bottom?.debug.copperAreaMm2 ?? Number.NaN)}</dd>
                  <dt>底层阻焊开窗面积（mm²）</dt>
                  <dd>{formatNumber(derivedMetrics.bottom?.debug.soldermaskOpenAreaMm2 ?? Number.NaN)}</dd>
                </dl>
              </details>
            )}

            <div class="formula">
              <div class="formula-title">计算公式</div>
              <code class="formula-line">沉金(单面) = Area( 铜层 ∩ 阻焊开窗 )</code>
              <code class="formula-line">沉金%(单面) = 沉金(单面) / 外接矩形面积 × 100</code>
              <code class="formula-line">沉金(合计) = 沉金(顶层) + 沉金(底层)</code>
              <code class="formula-line">沉金%(合计) = 沉金(合计) / 外接矩形面积 × 100</code>
              <code class="formula-line">孔壁沉金 = Length( Drill ∩ TopCu ∩ BotCu ∩ (TopOpen ∪ BotOpen) ) × 板厚</code>
              <code class="formula-line">沉金(含孔壁合计) = 沉金(合计) + 孔壁沉金</code>
              <code class="formula-line">沉金%(含孔壁合计) = 沉金(含孔壁合计) / 外接矩形面积 × 100</code>
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
