const drawSvg = async ({ svgContent, targetRes, borderColor, role }) => {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' })
  const bitmap = await createImageBitmap(blob)
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
  const rendered = canvas.transferToImageBitmap()
  return {
    role,
    bitmap: rendered,
    width: canvasWidth,
    height: canvasHeight,
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
      results.map((r) => r.bitmap),
    )
  } catch (error) {
    self.postMessage({ id, success: false, message: error?.message || String(error) })
  }
}
