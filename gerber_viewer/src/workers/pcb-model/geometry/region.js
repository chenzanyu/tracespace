import * as THREE from 'three'
import {ARC, LINE} from '@tracespace/plotter'
import {extrudeSettings} from './config'

export function renderImageRegion(element) {
  if (!element?.segments || element.segments.length === 0) return null
  const shape = new THREE.Shape()
  const first = element.segments[0]
  shape.moveTo(first.start[0], first.start[1])

  for (const segment of element.segments) {
    if (!Array.isArray(segment.start) || !Array.isArray(segment.end)) {
      console.warn('[pcbModel] Invalid region segment', segment)
      continue
    }

    if (segment.type === ARC) {
      shape.absarc(
        segment.center[0],
        segment.center[1],
        segment.radius,
        segment.start[2],
        segment.end[2],
        segment.start[2] > segment.end[2]
      )
    } else if (segment.type === LINE) {
      shape.lineTo(segment.end[0], segment.end[1])
    } else {
      console.warn('[pcbModel] Unsupported region segment type', segment)
    }
  }
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  geometry.translate(0, 0, -0.5)
  return geometry
}
