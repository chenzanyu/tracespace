import * as THREE from 'three'
import {BufferGeometryUtils} from 'three/examples/jsm/Addons.js'
import {
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  POLYGON,
  CIRCLE,
  RECTANGLE,
  LAYERED_SHAPE,
  OUTLINE,
  ARC,
  LINE,
} from '@tracespace/plotter'
import {extrudeSettings} from './config'
import {
  renderImageOutline,
  createOutlineState,
  finalizeOutlineState,
  appendSegmentsToPath,
} from './outline'
import {renderImagePath} from './path'
import {renderImageRegion} from './region'
import {renderImageShape} from './shape'

const normalizeGeometry = geometry => {
  if (!geometry) return null
  let result = geometry
  if (result.index) {
    const nonIndexed = result.toNonIndexed()
    geometry.dispose()
    result = nonIndexed
  }
  const position = result.getAttribute('position')
  if (!position) {
    console.warn('[pcbModel] Geometry missing position attribute')
    result.dispose?.()
    return null
  }
  if (!result.getAttribute('normal')) {
    result.computeVertexNormals()
  }
  if (!result.getAttribute('uv')) {
    const uvArray = new Float32Array(position.count * 2)
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2))
  }
  return result
}

const ensureHoleList = shape => {
  if (!Array.isArray(shape.holes)) {
    shape.holes = []
  }
}

const addCircleHole = (shape, circle) => {
  if (!circle) return
  ensureHoleList(shape)
  const hole = new THREE.Path()
  hole.absellipse(circle.cx, circle.cy, circle.r, circle.r, 0, Math.PI * 2, true)
  hole.closePath()
  shape.holes.push(hole)
}

const addRectangleHole = (shape, rect) => {
  if (!rect) return
  ensureHoleList(shape)
  const {x, y, xSize, ySize, r = 0} = rect
  const hole = new THREE.Path()
  if (r > 0) {
    hole.moveTo(x + r, y)
    hole.lineTo(x + xSize - r, y)
    hole.quadraticCurveTo(x + xSize, y, x + xSize, y + r)
    hole.lineTo(x + xSize, y + ySize - r)
    hole.quadraticCurveTo(x + xSize, y + ySize, x + xSize - r, y + ySize)
    hole.lineTo(x + r, y + ySize)
    hole.quadraticCurveTo(x, y + ySize, x, y + ySize - r)
    hole.lineTo(x, y + r)
    hole.quadraticCurveTo(x, y, x + r, y)
  } else {
    hole.moveTo(x, y)
    hole.lineTo(x + xSize, y)
    hole.lineTo(x + xSize, y + ySize)
    hole.lineTo(x, y + ySize)
  }
  hole.closePath()
  shape.holes.push(hole)
}

const addPolygonHole = (shape, points) => {
  if (!Array.isArray(points) || points.length < 3) return
  ensureHoleList(shape)
  const hole = new THREE.Path()
  hole.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    hole.lineTo(points[i][0], points[i][1])
  }
  hole.closePath()
  shape.holes.push(hole)
}

const addOutlineHole = (shape, segments) => {
  if (!Array.isArray(segments) || !segments.length) return
  ensureHoleList(shape)
  const hole = new THREE.Path()
  appendSegmentsToPath(segments, hole)
  hole.closePath()
  shape.holes.push(hole)
}

const addHoleFromShapeDefinition = (shape, definition) => {
  if (!definition) return
  switch (definition.type) {
    case CIRCLE:
      addCircleHole(shape, definition)
      break
    case RECTANGLE:
      addRectangleHole(shape, definition)
      break
    case POLYGON:
      addPolygonHole(shape, definition.points)
      break
    case LAYERED_SHAPE:
      definition.shapes?.forEach((sub) => addHoleFromShapeDefinition(shape, sub))
      break
    case OUTLINE:
      addOutlineHole(shape, definition.segments)
      break
    default:
      break
  }
}

const addHoleFromElement = (shape, element) => {
  if (!element) return
  if (element.type === IMAGE_SHAPE) {
    addHoleFromShapeDefinition(shape, element.shape)
    return
  }
  if (element.type === IMAGE_REGION) {
    const hole = new THREE.Path()
    appendSegmentsToPath(element.segments, hole)
    hole.closePath()
    ensureHoleList(shape)
    shape.holes.push(hole)
    return
  }
  if (element.type === IMAGE_PATH) {
    const hole = new THREE.Path()
    appendSegmentsToPath(element.segments, hole)
    hole.closePath()
    ensureHoleList(shape)
    shape.holes.push(hole)
  }
}

const applyDrillHoles = (shape, drillTrees) => {
  if (!shape || !Array.isArray(drillTrees) || !drillTrees.length) return
  for (const tree of drillTrees) {
    if (!tree?.children) continue
    for (const element of tree.children) {
      addHoleFromElement(shape, element)
    }
  }
}

const segmentsToShape = (segments) => {
  if (!Array.isArray(segments) || !segments.length) return null
  const shape = new THREE.Shape()
  appendSegmentsToPath(segments, shape)
  return shape
}

export function renderThree(
  imageTree,
  color,
  progress = () => {},
  outline = false,
  drillTrees = [],
  boardShapeRegions = null
) {
  if (!imageTree) {
    return new THREE.Group()
  }
  const region = []
  const path = []
  const shape = []
  const polygonShapes = []
  let current = 0
  progress(current)
  const useBoardShape =
    outline && Array.isArray(boardShapeRegions) && boardShapeRegions.length > 0
  const outlineState = useBoardShape ? null : outline ? createOutlineState() : null
  const boardShapes = useBoardShape
    ? boardShapeRegions
        .map((regionDef) => segmentsToShape(regionDef?.segments))
        .filter(Boolean)
    : []

  for (let index = 0; index < imageTree.children.length; index++) {
    const element = imageTree.children[index]
    const nextProgress = Math.ceil(((index + 1) / imageTree.children.length) * 100)
    if (nextProgress !== current) {
      current = nextProgress
      progress(current)
    }

    if (outlineState) {
      renderImageOutline(element, outlineState)
      continue
    }

    if (useBoardShape) {
      continue
    }

    if (element.type === IMAGE_REGION) {
      const geo = normalizeGeometry(renderImageRegion(element))
      if (geo) region.push(geo)
      continue
    }

    if (element.type === IMAGE_PATH) {
      const geos = renderImagePath(element)
      geos.forEach(geo => {
        const normalized = normalizeGeometry(geo)
        if (normalized) path.push(normalized)
      })
      continue
    }

    if (element.type === IMAGE_SHAPE) {
      const geos = renderImageShape(element)
      geos.forEach(entry => {
        const normalized = normalizeGeometry(entry.geometry)
        if (!normalized) return
        if (entry.type === POLYGON) {
          polygonShapes.push(normalized)
        } else {
          shape.push(normalized)
        }
      })
    }
  }

  const group = new THREE.Group()

  if (outlineState) {
    const outlineShape = finalizeOutlineState(outlineState)
    if (outlineShape) {
      applyDrillHoles(outlineShape, drillTrees)
      const geometry = new THREE.ExtrudeGeometry(outlineShape, extrudeSettings)
      geometry.translate(0, 0, -0.5)
      const normalized = normalizeGeometry(geometry)
      if (normalized) region.push(normalized)
    }
  } else if (boardShapes.length > 0) {
    boardShapes.forEach((shapeEntry) => {
      if (!shapeEntry) return
      applyDrillHoles(shapeEntry, drillTrees)
      const geometry = new THREE.ExtrudeGeometry(shapeEntry, extrudeSettings)
      geometry.translate(0, 0, -0.5)
      const normalized = normalizeGeometry(geometry)
      if (normalized) region.push(normalized)
    })
  }

  const material = new THREE.MeshBasicMaterial({color})

  const mergeAndAdd = geometries => {
    if (!geometries.length) return
    const merged = BufferGeometryUtils.mergeGeometries(geometries, false)
    if (!merged) {
      console.warn('[pcbModel] Failed to merge geometries')
      return
    }
    const mesh = new THREE.Mesh(merged, material)
    group.add(mesh)
    for (const geo of geometries) geo.dispose()
  }

  mergeAndAdd(region)
  mergeAndAdd(path)
  mergeAndAdd(shape)
  mergeAndAdd(polygonShapes)

  material.dispose()
  return group
}
