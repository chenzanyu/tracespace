import * as THREE from 'three'
import {BufferGeometryUtils} from 'three/examples/jsm/Addons.js'
import {IMAGE_PATH, IMAGE_REGION, IMAGE_SHAPE, POLYGON} from '@tracespace/plotter'
import {extrudeSettings} from './config'
import {renderImageOutline} from './outline'
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

export function renderThree(imageTree, color, progress = () => {}, outline = false) {
  if (!imageTree) {
    return new THREE.Group()
  }
  const region = []
  const path = []
  const shape = []
  const polygonShapes = []
  let current = 0
  progress(current)
  const outlineShape = outline ? new THREE.Shape() : null

  for (let index = 0; index < imageTree.children.length; index++) {
    const element = imageTree.children[index]
    const nextProgress = Math.ceil(((index + 1) / imageTree.children.length) * 100)
    if (nextProgress !== current) {
      current = nextProgress
      progress(current)
    }

    if (outlineShape) {
      renderImageOutline(element, outlineShape)
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

  if (outlineShape) {
    const geometry = new THREE.ExtrudeGeometry(outlineShape, extrudeSettings)
    geometry.translate(0, 0, -0.5)
    const normalized = normalizeGeometry(geometry)
    if (normalized) region.push(normalized)
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
