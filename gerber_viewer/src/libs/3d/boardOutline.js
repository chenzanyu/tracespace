import {IMAGE_REGION, LINE, ARC} from '@tracespace/plotter'

const REGION_TOLERANCE = 1e-6
const PRIMARY_FALLBACK_TYPES = new Set([
  'copper',
  'soldermask',
  'silkscreen',
  'solderpaste',
  'outline',
])

const toXY = (pos = []) => [Number(pos?.[0]) || 0, Number(pos?.[1]) || 0]

const positionsClose = (a, b, eps = REGION_TOLERANCE) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const approximateArcPoints = (segment) => {
  if (segment.type !== ARC) return []
  const startAngle = segment.start?.[2]
  const endAngle = segment.end?.[2]
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return []
  let sweep = endAngle - startAngle
  const startRaw = toXY(segment.start)
  const endRaw = toXY(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startRaw, endRaw)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []
  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const [cx, cy] = toXY(segment.center || [])
  const radius = Number(segment.radius) || 0
  const points = []
  for (let i = 1; i < steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points
}

const regionToPolygon = (region) => {
  if (!region || !Array.isArray(region.segments) || region.segments.length === 0) {
    return null
  }
  const rings = []
  let currentRing = []
  let cursor = null

  const finalizeRing = () => {
    if (currentRing.length >= 3) {
      if (!positionsClose(currentRing[0], currentRing[currentRing.length - 1])) {
        currentRing.push([...currentRing[0]])
      }
      rings.push(currentRing)
    }
    currentRing = []
  }

  for (const segment of region.segments) {
    const start = toXY(segment.start)
    const end = toXY(segment.end)
    if (!cursor || !positionsClose(cursor, start)) {
      if (currentRing.length > 0) finalizeRing()
      currentRing = [start]
    }
    if (segment.type === LINE) {
      currentRing.push(end)
    } else if (segment.type === ARC) {
      approximateArcPoints(segment).forEach((pt) => currentRing.push(pt))
      currentRing.push(end)
    } else {
      currentRing.push(end)
    }
    cursor = end
  }
  finalizeRing()
  return rings.length ? rings : null
}

const sanitizeMultiPolygon = (value) => {
  if (!Array.isArray(value) || value.length === 0) return null
  const sanitized = value
    .map((polygon) => {
      if (!Array.isArray(polygon) || polygon.length === 0) return null
      const rings = polygon
        .map((ring) => {
          if (!Array.isArray(ring) || ring.length < 3) return null
          const normalized = ring.map((point) => toXY(point))
          if (!positionsClose(normalized[0], normalized[normalized.length - 1])) {
            normalized.push([...normalized[0]])
          }
          return normalized.length >= 4 ? normalized : null
        })
        .filter(Boolean)
      return rings.length ? rings : null
    })
    .filter(Boolean)
  return sanitized.length ? sanitized : null
}

const extendBounds = (bounds, candidate) => {
  if (!Array.isArray(candidate) || candidate.length < 4) return bounds
  const [minX, minY, maxX, maxY] = candidate
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return bounds
  }
  if (!bounds) {
    return [minX, minY, maxX, maxY]
  }
  return [
    Math.min(bounds[0], minX),
    Math.min(bounds[1], minY),
    Math.max(bounds[2], maxX),
    Math.max(bounds[3], maxY),
  ]
}

const boundsFromPoint = (point) => {
  const [x, y] = toXY(point)
  return [x, y, x, y]
}

const extendBoundsWithSegment = (bounds, segment) => {
  if (!segment) return bounds
  let next = extendBounds(bounds, boundsFromPoint(segment.start))
  next = extendBounds(next, boundsFromPoint(segment.end))
  if (segment.type === ARC) {
    const samples = approximateArcPoints(segment)
    samples.forEach((pt) => {
      next = extendBounds(next, boundsFromPoint(pt))
    })
  }
  return next
}

const describeBounds = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const [minX, minY, maxX, maxY] = bounds
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

const createRegionFromBounds = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const [minX, minY, maxX, maxY] = bounds
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX || minY === maxY) {
    return null
  }
  return {
    type: IMAGE_REGION,
    segments: [
      {type: LINE, start: [minX, minY], end: [maxX, minY]},
      {type: LINE, start: [maxX, minY], end: [maxX, maxY]},
      {type: LINE, start: [maxX, maxY], end: [minX, maxY]},
      {type: LINE, start: [minX, maxY], end: [minX, minY]},
    ],
  }
}

const polygonFromBounds = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const [minX, minY, maxX, maxY] = bounds
  return [
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ],
  ]
}

const collectLayerBounds = (layers, plotTreesById, filterFn) => {
  let merged = null
  let layerCount = 0
  for (const layer of layers || []) {
    if (typeof filterFn === 'function' && !filterFn(layer)) continue
    const size = plotTreesById?.[layer.id]?.size
    if (!Array.isArray(size)) continue
    merged = extendBounds(merged, size)
    layerCount += 1
  }
  return {bounds: merged, layerCount}
}

const describePolygonSet = (polygons) => {
  if (!Array.isArray(polygons)) return []
  const ringArea = (ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return 0
    let area = 0
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[i + 1]
      area += x1 * y2 - x2 * y1
    }
    return area / 2
  }
  return polygons.map((polygon, index) => {
    const outer = polygon?.[0]
    const holes = polygon?.length ? polygon.slice(1) : []
    return {
      index,
      outerArea: outer ? Math.abs(ringArea(outer)) : 0,
      holeCount: holes.length,
      holeAreas: holes.map((ring) => Math.abs(ringArea(ring))),
    }
  })
}

const buildFallbackFromBounds = (bounds, source) => {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const region = createRegionFromBounds(bounds)
  const polygon = polygonFromBounds(bounds)
  return {
    bounds,
    regionList: region ? [region] : [],
    polygons: polygon ? [polygon] : null,
    source,
  }
}

const multiPolygonArea = (polygons) => {
  if (!Array.isArray(polygons) || polygons.length === 0) return 0
  const areaForRing = (ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return 0
    let area = 0
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[i + 1]
      area += x1 * y2 - x2 * y1
    }
    return area / 2
  }
  let total = 0
  polygons.forEach((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) return
    polygon.forEach((ring, index) => {
      const ringArea = Math.abs(areaForRing(ring))
      if (ringArea === 0) return
      total += index === 0 ? ringArea : -ringArea
    })
  })
  return Math.abs(total)
}

export const resolveBoardOutlineDescriptor = (plotResult) => {
  const boardShape = plotResult?.boardShape ?? null
  const layers = plotResult?.layers ?? []
  const plotTreesById = plotResult?.plotTreesById ?? {}
  const boardShapePolygons = sanitizeMultiPolygon(boardShape?.polygons)
  const hasSourcePolygons = Array.isArray(boardShapePolygons) && boardShapePolygons.length > 0
  const descriptor = {
    polygons: boardShapePolygons,
    regions: Array.isArray(boardShape?.regions) ? [...boardShape.regions] : [],
    bounds: extendBounds(null, boardShape?.size),
    failureReason: boardShape?.failureReason ?? null,
    fallbackSource: null,
    debug: {
      generatedAt: new Date().toISOString(),
      boardShapeRegionCount: boardShape?.regions?.length ?? 0,
      boardShapePolygonCount: Array.isArray(boardShape?.polygons) ? boardShape.polygons.length : 0,
      failureReason: boardShape?.failureReason ?? null,
      boundingBoxes: {},
      warnings: [],
      polygonStats: [],
      regionSummaries: [],
      openPathSummaries: [],
      coverage: null,
    },
  }

  if ((!descriptor.polygons || !descriptor.polygons.length) && descriptor.regions.length) {
    const regionPolygons = descriptor.regions
      .map((region) => regionToPolygon(region))
      .filter(Boolean)
    descriptor.polygons = sanitizeMultiPolygon(regionPolygons)
  }

  const primaryBounds = collectLayerBounds(layers, plotTreesById, (layer) =>
    PRIMARY_FALLBACK_TYPES.has(layer?.type ?? '')
  )
  const nonDrillBounds = collectLayerBounds(
    layers,
    plotTreesById,
    (layer) => layer?.type !== 'drill'
  )
  const anyLayerBounds = collectLayerBounds(layers, plotTreesById, () => true)

  const primarySummary = describeBounds(primaryBounds.bounds) ?? {}
  const nonDrillSummary = describeBounds(nonDrillBounds.bounds) ?? {}
  const anyLayerSummary = describeBounds(anyLayerBounds.bounds) ?? {}
  descriptor.debug.boundingBoxes.primary = {
    ...primarySummary,
    layerCount: primaryBounds.layerCount,
  }
  descriptor.debug.boundingBoxes.nonDrill = {
    ...nonDrillSummary,
    layerCount: nonDrillBounds.layerCount,
  }
  descriptor.debug.boundingBoxes.allLayers = {
    ...anyLayerSummary,
    layerCount: anyLayerBounds.layerCount,
  }

  const boundsArea = (bounds) => {
    if (!Array.isArray(bounds) || bounds.length < 4) return null
    const width = Math.abs(bounds[2] - bounds[0])
    const height = Math.abs(bounds[3] - bounds[1])
    const area = width * height
    return Number.isFinite(area) ? area : null
  }

  const applyFallbackFromBounds = (bounds, source, reasonMessage) => {
    const fallback = buildFallbackFromBounds(bounds, source)
    if (!fallback) return false
    descriptor.polygons = fallback.polygons
    descriptor.regions = fallback.regionList
    descriptor.bounds = fallback.bounds
    descriptor.fallbackSource = source
    if (reasonMessage) descriptor.debug.warnings.push(reasonMessage)
    return true
  }

  if ((!descriptor.polygons || descriptor.polygons.length === 0) && primaryBounds.bounds) {
    applyFallbackFromBounds(
      primaryBounds.bounds,
      'primary-layer-bounds',
      'Board outline fallback applied from copper/mask/silk/outline bounds'
    )
  }

  if ((!descriptor.polygons || descriptor.polygons.length === 0) && nonDrillBounds.bounds) {
    applyFallbackFromBounds(
      nonDrillBounds.bounds,
      'non-drill-bounds',
      'Fallback derived from non-drill layer bounds'
    )
  }

  if ((!descriptor.polygons || descriptor.polygons.length === 0) && anyLayerBounds.bounds) {
    applyFallbackFromBounds(
      anyLayerBounds.bounds,
      'all-layer-bounds',
      'Fallback derived from overall layer bounds'
    )
  }

  if (!descriptor.bounds && descriptor.regions.length) {
    descriptor.bounds = descriptor.regions.reduce((acc, region) => {
      const polygon = regionToPolygon(region)
      if (!polygon || !polygon[0]) return acc
      const xs = polygon[0].map(([x]) => x)
      const ys = polygon[0].map(([, y]) => y)
      return extendBounds(acc, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
    }, null)
  }

  descriptor.debug.regionSummaries = descriptor.regions.map((region, index) => ({
    index,
    segmentCount: region?.segments?.length ?? 0,
    bounds: describeBounds(
      (region?.segments || []).reduce((acc, segment) => extendBoundsWithSegment(acc, segment), null)
    ),
  }))

  const openPaths = Array.isArray(boardShape?.openPaths) ? boardShape.openPaths : []
  descriptor.debug.openPathSummaries = openPaths.map((path, index) => ({
    index,
    segmentCount: path?.segments?.length ?? 0,
    width: path?.width ?? null,
    bounds: describeBounds(
      (path?.segments || []).reduce((acc, segment) => extendBoundsWithSegment(acc, segment), null)
    ),
  }))

  const descriptorBoundsArea = boundsArea(descriptor.bounds)
  const primaryBoundsArea = boundsArea(primaryBounds.bounds)
  const boundsAreaRatio =
    descriptorBoundsArea && primaryBoundsArea && primaryBoundsArea > 0
      ? descriptorBoundsArea / primaryBoundsArea
      : null
  if (
    !descriptor.fallbackSource &&
    !hasSourcePolygons &&
    boundsAreaRatio !== null &&
    primaryBounds.bounds &&
    boundsAreaRatio < 0.65
  ) {
    const applied = applyFallbackFromBounds(
      primaryBounds.bounds,
      'primary-bounds-coverage',
      `Board outline bounds area (${descriptorBoundsArea?.toFixed(4) ?? 'n/a'}) is only ${
        (boundsAreaRatio * 100).toFixed(2)
      }% of copper/mask bounding box; replaced with bounding-box outline.`
    )
    if (applied) {
      descriptor.debug.boundsAreaFallback = {
        ratio: boundsAreaRatio,
        descriptorBoundsArea,
        primaryBoundsArea,
      }
    }
  }

  const polygonArea = multiPolygonArea(descriptor.polygons)
  const coverageRatio =
    descriptorBoundsArea && descriptorBoundsArea > 0
      ? Number((polygonArea / descriptorBoundsArea).toFixed(6))
      : null
  descriptor.debug.coverage = {
    polygonArea,
    boundsArea: descriptorBoundsArea,
    primaryBoundsArea,
    boundsAreaRatio,
    coverageRatio,
    regionCount: descriptor.regions.length,
    openPathCount: descriptor.debug.openPathSummaries.length,
  }

  descriptor.debug.polygonStats = describePolygonSet(descriptor.polygons)

  return descriptor
}

export const buildBoardOutlineDebugPayload = (descriptor, plotResult, extra = {}) => {
  const boundsSummary = describeBounds(descriptor.bounds)
  return {
    generatedAt: descriptor.debug.generatedAt,
    fallbackSource: descriptor.fallbackSource,
    failureReason: descriptor.failureReason,
    polygonCount: descriptor.polygons?.length ?? 0,
    polygons: descriptor.debug.polygonStats,
    warnings: descriptor.debug.warnings,
    bounds: boundsSummary,
    boundingBoxes: descriptor.debug.boundingBoxes,
    coverage: descriptor.debug.coverage,
    regionsCount: descriptor.regions.length,
    regionSummaries: descriptor.debug.regionSummaries,
    openPaths: descriptor.debug.openPathSummaries,
    layers: (plotResult?.layers || []).map((layer) => ({
      id: layer.id,
      type: layer.type,
      side: layer.side,
      filename: layer.filename,
    })),
    extra,
  }
}
