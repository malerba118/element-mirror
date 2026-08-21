"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";

import {
  ElementMirror,
  TextCaret,
  subscribeToSource,
} from "@frostin/element-mirror";

import { useCaptureStats } from "@/components/demo/capture-stats";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
});

/**
 * The void: a newsletter card floating in blackness over a film of real water.
 *
 * Everything that lights this page is the card, mirrored. The bloom behind it
 * is two mirrors scaled up, blurred hard and screen-blended, so the light is
 * made of the card's own pixels and changes colour the moment the card does.
 * The water is the part CSS could never finish: a third mirror runs unseen at
 * opacity 0, and a WebGL fragment shader samples its canvas as a texture —
 * live DOM as a GPU texture — flipping it, bending the sample coordinates with
 * travelling waves and rings, blurring with depth by mipmap level, and
 * drowning it towards black. Type in the card and the water types back;
 * click the water and the reflection ripples away from your cursor.
 *
 * The rings answer the keyboard, not the pointer. Every character lands in the
 * water at the caret's own image, carried through the flip — the ripples walk
 * right to left under the email field as you type into it, because the field
 * is flipped down there. The one unprompted ring is the subscribe button
 * swapping to "Subscribed" by itself: the card changed, so the water noticed.
 * Clicking the card spawns nothing; clicking the water itself still breaks it
 * where you touch it.
 *
 * The mirror is what makes the shader possible. A GPU can only distort what it
 * can read, and the card — text nodes, focus rings, a spinner mid-turn — is
 * not readable from a shader. The mirror's whole job is turning that live DOM
 * into the one thing a shader does understand, a canvas, every frame.
 *
 * The card's own background is a shader too: warped value noise drifting under
 * the card body rather than over it, so the glass's own backdrop blur is what
 * the drift is seen through. It lives inside the card, so the mirror carries
 * the motion into the bloom and the water along with everything else — an
 * untouched card still keeps the reflection alive. Its canvas is a quarter
 * scale, which is what keeps that motion affordable: a canvas is the one
 * thing a capture cannot clone structurally, so its pixels are re-encoded on
 * every frame of the card.
 *
 * The reflection floats a little off the card and is not squashed: still water
 * is a true mirror, and the gap is the height the card hovers at. There is no
 * horizon line and no room gradient — the floor exists only where the
 * reflection and the rings say it does.
 */

/**
 * The idle pulse, not the responsiveness. While the aurora runs, the card is
 * never still, so the mirrors capture at this rate forever — and each capture
 * reads the aurora's WebGL buffer back and encodes it as a PNG on the main
 * thread, which is the page's single dearest recurring cost. Typing does not
 * wait on this: a change kicks the capture loop and lands ahead of the grid,
 * so halving the rate halves the idle burn while keystrokes stay immediate.
 */
const FPS = 15;
/**
 * The rate while the user is touching the card. FPS above is the idle pulse,
 * priced for running forever; an interaction is priced for 400ms. What the
 * burst buys is latency rather than smoothness: a discrete change — a
 * double-click's highlight, a focus ring — is captured ahead of the fps grid,
 * but no further ahead than the asking mirror's own interval, so at 15fps the
 * change can still sit unseen for a whole 66ms slot. Tripling the rate for the
 * moment shrinks that worst case to ~22ms, and the engine's duty-cycle
 * backpressure still bounds what the burst may cost.
 */
const BURST_FPS = 45;
/** How long an interaction keeps the burst rate (and snaps frames in). */
const BURST_MS = 400;
/**
 * How far the card hovers above the water, so the reflection starts late.
 *
 * Counts twice everywhere, the way a mirror does: the image starts as far
 * below the surface as the card stands above it, so the band of black between
 * the card and its reflection is two of these, and raising it pushes the
 * reflection's tail down by two as well — which the stage will eventually cut
 * off mid-fade.
 */
const GAP = 20;
/** Sideways room the water canvas keeps for waves to displace into. */
const MARGIN = 90;
/**
 * The aurora canvas's backing store, as a fraction of its displayed size.
 *
 * This is the page's most valuable number. A canvas cannot be cloned
 * structurally, so every capture of the card reads this one back off the GPU
 * and PNG-encodes it — measured at 48ms a capture at full resolution against
 * 5ms without it, which the engine's backpressure then answers by throttling
 * captures to about four a second. Everything mirrored — the glow, the whole
 * reflection — therefore updated four times a second while the card itself
 * animated smoothly, and a large soft glow stepping at 4Hz reads as a flicker.
 *
 * The encode's cost is its pixel count, and a smooth field has no detail to
 * lose: at a quarter linear it is a sixteenth of the pixels, and the browser's
 * own upscale softens what is left. Nothing here is legible at native
 * resolution anyway — it sits behind frosted glass.
 */
const AURORA_RES = 0.25;

/**
 * The bloom, from tight and bright to wide and dim. Screen blending is what
 * makes this read as light: the card's dark body contributes nothing, so only
 * the saturated and near-white pixels spread. Each layer's blur has to stay
 * large next to its own size, or the halo is still legible as a rounded
 * rectangle; the wider layer is stretched sideways for the same reason —
 * light washing into a room, not a card behind a card. Two layers rather than
 * a graded stack, so the gap between them is wide: the tight one has to carry
 * the edge alone and the wide one the whole falloff.
 */
const BLOOM = [
  { sx: 1.06, sy: 1.06, blur: 26, opacity: 0.8, lag: 0 },
  { sx: 1.62, sy: 1.28, blur: 104, opacity: 0.52, lag: 110 },
];

/**
 * Canvas pixels per CSS pixel in a bloom layer's own canvas. Light this
 * blurred has nothing a resolution can lose, so a third is generous.
 */
const BLOOM_RES = 1 / 3;

let measure: CanvasRenderingContext2D | null = null;

/**
 * Where the caret sits on screen, measured rather than guessed: the input's
 * text up to the caret, set in the input's own font. Password fields measure
 * as the bullets they draw.
 */
function caretViewportPoint(input: HTMLInputElement) {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return null;
  const style = getComputedStyle(input);
  measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const upto = input.value.slice(0, input.selectionStart ?? input.value.length);
  const text = input.type === "password" ? "•".repeat(upto.length) : upto;
  const rect = input.getBoundingClientRect();
  const inset =
    parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
  const x =
    rect.left + inset + measure.measureText(text).width - input.scrollLeft;
  return {
    x: Math.max(rect.left + 4, Math.min(x, rect.right - 4)),
    y: rect.top + rect.height / 2,
  };
}

const VERTEX = `#version 300 es
layout(location = 0) in vec2 pos;
out vec2 v_uv;
void main() {
  v_uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

// Two frames of the card, not one: captures land a dozen times a second while
// this shader runs at display rate, so showing only the newest frame makes
// the reflection step whenever one lands. Instead the water dissolves from
// the frame before (A) to the newest (B) over roughly the gap between them,
// and the steps disappear into the medium — water was never going to hold a
// crisp image anyway. Each frame carries its own sub-rect, since the
// capture's overhang differs frame to frame.
uniform sampler2D u_texA; // outgoing frame
uniform sampler2D u_texB; // incoming frame
uniform vec2 u_quad;      // water canvas size, CSS px
uniform vec4 u_card;      // card box in quad space: left, top, width, height
uniform vec4 u_rectA;     // card box within texture A: offset.xy, scale.xy
uniform vec4 u_rectB;     // card box within texture B: offset.xy, scale.xy
uniform float u_mix;      // 0 = all A, 1 = all B
uniform float u_time;
uniform float u_ripple;   // 0..1
uniform vec4 u_rings[8];  // rings: centre x, centre y, start time, amplitude
uniform int u_ringCount;

in vec2 v_uv;
out vec4 outColor;

// One frame's contribution: the card sampled at depth-blurred lod, with a
// ring's wavefront dispersing red and blue a hair apart along its push.
// texUv may run past 0..1: the capture holds more than the card's box — its
// glow spills into the overhang around it — and cutting the reflection at
// the box guillotined that glow into a hard right angle at each corner. So
// the sample reaches into the overhang, and only the texture's own edge is
// the end of the world.
vec4 sampleCard(sampler2D tex, vec4 rect, vec2 texUv, float lod,
    vec2 ringDir, float push) {
  vec2 st = rect.xy + texUv * rect.zw;
  if (any(lessThan(st, vec2(0.0))) || any(greaterThan(st, vec2(1.0)))) {
    return vec4(0.0);
  }
  vec2 fringe = push > 0.001
    ? ringDir * min(push * 0.35, 2.0) * (rect.zw / u_card.zw)
    : vec2(0.0);
  vec4 col = textureLod(tex, st, lod);
  col.r = textureLod(tex, st + fringe, lod).r;
  col.b = textureLod(tex, st - fringe, lod).b;
  return col;
}

void main() {
  // Pixel position in the quad, y growing downwards from the water's edge.
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_quad;
  float depth = (px.y - u_card.y) / u_card.w;

  // Idle undulation: two slow travelling waves, mostly sideways, growing with
  // depth the way a reflection loses its grip away from the object.
  float amp = u_ripple * (1.5 + 13.0 * depth);
  vec2 disp = vec2(
    sin(px.y * 0.045 - u_time * 1.3 + px.x * 0.006) +
      0.5 * sin(px.y * 0.011 + u_time * 0.7),
    0.35 * sin(px.y * 0.06 + u_time * 1.05)
  ) * amp;

  // Rings: an expanding, fading band that pushes samples radially. Each has
  // its own amplitude — a keystroke stirs less water than a splash — and the
  // band also catches a little light, so a wave crossing the dim deep water
  // still reads.
  vec2 ringDisp = vec2(0.0);
  float glint = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_ringCount) break;
    float age = u_time - u_rings[i].z;
    vec2 away = px - u_rings[i].xy;
    float dist = length(away) + 1e-3;
    float radius = 30.0 + age * 230.0;
    float band = exp(-pow((dist - radius) / 30.0, 2.0)) * exp(-age * 1.5);
    ringDisp += (away / dist) * band * u_rings[i].w *
      sin(dist * 0.16 - age * 8.0);
    glint += band * (u_rings[i].w / 16.0);
  }

  // Into the card's texture sub-rect, flipped: the water's edge shows the
  // card's bottom edge. Not clipped to the card's box — the glow around the
  // card reflects too (see sampleCard) — only cut off well past where any
  // overhang could reach, to skip the arithmetic where nothing can be.
  vec2 cardUv = (px + disp + ringDisp - u_card.xy) / u_card.zw;
  vec2 texUv = vec2(cardUv.x, 1.0 - cardUv.y);
  if (any(lessThan(texUv, vec2(-0.6))) || any(greaterThan(texUv, vec2(1.6)))) {
    outColor = vec4(0.0);
    return;
  }

  // Progressive blur for free: the texture is mipmapped every upload, so the
  // waterline reads the full-resolution level and deeper water reads ever
  // smaller ones, trilinearly blended between.
  // Held back from the deepest levels: past about three the card's text has
  // dissolved into flat tone, so the water reads as haze rather than as a
  // reflection of anything, which is half of why the depths looked empty.
  float lod = (0.1 + 3.2 * smoothstep(0.0, 1.0, depth)) *
    (0.7 + 0.5 * u_ripple);

  float push = length(ringDisp);
  vec2 ringDir = push > 0.001 ? ringDisp / push : vec2(0.0);
  vec4 col = sampleCard(u_texB, u_rectB, texUv, lod, ringDir, push);
  if (u_mix < 1.0) {
    col = mix(sampleCard(u_texA, u_rectA, texUv, lod, ringDir, push),
      col, u_mix);
  }

  // Drowned towards black: everything is premultiplied, so one factor dims
  // and fades in the same breath. A whisper of dither keeps the long dark
  // ramp from banding — static, so still water stays perfectly still.
  //
  // Holds its light, then lets go. Even a straight ramp is already dark by
  // halfway — half gone at half depth, and against pure black that reads as
  // the reflection falling into nothing while there is still plenty of it
  // left to look at. Squaring the ramp's progress instead keeps the middle
  // depths near full strength and spends nearly all the falloff in the last
  // stretch, where the water is blurred enough to lose it gracefully. The end
  // is placed just inside where the stage cuts the canvas off, so the fade
  // still finishes on its own rather than ending at an edge.
  float t = clamp((depth - 0.03) / 0.92, 0.0, 1.0);
  float f = 0.68 * (1.0 - t * t);
  float dither =
    fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  outColor = col * f * (1.0 + glint * 0.35) * (1.0 + dither * 0.06);
}`;

/**
 * The card's own backdrop: value noise warped by more of itself — an aurora
 * behind frosted glass. Painted inside the card, so the mirror carries the
 * motion into the bloom and the water like anything else the card does.
 * Premultiplied output: alpha rides the brightest channel, so the light glows
 * over the glass without blacking it out.
 *
 * Coordinates are normalised by height, so the pattern is the same shape at
 * any resolution — which is what lets the canvas be a fraction of its
 * displayed size (see AURORA_RES).
 */
const AURORA_FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 u_res;    // backing store size, device px
uniform float u_time;
uniform float u_level; // 0..1

out vec4 outColor;

float rand(vec2 p) {
  return fract(sin(dot(p, vec2(12.543, 514.123))) * 4732.12);
}

float noise(vec2 p) {
  vec2 f = smoothstep(0.0, 1.0, fract(p));
  vec2 i = floor(p);
  float a = rand(i);
  float b = rand(i + vec2(1.0, 0.0));
  float c = rand(i + vec2(0.0, 1.0));
  float d = rand(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;
  uv += 0.375 *
    noise(uv * 3.0 + u_time / 2.0 + noise(uv * 7.0 - u_time / 3.0) / 2.0);
  float lift = 5.0 * pow(1.0 - noise(uv * 4.0 - vec2(0.0, u_time / 2.0)), 5.0);
  // Dimmed well under the dot-grid original: it lit one cell in four, and a
  // continuous field reads stronger still than the same average broken into
  // dots, because the bright parts join up instead of being held apart by
  // black. Then pulled most of the way to grey — at full saturation the
  // unbroken field reads as a blue wash where the grid read as texture, and
  // what should be a cold drift behind glass becomes the card's colour.
  vec3 col = mix(vec3(0.0), vec3(0.2, 0.4, 1.0), lift) * 0.17;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 0.35);
  col = clamp(pow(col, vec3(1.0 / 2.2)), 0.0, 1.0);
  float a = max(col.r, max(col.g, col.b));
  outColor = vec4(col, a) * u_level;
}`;

/** Compiles the fullscreen-triangle program every shader here draws with. */
function buildProgram(gl: WebGL2RenderingContext, fragmentSource: string) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
    }
    return shader;
  };
  const program = gl.createProgram()!;
  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
  }
  // Flagged now, freed with the program; only the program is held onto.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  return {
    program,
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

function createAuroraRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    // The mirror reads this canvas between frames; the buffer must survive
    // compositing or every capture of the card would find it blank.
    preserveDrawingBuffer: true,
  });
  if (!gl || gl.isContextLost()) return null;

  const built = buildProgram(gl, AURORA_FRAGMENT);
  const uniform = (name: string) => gl.getUniformLocation(built.program, name);
  const locations = {
    res: uniform("u_res"),
    time: uniform("u_time"),
    level: uniform("u_level"),
  };

  return {
    draw(time: number, level: number) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(
        locations.res,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      );
      gl.uniform1f(locations.time, time);
      gl.uniform1f(locations.level, level);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: built.dispose,
  };
}

type WaterRenderer = {
  draw: (options: {
    source: HTMLCanvasElement;
    /**
     * Whether the source canvas holds pixels no texture does. Uploading the
     * card and rebuilding its mipmaps is the frame's biggest single cost, and
     * frames land at capture rate while this loop runs at display rate —
     * most iterations, the textures on the GPU are already right.
     */
    upload: boolean;
    rect: [number, number, number, number];
    card: [number, number, number, number];
    time: number;
    ripple: number;
    /** How far the newest frame has dissolved in over the one before, 0..1. */
    mixAmount: number;
    rings: Float32Array;
    ringCount: number;
  }) => void;
  dispose: () => void;
};

function createWaterRenderer(canvas: HTMLCanvasElement): WaterRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    // Lets anything outside (tests, drawImage) read the composited result.
    preserveDrawingBuffer: true,
  });
  if (!gl || gl.isContextLost()) return null;

  const built = buildProgram(gl, FRAGMENT);

  // Ping-ponged: a fresh frame is uploaded over the older of the two, which
  // then becomes the incoming side of the crossfade while the frame it
  // replaced-in-role fades out. Each remembers the sub-rect of the card
  // within it, since the capture's overhang differs frame to frame.
  const makeTexture = () => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  };
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const textures = [makeTexture(), makeTexture()];
  const rects: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [0, 0, 1, 1],
  ];
  let front = 0;

  const uniform = (name: string) => gl.getUniformLocation(built.program, name);
  const locations = {
    texA: uniform("u_texA"),
    texB: uniform("u_texB"),
    quad: uniform("u_quad"),
    card: uniform("u_card"),
    rectA: uniform("u_rectA"),
    rectB: uniform("u_rectB"),
    mix: uniform("u_mix"),
    time: uniform("u_time"),
    ripple: uniform("u_ripple"),
    rings: uniform("u_rings"),
    ringCount: uniform("u_ringCount"),
  };
  gl.uniform1i(locations.texA, 0);
  gl.uniform1i(locations.texB, 1);

  return {
    draw({
      source,
      upload,
      rect,
      card,
      time,
      ripple,
      mixAmount,
      rings,
      ringCount,
    }) {
      if (source.width === 0 || source.height === 0) return;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      if (upload) {
        front = 1 - front;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textures[front]);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source,
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        rects[front] = rect;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[1 - front]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures[front]);
      gl.uniform2f(locations.quad, canvas.clientWidth, canvas.clientHeight);
      gl.uniform4fv(locations.card, card);
      gl.uniform4fv(locations.rectA, rects[1 - front]);
      gl.uniform4fv(locations.rectB, rects[front]);
      gl.uniform1f(locations.mix, mixAmount);
      gl.uniform1f(locations.time, time);
      gl.uniform1f(locations.ripple, ripple);
      gl.uniform4fv(locations.rings, rings);
      gl.uniform1i(locations.ringCount, ringCount);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      // Free what this init created, but never loseContext(): the canvas
      // keeps handing back the same context, so losing it would poison
      // every re-init — and any relayout (zoom, resize) re-inits.
      for (const texture of textures) gl.deleteTexture(texture);
      built.dispose();
    },
  };
}

/**
 * The water canvas's CSS box for a card of a given size. Read by both the
 * layout and the render loop, which measure the card at different moments.
 */
function waterBox(geo: { width: number; height: number }) {
  return {
    width: geo.width + MARGIN * 2,
    height: Math.round(geo.height * 0.95 + GAP),
  };
}

/**
 * One layer of the glow, blurred into pixels rather than by CSS.
 *
 * The obvious spelling — a mirror with `filter: blur()` and `mix-blend-mode:
 * screen` — was most of the page's frame time: a blend needs the backdrop, so
 * the compositor cannot keep the blurred surface cached, and it re-ran the
 * full-resolution blur every frame anything beneath moved. The aurora moves
 * every frame. Scaling the element down and transforming back up bought
 * nothing either, because Chromium rasters a filtered surface at its final
 * on-screen scale.
 *
 * So the blur leaves the compositor: this subscribes to the card's shared
 * capture directly and draws each landed frame through `ctx.filter` into a
 * small canvas — paid once per frame at the bloom's own low rate, at a third
 * of the resolution, instead of once per composited frame at full. What the
 * compositor is left to blend is an ordinary unfiltered layer, which it does
 * cheaply. A blur upscaled is the same blur; light has no resolution to lose.
 */
function BloomLayer({
  source,
  layer,
  opacity,
  geo,
  index,
}: {
  source: React.RefObject<HTMLDivElement | null>;
  layer: (typeof BLOOM)[number];
  opacity: number;
  geo: { left: number; top: number; width: number; height: number };
  index: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // Room for the blur's spill, in CSS pixels: a Gaussian at radius r is done
  // by ~1.5r out.
  const pad = layer.blur * 1.5;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Feature-probe rather than assume: Safari still ignores ctx.filter.
    ctx.filter = "blur(1px)";
    const filterable = ctx.filter !== "none";
    ctx.filter = "none";

    const subscription = subscribeToSource({
      resolve: () => source.current,
      // The card's own rate, not a slower one. A soft glow looks like it could
      // be sampled sparsely, but it is a large area over a black void, and the
      // aurora keeps changing its colour: at a slower rate the whole wash
      // steps in brightness a few times a second, which reads as a flicker
      // even when each step is under a percent. What made a slow rate look
      // worth it was the CSS blur it used to re-run; drawn into a small canvas
      // instead, a frame here is one filtered drawImage.
      fps: FPS,
      delay: layer.lag,
      // What this layer would want if it were alone. The shared capture is
      // taken at the highest any mirror of the card asks for, so in practice
      // the water's ratio wins and the frame arrives finer than this — which
      // the draw below handles by scaling from the frame's own ratio.
      pixelRatio: BLOOM_RES,
      isActive: () => true,
      onFrame(bitmap, _w, _h, geometry) {
        const width = Math.max(
          1,
          Math.round((geometry.layoutWidth + pad * 2) * BLOOM_RES),
        );
        const height = Math.max(
          1,
          Math.round((geometry.layoutHeight + pad * 2) * BLOOM_RES),
        );
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.clearRect(0, 0, width, height);
        const x = (pad + geometry.originX + geometry.translateX) * BLOOM_RES;
        const y = (pad + geometry.originY + geometry.translateY) * BLOOM_RES;
        const w = (bitmap.width / geometry.pixelRatio) * BLOOM_RES;
        const h = (bitmap.height / geometry.pixelRatio) * BLOOM_RES;
        if (filterable) {
          ctx.filter = `blur(${layer.blur * BLOOM_RES}px) saturate(2.4) brightness(1.35)`;
          ctx.drawImage(bitmap, x, y, w, h);
          ctx.filter = "none";
        } else {
          // No ctx.filter: crush the frame to blur-sized cells and let the
          // smoothing on the way back up stand in for the Gaussian.
          const cells = Math.max(
            2,
            Math.round(width / (layer.blur * BLOOM_RES)),
          );
          const scratch = document.createElement("canvas");
          scratch.width = cells;
          scratch.height = Math.max(
            2,
            Math.round(cells * (height / Math.max(1, width))),
          );
          const sctx = scratch.getContext("2d");
          if (!sctx) return;
          sctx.drawImage(
            bitmap,
            (x / width) * cells,
            (y / height) * scratch.height,
            (w / width) * cells,
            (h / height) * scratch.height,
          );
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(scratch, 0, 0, width, height);
        }
      },
    });
    return () => subscription.release();
  }, [source, layer, pad]);

  return (
    <div
      data-bloom={index}
      className="pointer-events-none absolute z-10"
      style={{
        left: geo.left - pad,
        top: geo.top - pad,
        width: geo.width + pad * 2,
        height: geo.height + pad * 2,
        transform: `scale(${layer.sx}, ${layer.sy})`,
        mixBlendMode: "screen",
        opacity,
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default function GlassFloorPage() {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  /** The unseen mirror whose canvas becomes the water's texture. */
  const feedRef = React.useRef<HTMLSpanElement>(null);
  const waterRef = React.useRef<HTMLCanvasElement>(null);
  const [glow, setGlow] = React.useState(35);
  const [frost, setFrost] = React.useState(84);
  const [ripple, setRipple] = React.useState(35);
  // Full: under the glass, the card's tint and blur take most of it before it
  // reaches the eye.
  const [aurora, setAurora] = React.useState(100);
  /**
   * The card's width in CSS pixels. Everything else on the page is measured
   * from the card rather than set alongside it, so this is the only number
   * that has to move: the bloom, the water canvas and the shader's card
   * uniform all follow from the measurement.
   */
  const [width, setWidth] = React.useState(440);
  const auroraRef = React.useRef<HTMLCanvasElement>(null);
  const [geo, setGeo] = React.useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [email, setEmail] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "loading" | "done">("idle");
  // The water shows the reflection at 1:1, so unlike the blooms its feed has
  // to be captured at the display's own density or the waterline turns to mush.
  const [feedRatio, setFeedRatio] = React.useState(1);
  React.useEffect(() => {
    setFeedRatio(Math.min(window.devicePixelRatio || 1, 2));
  }, []);
  const stats = useCaptureStats();

  const live = React.useRef({ ripple, aurora, geo, rings: [] as number[] });
  React.useEffect(() => {
    live.current.ripple = ripple;
  }, [ripple]);
  React.useEffect(() => {
    live.current.aurora = aurora;
  }, [aurora]);
  // The render loop reads the card's box from here rather than from a
  // dependency, so resizing the card resizes the water in place instead of
  // tearing down a WebGL renderer and recompiling its shader per slider step.
  React.useEffect(() => {
    live.current.geo = geo;
  }, [geo]);

  // The aurora under the glass. The canvas only exists while the level is
  // non-zero: a canvas in the source reads as live content and keeps the
  // capture loop running, so an aurora turned off has to actually leave.
  const auroraOn = aurora > 0;
  React.useEffect(() => {
    const canvas = auroraRef.current;
    if (!canvas) return;
    const renderer = createAuroraRenderer(canvas);
    if (!renderer) return;
    // Deliberately far below the display's density: see AURORA_RES.
    const dpr = AURORA_RES;
    // Measured from the wrapper, never from the canvas: a canvas is a replaced
    // element, so its `auto` size comes from its width/height attributes
    // rather than from its insets. Sizing it against itself would feed each
    // write back into layout and run away.
    const box = canvas.parentElement!;
    const size = () => {
      const rect = box.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(box);
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Paced to the capture rate rather than the display's: the mirror only
      // picks the aurora up FPS times a second, so on a fast display most
      // draws would drift unseen between captures. Half a frame of slack so
      // a tick landing just early still counts as on time.
      if (now - last < 1000 / FPS - 8) return;
      last = now;
      renderer.draw(now / 1000, live.current.aurora / 100);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      renderer.dispose();
    };
  }, [auroraOn]);

  React.useEffect(() => {
    const stage = stageRef.current;
    const card = cardRef.current;
    if (!stage || !card) return;
    const measure = () => {
      const s = stage.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      setGeo({
        left: c.left - s.left,
        top: c.top - s.top,
        width: c.width,
        height: c.height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const surface = geo.top + geo.height + GAP;
  const { width: waterWidth, height: waterHeight } = waterBox(geo);

  // When the user last touched the card. The crossfade below is for ambient
  // motion — the aurora drifting between captures — but a frame carrying a
  // focus ring or a keystroke is an answer, and easing an answer in reads as
  // lag. The render loop snaps any frame landing soon after one of these, and
  // the mirrors run at BURST_FPS for the same window (see the constant): the
  // fps grid is most of the distance between a double-click and its highlight
  // reaching the water. A ref and a rate function rather than state, very
  // deliberately: noting the interaction must itself cost nothing — a
  // re-render or re-subscription here would spend the main thread right as
  // the interaction's own events (the second click of a double-click) need
  // it. The raised rate takes effect when the change's own selectionchange or
  // mutation kicks the loop, which is the first moment it has anything to buy.
  const interactedAt = React.useRef(0);
  const burstRate = React.useCallback(
    () =>
      performance.now() - interactedAt.current < BURST_MS ? BURST_FPS : FPS,
    [],
  );
  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const note = () => {
      interactedAt.current = performance.now();
    };
    const types = ["focusin", "focusout", "pointerdown", "keydown", "input"];
    for (const type of types) card.addEventListener(type, note, true);
    return () => {
      for (const type of types) card.removeEventListener(type, note, true);
    };
  }, []);

  // Raised by a shadow subscriber whenever a frame of the card lands, so the
  // render loop knows the one iteration where re-uploading the texture buys
  // anything. It rides the same shared capture as the feed mirror — same
  // element, same clock — so it costs no captures of its own.
  const textureFresh = React.useRef(false);
  React.useEffect(() => {
    const subscription = subscribeToSource({
      resolve: () => cardRef.current,
      // A getter because the loop reads fps every cycle: this subscriber has
      // to be due as often as the bursting feed, or frames the feed shows
      // would reach the water only at the idle rate.
      get fps() {
        return burstRate();
      },
      delay: 0,
      // This one never reads the bitmap, only the fact that one arrived, so it
      // asks for the least it can and lets the mirrors that do read it decide.
      pixelRatio: BLOOM_RES,
      isActive: () => true,
      onFrame: () => {
        textureFresh.current = true;
      },
    });
    return () => subscription.release();
  }, [burstRate]);

  // The render loop: the feed mirror's canvas goes up as a texture and the
  // shader redraws the water, dissolving each new frame in over the last so
  // the reflection moves at display rate while captures land at theirs. The
  // card's sub-rect within that canvas moves as the capture's overhang grows
  // and shrinks, so it is read back from the two client rects rather than
  // assumed — but only on frames that landed one, since that is the only time
  // it can have moved. Frames where nothing can have changed — no new
  // capture, no fade mid-flight, ripple at zero, no live rings — draw nothing
  // at all, with one settling draw after motion ends so the water is left
  // flat rather than frozen mid-wave.
  const waterReady = geo.width > 0;
  React.useEffect(() => {
    const water = waterRef.current;
    const feed = feedRef.current;
    if (!water || !feed || !waterReady) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = createWaterRenderer(water);
    if (!renderer) return;

    const rings = new Float32Array(8 * 4);
    let uploaded = false;
    let settled = false;
    let rect: [number, number, number, number] = [0, 0, 1, 1];
    // The crossfade between the two newest frames (see the fragment shader):
    // each fresh frame starts a dissolve sized to the gap it arrived by, so
    // the fade tends to finish right as the next frame lands and the
    // reflection moves continuously at whatever rate captures come.
    let landedAt = 0;
    let fadeStart = 0;
    let fadeMs = 0;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const source = feed.querySelector("canvas");
      if (!source) return;
      const nowMs = performance.now();
      const now = nowMs / 1000;
      const state = live.current;
      // Three seconds outlives every ring's visible life; of what survives,
      // the newest eight ride along to the shader.
      const kept: number[] = [];
      for (let i = 0; i + 3 < state.rings.length; i += 4) {
        if (now - state.rings[i + 2] < 3) {
          kept.push(...state.rings.slice(i, i + 4));
        }
      }
      state.rings = kept;

      const fresh = textureFresh.current && source.width > 0;
      if (fresh) {
        // The first frame appears outright — there is nothing to fade from.
        fadeMs = landedAt ? Math.min(Math.max(nowMs - landedAt, 50), 180) : 0;
        // A frame arriving on the heels of an interaction is carrying its
        // result — a focus ring, a double-click's highlight — and is shown
        // outright: even a 40ms ease on an answer read as lag, and the burst
        // rate has frames arriving too often to be worth blending anyway. The
        // window is generous because the frame lags the event by the whole
        // pipeline: the capture's turn, the capture, the raster.
        if (nowMs - interactedAt.current < BURST_MS) fadeMs = 0;
        fadeStart = nowMs;
        landedAt = nowMs;
      }
      const mixAmount =
        fadeMs > 0 ? Math.min(1, (nowMs - fadeStart) / fadeMs) : 1;
      const animating = state.ripple > 0 || kept.length > 0 || mixAmount < 1;
      // Nothing to show until the first capture lands a texture.
      if (!uploaded && !fresh) return;

      // The card can be resized under us. Reallocating the drawing buffer
      // blanks it, so a resize always owes a draw even when nothing moved.
      const box = waterBox(state.geo);
      const bufferWidth = Math.round(box.width * dpr);
      const bufferHeight = Math.round(box.height * dpr);
      const resized =
        water.width !== bufferWidth || water.height !== bufferHeight;
      if (resized) {
        water.width = bufferWidth;
        water.height = bufferHeight;
      }

      if (!fresh && !animating && !resized && settled) return;
      settled = !fresh && !animating;
      textureFresh.current = false;
      uploaded = true;

      const newest = kept.slice(-8 * 4);
      const ringCount = newest.length / 4;
      rings.set(newest);

      if (fresh || resized) {
        const feedRect = feed.getBoundingClientRect();
        const sourceRect = source.getBoundingClientRect();
        rect = [
          (feedRect.left - sourceRect.left) / sourceRect.width,
          (feedRect.top - sourceRect.top) / sourceRect.height,
          feedRect.width / sourceRect.width,
          feedRect.height / sourceRect.height,
        ];
      }
      renderer.draw({
        source,
        upload: fresh,
        rect,
        // The card hovers GAP above the water, so its image starts GAP below
        // the waterline: flip geometry, not taste.
        card: [MARGIN, GAP, state.geo.width, state.geo.height],
        time: now,
        ripple: state.ripple / 100,
        mixAmount,
        rings,
        ringCount,
      });
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      renderer.dispose();
    };
  }, [waterReady]);

  const addRing = (x: number, y: number, amplitude: number) => {
    const rings = live.current.rings;
    rings.push(x, y, performance.now() / 1000, amplitude);
    if (rings.length > 8 * 4) rings.splice(0, rings.length - 8 * 4);
  };

  /** A click on the water itself: a ring right where it lands. */
  const splash = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || geo.width === 0) return;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left - (geo.left - MARGIN);
    const y = event.clientY - rect.top - surface;
    if (y < -GAP) return;
    addRing(x, Math.max(0, y), 16);
  };

  /**
   * The water reacting to the card: a viewport point on the card, carried
   * through the flip to where its image lies in the water. Near the card's
   * bottom edge lands at the waterline; typing in a field high on the card
   * stirs the deep water.
   */
  const rippleFromCard = (
    clientX: number,
    clientY: number,
    amplitude: number,
  ) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    addRing(
      clientX - rect.left + MARGIN,
      GAP + (rect.height - (clientY - rect.top)),
      amplitude,
    );
  };

  const rippleFromElement = (element: Element, amplitude: number) => {
    const rect = element.getBoundingClientRect();
    rippleFromCard(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      amplitude,
    );
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (phase !== "idle") return;
    setPhase("loading");
    window.setTimeout(() => {
      setPhase("done");
      // The card changed on its own — the water should notice that too.
      const button = cardRef.current?.querySelector('button[type="submit"]');
      if (button) rippleFromElement(button, 12);
    }, 1200);
    window.setTimeout(() => setPhase("idle"), 3400);
  };

  return (
    <div className="dark flex h-dvh flex-col overflow-hidden bg-black text-zinc-100">
      <header className="pointer-events-none absolute top-0 right-0 left-0 z-30 flex items-baseline justify-between px-6 pt-5">
        <h1 className="font-heading text-sm font-medium tracking-tight">
          Glass floor
        </h1>
        <p className="max-w-md text-right text-xs text-pretty text-zinc-500">
          The glow is the card, mirrored and blurred. The water is the card
          again — a mirror fed to a shader. Whatever you do to the card lands in
          the water where its image lives.
        </p>
      </header>

      <div
        ref={stageRef}
        onPointerDown={splash}
        className="relative flex-1 overflow-hidden bg-black"
      >
        {geo.width > 0 ? (
          <>
            {/* Unmounted rather than dimmed at zero: an invisible bloom
                still blits every frame and still re-runs its blur, so
                "unlit" should actually cost nothing. */}
            {glow > 0 &&
              BLOOM.map((layer, index) => (
                <BloomLayer
                  key={index}
                  index={index}
                  source={cardRef}
                  layer={layer}
                  geo={geo}
                  opacity={layer.opacity * (glow / 100)}
                />
              ))}

            {/* The water's texture feed: a live mirror nobody sees directly. */}
            <ElementMirror
              ref={feedRef}
              source={cardRef}
              fps={burstRate}
              pixelRatio={feedRatio}
              className="pointer-events-none absolute"
              style={{
                left: geo.left,
                top: surface,
                opacity: 0,
              }}
            />
            <canvas
              ref={waterRef}
              data-reflection
              className="pointer-events-none absolute z-10"
              style={{
                left: geo.left - MARGIN,
                top: surface,
                width: waterWidth,
                height: waterHeight,
              }}
            />
          </>
        ) : null}

        <div
          className="absolute top-[15%] left-1/2 z-20 -translate-x-1/2 rounded-[26px]"
          // The drop shadow lives on this wrapper, outside the mirrored
          // element, and this is a performance decision rather than a styling
          // one. The capture widens for every pixel of ink the card paints
          // past its box, and 90px of blur falling 60px down is ~110px of ink
          // — which the mirror's power-of-two canvas growth then rounded up to
          // 192px of room on every side. That nearly quadrupled the pixel area
          // of the capture bitmap, and every pixel of it is paid again at each
          // step: the SVG raster, the feed blit, the texture upload, the bloom
          // draws. Painted here it looks identical and costs the pipeline
          // nothing. (Inset shadows stay on the card: they paint inside.)
          style={{ boxShadow: "0 60px 90px -40px rgba(0,0,0,0.95)" }}
        >
          {/* The thick beveled glass rim, with the card proper inside it. */}
          <div
            ref={cardRef}
            className={`${instrumentSans.className} relative rounded-[26px] p-1.5 backdrop-blur-[14px]`}
            style={{
              width,
              backgroundImage:
                "linear-gradient(165deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.05) 26%, rgba(255,255,255,0.015) 60%, rgba(255,255,255,0.16) 100%)",
              boxShadow:
                "inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -1px 1px rgba(255,255,255,0.18)",
            }}
          >
            {/* Caustic corner glints, hanging past the rim. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-4.5 -left-4.5 size-22.5 rounded-full blur-[10px]"
              style={{
                background:
                  "radial-gradient(circle, rgba(224,231,255,0.5), transparent 62%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-3.5 -bottom-3.5 size-17.5 rounded-full blur-[10px]"
              style={{
                background:
                  "radial-gradient(circle, rgba(199,210,254,0.32), transparent 64%)",
              }}
            />

            {/* The bevel's own surface, under everything: the frame catches
                the drift full strength, while the card body over it shows
                only what its tint lets through. The wrapper owns the box, so
                the canvas can stretch to it in percentages. */}
            {auroraOn ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]"
              >
                {/* Bare: the canvas renders at a quarter of its displayed
                    size (see AURORA_RES) and the browser's upscale is all the
                    softening a smooth field needs. */}
                <canvas ref={auroraRef} className="block h-full w-full" />
              </div>
            ) : null}

            <div
              className="relative flex flex-col gap-5.5 rounded-[20px] px-7.5 pt-8 pb-6.5 backdrop-blur-xl backdrop-saturate-150"
              style={{
                backgroundColor: `rgba(8,8,13,${(frost / 100).toFixed(3)})`,
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 10px rgba(0,0,0,0.6)",
              }}
            >
              <div className="flex flex-col gap-2.5">
                <h2
                  className="m-0 bg-clip-text text-[27px] leading-[1.15] font-semibold tracking-tight text-transparent text-pretty"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, #fff 28%, #a8a8bd)",
                  }}
                >
                  Slop digest
                </h2>
                <p
                  className="m-0 text-sm leading-[1.55] text-pretty"
                  style={{ color: "rgba(255,255,255,0.48)" }}
                >
                  More spam for your inbox.
                </p>
              </div>

              {/* One field with the button sitting inside it. The well's
                  border, inset shadow and focus ring belong to the form, so
                  the ring draws around the pair; the input keeps its own left
                  padding, which is what the caret measurement reads. */}
              {/* relative: the TextCaret positions itself against the
                  nearest positioned ancestor it shares with the input. */}
              <form
                className="relative flex items-center gap-2 rounded-[18px] border border-white/10 bg-white/3 p-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-180 focus-within:border-[rgba(199,210,254,0.6)] focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.45),0_0_0_3px_rgba(165,180,252,0.14)]"
                onSubmit={submit}
              >
                {/* type="text" rather than "email": the selection API — and
                    with it the mirror's selection capture — only applies to
                    text/search/url/tel/password inputs. An email input paints
                    a highlight the platform refuses to report (selectionStart
                    is null even mid-selection), so the reflection could never
                    show it. inputMode keeps the email keyboard on touch. */}
                <input
                  ref={emailRef}
                  // id="email"
                  type="text"
                  // inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@studio.com"
                  aria-label="Email address"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    const caret = caretViewportPoint(event.target);
                    if (caret) rippleFromCard(caret.x, caret.y, 6);
                  }}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2.5 pl-3 text-sm text-white outline-none placeholder:text-white/30"
                />
                {/* A DOM caret in place of the painted native one, so the
                    reflection carries it — blink and all. Styled to match
                    the focus ring's indigo. */}
                <TextCaret
                  input={emailRef}
                  style={{
                    width: 2,
                    borderRadius: 1,
                    background: "#c7d2fe",
                    boxShadow: "0 0 7px rgba(165,180,252,0.85)",
                  }}
                />
                <button
                  type="submit"
                  disabled={phase !== "idle"}
                  className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 px-4.5 py-2.5 text-sm font-semibold shadow-[inset_0_-1px_0_rgba(0,0,0,0.14),0_10px_26px_-12px_rgba(200,210,255,0.6)] transition-[transform,box-shadow] duration-160 hover:shadow-[inset_0_-1px_0_rgba(0,0,0,0.14),0_16px_32px_-12px_rgba(200,210,255,0.8)] disabled:pointer-events-none"
                  style={{
                    color: "#0b0b12",
                    backgroundImage:
                      "linear-gradient(180deg, #ffffff, #ccd0e6)",
                  }}
                >
                  {phase === "loading" ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />{" "}
                      Subscribing…
                    </>
                  ) : phase === "done" ? (
                    <>
                      <CheckIcon className="size-4" /> Subscribed
                    </>
                  ) : (
                    "Subscribe"
                  )}
                </button>
              </form>

              <div
                className="flex items-center justify-between border-t border-white/6 pt-3.5 text-xs"
                style={{ color: "rgba(255,255,255,0.36)" }}
              >
                <span>9,400 readers</span>
                {/* Colour inherited from the row, so both halves match. */}
                <span className={jetbrainsMono.className}>
                  unsubscribe anytime
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="z-30 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-white/10 bg-black px-6 py-5">
        <div className="w-40 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="width" className="text-xs text-zinc-400">
              width
            </Label>
            <span className="font-mono text-xs text-zinc-500">{width}px</span>
          </div>
          <Slider
            id="width"
            min={320}
            max={640}
            step={8}
            value={[width]}
            onValueChange={([value]) => setWidth(value)}
          />
        </div>

        <div className="w-40 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="glow" className="text-xs text-zinc-400">
              glow
            </Label>
            <span className="font-mono text-xs text-zinc-500">
              {glow === 0 ? "unlit" : `${glow}%`}
            </span>
          </div>
          <Slider
            id="glow"
            min={0}
            max={100}
            step={5}
            value={[glow]}
            onValueChange={([value]) => setGlow(value)}
          />
        </div>

        <div className="w-40 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="frost" className="text-xs text-zinc-400">
              frost
            </Label>
            <span className="font-mono text-xs text-zinc-500">
              {frost === 0 ? "clear glass" : `${frost}%`}
            </span>
          </div>
          <Slider
            id="frost"
            min={0}
            max={100}
            step={4}
            value={[frost]}
            onValueChange={([value]) => setFrost(value)}
          />
        </div>

        <div className="w-40 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="ripple" className="text-xs text-zinc-400">
              ripple
            </Label>
            <span className="font-mono text-xs text-zinc-500">
              {ripple === 0 ? "still water" : `${ripple}%`}
            </span>
          </div>
          <Slider
            id="ripple"
            min={0}
            max={100}
            step={5}
            value={[ripple]}
            onValueChange={([value]) => setRipple(value)}
          />
        </div>

        <div className="w-40 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="aurora" className="text-xs text-zinc-400">
              aurora
            </Label>
            <span className="font-mono text-xs text-zinc-500">
              {aurora === 0 ? "off" : `${aurora}%`}
            </span>
          </div>
          <Slider
            id="aurora"
            min={0}
            max={100}
            step={5}
            value={[aurora]}
            onValueChange={([value]) => setAurora(value)}
          />
        </div>

        <p className="ml-auto font-mono text-xs text-zinc-600">
          {stats.mirrors} mirrors · {stats.capturesPerSecond} cap/s ·{" "}
          {stats.blitsPerSecond} blit/s · {stats.mainThreadPercent}% thread
        </p>
      </footer>
    </div>
  );
}
