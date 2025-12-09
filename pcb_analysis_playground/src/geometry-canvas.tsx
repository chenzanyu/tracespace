import type {JSX} from 'preact/jsx-runtime'

interface GeometryCanvasProps {
  paths: string[]
  viewBox: string
}

export function GeometryCanvas({
  paths,
  viewBox,
}: GeometryCanvasProps): JSX.Element {
  if (!paths.length || viewBox.length === 0) {
    return (
      <div class="viewer viewer--empty">
        <p>Upload a Gerber layer to inspect the generated geometry.</p>
      </div>
    )
  }

  return (
    <div class="viewer">
      <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg">
        {paths.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </svg>
    </div>
  )
}
