<template>
  <div ref="mountEl" class="w-full h-full"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'

const emit = defineEmits(['ready','resized'])

// Props
const props = defineProps({
  // Array of { id, type, visible, color, element, weight }
  layers: { type: Array, required: true },
  // [x,y,w,h] in board units (renderer units)
  viewBox: { type: Array, required: true },
  // Physical size of viewBox in mm for unit conversion
  mmWidth: { type: Number, required: true },
  mmHeight: { type: Number, required: true },
  // zoom + pan managed by parent, pixels
  scale: { type: Number, required: true },
  translate: { type: Object, required: true },
})

const mountEl = ref(null)
let canvas = null
let ctx = null
let ro = null
// Reusable offscreen pool for masking composition
const offscreens = []
let drawPending = false
let rafId = 0

function scheduleDraw() {
  if (drawPending) return
  drawPending = true
  rafId = requestAnimationFrame(() => { drawPending = false; draw() })
}

const DPR = () => Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
const PX_PER_MM = 96 / 25.4
const pxPerUnit = computed(() => {
  // Convert renderer units to pixels via mm
  const vbW = Array.isArray(props.viewBox) ? Number(props.viewBox[2]) : 0
  const mmW = Number(props.mmWidth) || 0
  if (!vbW || !mmW) return PX_PER_MM // fallback assume 1 unit == 1 mm
  const mmPerUnit = mmW / vbW
  return mmPerUnit * PX_PER_MM
})

// Compile cache per layer
// masks: collected mask geometries (black subtract)
// ops: fallback op tree
// flat: fast path data (single fill path + stroke groups)
const compiled = new Map()

function ensureCanvas() {
  if (canvas) return
  const el = document.createElement('canvas')
  el.style.position = 'absolute'
  el.style.inset = '0'
  el.style.width = '100%'
  el.style.height = '100%'
  mountEl.value.style.position = 'relative'
  mountEl.value.appendChild(el)
  canvas = el
  ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
  const resize = () => {
    const dpr = DPR()
    const r = mountEl.value.getBoundingClientRect()
    canvas.width = Math.max(1, Math.floor(r.width * dpr))
    canvas.height = Math.max(1, Math.floor(r.height * dpr))
    // resize offscreen buffers
    for (const o of offscreens) { o.canvas.width = canvas.width; o.canvas.height = canvas.height }
    // Keep CSS size 100% so it fills container
    scheduleDraw()
    emit('resized')
  }
  resize()
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(resize)
    ro.observe(mountEl.value)
  } else {
    window.addEventListener('resize', resize)
  }
}

function destroyCanvas() {
  if (ro) { try { ro.disconnect() } catch {} ro = null }
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
  canvas = null
  ctx = null
  offscreens.splice(0)
}

// --- AST to Path2D ---
function toNumber(v) { const n = parseFloat(v); return isFinite(n) ? n : 0 }

function rectPath(x, y, w, h, rx = 0, ry = 0) {
  const p = new Path2D()
  if (!rx && !ry) {
    p.rect(x, y, w, h)
    return p
  }
  const rrx = Math.max(0, rx), rry = Math.max(0, ry)
  const r = { tlx: rrx, tly: rry, trx: rrx, try: rry, brx: rrx, bry: rry, blx: rrx, bly: rry }
  p.moveTo(x + r.tlx, y)
  p.lineTo(x + w - r.trx, y)
  p.quadraticCurveTo(x + w, y, x + w, y + r.try)
  p.lineTo(x + w, y + h - r.bry)
  p.quadraticCurveTo(x + w, y + h, x + w - r.brx, y + h)
  p.lineTo(x + r.blx, y + h)
  p.quadraticCurveTo(x, y + h, x, y + h - r.bly)
  p.lineTo(x, y + r.tly)
  p.quadraticCurveTo(x, y, x + r.tlx, y)
  p.closePath()
  return p
}

function polygonPath(pointsStr) {
  const coords = String(pointsStr).trim().split(/[\s,]+/).map(toNumber)
  const p = new Path2D()
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i]
    const y = coords[i + 1]
    if (i === 0) p.moveTo(x, y)
    else p.lineTo(x, y)
  }
  p.closePath()
  return p
}

function collectShapes(node, out) {
  if (!node || node.type !== 'element') return
  const t = node.tagName
  const props = node.properties || {}
  if (t === 'path' && typeof props.d === 'string') {
    const d = String(props.d)
    const isStrokeOnly = (props.fill === 'none') && (props.strokeWidth || props['stroke-width'])
    if (isStrokeOnly) {
      const w = toNumber(props.strokeWidth ?? props['stroke-width'])
      out.strokes.push({ path: new Path2D(d), width: w })
    } else {
      out.fills.push(new Path2D(d))
    }
    return
  }
  if (t === 'rect') {
    const x = toNumber(props.x), y = toNumber(props.y)
    const w = toNumber(props.width), h = toNumber(props.height)
    const rx = toNumber(props.rx ?? 0), ry = toNumber(props.ry ?? 0)
    out.fills.push(rectPath(x, y, w, h, rx, ry))
    return
  }
  if (t === 'circle') {
    const cx = toNumber(props.cx), cy = toNumber(props.cy), r = toNumber(props.r)
    const p = new Path2D(); p.arc(cx, cy, r, 0, Math.PI * 2)
    out.fills.push(p)
    return
  }
  if (t === 'polygon' && props.points) { out.fills.push(polygonPath(props.points)); return }
  const children = Array.isArray(node.children) ? node.children : []
  for (const c of children) collectShapes(c, out)
}

function collectMasks(node, masks) {
  if (!node || node.type !== 'element') return
  const t = node.tagName
  if (t === 'mask') {
    const id = node.properties?.id
    if (typeof id === 'string') {
      const acc = { fills: [], strokes: [] }
      const stack = [{ n: node, black: false }]
      while (stack.length) {
        const { n, black } = stack.pop()
        if (!n || n.type !== 'element') continue
        const tag = n.tagName
        const props = n.properties || {}
        if (tag === 'rect') {
          // white cover rect is ignored; if black rect appears under black=true, treat as cutout
          const fill = (props.fill || props.style || '').toString()
          const isWhite = /#fff|white/i.test(fill)
          if (black && !isWhite) {
            const x = toNumber(props.x), y = toNumber(props.y)
            const w = toNumber(props.width), h = toNumber(props.height)
            acc.fills.push(rectPath(x, y, w, h, toNumber(props.rx ?? 0), toNumber(props.ry ?? 0)))
          }
          continue
        }
        if (tag === 'g') {
          const style = (props.style || '').toString()
          const color = (props.color || '').toString()
          const nextBlack = black || /#000/i.test(color) || /color:\s*#000/i.test(style)
          const children = Array.isArray(n.children) ? n.children : []
          for (const c of children) stack.push({ n: c, black: nextBlack })
          continue
        }
        if (black) {
          // compile shapes inside black groups
          collectShapes(n, acc)
        } else {
          const children = Array.isArray(n.children) ? n.children : []
          for (const c of children) stack.push({ n: c, black })
        }
      }
      masks[id] = acc
    }
    return
  }
  const children = Array.isArray(node.children) ? node.children : []
  for (const c of children) collectMasks(c, masks)
}

// Collect <clipPath> definitions into a map of id -> Path2D
function collectClips(node, clips) {
  if (!node || node.type !== 'element') return
  const t = node.tagName
  if (t === 'clipPath') {
    const id = node.properties?.id
    if (typeof id === 'string') {
      // aggregate all child shapes into a single path
      const acc = { fills: [], strokes: [] }
      collectShapes(node, acc)
      const clipPath = new Path2D()
      for (const p of acc.fills) clipPath.addPath(p)
      // strokes are uncommon for clips; if present, approximate by stroking path itself
      for (const s of acc.strokes) clipPath.addPath(s.path)
      clips[id] = clipPath
    }
    return
  }
  const children = Array.isArray(node.children) ? node.children : []
  for (const c of children) collectClips(c, clips)
}

function compileOps(node, masks) {
  const ops = []
  if (!node || node.type !== 'element') return ops
  const t = node.tagName
  if (t === 'defs' || t === 'clipPath') return ops
  const props = node.properties || {}
  if (typeof props.mask === 'string') {
    const idMatch = String(props.mask).match(/url\(#([^\)]+)\)/)
    const maskId = idMatch ? idMatch[1] : null
    const children = Array.isArray(node.children) ? node.children : []
    let childOps = []
    for (const c of children) childOps.push(...compileOps(c, masks))
    ops.push({ type: 'group', maskId, ops: childOps })
    return ops
  }
  // Propagate clip-path by wrapping into a group with clipId
  if (typeof props['clip-path'] === 'string') {
    const idMatch = String(props['clip-path']).match(/url\(#([^\)]+)\)/)
    const clipId = idMatch ? idMatch[1] : null
    let childOps = []
    if (t === 'path' || t === 'rect' || t === 'circle' || (t === 'polygon' && (props.points))) {
      const agg = { fills: [], strokes: [] }
      collectShapes(node, agg)
      if (agg.fills.length || agg.strokes.length) childOps.push({ type: 'draw', ...agg })
    } else {
      const children = Array.isArray(node.children) ? node.children : []
      for (const c of children) childOps.push(...compileOps(c, masks))
    }
    ops.push({ type: 'group', clipId, ops: childOps })
    return ops
  }
  // aggregate simple shapes into a single draw op
  const agg = { fills: [], strokes: [] }
  if (t === 'path' || t === 'rect' || t === 'circle' || (t === 'polygon' && (props.points))) {
    collectShapes(node, agg)
  } else {
    const children = Array.isArray(node.children) ? node.children : []
    for (const c of children) {
      const sub = compileOps(c, masks)
      ops.push(...sub)
    }
  }
  if (agg.fills.length || agg.strokes.length) ops.push({ type: 'draw', ...agg })
  return ops
}

function compileLayer(id, element) {
  const masks = {}
  collectMasks(element, masks)
  const clips = {}
  collectClips(element, clips)
  const ops = compileOps(element, masks)
  // Flatten ops into a single fill path and group strokes by width
  function flatten(list) {
    const fillPath = new Path2D()
    const strokeMap = new Map()
    const addStroke = (w, p) => {
      const key = Number(w.toFixed(4))
      let agg = strokeMap.get(key)
      if (!agg) { agg = new Path2D(); strokeMap.set(key, agg) }
      agg.addPath(p)
    }
    const walk = (ops) => {
      for (const op of ops || []) {
        if (!op) continue
        if (op.type === 'draw') {
          for (const f of (op.fills || [])) fillPath.addPath(f)
          for (const s of (op.strokes || [])) addStroke(s.width, s.path)
        } else if (op.type === 'group') {
          walk(op.ops || [])
          // IMPORTANT: do NOT merge mask/clip into fillPath here; compositing is required.
        }
      }
    }
    walk(list)
    const strokeGroups = Array.from(strokeMap, ([width, path]) => ({ width, path }))
    return { fillPath, strokeGroups }
  }
  const flat = flatten(ops)
  // Detect presence of any grouping that requires compositing (e.g., masks)
  const hasGroups = (function hasGroup(list) {
    for (const op of list || []) {
      if (!op) continue
      if (op.type === 'group') return true
      if (op.ops && hasGroup(op.ops)) return true
    }
    return false
  })(ops)
  compiled.set(id, { masks, clips, ops, flat, hasGroups })
}

function draw() {
  if (!ctx || !canvas) return
  const dpr = DPR()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false

  const [vx, vy] = props.viewBox
  // Apply pan in device pixels
  ctx.translate(Math.round(props.translate.x * dpr), Math.round(props.translate.y * dpr))
  // zoom then mm->px then shift viewBox origin
  ctx.scale(props.scale * dpr, props.scale * dpr)
  ctx.scale(pxPerUnit.value, pxPerUnit.value)
  ctx.translate(-vx, -vy)

  // draw order: descending weight so TOP is on top, drawing at bottom
  const layers = Array.isArray(props.layers) ? [...props.layers].sort((a,b)=>b.weight - a.weight) : []
  for (const layer of layers) {
    if (!layer || layer.visible === false) continue
    const cache = compiled.get(layer.id)
    if (!cache) continue
    const color = layer.color || '#fff'
    const baseDiv = Math.max(props.scale * dpr, 0.001)

    function drawAgg(targetCtx, agg) {
      targetCtx.save()
      targetCtx.fillStyle = color
      targetCtx.strokeStyle = color
      const minPx = 2
      for (const s of agg.strokes || []) {
        const wBoard = Math.max(s.width / baseDiv, minPx / (pxPerUnit.value * baseDiv))
        targetCtx.lineWidth = wBoard
        targetCtx.stroke(s.path)
      }
      for (const p of agg.fills || []) targetCtx.fill(p, 'evenodd')
      targetCtx.restore()
    }

    function applyMask(targetCtx, maskId) {
      const m = cache.masks[maskId]
      if (!m) return
      targetCtx.save()
      targetCtx.globalCompositeOperation = 'destination-out'
      // Black shapes subtract
      for (const p of m.fills) targetCtx.fill(p, 'evenodd')
      for (const s of m.strokes) {
        const wBoard = Math.max(s.width / baseDiv, 1.0 / (pxPerUnit.value * baseDiv))
        targetCtx.lineWidth = wBoard
        targetCtx.stroke(s.path)
      }
      targetCtx.restore()
    }

    function getOffscreen(depth) {
      if (!offscreens[depth]) {
        const c = document.createElement('canvas')
        c.width = canvas.width; c.height = canvas.height
        const cx = c.getContext('2d', { alpha: true })
        cx.imageSmoothingEnabled = false
        offscreens[depth] = { canvas: c, ctx: cx }
      }
      return offscreens[depth]
    }

    function clearCtx(targetCtx) {
      targetCtx.save(); targetCtx.setTransform(1,0,0,1,0,0); targetCtx.clearRect(0,0,canvas.width,canvas.height); targetCtx.restore()
    }

    function drawOpsList(targetCtx, ops, depth = 0) {
      for (const op of ops) {
        if (!op) continue
        if (op.type === 'draw') drawAgg(targetCtx, op)
        else if (op.type === 'group') {
          // Render group to pooled offscreen, then punch mask
          const off = getOffscreen(depth)
          const octx = off.ctx
          clearCtx(octx)
          // copy current transform to offscreen for correct coordinates
          try { octx.setTransform(ctx.getTransform()) } catch { octx.setTransform(1,0,0,1,0,0) }
          // If a clip is present, apply it on the offscreen before drawing children
          if (op.clipId && cache.clips && cache.clips[op.clipId]) {
            octx.save()
            try { octx.clip(cache.clips[op.clipId], 'evenodd') } catch {}
          }
          drawOpsList(octx, op.ops, depth + 1)
          if (op.maskId) applyMask(octx, op.maskId)
          if (op.clipId && cache.clips && cache.clips[op.clipId]) {
            // restore after clip to avoid leaking clip state
            try { octx.restore() } catch {}
          }
          // Blit the offscreen in device pixels: reset target transform
          targetCtx.save()
          try { targetCtx.setTransform(1,0,0,1,0,0) } catch {}
          targetCtx.drawImage(off.canvas, 0, 0)
          targetCtx.restore()
        }
      }
    }

    // Fast path only when there are no groups/masks that need compositing
    if (!cache.hasGroups && cache.flat && (cache.flat.fillPath || (cache.flat.strokeGroups && cache.flat.strokeGroups.length))) {
      ctx.save()
      ctx.fillStyle = color
      ctx.strokeStyle = color
      const minPx = 2
      for (const g of (cache.flat.strokeGroups || [])) {
        const wBoard = Math.max(g.width / baseDiv, minPx / (pxPerUnit.value * baseDiv))
        ctx.lineWidth = wBoard
        ctx.stroke(g.path)
      }
      if (cache.flat.fillPath) ctx.fill(cache.flat.fillPath, 'evenodd')
      ctx.restore()
    } else {
      drawOpsList(ctx, cache.ops, 0)
    }
    // Outline enhancement pass on final layer paint
    const isOutline = layer.type === 'outline'
    if (isOutline) {
      ctx.save()
      ctx.strokeStyle = color
      const minPxOutline = 2
      ctx.lineWidth = Math.max(minPxOutline / (pxPerUnit.value * baseDiv), 0.0001)
      // draw outline paths again as stroke over content
      if (cache.flat && cache.flat.fillPath) {
        ctx.stroke(cache.flat.fillPath)
      } else {
        for (const op of cache.ops) if (op.type === 'draw') for (const p of (op.fills || [])) ctx.stroke(p)
      }
      ctx.restore()
    }
  }
}

// Watchers
watch(() => props.layers, (arr) => {
  compiled.clear()
  for (const l of arr || []) if (l && l.element) compileLayer(l.id, l.element)
  scheduleDraw()
}, { deep: true })

watch(() => [props.scale, props.translate.x, props.translate.y, props.viewBox[0], props.viewBox[1], props.viewBox[2], props.viewBox[3]], scheduleDraw)

onMounted(() => {
  ensureCanvas()
  compiled.clear()
  for (const l of props.layers || []) if (l && l.element) compileLayer(l.id, l.element)
  scheduleDraw()
  // notify parent to refit after first paint
  emit('ready')
})

onBeforeUnmount(() => {
  compiled.clear()
  destroyCanvas()
})
</script>

<style scoped>
div { position: relative; width: 100%; height: 100%; }
</style>
