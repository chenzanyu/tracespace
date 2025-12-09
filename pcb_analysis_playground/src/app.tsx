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
  analyzeSpacingRule,
} from '@tracespace/pcb-analysis'
import type {
  ImageGeometryResult,
  MinimumSpacingMeasurement,
  SpacingRuleResult,
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
  violationPaths: string[]
  ruleSpacingMil: number
  ruleHasViolations: boolean
}

export function App(): JSX.Element {
  const [viewer, setViewer] = useState<ViewerDisplay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [ruleMil, setRuleMil] = useState(6.0)
  const [geometryResult, setGeometryResult] =
    useState<ImageGeometryResult | null>(null)

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
      setGeometryResult(result)
      const display = buildViewerDisplay(file.name, result, ruleMil)
      setViewer(display)
    } catch (err) {
      setViewer(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsProcessing(false)
      event.currentTarget.value = ''
    }
  }

  const handleRuleChange = (
    event: JSX.TargetedEvent<HTMLInputElement, Event>
  ): void => {
    const nextValue = Number(event.currentTarget.value)
    if (Number.isNaN(nextValue) || nextValue <= 0) return
    setRuleMil(nextValue)
    if (geometryResult !== null && viewer !== null) {
      const updated = buildViewerDisplay(
        viewer.filename,
        geometryResult,
        nextValue
      )
      setViewer(updated)
    }
  }

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
        <label class="rule-input">
          <span>Minimum spacing rule (mil)</span>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="40"
            value={ruleMil}
            onInput={handleRuleChange}
          />
        </label>
        {error !== null && <p class="error">{error}</p>}
        {viewer && (
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
              <dt>Rule check</dt>
              <dd>
                {viewer.ruleSpacingMil.toFixed(2)} mil ·{' '}
                {viewer.ruleHasViolations ? 'violations found' : 'pass'}
              </dd>
            </dl>
          </div>
        )}
      </section>

      <section class="viewer-section">
        <GeometryCanvas
          paths={viewer?.paths ?? []}
          viewBox={viewer?.viewBox ?? ''}
          marker={viewer?.minimumSpacingLocation ?? null}
          violationPaths={viewer?.violationPaths ?? []}
        />
      </section>
    </div>
  )
}

function buildViewerDisplay(
  filename: string,
  result: ImageGeometryResult,
  ruleMil: number
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
  const ruleResult = analyzeSpacingRule(result, ruleMil)
  const violationPaths = geometryToPaths(
    geojsonWriter.write(
      ruleResult.violations
    ) as GeoJsonGeometry | GeoJsonGeometryCollection
  )

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
    violationPaths,
    ruleSpacingMil: ruleResult.spacingMil,
    ruleHasViolations: ruleResult.hasViolations,
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
