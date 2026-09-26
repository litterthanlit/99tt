import { stampSegment, stampStroke, type StrokePoint } from '@/lib/brush/stamps'
import { hexToRgb } from '@/lib/color/hex'
import type { Rect } from '@/lib/geometry/place'
import { createTarget, deleteTarget, type Target } from './gl'
import type { Painter } from './painter'

export interface Stroke { color: string; size: number; opacity: number; erase: boolean; points: StrokePoint[] }
export type StrokeStyle = Omit<Stroke, 'points'>

/**
 * One layer's pixels, rebuilt from an optional image base plus a stroke list.
 * Plan 2 replaces `base` with the baked snapshot and keeps the same replay rule.
 */
export class LayerSurface {
  target: Target
  base: { bitmap: ImageBitmap; rect: Rect; tex: WebGLTexture | null } | null = null
  strokes: Stroke[] = []
  version = 0
  mipDirty = true
  private live: { stroke: Stroke; carry: number } | null = null

  constructor(private gl: WebGL2RenderingContext, private painter: Painter, readonly size: number) {
    this.target = createTarget(gl, size, true)
  }

  get drawing() {
    return this.live !== null
  }

  setBase(bitmap: ImageBitmap, rect: Rect) {
    if (this.base?.tex) this.gl.deleteTexture(this.base.tex)
    this.base = { bitmap, rect, tex: null }
    this.replay()
  }

  begin(style: StrokeStyle, p: StrokePoint) {
    const r = stampSegment(p, p, style.size, style.opacity, 0)
    this.painter.stamp(this.target, r.dabs, hexToRgb(style.color), style.erase)
    this.live = { stroke: { ...style, points: [p] }, carry: r.carry }
    this.touch()
  }

  extend(p: StrokePoint) {
    if (!this.live) return
    const { stroke } = this.live
    const prev = stroke.points[stroke.points.length - 1]
    const r = stampSegment(prev, p, stroke.size, stroke.opacity, this.live.carry)
    this.painter.stamp(this.target, r.dabs, hexToRgb(stroke.color), stroke.erase)
    stroke.points.push(p)
    this.live.carry = r.carry
    this.touch()
  }

  commit(): Stroke | null {
    const stroke = this.live?.stroke ?? null
    this.live = null
    if (stroke) this.strokes.push(stroke)
    return stroke
  }

  cancel() {
    if (!this.live) return
    this.live = null
    this.replay()
  }

  undo(): boolean {
    if (this.live || this.strokes.length === 0) return false
    this.strokes.pop()
    this.replay()
    return true
  }

  replay() {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo)
    gl.viewport(0, 0, this.size, this.size)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (this.base) {
      this.base.tex ??= this.painter.uploadImage(this.base.bitmap)
      this.painter.image(this.target, this.base.tex, this.base.rect)
    }
    for (const s of this.strokes) this.painter.stamp(this.target, stampStroke(s.points, s.size, s.opacity), hexToRgb(s.color), s.erase)
    this.touch()
  }

  ensureMips() {
    if (!this.mipDirty) return
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.target.tex)
    this.gl.generateMipmap(this.gl.TEXTURE_2D)
    this.mipDirty = false
  }

  /** After WebGL context loss: new GPU objects, same base + strokes. */
  restore(painter: Painter) {
    this.painter = painter
    this.target = createTarget(this.gl, this.size, true)
    if (this.base) this.base.tex = null
    this.live = null
    this.replay()
  }

  dispose() {
    deleteTarget(this.gl, this.target)
    if (this.base?.tex) this.gl.deleteTexture(this.base.tex)
  }

  private touch() {
    this.version++
    this.mipDirty = true
  }
}
