import {useState} from 'preact/hooks'
import type {JSX} from 'preact/jsx-runtime'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter'
import type {
  Geometry as GeoJsonGeometry,
  GeometryCollection as GeoJsonGeometryCollection,
  LineString as GeoJsonLineString,
  Polygon as GeoJsonPolygon,
} from 'geojson'

import {
  gerberToImageGeometries,
  measureMinimumSpacing,
} from '@tracespace/pcb-analysis'
import type {
  GeometryPerformanceProfile,
  ImageGeometryResult,
  MinimumSpacingMeasurement,
} from '@tracespace/pcb-analysis'
import type {UnitsType} from '@tracespace/parser'

import {GeometryCanvas} from './geometry-canvas'

const geojsonWriter = new GeoJSONWriter()

interface ViewerDisplay {
  filename: string
  paths: string[]
  viewBox: string
  units: UnitsType | undefined
  mmPerUnit: number
  compositeAreaMm2: number
  primitiveCount: number
  minimumSpacingMil: number | null
  minimumSpacingLocation: MinimumSpacingMeasurement['location']
  minimumSpacingEndpoints: MinimumSpacingMeasurement['endpoints']
  minimumSpacingPaths: string[]
  performance: GeometryPerformanceProfile | null
  minimumSpacingMetrics: MinimumSpacingMeasurement['metrics'] | null
  memory: MemorySnapshot | null
}

interface MemorySnapshot {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface PerformanceMemory {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

export function App(): JSX.Element {
  const [viewer, setViewer] = useState<ViewerDisplay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFileChange = async (
    event: JSX.TargetedEvent<HTMLInputElement, Event>
  ): Promise<void> => {
    const file = event.currentTarget.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setError(null)

    try {
      const contents = await file.text()
      const result = gerberToImageGeometries(contents)
      const memorySnapshot = captureMemorySnapshot()
      const display = buildViewerDisplay(
        file.name,
        result,
        memorySnapshot
      )
      setViewer(display)
    } catch (err) {
      setViewer(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsProcessing(false)
      event.currentTarget.value = ''
    }
  }

  const pipelineTotalMs = viewer?.performance?.totalMs ?? null
  const spacingDurationMs = viewer?.minimumSpacingMetrics?.durationMs ?? null
  const convertBreakdown = viewer?.performance?.convertBreakdown
  const combinedTotalMs =
    viewer !== null
      ? (pipelineTotalMs ?? 0) + (spacingDurationMs ?? 0)
      : null
  const hasPerformancePanel =
    viewer !== null &&
    Boolean(
      viewer.performance ||
        viewer.minimumSpacingMetrics ||
        viewer.memory
    )

  return (
    <div class="app">
      <header>
        <div>
          <p class="eyebrow">PCB Analysis Playground</p>
          <h1>Plot tree -&gt; JSTS -&gt; SVG</h1>
          <p class="lede">
            Upload a single Gerber layer to run it through the tracespace parser,
            plotter, and the new <code>@tracespace/pcb-analysis</code> geometry
            pipeline. The result below is rendered directly from the JSTS data so
            we can visually validate the conversion.
          </p>
        </div>
      </header>

      <section class="controls">
        <label class="file-picker">
          <input
            type="file"
            accept=".gbr,.ger,.grb,.art,.txt,.ncdrill"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          <span>{isProcessing ? 'Processing...' : 'Select Gerber file'}</span>
        </label>
        {error !== null && <p class="error">{error}</p>}
        {viewer && (
          <>
            <div class="summary">
              <dl>
                <dt>File</dt>
                <dd>{viewer.filename}</dd>
                <dt>Units</dt>
                <dd>
                  {viewer.units ?? 'mm'} (1 unit = {viewer.mmPerUnit.toFixed(4)} mm)
                </dd>
                <dt>Graphics processed</dt>
                <dd>{viewer.primitiveCount}</dd>
                <dt>Composite area</dt>
                <dd>{viewer.compositeAreaMm2.toFixed(3)} mm^2</dd>
                <dt>Minimum spacing</dt>
                <dd>
                  {viewer.minimumSpacingMil !== null
                    ? `${viewer.minimumSpacingMil.toFixed(3)} mil`
                    : 'N/A'}
                </dd>
                {viewer.minimumSpacingEndpoints && (
                  <>
                    <dt>Spacing points</dt>
                    <dd>
                      {formatPoint(viewer.minimumSpacingEndpoints[0])} →
                      {formatPoint(viewer.minimumSpacingEndpoints[1])}
                    </dd>
                  </>
                )}              </dl>
            </div>
            {hasPerformancePanel && (
              <div class="performance-panel">
                <h2>Performance</h2>
                <table>
                  <tbody>
                    <tr>
                      <th>Parse</th>
                      <td>{formatMs(viewer.performance?.parseMs)}</td>
                    </tr>
                    <tr>
                      <th>Plot</th>
                      <td>{formatMs(viewer.performance?.plotMs)}</td>
                    </tr>
                    <tr>
                      <th>Convert</th>
                      <td>{formatMs(viewer.performance?.convertMs)}</td>
                    </tr>
                    {convertBreakdown && (
                      <>
                        <tr>
                          <th>↳ geometry</th>
                          <td>{formatMs(convertBreakdown.convertGraphicMs)}</td>
                        </tr>
                        <tr>
                          <th>↳ precision</th>
                          <td>{formatMs(convertBreakdown.precisionReductionMs)}</td>
                        </tr>
                        <tr>
                          <th>↳ boolean ops</th>
                          <td>{formatMs(convertBreakdown.booleanOpsMs)}</td>
                        </tr>
                        <tr>
                          <th>↳ runs</th>
                          <td>
                            {convertBreakdown.runCount} (
                            {convertBreakdown.averageRunSize.toFixed(1)} avg size)
                          </td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <th>Pipeline total</th>
                      <td>{formatMs(viewer.performance?.totalMs)}</td>
                    </tr>
                    <tr>
                      <th>Spacing search</th>
                      <td>{formatMs(spacingDurationMs)}</td>
                    </tr>                    <tr>
                      <th>Overall total</th>
                      <td>
                        {combinedTotalMs !== null
                          ? formatMs(combinedTotalMs)
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <th>Memory</th>
                      <td>
                        {viewer.memory
                          ? `${formatBytes(
                              viewer.memory.usedJSHeapSize
                            )} / ${formatBytes(
                              viewer.memory.totalJSHeapSize
                            )} (limit ${formatBytes(
                              viewer.memory.jsHeapSizeLimit
                            )})`
                          : 'Unavailable'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {viewer.minimumSpacingMetrics && (
                  <p class="performance-note">
                    <strong>Min spacing:</strong>{' '}
                    {viewer.minimumSpacingMetrics.componentsIndexed} components ·{' '}
                    {viewer.minimumSpacingMetrics.candidatePairs} candidate pairs ·{' '}
                    {viewer.minimumSpacingMetrics.evaluatedPairs} distance ops
                  </p>
                )}              </div>
            )}
          </>
        )}
      </section>

      <section class="viewer-section">
        <GeometryCanvas
          paths={viewer?.paths ?? []}
          viewBox={viewer?.viewBox ?? ''}
          marker={viewer?.minimumSpacingLocation ?? null}
          measurementPaths={viewer?.minimumSpacingPaths ?? []}
        />
      </section>
    </div>
  )
}

function buildViewerDisplay(
  filename: string,
  result: ImageGeometryResult,
  memorySnapshot: MemorySnapshot | null = null
): ViewerDisplay {
  const {composite, graphics, mmPerUnit} = result
  const envelope = composite.getEnvelopeInternal()
  const minX = envelope?.getMinX() ?? -10
  const maxY = envelope?.getMaxY() ?? 10
  const width = Math.max(envelope?.getWidth() ?? 20, 1)
  const height = Math.max(envelope?.getHeight() ?? 20, 1)
  const viewBox = `${minX} ${-maxY} ${width} ${height}`
  const geojson = geojsonWriter.write(
    composite
  ) as GeoJsonGeometry | GeoJsonGeometryCollection
  const paths = geometryToPaths(geojson)
  const areaUnits = composite.getArea()
  const minimumSpacing = measureMinimumSpacing(result)
  const minimumSpacingPaths =
    minimumSpacing?.violations && !minimumSpacing.violations.isEmpty()
      ? geometryToPaths(
          geojsonWriter.write(
            minimumSpacing.violations
          ) as GeoJsonGeometry | GeoJsonGeometryCollection
        )
      : []
  const memory = memorySnapshot ?? captureMemorySnapshot()

  return {
    filename,
    paths,
    viewBox,
    units: result.units,
    mmPerUnit,
    primitiveCount: graphics.length,
    compositeAreaMm2: areaUnits * mmPerUnit * mmPerUnit,
    minimumSpacingMil: minimumSpacing?.spacingMil ?? null,
    minimumSpacingLocation: minimumSpacing?.location ?? null,
    minimumSpacingEndpoints: minimumSpacing?.endpoints ?? null,
    minimumSpacingPaths,
    performance: result.performance ?? null,
    minimumSpacingMetrics: minimumSpacing?.metrics ?? null,
    memory,
  }
}

function geometryToPaths(
  geometry: GeoJsonGeometry | GeoJsonGeometryCollection | null | undefined
): string[] {
  if (!geometry) return []

  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap(geometryToPaths)
  }

  switch (geometry.type) {
    case 'Polygon':
      return [polygonToPath(geometry.coordinates)]
    case 'MultiPolygon':
      return geometry.coordinates.map(polygonToPath)
    case 'LineString':
      return [lineToPath(geometry.coordinates)]
    case 'MultiLineString':
      return geometry.coordinates.map(lineToPath)
    default:
      return []
  }
}

function polygonToPath(
  coordinates: GeoJsonPolygon['coordinates']
): string {
  return coordinates
    .map(ring => pointsToPath(ring, true))
    .filter(Boolean)
    .join(' ')
}

function lineToPath(coordinates: GeoJsonLineString['coordinates']): string {
  return pointsToPath(coordinates, false)
}

function pointsToPath(points: GeoJsonLineString['coordinates'], close: boolean): string {
  if (points.length === 0) return ''

  const commands = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${-y}`)
    .join(' ')

  return close ? `${commands} Z` : commands
}

function formatMs(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—'
  }

  return `${value.toFixed(2)} ms`
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 ? 0 : 2
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function captureMemorySnapshot(): MemorySnapshot | null {
  if (typeof performance === 'undefined') {
    return null
  }

  const perf = performance as Performance & {memory?: PerformanceMemory}
  if (!perf.memory) {
    return null
  }

  const {usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit} = perf.memory
  if (
    typeof usedJSHeapSize !== 'number' ||
    typeof totalJSHeapSize !== 'number' ||
    typeof jsHeapSizeLimit !== 'number'
  ) {
    return null
  }

  return {usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit}
}

function formatPoint(point?: [number, number] | null, precision = 3): string {
  if (!point) return '—'
  const [x, y] = point
  return `(${x.toFixed(precision)}, ${y.toFixed(precision)})`
}
