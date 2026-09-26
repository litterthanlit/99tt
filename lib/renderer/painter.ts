import type { Dab } from '@/lib/brush/stamps'
import { rectToTargetClip, type Rect } from '@/lib/geometry/place'
import { bindTarget, createProgram, type Program, type Target } from './gl'
import { IMAGE_FS, QUAD_VS, STAMP_FS, STAMP_VS } from './shaders'

/** Draws dabs and images into layer targets. */
export class Painter {
  private stampProg: Program
  private imageProg: Program
  private dabVao: WebGLVertexArrayObject
  private dabBuf: WebGLBuffer

  constructor(private gl: WebGL2RenderingContext, private quad: WebGLVertexArrayObject) {
    this.stampProg = createProgram(gl, STAMP_VS, STAMP_FS)
    this.imageProg = createProgram(gl, QUAD_VS, IMAGE_FS)
    this.dabVao = gl.createVertexArray()!
    gl.bindVertexArray(this.dabVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.dabBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuf)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(1, 1)
    gl.bindVertexArray(null)
  }

  stamp(target: Target, dabs: Dab[], rgb: [number, number, number], erase: boolean) {
    if (dabs.length === 0) return
    const { gl } = this
    const data = new Float32Array(dabs.length * 4)
    dabs.forEach((d, i) => data.set([d.x, d.y, d.radius, d.alpha], i * 4))
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW)
    bindTarget(gl, target)
    gl.useProgram(this.stampProg.prog)
    gl.uniform1f(this.stampProg.u('u_size'), target.size)
    gl.uniform3fv(this.stampProg.u('u_color'), rgb)
    gl.enable(gl.BLEND)
    if (erase) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindVertexArray(this.dabVao)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, dabs.length)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  uploadImage(bitmap: ImageBitmap): WebGLTexture {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  image(target: Target, tex: WebGLTexture, rect: Rect) {
    const { gl } = this
    bindTarget(gl, target)
    gl.useProgram(this.imageProg.prog)
    gl.uniformMatrix3fv(this.imageProg.u('u_toClip'), false, rectToTargetClip(rect, target.size))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(this.imageProg.u('u_tex'), 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindVertexArray(this.quad)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  dispose() {
    this.gl.deleteProgram(this.stampProg.prog)
    this.gl.deleteProgram(this.imageProg.prog)
    this.gl.deleteBuffer(this.dabBuf)
    this.gl.deleteVertexArray(this.dabVao)
  }
}
