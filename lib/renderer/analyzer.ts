import { FULLSCREEN } from '@/lib/geometry/mat3'
import { placeUniform } from '@/lib/geometry/place'
import { PAINTING_SIZE } from '@/lib/doc/types'
import { alphaCentroid, colorTransfer } from '@/lib/harmonize/stats'
import { Compositor, type Analysis, type LayerDraw } from './compositor'
import { bindTarget, createTarget, deleteTarget, type Program, type Target } from './gl'

const SMALL = 128

/** Reads a 128² version of a layer (and what is under it) to get centroid + color transfer. */
export class Analyzer {
  private small: Target
  private comp: Compositor
  private layerPx = new Uint8Array(SMALL * SMALL * 4)
  private belowPx = new Uint8Array(SMALL * SMALL * 4)

  constructor(private gl: WebGL2RenderingContext, private quad: WebGLVertexArrayObject, private placeProg: Program, layerProg: Program) {
    this.small = createTarget(gl, SMALL)
    this.comp = new Compositor(gl, quad, layerProg, SMALL, false)
  }

  analyze(draws: LayerDraw[], index: number, background: [number, number, number]): Analysis {
    const { gl, placeProg } = this
    const { layer, surface } = draws[index]
    surface.ensureMips()
    bindTarget(gl, this.small)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(placeProg.prog)
    gl.bindVertexArray(this.quad)
    gl.uniformMatrix3fv(placeProg.u('u_toClip'), false, FULLSCREEN)
    gl.uniform3fv(placeProg.u('u_place'), placeUniform(layer.place, PAINTING_SIZE))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, surface.target.tex)
    gl.uniform1i(placeProg.u('u_layer'), 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    gl.readPixels(0, 0, SMALL, SMALL, gl.RGBA, gl.UNSIGNED_BYTE, this.layerPx)

    const centroid = alphaCentroid(this.layerPx, SMALL, SMALL) ?? { x: 0.5, y: 0.5 }
    let transfer = null
    if (layer.harmonize.colorMatch > 0) {
      const below = this.comp.render(draws.slice(0, index), { time: 0, background, still: true })
      bindTarget(gl, below)
      gl.readPixels(0, 0, SMALL, SMALL, gl.RGBA, gl.UNSIGNED_BYTE, this.belowPx)
      transfer = colorTransfer(this.layerPx, this.belowPx)
    }
    return { centroid, transfer }
  }

  dispose() {
    deleteTarget(this.gl, this.small)
    this.comp.dispose()
  }
}
