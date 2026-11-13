import { useEffect, useRef } from 'react';
import { SHADER_PRELUDE, type ShaderSpec } from './shaders';

/** Ripples kept at once; older taps are replaced first. */
const MAX_RIPPLES = 6;

/** The canvas draws at this share of the screen's pixels and the browser scales it up. */
const RENDER_SCALE = 0.6;

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (import.meta.env.DEV) console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Full-screen GPU background for themes with a shader (computers, full effects only). It follows
 * the mouse, takes ripples from taps, pauses while the tab is hidden, and calls onFail when the
 * device has no WebGL so the still CSS background can take over.
 */
export function ShaderLayer({ spec, onFail }: { spec: ShaderSpec; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!canvas || !gl) {
      onFail();
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, SHADER_PRELUDE + spec.fragment);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      onFail();
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      onFail();
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uRipples = gl.getUniformLocation(program, 'u_ripples');
    const uScroll = gl.getUniformLocation(program, 'u_scroll');

    let scale = 1;
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE;
      canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
      canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // Pointer in canvas pixels, origin bottom-left like gl_FragCoord. Starts off-screen.
    const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
    const ripples = new Float32Array(MAX_RIPPLES * 3).fill(-1e4);
    let next = 0;
    const start = performance.now();
    const now = () => (performance.now() - start) / 1000;

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      mouse.tx = event.clientX * scale;
      mouse.ty = canvas.height - event.clientY * scale;
      if (mouse.x < -1e3) {
        mouse.x = mouse.tx;
        mouse.y = mouse.ty;
      }
    };
    const down = (event: PointerEvent) => {
      if (!spec.ripples || event.button !== 0) return;
      ripples[next * 3] = event.clientX * scale;
      ripples[next * 3 + 1] = canvas.height - event.clientY * scale;
      ripples[next * 3 + 2] = now();
      next = (next + 1) % MAX_RIPPLES;
    };
    const leave = () => {
      mouse.tx = mouse.ty = -1e4;
      mouse.x = mouse.y = -1e4;
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);

    const lost = (event: Event) => {
      event.preventDefault();
      onFail();
    };
    canvas.addEventListener('webglcontextlost', lost);

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (document.hidden) return;
      // Ease the light toward the pointer so it trails a little, like moving through water.
      mouse.x += (mouse.tx - mouse.x) * 0.08;
      mouse.y += (mouse.ty - mouse.y) * 0.08;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, now());
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform3fv(uRipples, ripples);
      gl.uniform1f(uScroll, window.scrollY * scale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      document.documentElement.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', lost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [spec, onFail]);

  return <canvas ref={canvasRef} aria-hidden className="omni-ambient omni-shader" />;
}
