import { BLEND_MODES, PAINTING_SIZE, type Layer } from '@/lib/doc/types'
import { FULLSCREEN, IDENTITY, type Pt } from '@/lib/geometry/mat3'
import { placeUniform } from '@/lib/geometry/place'
import type { ColorTransfer } from '@/lib/harmonize/stats'
import { bindTarget, createTarget, deleteTarget, type Program, type Target } from './gl'
import { flowUniforms, transformAt } from './motion'
import type { LayerSurface } from './surface'

export interface Analysis { centroid: Pt; transfer: ColorTransfer | null }
export interface LayerDraw { layer: Layer; surface: LayerSurface; analysis: Analysis | null }
export interface CompositeOptions {
  time: number
  background: [number, number, number]
  /** no motion, no bleed, no color match — used for analysis backdrops */
  still: boolean
}

/** Composites layers bottom→top, ping-ponging between two targets. */
export class Compositor {
  private targets: [Target, Target]

  constructor(private gl: WebGL2RenderingContext, private quad: WebGLVertexArrayObject, private prog: Program, readonly size: number, mips: boolean) {
    this.targets = [createTarget(gl, size, mips), createTarget(gl, size, mips)]
  }

  render(draws: LayerDraw[], o: CompositeOptions): Target {
    const { gl, prog } = this
    let [src, dst] = this.targets
    bindTarget(gl, src)
    gl.clearColor(o.background[0], o.background[1], o.background[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(prog.prog)
    gl.bindVertexArray(this.quad)
    gl.uniformMatrix3fv(prog.u('u_toClip'), false, FULLSCREEN)
    gl.uniform1i(prog.u('u_below'), 0)
    gl.uniform1i(prog.u('u_layer'), 1)
    gl.uniform1f(prog.u('u_time'), o.time)

    for (const { layer, surface, analysis } of draws) {
      if (!layer.visible || layer.opacity <= 0) continue
      surface.ensureMips()
      const motion = o.still
        ? { matrix: IDENTITY, opacity: layer.opacity }
        : transformAt(layer.transform, o.time, analysis?.centroid ?? { x: 0.5, y: 0.5 }, layer.opacity)
      const flow = flowUniforms(layer.flow)
      const transfer = o.still ? null : analysis?.transfer ?? null
      const h = layer.harmonize

      bindTarget(gl, dst)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, src.tex)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, surface.target.tex)
      gl.uniform3fv(prog.u('u_place'), placeUniform(layer.place, PAINTING_SIZE))
      gl.uniformMatrix3fv(prog.u('u_xform'), false, motion.matrix)
      gl.uniform1f(prog.u('u_opacity'), motion.opacity)
      gl.uniform1i(prog.u('u_blend'), BLEND_MODES.indexOf(layer.blend))
      gl.uniform1i(prog.u('u_flowKind'), o.still ? 0 : flow.kind)
      gl.uniform2f(prog.u('u_flow'), flow.speed, flow.intensity)
      gl.uniform2fv(prog.u('u_dir'), flow.dir)
      gl.uniform2fv(prog.u('u_seed'), flow.seed)
      gl.uniform2fv(prog.u('u_origin'), flow.origin)
      gl.uniform1f(prog.u('u_featherOn'), h.feather > 0 ? 1 : 0)
      gl.uniform1f(prog.u('u_featherLod'), Math.log2(Math.max(1, h.feather)))
      gl.uniform1f(prog.u('u_bleed'), o.still ? 0 : h.bleed)
      gl.uniform1f(prog.u('u_match'), transfer ? h.colorMatch : 0)
      if (transfer) {
        gl.uniform3fv(prog.u('u_srcMean'), transfer.srcMean)
        gl.uniform3fv(prog.u('u_labScale'), transfer.scale)
        gl.uniform3fv(prog.u('u_dstMean'), transfer.dstMean)
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      ;[src, dst] = [dst, src]
    }
    gl.bindVertexArray(null)
    return src
  }

  dispose() {
    this.targets.forEach(t => deleteTarget(this.gl, t))
  }
}
