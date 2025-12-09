import {useState} from 'preact/hooks'
import type {JSX} from 'preact/jsx-runtime'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter'
import type {
  Geometry as GeoJsonGeometry,
  GeometryCollection as GeoJsonGeometryCollection,
  LineString as GeoJsonLineString,
  Polygon as GeoJsonPolygon,
} from 'geojson'

import {gerberToImageGeometries} from '@tracespace/pcb-analysis'
import type {ImageGeometryResult} from '@tracespace/pcb-analysis'
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
      const display = buildViewerDisplay(file.name, result)
      setViewer(display)
    } catch (err) {
      setViewer(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsProcessing(false)
      event.currentTarget.value = ''
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
            </dl>
          </div>
        )}
      </section>

      <section class="viewer-section">
        <GeometryCanvas
          paths={viewer?.paths ?? []}
          viewBox={viewer?.viewBox ?? ''}
        />
      </section>
    </div>
  )
}

function buildViewerDisplay(
  filename: string,
  result: ImageGeometryResult
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

  return {
    filename,
    paths,
    viewBox,
    units: result.units,
    mmPerUnit,
    primitiveCount: graphics.length,
    compositeAreaMm2: areaUnits * mmPerUnit * mmPerUnit,
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
