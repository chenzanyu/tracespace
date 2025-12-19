import {Application, Container} from 'pixi.js'
import type {JSX} from 'preact/jsx-runtime'
import {useEffect, useMemo, useRef, useState} from 'preact/hooks'
import type {Geometry as GeoJsonGeometry} from 'geojson'
import type {ImageTree} from '@tracespace/plotter'

import {createGeoJsonDisplay, type GeoJsonDisplayOptions} from './geojson-display'
import {createLabelDisplay, type LabelDisplayOptions, type PixiLabel} from './label-display'
import {createLayerDisplay, parseHexColor, type PixiRenderContext} from './gerber-stack'

const PIXELS_PER_MM = 96 / 25.4

export type PixiLayerSource =
  | {kind: 'plotTree'; tree: ImageTree}
  | {kind: 'plotTrees'; trees: ImageTree[]}
  | {kind: 'geojson'; geometry: GeoJsonGeometry | null; display?: GeoJsonDisplayOptions}
  | {kind: 'labels'; labels: PixiLabel[]; display?: LabelDisplayOptions}

export interface PixiLayer {
  id: string
  label: string
  color: string
  opacity: number
  visible: boolean
  source: PixiLayerSource
}

export interface PixiLayerViewerProps {
  viewBox: [number, number, number, number] | null
  mmPerUnit: number
  layers: PixiLayer[]
  recenterSignal?: number
  focusPoint?: {x: number; y: number} | null
  focusSignal?: number
}

type ViewState = {
  scale: number
  translateX: number
  translateY: number
}

const clampNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function PixiLayerViewer({
  viewBox,
  mmPerUnit,
  layers,
  recenterSignal = 0,
  focusPoint = null,
  focusSignal = 0,
}: PixiLayerViewerProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const rootRef = useRef<Container | null>(null)
  const viewBoxRef = useRef<[number, number, number, number] | null>(null)
  const unitsToPxRef = useRef<number>(1)
  const ctxRef = useRef<PixiRenderContext | null>(null)
  const viewStateRef = useRef<ViewState>({scale: 1, translateX: 0, translateY: 0})
  const dragRef = useRef<{active: boolean; startX: number; startY: number; originX: number; originY: number}>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  })
  const rafRef = useRef<number | null>(null)
  const [ready, setReady] = useState(false)

  const unitsToPx = useMemo(() => {
    const safe = clampNumber(mmPerUnit, 1) || 1
    return safe * PIXELS_PER_MM
  }, [mmPerUnit])

  const ctx = useMemo<PixiRenderContext | null>(() => {
    if (!viewBox) return null
    return {viewBox, unitsToPx}
  }, [viewBox, unitsToPx])

  useEffect(() => {
    viewBoxRef.current = viewBox
    unitsToPxRef.current = unitsToPx
    ctxRef.current = ctx
  }, [viewBox, unitsToPx, ctx])

  const requestRender = () => {
    const app = appRef.current
    if (!app) return
    if (rafRef.current !== null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      try {
        app.render()
      } catch {
        // noop
      }
    })
  }

  const applyViewTransform = () => {
    const root = rootRef.current
    if (!root) return
    const {scale, translateX, translateY} = viewStateRef.current
    root.scale.set(scale)
    root.position.set(translateX, translateY)
    requestRender()
  }

  const fitToContainer = () => {
    const host = hostRef.current
    const app = appRef.current
    const root = rootRef.current
    const nextViewBox = viewBoxRef.current
    const nextUnitsToPx = unitsToPxRef.current
    if (!host || !app || !root || !nextViewBox) return

    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    if (app.renderer.width !== width || app.renderer.height !== height) {
      app.renderer.resize(width, height)
    }

    const contentW = Math.max(nextViewBox[2] * nextUnitsToPx, 1)
    const contentH = Math.max(nextViewBox[3] * nextUnitsToPx, 1)
    const pad = 0.92
    const scale = Math.min((width * pad) / contentW, (height * pad) / contentH)
    const translateX = (width - contentW * scale) / 2
    const translateY = (height - contentH * scale) / 2
    viewStateRef.current = {scale, translateX, translateY}
    applyViewTransform()
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    const app = new Application()
    let resizeObserver: ResizeObserver | null = null

    const init = async () => {
      try {
        await app.init({
          width: Math.max(host.clientWidth, 1),
          height: Math.max(host.clientHeight, 1),
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        })
        if (cancelled) return

        const canvasEl = app.canvas ?? app.view
        canvasEl.style.display = 'block'
        canvasEl.style.width = '100%'
        canvasEl.style.height = '100%'
        canvasEl.style.userSelect = 'none'
        canvasEl.style.touchAction = 'none'
        host.appendChild(canvasEl)

        app.ticker?.stop()
        app.stage.eventMode = 'none'

        const root = new Container()
        root.eventMode = 'none'
        root.sortableChildren = true
        app.stage.sortableChildren = true
        app.stage.addChild(root)

        appRef.current = app
        rootRef.current = root

        resizeObserver = new ResizeObserver(() => {
          if (!appRef.current) return
          fitToContainer()
        })
        resizeObserver.observe(host)

        setReady(true)
      } catch (error) {
        console.error('[pcb_analysis_playground] pixi init failed', error)
      }
    }

    void init()

    return () => {
      cancelled = true
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      resizeObserver?.disconnect()
      resizeObserver = null
      try {
        app.destroy(true)
      } catch {
        // noop
      }
      appRef.current = null
      rootRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    fitToContainer()
  }, [ready, viewBox, unitsToPx, recenterSignal])

  useEffect(() => {
    const host = hostRef.current
    const nextCtx = ctxRef.current
    if (!ready || !host || !nextCtx || !focusPoint) return

    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    const current = viewStateRef.current
    const scale = Number.isFinite(current.scale) && current.scale > 0 ? current.scale : 1

    const [vx, vy] = nextCtx.viewBox
    const ySvg = -focusPoint.y
    const worldX = (focusPoint.x - vx) * nextCtx.unitsToPx
    const worldY = (ySvg - vy) * nextCtx.unitsToPx

    viewStateRef.current = {
      scale,
      translateX: width / 2 - worldX * scale,
      translateY: height / 2 - worldY * scale,
    }
    applyViewTransform()
  }, [focusSignal, focusPoint, ready])

  useEffect(() => {
    const host = hostRef.current
    const root = rootRef.current
    if (!host || !root) return

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const rect = host.getBoundingClientRect()
      dragRef.current.active = true
      dragRef.current.startX = event.clientX - rect.left
      dragRef.current.startY = event.clientY - rect.top
      dragRef.current.originX = viewStateRef.current.translateX
      dragRef.current.originY = viewStateRef.current.translateY
      host.setPointerCapture(event.pointerId)
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current.active) return
      const rect = host.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const dx = x - dragRef.current.startX
      const dy = y - dragRef.current.startY
      viewStateRef.current.translateX = dragRef.current.originX + dx
      viewStateRef.current.translateY = dragRef.current.originY + dy
      applyViewTransform()
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      try {
        host.releasePointerCapture(event.pointerId)
      } catch {
        // noop
      }
    }

    const handleWheel = (event: WheelEvent) => {
      if (!ctxRef.current) return
      const rect = host.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const current = viewStateRef.current
      const scale = current.scale || 1

      const delta = Number(event.deltaY) || 0
      const zoom = Math.pow(1.0015, -delta)
      const nextScale = Math.min(80, Math.max(0.05, scale * zoom))
      if (nextScale === scale) return

      const worldX = (x - current.translateX) / scale
      const worldY = (y - current.translateY) / scale
      const nextTranslateX = x - worldX * nextScale
      const nextTranslateY = y - worldY * nextScale

      viewStateRef.current = {scale: nextScale, translateX: nextTranslateX, translateY: nextTranslateY}
      applyViewTransform()
      event.preventDefault()
    }

    const handleDblClick = () => fitToContainer()

    host.addEventListener('pointerdown', handlePointerDown)
    host.addEventListener('pointermove', handlePointerMove)
    host.addEventListener('pointerup', handlePointerUp)
    host.addEventListener('pointercancel', handlePointerUp)
    host.addEventListener('wheel', handleWheel, {passive: false})
    host.addEventListener('dblclick', handleDblClick)

    return () => {
      host.removeEventListener('pointerdown', handlePointerDown)
      host.removeEventListener('pointermove', handlePointerMove)
      host.removeEventListener('pointerup', handlePointerUp)
      host.removeEventListener('pointercancel', handlePointerUp)
      host.removeEventListener('wheel', handleWheel)
      host.removeEventListener('dblclick', handleDblClick)
    }
  }, [ready])

  useEffect(() => {
    const root = rootRef.current
    if (!ready || !ctx || !root) return

    root.removeChildren()

    layers.forEach((layer, index) => {
      const display = (() => {
        const tint = parseHexColor(layer.color)
        const alpha = Number(layer.opacity)
        const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
        if (layer.source.kind === 'plotTree') {
          return createLayerDisplay(layer.source.tree, ctx, tint, safeAlpha)
        }
        if (layer.source.kind === 'plotTrees') {
          const group = new Container()
          group.eventMode = 'none'
          const list = Array.isArray(layer.source.trees) ? layer.source.trees : []
          list.forEach((tree, treeIndex) => {
            const child = createLayerDisplay(tree, ctx, tint, safeAlpha)
            child.zIndex = treeIndex
            group.addChild(child)
          })
          group.sortableChildren = true
          return group
        }
        if (layer.source.kind === 'labels') {
          const labels = Array.isArray(layer.source.labels) ? layer.source.labels : []
          return createLabelDisplay(labels, ctx, tint, safeAlpha, layer.source.display)
        }
        return createGeoJsonDisplay(layer.source.geometry, ctx, tint, safeAlpha, layer.source.display)
      })()
      display.zIndex = index
      display.visible = layer.visible !== false
      root.addChild(display)
    })

    root.sortDirty = true
    requestRender()
  }, [ctx, layers, ready])

  const empty = !viewBox || viewBox[2] <= 0 || viewBox[3] <= 0

  return (
    <div class="viewer" ref={hostRef}>
      {empty && (
        <div class="viewer-overlay">
          <p>请上传 Gerber 压缩包以预览图层。</p>
        </div>
      )}
      {focusPoint && <div class="viewer-crosshair" aria-hidden="true" />}
    </div>
  )
}
