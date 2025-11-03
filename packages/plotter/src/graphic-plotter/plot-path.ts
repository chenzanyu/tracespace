import * as Tree from '../tree'
import type {Tool} from '../tool-store'
import {SIMPLE_TOOL} from '../tool-store'
import type {Location, Point} from '../location-store'
import {TWO_PI} from '../coordinate-math'

import {plotRectPath} from './plot-rect-path'

export const CW = 'cw'
export const CCW = 'ccw'

export type ArcDirection = typeof CW | typeof CCW

export function plotSegment(
  location: Location,
  arcDirection?: ArcDirection,
  ambiguousArcCenter?: boolean
): Tree.PathSegment {
  return arcDirection === undefined
    ? createLineSegment(location)
    : createArcSegment(location, arcDirection, ambiguousArcCenter)
}

export function plotContour(
  segments: Tree.PathSegment[]
): Tree.ImageGraphicBase | undefined {
  if (segments.length > 0) {
    return {type: Tree.IMAGE_REGION, segments}
  }
}

export function plotLine(
  segment: Tree.PathSegment,
  tool: Tool | undefined
): Tree.ImageGraphicBase | undefined {
  if (tool?.type === SIMPLE_TOOL && tool.shape.type === Tree.CIRCLE) {
    return {
      type: Tree.IMAGE_REGION,
      segments: contourizeCirclePath(segment, tool.shape.diameter),
    }
  }

  if (tool?.type === SIMPLE_TOOL && tool.shape.type === Tree.RECTANGLE) {
    return plotRectPath(segment, tool.shape)
  }
}

function createLineSegment(location: Location): Tree.PathLineSegment {
  return {
    type: Tree.LINE,
    start: [location.startPoint.x, location.startPoint.y],
    end: [location.endPoint.x, location.endPoint.y],
  }
}

function contourizeCirclePath(
  segment: Tree.PathSegment,
  width: number
): Tree.PathSegment[] {
  const radius = width / 2

  if (segment.type === Tree.LINE) {
    const {start, end} = segment
    const [x1, y1] = start
    const [x2, y2] = end
    const theta = Math.atan2(y2 - y1, x2 - x1)
    const dx = -radius * Math.sin(theta)
    const dy = radius * Math.cos(theta)

    return [
      {type: Tree.LINE, start: [x1 + dx, y1 + dy], end: [x2 + dx, y2 + dy]},
      {
        type: Tree.ARC,
        start: [x2 + dx, y2 + dy, theta + Math.PI / 2],
        end: [x2 - dx, y2 - dy, theta - Math.PI / 2],
        center: [x2, y2],
        radius,
      },
      {type: Tree.LINE, start: [x2 - dx, y2 - dy], end: [x1 - dx, y1 - dy]},
      {
        type: Tree.ARC,
        start: [x1 - dx, y1 - dy, theta + (3 * Math.PI) / 2],
        end: [x1 + dx, y1 + dy, theta + Math.PI / 2],
        center: [x1, y1],
        radius,
      },
    ]
  }

  const {start, end, radius: arcRadius, center} = segment
  const [x1, y1] = start
  const [x2, y2] = end
  const [cx, cy] = center
  const theta1 = start[2]
  const theta2 = end[2]
  const dx1 = -radius * Math.sin(theta1 - Math.PI / 2)
  const dy1 = radius * Math.cos(theta1 - Math.PI / 2)
  const dx2 = -radius * Math.sin(theta2 - Math.PI / 2)
  const dy2 = radius * Math.cos(theta2 - Math.PI / 2)

  if (theta1 > theta2) {
    return [
      {
        type: Tree.ARC,
        start: [x1 + dx1, y1 + dy1, theta1],
        end: [x2 + dx2, y2 + dy2, theta2],
        center: [cx, cy],
        radius: arcRadius + radius,
      },
      {
        type: Tree.ARC,
        start: [x2 + dx2, y2 + dy2, theta2],
        end: [x2 - dx2, y2 - dy2, theta2 - Math.PI],
        center: [x2, y2],
        radius,
      },
      {
        type: Tree.ARC,
        start: [x2 - dx2, y2 - dy2, theta2],
        end: [x1 - dx1, y1 - dy1, theta1],
        center: [cx, cy],
        radius: arcRadius - radius,
      },
      {
        type: Tree.ARC,
        start: [x1 - dx1, y1 - dy1, theta1 + Math.PI],
        end: [x1 + dx1, y1 + dy1, theta1],
        center: [x1, y1],
        radius,
      },
    ]
  }

  return [
    {
      type: Tree.ARC,
      start: [x1 + dx1, y1 + dy1, theta1],
      end: [x2 + dx2, y2 + dy2, theta2],
      center: [cx, cy],
      radius: arcRadius + radius,
    },
    {
      type: Tree.ARC,
      start: [x2 + dx2, y2 + dy2, theta2],
      end: [x2 - dx2, y2 - dy2, theta2 + Math.PI],
      center: [x2, y2],
      radius,
    },
    {
      type: Tree.ARC,
      start: [x2 - dx2, y2 - dy2, theta2],
      end: [x1 - dx1, y1 - dy1, theta1],
      center: [cx, cy],
      radius: arcRadius - radius,
    },
    {
      type: Tree.ARC,
      start: [x1 - dx1, y1 - dy1, theta1 - Math.PI],
      end: [x1 + dx1, y1 + dy1, theta1],
      center: [x1, y1],
      radius,
    },
  ]
}

function createArcSegment(
  location: Location,
  arcDirection: ArcDirection,
  ambiguousArcCenter = false
): Tree.PathSegment {
  const {startPoint, endPoint, arcOffsets} = location
  const radius =
    arcOffsets.a > 0
      ? arcOffsets.a
      : (arcOffsets.i ** 2 + arcOffsets.j ** 2) ** 0.5

  if (ambiguousArcCenter || arcOffsets.a > 0) {
    if (startPoint.x === endPoint.x && startPoint.y === endPoint.y) {
      return createLineSegment(location)
    }

    const [start, end, center] = findCenterCandidates(location, radius)
      .map(centerPoint =>
        getArcPositions(startPoint, endPoint, centerPoint, arcDirection)
      )
      .sort(([startA, endA], [startB, endB]) => {
        const sweepA = Math.abs(endA[2] - startA[2])
        const sweepB = Math.abs(endB[2] - startB[2])
        return sweepA - sweepB
      })[0]

    return {type: Tree.ARC, start, end, center, radius}
  }

  const centerPoint = {
    x: startPoint.x + arcOffsets.i,
    y: startPoint.y + arcOffsets.j,
  }

  const [start, end, center] = getArcPositions(
    startPoint,
    endPoint,
    centerPoint,
    arcDirection
  )

  return {type: Tree.ARC, start, end, center, radius}
}

export function getArcPositions(
  startPoint: Point,
  endPoint: Point,
  centerPoint: Point,
  arcDirection: ArcDirection
): [start: Tree.ArcPosition, end: Tree.ArcPosition, center: Tree.Position] {
  let startAngle = Math.atan2(
    startPoint.y - centerPoint.y,
    startPoint.x - centerPoint.x
  )
  let endAngle = Math.atan2(
    endPoint.y - centerPoint.y,
    endPoint.x - centerPoint.x
  )

  if (arcDirection === CCW) {
    endAngle = endAngle > startAngle ? endAngle : endAngle + TWO_PI
  } else {
    startAngle = startAngle > endAngle ? startAngle : startAngle + TWO_PI
  }

  return [
    [startPoint.x, startPoint.y, startAngle],
    [endPoint.x, endPoint.y, endAngle],
    [centerPoint.x, centerPoint.y],
  ]
}

function findCenterCandidates(location: Location, radius: number): Point[] {
  const {x: x1, y: y1} = location.startPoint
  const {x: x2, y: y2} = location.endPoint

  const [dx, dy] = [x2 - x1, y2 - y1]
  const [sx, sy] = [x2 + x1, y2 + y1]
  const distance = Math.sqrt(dx ** 2 + dy ** 2)

  if (radius <= distance / 2) {
    return [{x: x1 + dx / 2, y: y1 + dy / 2}]
  }

  const factor = Math.sqrt((4 * radius ** 2) / distance ** 2 - 1)
  const [xBase, yBase] = [sx / 2, sy / 2]
  const [xAddend, yAddend] = [(dy * factor) / 2, (dx * factor) / 2]

  return [
    {x: xBase + xAddend, y: yBase - yAddend},
    {x: xBase - xAddend, y: yBase + yAddend},
  ]
}
