import { hexToRgb } from '@/lib/color/hex'
import { elapsedSeconds } from '@/lib/doc/painting'
import { PAINTING_SIZE, type Painting } from '@/lib/doc/types'
import { paintingRect, rectToClip, type View } from '@/lib/geometry/view'
import { analysisKey } from './analysisKey'
import { Analyzer } from './analyzer'
import { Compositor, type Analysis, type LayerDraw } from './compositor'
import { bindTarget, createGL, createProgram, createQuad, type Program } from './gl'
import { Painter } from './painter'
import { LAYER_FS, PLACE_FS, QUAD_VS, SCREEN_FS } from './shaders'
import { LayerSurface } from './surface'

interface Resources {
  quad: WebGLVertexArrayObject
  painter: Painter
  layer: Program
  place: Program
  screen: Program
  comp: Compositor
  analyzer: Analyzer
}

function createResources(gl: WebGL2RenderingContext): Resources {
  const quad = createQuad(gl)
  const layer = createProgram(gl, QUAD_VS, LAYER_FS)
  const place = createProgram(gl, QUAD_VS, PLACE_FS)
  const screen = createProgram(gl, QUAD_VS, SCREEN_FS)
  return {
    quad, layer, place, screen,
    painter: new Painter(gl, quad),
    comp: new Compositor(gl, quad, layer, PAINTING_SIZE, true),
    analyzer: new Analyzer(gl, quad, place, layer),
  }
}

export class Renderer {
  private gl: WebGL2RenderingContext
  private res: Resources
  private surfaces = new Map<string, LayerSurface>()
  private analyses = new Map<string, { key: string; value: Analysis }>()
  private lost = false
  onLost: ((lost: boolean) => void) | null = null

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = createGL(canvas)
    this.res = createResources(this.gl)
    canvas.addEventListener('webglcontextlost', this.handleLost)
    canvas.addEventListener('webglcontextrestored', this.handleRestored)
  }

  surface(layerId: string): LayerSurface {
    let s = this.surfaces.get(layerId)
    if (!s) {
      s = new LayerSurface(this.gl, this.res.painter, PAINTING_SIZE)
      this.surfaces.set(layerId, s)
    }
    return s
  }

  dropSurface(layerId: string) {
    this.surfaces.get(layerId)?.dispose()
    this.surfaces.delete(layerId)
    this.analyses.delete(layerId)
  }

  frame(p: Painting, view: View, now: number) {
    const { gl, canvas, res } = this
    if (this.lost || gl.isContextLost()) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    const background = hexToRgb(p.background)
    const draws: LayerDraw[] = p.layers.map(layer => ({
      layer,
      surface: this.surface(layer.id),
      analysis: this.analyses.get(layer.id)?.value ?? null,
    }))
    this.refreshOneAnalysis(p, draws, background)

    const time = elapsedSeconds(p, now)
    const out = res.comp.render(draws, { time, background, still: false })
    gl.bindTexture(gl.TEXTURE_2D, out.tex)
    gl.generateMipmap(gl.TEXTURE_2D)

    const vp = { width: cssW, height: cssH }
    bindTarget(gl, null, w, h)
    gl.clearColor(0.07, 0.07, 0.07, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(res.screen.prog)
    gl.bindVertexArray(res.quad)
    gl.uniformMatrix3fv(res.screen.u('u_toClip'), false, rectToClip(paintingRect(vp, PAINTING_SIZE, view), vp))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, out.tex)
    gl.uniform1i(res.screen.u('u_tex'), 0)
    gl.uniform1f(res.screen.u('u_grain'), p.grain)
    gl.uniform1f(res.screen.u('u_time'), time)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  /** At most one readback per frame; skipped while that layer is mid-stroke. */
  private refreshOneAnalysis(p: Painting, draws: LayerDraw[], background: [number, number, number]) {
    const versionOf = (id: string) => this.surfaces.get(id)?.version ?? 0
    for (let i = 0; i < draws.length; i++) {
      const { layer, surface } = draws[i]
      const needs = layer.harmonize.colorMatch > 0 || layer.transform.recipe === 'pulse' || layer.transform.recipe === 'turn'
      if (!needs || surface.drawing) continue
      const key = analysisKey(p, i, versionOf)
      if (this.analyses.get(layer.id)?.key === key) continue
      const value = this.res.analyzer.analyze(draws, i, background)
      this.analyses.set(layer.id, { key, value })
      draws[i].analysis = value
      return
    }
  }

  private handleLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
    this.onLost?.(true)
  }

  private handleRestored = () => {
    try {
      this.res = createResources(this.gl)
      for (const s of this.surfaces.values()) s.restore(this.res.painter)
      this.analyses.clear()
      this.lost = false
      this.onLost?.(false)
    } catch {
      // stays lost; the UI keeps showing "Reload to restore the canvas"
    }
  }

  dispose() {
    const { gl, res } = this
    this.canvas.removeEventListener('webglcontextlost', this.handleLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored)
    for (const s of this.surfaces.values()) s.dispose()
    this.surfaces.clear()
    res.comp.dispose()
    res.analyzer.dispose()
    res.painter.dispose()
    ;[res.layer, res.place, res.screen].forEach(pr => gl.deleteProgram(pr.prog))
  }
}
