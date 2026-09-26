export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
  if (!gl) throw new Error('WebGL2 is not available in this browser')
  return gl
}

export interface Program {
  prog: WebGLProgram
  u: (name: string) => WebGLUniformLocation | null
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader compile failed')
  return s
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const prog = gl.createProgram()!
  const v = compileShader(gl, gl.VERTEX_SHADER, vs)
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(prog, v)
  gl.attachShader(prog, f)
  gl.bindAttribLocation(prog, 0, 'a_pos')
  gl.bindAttribLocation(prog, 1, 'a_dab')
  gl.linkProgram(prog)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Program link failed')
  const cache = new Map<string, WebGLUniformLocation | null>()
  return {
    prog,
    u: name => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name))
      return cache.get(name)!
    },
  }
}

export interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; size: number; mips: boolean }

export function createTarget(gl: WebGL2RenderingContext, size: number, mips = false): Target {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texStorage2D(gl.TEXTURE_2D, mips ? Math.floor(Math.log2(size)) + 1 : 1, gl.RGBA8, size, size)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.viewport(0, 0, size, size)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fbo, size, mips }
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target) {
  gl.deleteFramebuffer(t.fbo)
  gl.deleteTexture(t.tex)
}

/** Bind a render target, or the screen when t is null. */
export function bindTarget(gl: WebGL2RenderingContext, t: Target | null, width = 0, height = 0) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null)
  gl.viewport(0, 0, t ? t.size : width, t ? t.size : height)
}

/** Triangle strip over [0,1]² at attribute 0. */
export function createQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}
