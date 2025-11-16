const trimSourceSummary = (source, length = 160) => {
  const raw = (source || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw.length > length ? `${raw.slice(0, length)}…` : raw
}

const parseLengthToPx = (value, fallback) => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().toLowerCase()
  const match = trimmed.match(/^([+-]?[0-9]*\.?[0-9]+)\s*(px|mm|cm|in)?$/)
  if (!match) return fallback
  const num = parseFloat(match[1])
  const unit = match[2] || 'px'
  if (!Number.isFinite(num)) return fallback
  switch (unit) {
    case 'mm': return num * (96 / 25.4)
    case 'cm': return num * (96 / 2.54)
    case 'in': return num * 96
    default: return num
  }
}

const normalizeSvgMarkup = (svgContent, targetRes = 1024) => {
  const trimmed = (svgContent || '').trim()
  if (!trimmed) throw new Error('Empty SVG content')
  const parserAvailable = typeof DOMParser !== 'undefined'
  const serializerAvailable = typeof XMLSerializer !== 'undefined'
  if (parserAvailable && serializerAvailable) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(trimmed, 'image/svg+xml')
      const svg = doc.documentElement
      if (svg && svg.nodeName?.toLowerCase?.() === 'svg') {
        if (!svg.getAttribute('xmlns')) {
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        }
        const fallbackSize = Math.max(1, targetRes || 1024)
        const vbAttr = svg.getAttribute('viewBox')
        let vbWidth = null
        let vbHeight = null
        let vbMinX = null
        let vbMinY = null
        if (vbAttr) {
          const parts = vbAttr.split(/[,\s]+/).map((part) => parseFloat(part))
          if (parts.length >= 4) {
            vbMinX = Number.isFinite(parts[0]) ? parts[0] : null
            vbMinY = Number.isFinite(parts[1]) ? parts[1] : null
            vbWidth = Number.isFinite(parts[2]) ? parts[2] : null
            vbHeight = Number.isFinite(parts[3]) ? parts[3] : null
          }
        }
        const widthAttr = svg.getAttribute('width')
        const heightAttr = svg.getAttribute('height')
        const parsedWidth = parseLengthToPx(widthAttr, vbWidth || fallbackSize)
        const parsedHeight = parseLengthToPx(heightAttr, vbHeight || fallbackSize)
        svg.setAttribute('width', `${Math.max(1, parsedWidth || fallbackSize)}px`)
        svg.setAttribute('height', `${Math.max(1, parsedHeight || fallbackSize)}px`)
        const finalVbWidth = vbWidth || parsedWidth || fallbackSize
        const finalVbHeight = vbHeight || parsedHeight || fallbackSize
        const finalMinX = vbMinX ?? 0
        const finalMinY = vbMinY ?? 0
        if (finalMinX < 0 || finalMinY < 0) {
          // 将负的 viewBox 原点平移到 (0,0)，以避免 worker 解析失败
          const translateX = Math.abs(finalMinX < 0 ? finalMinX : 0)
          const translateY = Math.abs(finalMinY < 0 ? finalMinY : 0)
          const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
          wrapper.setAttribute('transform', `translate(${translateX}, ${translateY})`)
          while (svg.firstChild) {
            wrapper.appendChild(svg.firstChild)
          }
          svg.appendChild(wrapper)
          svg.setAttribute('viewBox', `0 0 ${finalVbWidth + translateX} ${finalVbHeight + translateY}`)
        } else if (!svg.getAttribute('viewBox')) {
          svg.setAttribute('viewBox', `0 0 ${finalVbWidth} ${finalVbHeight}`)
        }
        const serializer = new XMLSerializer()
        return serializer.serializeToString(doc)
      }
    } catch (error) {
      console.warn('[svgRaster.worker] normalizeSvgMarkup failed, using raw SVG', error)
    }
  }
  const hasXmlDecl = trimmed.startsWith('<?xml')
  const ensuredXml = hasXmlDecl ? trimmed : `<?xml version="1.0" encoding="UTF-8"?>\n${trimmed}`
  const hasXmlns = ensuredXml.includes('xmlns=')
  return hasXmlns
    ? ensuredXml
    : ensuredXml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
}

const svgToBlob = (svgContent, targetRes) => {
  const normalized = normalizeSvgMarkup(svgContent, targetRes)
  const encoder = new TextEncoder()
  const bytes = encoder.encode(normalized)
  return new Blob([bytes], { type: 'image/svg+xml;charset=utf-8' })
}

const drawSvg = async ({ svgContent, targetRes, borderColor, role }) => {
  const summary = trimSourceSummary(svgContent)
  const blob = svgToBlob(svgContent, targetRes)
  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch (error) {
    const enhanced = new Error(`[svgRaster.worker] createImageBitmap failed (${role}): ${error?.message || error}`)
    enhanced.sourcePreview = summary
    enhanced.sourceFull = svgContent
    enhanced.originalError = error
    throw enhanced
  }
  const longerSide = Math.max(bitmap.width, bitmap.height)
  const size = Math.max(targetRes || 1024, longerSide)
  let canvasWidth
  let canvasHeight
  if (bitmap.width >= bitmap.height) {
    canvasWidth = size
    canvasHeight = Math.max(1, Math.round((bitmap.height / bitmap.width) * size))
  } else {
    canvasHeight = size
    canvasWidth = Math.max(1, Math.round((bitmap.width / bitmap.height) * size))
  }
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')
  const scaleX = canvasWidth / bitmap.width
  const scaleY = canvasHeight / bitmap.height
  ctx.imageSmoothingEnabled = false
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0)
  ctx.drawImage(bitmap, 0, 0)
  if (role === 'top') {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = borderColor
    ctx.fillRect(0, canvas.height - 1, 1, 1)
    ctx.restore()
  }
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight)
  const rendered = canvas.transferToImageBitmap()
  return {
    role,
    bitmap: rendered,
    width: canvasWidth,
    height: canvasHeight,
    data: imageData.data.buffer,
  }
}

self.onmessage = async (event) => {
  const { id, payload } = event.data || {}
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas not supported')
    }
    const results = []
    for (const item of payload) {
      const rendered = await drawSvg(item)
      results.push(rendered)
    }
    self.postMessage(
      { id, success: true, results },
      results.flatMap((r) => [r.bitmap, r.data].filter(Boolean)),
    )
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      message: error?.message || String(error),
      preview: error?.sourcePreview || null,
      full: error?.sourceFull || null,
    })
  }
}
