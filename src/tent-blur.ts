// Scene-relative silhouette; trees, distant rides and the path stay outside it.
export const TENT_OUTLINE = [
  [0.475, 0],
  [0.537, 0],
  [0.574, 0.105],
  [0.644, 0.2],
  [0.734, 0.246],
  [0.736, 0.49],
  [0.745, 0.626],
  [0.77, 0.713],
  [0.724, 0.761],
  [0.282, 0.761],
  [0.215, 0.713],
  [0.248, 0.631],
  [0.263, 0.544],
  [0.269, 0.249],
  [0.34, 0.198],
  [0.4, 0.112],
];

// Two small separable passes soften the source BEFORE palette/dithering/edges.
// Reuse the scene's uploaded video texture; no extra decoder or CPU frame copies.
export class TentBlur {
  private readonly width = 300;
  private readonly height = 168;
  private readonly program: WebGLProgram;
  private readonly textures: WebGLTexture[] = [];
  private readonly targets: WebGLFramebuffer[] = [];
  private readonly mask: WebGLTexture;
  private readonly direction: WebGLUniformLocation;
  private lastSource = '';

  constructor(private gl: WebGLRenderingContext) {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        throw new Error('Tent blur shader unavailable');
      }
      return shader;
    };
    const vertex = compile(
      gl.VERTEX_SHADER,
      `
      attribute vec2 position;
      attribute vec2 texCoord;
      varying vec2 uv;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        // Offscreen passes retain the source texture's orientation. Only the
        // final screen pass flips it into the canvas's top-to-bottom coordinates.
        uv = vec2(texCoord.x, 1.0 - texCoord.y);
      }`,
    );
    const fragment = compile(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D image;
      uniform vec2 direction;
      varying vec2 uv;
      void main() {
        vec3 color = texture2D(image, uv).rgb * 0.2270270270;
        color += texture2D(image, uv + direction * 1.3846153846).rgb * 0.3162162162;
        color += texture2D(image, uv - direction * 1.3846153846).rgb * 0.3162162162;
        color += texture2D(image, uv + direction * 3.2307692308).rgb * 0.0702702703;
        color += texture2D(image, uv - direction * 3.2307692308).rgb * 0.0702702703;
        gl_FragColor = vec4(color, 1.0);
      }`,
    );
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.bindAttribLocation(this.program, 0, 'position');
    gl.bindAttribLocation(this.program, 1, 'texCoord');
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error('Tent blur program unavailable');
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'image'), 3);
    this.direction = gl.getUniformLocation(this.program, 'direction')!;
    gl.activeTexture(gl.TEXTURE4);
    for (let i = 0; i < 2; i++) {
      const texture = this.texture();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.width,
        this.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      const target = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Tent blur target unavailable');
      this.textures.push(texture);
      this.targets.push(target);
    }
    // This procedural mask is drawn once, not on every video frame.
    const mask = document.createElement('canvas');
    mask.width = this.width;
    mask.height = this.height;
    const context = mask.getContext('2d')!;
    context.fillStyle = '#fff';
    context.filter = 'blur(1px)';
    context.beginPath();
    TENT_OUTLINE.forEach(([x, y], index) => {
      if (index) context.lineTo(x * this.width, y * this.height);
      else context.moveTo(x * this.width, y * this.height);
    });
    context.closePath();
    context.fill();
    gl.activeTexture(gl.TEXTURE5);
    this.mask = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private texture() {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  render(source: WebGLTexture, key: string) {
    if (key === this.lastSource) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE3);
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, i ? this.textures[0] : source);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[i]);
      gl.uniform2f(this.direction, i ? 0 : 1 / this.width, i ? 1 / this.height : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.lastSource = key;
  }

  dispose() {
    const gl = this.gl;
    this.textures.forEach((texture) => gl.deleteTexture(texture));
    this.targets.forEach((target) => gl.deleteFramebuffer(target));
    gl.deleteTexture(this.mask);
    gl.deleteProgram(this.program);
  }
}
