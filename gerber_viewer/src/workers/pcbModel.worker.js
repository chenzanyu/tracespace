import * as THREE from 'three'
import {plot} from '@tracespace/plotter'
import {renderThree} from './pcb-model/geometry/index.js'

const ACTION_BUILD_LAYER = 'build-layer'

const normalizeColor = value => {
  try {
    return new THREE.Color(value ?? 0xffffff)
  } catch (error) {
    return new THREE.Color(0xffffff)
  }
}

const serializeGroup = group => {
  const json = group.toJSON()
  group.traverse(obj => {
    if (obj.geometry?.dispose) obj.geometry.dispose()
    if (Array.isArray(obj.material)) {
      obj.material.forEach(mat => mat?.dispose?.())
    } else {
      obj.material?.dispose?.()
    }
  })
  return json
}

const buildLayerPayload = payload => {
  const {layerId, parseTree, color, outline} = payload
  if (!parseTree) {
    throw new Error('Missing parse tree for layer job')
  }
  const imageTree = plot(parseTree)
  const group = renderThree(imageTree, normalizeColor(color), () => {}, outline)
  return {
    layerId,
    type: payload.type,
    side: payload.side,
    color,
    mesh: serializeGroup(group),
  }
}

self.onmessage = event => {
  const {jobId, action, payload} = event.data || {}
  if (!jobId) return
  try {
    if (action === ACTION_BUILD_LAYER) {
      const result = buildLayerPayload(payload)
      self.postMessage({jobId, success: true, result})
      return
    }
    throw new Error(`Unsupported action: ${action}`)
  } catch (error) {
    self.postMessage({jobId, success: false, message: error?.message || String(error)})
  }
}
