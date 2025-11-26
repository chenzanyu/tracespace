import * as THREE from 'three'
import {LAYERED_SHAPE, OUTLINE, CIRCLE, POLYGON, RECTANGLE} from '@tracespace/plotter'
import {extrudeSettings} from './config'

const renderCircle = shape => {
  const geometry = new THREE.CylinderGeometry(shape.r, shape.r, 1)
  geometry.translate(shape.cx, shape.cy, 0)
  const matrix = new THREE.Matrix4().makeTranslation(-shape.cx, -shape.cy, 0)
  const rotationZ = new THREE.Matrix4().makeRotationX(Math.PI / 2)
  const translateBack = new THREE.Matrix4().makeTranslation(shape.cx, shape.cy, 0)
  const transformMatrix = new THREE.Matrix4()
    .multiply(translateBack)
    .multiply(rotationZ)
    .multiply(matrix)
  geometry.applyMatrix4(transformMatrix)
  geometry.deleteAttribute('uv')
  return geometry
}

export const drawRoundedRect = (x, y, width, height, radius) => {
  const shape = new THREE.Shape()
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}

const renderRectangle = shape => {
  let geometry
  if (shape.r) {
    geometry = new THREE.ExtrudeGeometry(
      drawRoundedRect(shape.x, shape.y, shape.xSize, shape.ySize, shape.r),
      extrudeSettings
    )
    geometry.translate(0, 0, extrudeSettings.depth ? -extrudeSettings.depth / 2 : -0.5)
  } else {
    geometry = new THREE.BoxGeometry(shape.xSize, shape.ySize, 1)
    const cx = shape.x + shape.xSize / 2
    const cy = shape.y + shape.ySize / 2
    geometry.translate(cx, cy, 0)
  }
  geometry.deleteAttribute('uv')
  return geometry
}

const renderOutlineShape = segments => {
  const geometry = new THREE.CylinderGeometry(segments[0].radius, segments[0].radius, 1)
  geometry.translate(segments[0].center[0], segments[0].center[1], 0)
  geometry.deleteAttribute('uv')
  return geometry
}

const renderPolygon = points => {
  if (!Array.isArray(points) || points.length < 3) {
    console.warn('[pcbModel] Invalid polygon points', points)
    return new THREE.BufferGeometry()
  }
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]
    shape.lineTo(x, y)
    shape.moveTo(x, y)
  }
  shape.lineTo(points[0][0], points[0][1])
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  geometry.deleteAttribute('uv')
  geometry.translate(0, 0, extrudeSettings.depth ? -extrudeSettings.depth / 2 : -0.5)
  return geometry
}

export function renderImageShape(element) {
  const output = []
  if (!element?.shape) return output

  const appendShapeGeometry = (definition, inheritedErase = false) => {
    if (!definition) return
    const eraseFlag = inheritedErase || definition.erase === true
    switch (definition.type) {
      case CIRCLE:
        output.push({erase: eraseFlag, geometry: renderCircle(definition), type: CIRCLE})
        break
      case RECTANGLE:
        output.push({erase: eraseFlag, geometry: renderRectangle(definition), type: RECTANGLE})
        break
      case LAYERED_SHAPE:
        definition.shapes?.forEach((subShape) => appendShapeGeometry(subShape, eraseFlag))
        break
      case POLYGON:
        output.push({erase: eraseFlag, geometry: renderPolygon(definition.points), type: POLYGON})
        break
      case OUTLINE:
        output.push({
          erase: eraseFlag,
          geometry: renderOutlineShape(definition.segments),
          type: OUTLINE,
        })
        break
      default:
        console.warn('[pcbModel] Unsupported shape type', definition)
        break
    }
  }

  appendShapeGeometry(element.shape, element.shape?.erase === true)
  return output
}
