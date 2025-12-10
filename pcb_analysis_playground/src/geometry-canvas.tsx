import type {JSX} from 'preact/jsx-runtime'

interface GeometryCanvasProps {
  paths: string[]
  viewBox: string
  marker?: [number, number] | null
  measurementPaths?: string[]
}

export function GeometryCanvas({
  paths,
  viewBox,
  marker,
  measurementPaths = [],
}: GeometryCanvasProps): JSX.Element {
  if (!paths.length || viewBox.length === 0) {
    return (
      <div class="viewer viewer--empty">
        <p>Upload a Gerber layer to inspect the generated geometry.</p>
      </div>
    )
  }

  const [x = 0, y = 0, width = 0, height = 0] = viewBox
    .split(' ')
    .map(value => Number(value))
  const markerRadius = width > 0 && height > 0 ? Math.min(width, height) / 150 : 0.2

  return (
    <div class="viewer">
      <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg">
        {paths.map((d, index) => (
          <path key={index} d={d} />
        ))}
        {measurementPaths.map((d, index) => (
          <path class="viewer-measurement" key={`ms-${index}`} d={d} />
        ))}
        {marker && (
          <g class="viewer-marker">
            <circle cx={marker[0]} cy={-marker[1]} r={markerRadius} />
            <line
              x1={marker[0] - markerRadius * 1.5}
              y1={-marker[1]}
              x2={marker[0] + markerRadius * 1.5}
              y2={-marker[1]}
            />
            <line
              x1={marker[0]}
              y1={-marker[1] - markerRadius * 1.5}
              x2={marker[0]}
              y2={-marker[1] + markerRadius * 1.5}
            />
          </g>
        )}
      </svg>
    </div>
  )
}
