import * as THREE from 'three'
import {ARC, LINE, IMAGE_PATH, IMAGE_REGION} from '@tracespace/plotter'

const appendSegmentsToShape = (segments, shape) => {
  if (!Array.isArray(segments) || segments.length === 0) return
  const first = segments[0]
  const startPoint = first?.start
  if (!Array.isArray(startPoint) || startPoint.length < 2) return
  shape.moveTo(startPoint[0], startPoint[1])
  for (const segment of segments) {
    if (segment.type === LINE) {
      if (!segment.end) continue
      shape.lineTo(segment.end[0], segment.end[1])
    } else if (segment.type === ARC) {
      shape.absarc(
        segment.center[0],
        segment.center[1],
        segment.radius,
        segment.start[2],
        segment.end[2],
        segment.start[2] > segment.end[2]
      )
    }
  }
}

export function renderImageOutline(element, shape) {
  if (!element) return
  if (element.type === IMAGE_PATH) {
    appendSegmentsToShape(element.segments, shape)
    return
  }
  if (element.type === IMAGE_REGION) {
    appendSegmentsToShape(element.segments, shape)
    return
  }
  console.warn('[pcbModel] Invalid outline element', element)
}
