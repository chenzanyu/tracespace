import * as THREE from 'three'
import {ARC, LINE} from '@tracespace/plotter'

const renderImagePathLine = segment => {
  return new THREE.LineCurve(
    new THREE.Vector2(segment.start[0], segment.start[1]),
    new THREE.Vector2(segment.end[0], segment.end[1])
  )
}

const renderImagePathArc = segment => {
  return new THREE.EllipseCurve(
    segment.center[0],
    segment.center[1],
    segment.radius,
    segment.radius,
    segment.start[2],
    segment.end[2],
    segment.start[2] > segment.end[2]
  )
}

export function renderImagePath(element) {
  if (!element?.segments) return []
  const geometries = []
  const width = 1
  const height = element.width || 0
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2, -height / 2)
  shape.lineTo(width / 2, -height / 2)
  shape.lineTo(width / 2, height / 2)
  shape.lineTo(-width / 2, height / 2)
  shape.lineTo(-width / 2, -height / 2)

  for (const segment of element.segments) {
    let curve = null
    if (segment.type === LINE) {
      curve = renderImagePathLine(segment)
    } else if (segment.type === ARC) {
      curve = renderImagePathArc(segment)
    } else {
      console.warn('[pcbModel] Unsupported path segment', segment)
      continue
    }
    const vectorPoints = curve
      .getPoints(50)
      .map(point => new THREE.Vector3(point.x, point.y, 0))
    const spline = new THREE.CatmullRomCurve3(vectorPoints, false, 'catmullrom', 2)
    const extrudeSettings = {
      steps: 1,
      bevelEnabled: true,
      extrudePath: spline,
    }
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    geometries.push(geometry)
  }

  return geometries
}
