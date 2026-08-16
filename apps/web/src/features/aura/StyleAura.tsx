import { useEffect, useRef, useState } from "react";
import { FOUNDATION_AURA, hexToAuraRgb, type StyleAuraProfile } from "./palette";
import { auraFragmentShader, auraVertexShader } from "./shaders";

export type AuraStatus = "starting" | "live" | "adaptive" | "frozen" | "fallback";

interface StyleAuraProps {
  profile: StyleAuraProfile;
  energy: number;
  warmth: number;
  forcedFallback?: boolean;
  onStatusChange?: (status: AuraStatus) => void;
}

interface TrailPoint {
  x: number;
  y: number;
  strength: number;
}

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
const TRAIL_LENGTH = 12;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not allocate a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader) ?? "Unknown shader compilation error.";
    gl.deleteShader(shader);
    throw new Error(reason);
  }
  return shader;
}

function createAuraProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, auraVertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, auraFragmentShader);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL could not allocate a program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const reason = gl.getProgramInfoLog(program) ?? "Unknown shader link error.";
    gl.deleteProgram(program);
    throw new Error(reason);
  }
  return program;
}

function paletteToNumbers(colours: readonly string[]): number[][] {
  return colours.map((colour, index) => [
    ...(hexToAuraRgb(colour) ?? hexToAuraRgb(FOUNDATION_AURA[index]) ?? [0.3, 0.4, 0.5]),
  ]);
}

export function StyleAura({
  profile,
  energy,
  warmth,
  forcedFallback = false,
  onStatusChange,
}: StyleAuraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onStatusRef = useRef(onStatusChange);
  const targetColoursRef = useRef(paletteToNumbers(profile.colours));
  const currentColoursRef = useRef(paletteToNumbers(FOUNDATION_AURA));
  const targetSettingsRef = useRef({ energy, warmth });
  const currentSettingsRef = useRef({ energy: 0.58, warmth: 0.42 });
  const redrawFrozenRef = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(forcedFallback);

  onStatusRef.current = onStatusChange;

  useEffect(() => {
    targetColoursRef.current = paletteToNumbers(profile.colours);
    redrawFrozenRef.current?.();
  }, [profile.colours]);

  useEffect(() => {
    targetSettingsRef.current = { energy: clamp(energy), warmth: clamp(warmth) };
    redrawFrozenRef.current?.();
  }, [energy, warmth]);

  useEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const canvas: HTMLCanvasElement = currentCanvas;
    let reported: AuraStatus | null = null;
    const report = (status: AuraStatus) => {
      if (reported === status) return;
      reported = status;
      onStatusRef.current?.(status);
    };

    if (forcedFallback) {
      setFallback(true);
      report("fallback");
      return;
    }

    report("starting");
    setFallback(false);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const trails: TrailPoint[] = Array.from({ length: TRAIL_LENGTH }, () => ({
      x: 0.5,
      y: 0.5,
      strength: 0,
    }));
    const pointer = {
      x: 0.5,
      y: 0.52,
      targetX: 0.5,
      targetY: 0.52,
      velocityX: 0,
      velocityY: 0,
      targetVelocityX: 0,
      targetVelocityY: 0,
      activity: 0,
      targetActivity: 0,
      lastX: 0.5,
      lastY: 0.52,
      lastAt: performance.now(),
      lastTrailAt: 0,
    };
    let trailCursor = 0;
    let frameHandle: number | null = null;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let destroyed = false;
    let contextLost = false;
    let quality = 1;
    let averageFrameMs = 16.7;
    let stableFrames = 0;
    let previousFrameAt = performance.now();
    let scrollTarget = 0;
    let scrollCurrent = 0;

    const locations: {
      position: number;
      resolution: WebGLUniformLocation | null;
      time: WebGLUniformLocation | null;
      scroll: WebGLUniformLocation | null;
      energy: WebGLUniformLocation | null;
      warmth: WebGLUniformLocation | null;
      pointer: WebGLUniformLocation | null;
      velocity: WebGLUniformLocation | null;
      activity: WebGLUniformLocation | null;
      colours: WebGLUniformLocation | null;
      trails: WebGLUniformLocation | null;
    } = {
      position: -1,
      resolution: null,
      time: null,
      scroll: null,
      energy: null,
      warmth: null,
      pointer: null,
      velocity: null,
      activity: null,
      colours: null,
      trails: null,
    };

    function resize() {
      if (!gl) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
      const width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
      const height = Math.max(1, Math.round(window.innerHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    }

    function updatePalette(delta: number) {
      const rate = 1 - Math.pow(0.965, Math.max(1, delta / 16.67));
      const targets = targetColoursRef.current;
      const currents = currentColoursRef.current;
      for (let colourIndex = 0; colourIndex < 4; colourIndex += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
          currents[colourIndex][channel] +=
            (targets[colourIndex][channel] - currents[colourIndex][channel]) * rate;
        }
      }
      const targetSettings = targetSettingsRef.current;
      const currentSettings = currentSettingsRef.current;
      currentSettings.energy += (targetSettings.energy - currentSettings.energy) * rate;
      currentSettings.warmth += (targetSettings.warmth - currentSettings.warmth) * rate;
    }

    function draw(frameAt: number, delta = 16.67) {
      if (!gl || !program || contextLost) return;
      updatePalette(delta);
      const interpolation = 1 - Math.pow(0.82, Math.max(1, delta / 16.67));
      pointer.x += (pointer.targetX - pointer.x) * interpolation;
      pointer.y += (pointer.targetY - pointer.y) * interpolation;
      pointer.velocityX += (pointer.targetVelocityX - pointer.velocityX) * interpolation;
      pointer.velocityY += (pointer.targetVelocityY - pointer.velocityY) * interpolation;
      pointer.activity += (pointer.targetActivity - pointer.activity) * interpolation * 0.7;
      pointer.targetVelocityX *= Math.pow(0.84, Math.max(1, delta / 16.67));
      pointer.targetVelocityY *= Math.pow(0.84, Math.max(1, delta / 16.67));
      if (frameAt - pointer.lastAt > 120) pointer.targetActivity *= 0.94;
      scrollCurrent += (scrollTarget - scrollCurrent) * 0.045;

      const trailUniforms = new Float32Array(TRAIL_LENGTH * 3);
      for (let index = 0; index < TRAIL_LENGTH; index += 1) {
        trails[index].strength *= Math.pow(0.988, Math.max(1, delta / 16.67));
        trailUniforms[index * 3] = trails[index].x;
        trailUniforms[index * 3 + 1] = trails[index].y;
        trailUniforms[index * 3 + 2] = trails[index].strength;
      }

      const colourUniforms = new Float32Array(currentColoursRef.current.flat());
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(locations.resolution, canvas.width, canvas.height);
      gl.uniform1f(locations.time, frameAt / 1000);
      gl.uniform1f(locations.scroll, scrollCurrent);
      gl.uniform1f(locations.energy, currentSettingsRef.current.energy);
      gl.uniform1f(locations.warmth, currentSettingsRef.current.warmth);
      gl.uniform2f(locations.pointer, pointer.x, pointer.y);
      gl.uniform2f(locations.velocity, pointer.velocityX, pointer.velocityY);
      gl.uniform1f(locations.activity, pointer.activity);
      gl.uniform3fv(locations.colours, colourUniforms);
      gl.uniform3fv(locations.trails, trailUniforms);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function animate(frameAt: number) {
      if (destroyed || contextLost || document.hidden || motionQuery.matches) {
        frameHandle = null;
        return;
      }
      const delta = Math.min(50, Math.max(1, frameAt - previousFrameAt));
      previousFrameAt = frameAt;
      averageFrameMs = averageFrameMs * 0.965 + delta * 0.035;
      stableFrames += 1;
      if (averageFrameMs > 27 && quality > 0.76 && stableFrames > 90) {
        quality = 0.74;
        stableFrames = 0;
        resize();
        report("adaptive");
      } else if (averageFrameMs < 18.4 && quality < 1 && stableFrames > 300) {
        quality = 1;
        stableFrames = 0;
        resize();
        report("live");
      }
      draw(frameAt, delta);
      frameHandle = window.requestAnimationFrame(animate);
    }

    function start() {
      if (destroyed || contextLost || document.hidden || motionQuery.matches || frameHandle !== null) return;
      previousFrameAt = performance.now();
      frameHandle = window.requestAnimationFrame(animate);
    }

    function stop() {
      if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }

    function initialiseGpu() {
      try {
        gl = canvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          depth: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
          premultipliedAlpha: true,
        });
        if (!gl) throw new Error("WebGL is unavailable.");
        program = createAuraProgram(gl);
        buffer = gl.createBuffer();
        if (!buffer) throw new Error("WebGL could not allocate geometry.");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
        locations.position = gl.getAttribLocation(program, "a_position");
        locations.resolution = gl.getUniformLocation(program, "u_resolution");
        locations.time = gl.getUniformLocation(program, "u_time");
        locations.scroll = gl.getUniformLocation(program, "u_scroll");
        locations.energy = gl.getUniformLocation(program, "u_energy");
        locations.warmth = gl.getUniformLocation(program, "u_warmth");
        locations.pointer = gl.getUniformLocation(program, "u_pointer");
        locations.velocity = gl.getUniformLocation(program, "u_velocity");
        locations.activity = gl.getUniformLocation(program, "u_activity");
        locations.colours = gl.getUniformLocation(program, "u_colours[0]");
        locations.trails = gl.getUniformLocation(program, "u_trails[0]");
        gl.enableVertexAttribArray(locations.position);
        gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
        resize();
        setFallback(false);
        redrawFrozenRef.current = () => {
          if (!motionQuery.matches || contextLost || destroyed) return;
          currentColoursRef.current = targetColoursRef.current.map((colour) => [...colour]);
          currentSettingsRef.current = { ...targetSettingsRef.current };
          draw(14_200);
        };
        if (motionQuery.matches) {
          currentColoursRef.current = targetColoursRef.current.map((colour) => [...colour]);
          currentSettingsRef.current = { ...targetSettingsRef.current };
          draw(14_200);
          report("frozen");
        } else {
          report("live");
          start();
        }
      } catch {
        stop();
        setFallback(true);
        report("fallback");
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (motionQuery.matches) return;
      const now = performance.now();
      const nextX = clamp(event.clientX / Math.max(1, window.innerWidth));
      const nextY = clamp(1 - event.clientY / Math.max(1, window.innerHeight));
      const elapsed = Math.max(8, now - pointer.lastAt);
      const velocityX = ((nextX - pointer.lastX) / elapsed) * 16.67;
      const velocityY = ((nextY - pointer.lastY) / elapsed) * 16.67;
      const speed = Math.hypot(velocityX, velocityY);
      pointer.targetX = nextX;
      pointer.targetY = nextY;
      pointer.targetVelocityX = clamp(velocityX, -0.12, 0.12);
      pointer.targetVelocityY = clamp(velocityY, -0.12, 0.12);
      pointer.targetActivity = clamp(0.28 + speed * 12, 0, 1);
      pointer.lastX = nextX;
      pointer.lastY = nextY;
      pointer.lastAt = now;
      if (now - pointer.lastTrailAt >= 34 && speed > 0.0014) {
        trails[trailCursor] = {
          x: nextX,
          y: nextY,
          strength: clamp(0.22 + speed * 8, 0.22, 0.82),
        };
        trailCursor = (trailCursor + 1) % TRAIL_LENGTH;
        pointer.lastTrailAt = now;
      }
    };
    const onPointerLeave = () => {
      pointer.targetActivity = 0;
    };
    const onScroll = () => {
      const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollTarget = clamp(window.scrollY / range);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (motionQuery.matches) {
        draw(14_200);
      } else {
        start();
      }
    };
    const onMotionChange = () => {
      if (motionQuery.matches) {
        stop();
        currentColoursRef.current = targetColoursRef.current.map((colour) => [...colour]);
        currentSettingsRef.current = { ...targetSettingsRef.current };
        draw(14_200);
        report("frozen");
      } else {
        report(quality < 1 ? "adaptive" : "live");
        start();
      }
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      stop();
      setFallback(true);
      report("fallback");
    };
    const onContextRestored = () => {
      contextLost = false;
      initialiseGpu();
    };

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotionChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    onScroll();
    initialiseGpu();

    return () => {
      destroyed = true;
      redrawFrozenRef.current = null;
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (gl && buffer) gl.deleteBuffer(buffer);
      if (gl && program) gl.deleteProgram(program);
    };
  }, [forcedFallback]);

  const fallbackStyle = {
    "--aura-one": profile.colours[0],
    "--aura-two": profile.colours[1],
    "--aura-three": profile.colours[2],
    "--aura-four": profile.colours[3],
  } as React.CSSProperties;

  return (
    <div
      className={`style-aura ${fallback ? "style-aura-fallback-active" : ""}`}
      style={fallbackStyle}
      aria-hidden="true"
      data-aura-status={fallback ? "fallback" : "webgl"}
    >
      <canvas ref={canvasRef} />
      <div className="style-aura-fallback" />
      <div className="style-aura-legibility" />
    </div>
  );
}
