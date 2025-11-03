import {read, plot} from '../packages/core/dist/tracespace-core.js'
import {BoundingBox} from '../packages/plotter/dist/tracespace-plotter.js'

const file = process.argv[2] ?? 'gerber_viewer/test_file/Joystick Micro PWM V2.GTL'
const readResult = await read([file])
const plotResult = plot(readResult)

const firstLayer = plotResult.layers[0]
const tree = plotResult.plotTreesById[firstLayer.id]

console.log(`Loaded ${file}`)
console.log(`Units: ${tree.units}`)
console.log(`Graphics: ${tree.children.length}`)

const polarityCounts = {dark: 0, clear: 0}
const typeCounts = new Map()
const clearSummaries = []

const continuityStats = {
  checked: 0,
  discontinuities: 0,
  maxGap: 0,
}

for (const [index, graphic] of tree.children.entries()) {
  const polarity = graphic.polarity ?? 'dark'
  polarityCounts[polarity] = (polarityCounts[polarity] ?? 0) + 1

  typeCounts.set(graphic.type, (typeCounts.get(graphic.type) ?? 0) + 1)

  if (polarity === 'clear') {
    const [minX, minY, maxX, maxY] = BoundingBox.fromGraphic(graphic)
    clearSummaries.push({
      index,
      type: graphic.type,
      minX,
      minY,
      maxX,
      maxY,
    })
  }

  if (graphic.type === 'imageRegion') {
    const segments = graphic.segments
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1]
      const next = segments[i]

      const prevEnd =
        prev.type === 'arc' ? prev.end.slice(0, 2) : prev.end.slice(0, 2)
      const nextStart =
        next.type === 'arc' ? next.start.slice(0, 2) : next.start.slice(0, 2)

      const dx = Math.abs(prevEnd[0] - nextStart[0])
      const dy = Math.abs(prevEnd[1] - nextStart[1])
      const gap = Math.max(dx, dy)

      continuityStats.checked += 1
      if (gap > 1e-6) {
        continuityStats.discontinuities += 1
        if (gap > continuityStats.maxGap) continuityStats.maxGap = gap
      }
    }
  }
}

console.log('Polarity counts:', polarityCounts)
console.log(
  'Type counts:',
  Array.from(typeCounts.entries())
    .map(([type, count]) => `${type}=${count}`)
    .join(', ')
)

console.log(
  `Continuity checks: ${continuityStats.checked}, ` +
    `discontinuities: ${continuityStats.discontinuities}, ` +
    `max gap: ${continuityStats.maxGap.toFixed(6)}`
)

console.log('First 5 clear graphics (index, bbox):')
for (const info of clearSummaries.slice(0, 5)) {
  console.log(
    `  #${info.index} ${info.type} ` +
      `[${info.minX}, ${info.minY}] -> [${info.maxX}, ${info.maxY}]`
  )
}
