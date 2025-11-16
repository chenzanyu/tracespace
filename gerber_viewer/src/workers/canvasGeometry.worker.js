import * as THREE from 'three'
import { CanvasGeometry } from '../libs/3d/CanvasGeometry'

// Worker 端只接受主线程传来的 RGBA 数据，保守转换成 ImageData
const ensureImageData = (image) => {
  if (!image || !image.data || !Number.isFinite(image.width) || !Number.isFinite(image.height)) {
    throw new Error('Invalid image payload')
  }
  const { data, width, height } = image
  return new ImageData(new Uint8ClampedArray(data), width, height)
}

const serializeGeometry = (geometry) => {
  if (!geometry) {
    return {
      positions: new Float32Array(),
      uvs: new Float32Array(),
      normals: new Float32Array(),
      groups: [],
      boundingBox: { min: [0, 0, 0], max: [0, 0, 0] },
    }
  }
  geometry.computeBoundingBox()
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals()
  }
  const positionAttr = geometry.getAttribute('position')
  const uvAttr = geometry.getAttribute('uv')
  const normalAttr = geometry.getAttribute('normal')
  const groups = Array.isArray(geometry.groups)
    ? geometry.groups.map((group) => ({
      start: group.start || 0,
      count: group.count || 0,
      materialIndex: group.materialIndex || 0,
    }))
    : []
  const boundingBox = geometry.boundingBox
    ? {
      min: geometry.boundingBox.min.toArray(),
      max: geometry.boundingBox.max.toArray(),
    }
    : { min: [0, 0, 0], max: [0, 0, 0] }
  return {
    positions: positionAttr?.array || new Float32Array(),
    uvs: uvAttr?.array || new Float32Array(),
    normals: normalAttr?.array || new Float32Array(),
    groups,
    boundingBox,
  }
}

// 在 OffscreenCanvas 上运行原 CanvasGeometry 算法（避免阻塞主线程）
const buildGeometryPayload = (image, options) => {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas not supported')
  }
  const { width, height } = image || {}
  if (!width || !height) throw new Error('Image dimensions missing')
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2d context')
  const img = ensureImageData(image)
  ctx.putImageData(img, 0, 0)
  const geometry = new CanvasGeometry(canvas, options)
  const payload = serializeGeometry(geometry)
  geometry.dispose?.()
  return payload
}

const handleMessage = (event) => {
  const { id, image, options } = event.data || {}
  try {
    const payload = buildGeometryPayload(image, options)
    const transfers = [
      payload.positions?.buffer,
      payload.uvs?.buffer,
      payload.normals?.buffer,
    ].filter((buffer) => buffer instanceof ArrayBuffer)
    self.postMessage(
      {
        id,
        success: true,
        payload: {
          positions: payload.positions || new Float32Array(),
          uvs: payload.uvs || new Float32Array(),
          normals: payload.normals || new Float32Array(),
          groups: payload.groups,
          boundingBox: payload.boundingBox,
        },
      },
      transfers,
    )
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      message: error?.message || String(error),
    })
  }
}

self.addEventListener('message', handleMessage)
