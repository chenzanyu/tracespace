<template>
  <div ref="mountEl" class="w-full h-full"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Application, Container, Sprite, Texture } from 'pixi.js'

const props = defineProps({
  svg: { type: String, required: true },
  scale: { type: Number, required: true },
  translate: { type: Object, required: true },
})

const mountEl = ref(null)
let app = null
let viewContainer = null
let sprite = null
let currentObjectUrl = null
let ro = null
let bakedScale = 1 // last scale baked into texture resolution

const PX_PER_MM = 96 / 25.4

function parseSvgMetrics(svg) {
  const tagMatch = svg.match(/<svg\b[^>]*>/i)
  const tag = tagMatch ? tagMatch[0] : ''
  const getAttr = (name) => {
    const m = tag.match(new RegExp(name + '="([^"]*)"', 'i'))
    return m ? m[1] : null
  }
  const wAttr = getAttr('width')
  const hAttr = getAttr('height')
  const vbAttr = getAttr('viewBox')
  const parseLen = (v) => {
    if (!v) return null
    const s = String(v).trim()
    if (s.endsWith('mm')) return parseFloat(s) * PX_PER_MM
    if (s.endsWith('px')) return parseFloat(s)
    const n = parseFloat(s)
    return isFinite(n) ? n : null
  }
  const widthPx = parseLen(wAttr)
  const heightPx = parseLen(hAttr)
  let vb = null
  if (vbAttr) {
    const nums = vbAttr.split(/\s+/).map((x) => parseFloat(x)).filter((x) => !isNaN(x))
    if (nums.length >= 4) vb = { x: nums[0], y: nums[1], w: nums[2], h: nums[3] }
  }
  return { widthPx, heightPx, vb }
}

function rewriteSvgSize(svg, newW, newH) {
  let updated = svg
  updated = updated.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    let a = attrs
    if (/\bwidth=\"/i.test(a)) a = a.replace(/\bwidth=\"[^\"]*\"/i, `width="${Math.round(newW)}px"`)
    else a = a + ` width="${Math.round(newW)}px"`
    if (/\bheight=\"/i.test(a)) a = a.replace(/\bheight=\"[^\"]*\"/i, `height="${Math.round(newH)}px"`)
    else a = a + ` height="${Math.round(newH)}px"`
    return `<svg${a}>`
  })
  return updated
}

async function ensureApp() {
  if (app) return
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
  app = new Application()
  await app.init({
    antialias: true,
    backgroundAlpha: 0,
    powerPreference: 'high-performance',
    resolution: dpr,
    autoDensity: true,
    // We'll manage resize with ResizeObserver for reliability
    resizeTo: undefined,
  })
  const host = mountEl.value
  host.style.position = host.style.position || 'relative'
  app.canvas.style.position = 'absolute'
  app.canvas.style.inset = '0'
  app.canvas.style.width = '100%'
  app.canvas.style.height = '100%'
  host.appendChild(app.canvas)

  // Ensure canvas matches container size precisely
  const doResize = () => {
    const rect = host.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    app.renderer.resize(w, h)
  }
  doResize()
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => doResize())
    ro.observe(host)
  } else {
    window.addEventListener('resize', doResize)
  }
  viewContainer = new Container()
  app.stage.addChild(viewContainer)
  sprite = new Sprite(Texture.WHITE)
  sprite.anchor.set(0, 0)
  sprite.position.set(0, 0)
  viewContainer.addChild(sprite)
}

async function svgToTexture(svgString) {
  // Revoke previous URL to avoid leaks
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
  // Compute a raster size proportional to current zoom & DPR to keep sharpness
  const metrics = parseSvgMetrics(svgString)
  const baseW = metrics.widthPx || (metrics.vb?.w ?? 0)
  const baseH = metrics.heightPx || (metrics.vb?.h ?? 0)
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
  const quality = 1.25 // small oversampling to stay crisp
  const desiredW = Math.max(1, Math.floor((baseW || 1024) * Math.max(1, props.scale || 1) * dpr * quality))
  const desiredH = Math.max(1, Math.floor((baseH || 1024) * Math.max(1, props.scale || 1) * dpr * quality))
  const maxDim = 8192
  const scaleClamp = Math.min(1, maxDim / Math.max(desiredW, desiredH))
  const targetW = Math.max(1, Math.floor(desiredW * scaleClamp))
  const targetH = Math.max(1, Math.floor(desiredH * scaleClamp))
  const hiResSvg = rewriteSvgSize(svgString, targetW, targetH)
  bakedScale = Math.max(1, props.scale || 1)

  const blob = new Blob([hiResSvg], { type: 'image/svg+xml' })
  currentObjectUrl = URL.createObjectURL(blob)

  // Prefer createImageBitmap when available for async decode
  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(blob)
      return Texture.from(bitmap)
    }
  } catch (_) {
    // fallthrough to HTMLImageElement path
  }

  // Fallback: HTMLImageElement decoding
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = (e) => reject(e)
    image.decoding = 'async'
    image.src = currentObjectUrl
  })
  return Texture.from(img)
}

async function applySvg(svgString) {
  if (!app) await ensureApp()
  if (!svgString || svgString.length === 0) return
  try {
    const tex = await svgToTexture(svgString)
    if (sprite.texture) {
      const oldTex = sprite.texture
      sprite.texture = tex
      if (oldTex !== tex) oldTex.destroy(true)
    } else {
      sprite.texture = tex
    }
    // Reset sprite size; keep anchored at top-left
    sprite.position.set(0, 0)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to apply SVG texture', e)
  }
}

function applyTransform() {
  if (!viewContainer) return
  const s = typeof props.scale === 'number' && isFinite(props.scale) ? props.scale : 1
  viewContainer.scale.set(s)
  const tx = (props.translate && typeof props.translate.x === 'number') ? props.translate.x : 0
  const ty = (props.translate && typeof props.translate.y === 'number') ? props.translate.y : 0
  viewContainer.position.set(Math.round(tx), Math.round(ty))
}

onMounted(async () => {
  await ensureApp()
  applyTransform()
  if (props.svg) await applySvg(props.svg)
})

onBeforeUnmount(() => {
  try {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
  } catch {}
  if (ro) { try { ro.disconnect() } catch {} ro = null }
  if (app) {
    try { app.destroy(true, { children: true, texture: true, baseTexture: true }) } catch {}
    app = null
    viewContainer = null
    sprite = null
  }
})

watch(() => props.svg, (v) => { if (v) applySvg(v) })
let rebakeTimer = null
function scheduleRebake() {
  if (rebakeTimer) clearTimeout(rebakeTimer)
  rebakeTimer = setTimeout(() => { if (props.svg) applySvg(props.svg) }, 120)
}

watch(() => props.scale, (s) => {
  applyTransform()
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
  // When zooming in beyond previous baked resolution, regenerate sharper texture
  if ((s || 1) * dpr > (bakedScale || 1) * dpr * 1.1) scheduleRebake()
})
watch(() => [props.translate?.x, props.translate?.y], applyTransform)
</script>

<style scoped>
div { outline: none; }
</style>
