export const auraVertexShader = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const auraFragmentShader = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_scroll;
uniform float u_energy;
uniform float u_warmth;
uniform vec2 u_pointer;
uniform vec2 u_velocity;
uniform float u_activity;
uniform vec3 u_colours[4];
uniform vec3 u_trails[12];

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 rotation = mat2(0.82, -0.57, 0.57, 0.82);
  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * noise(point);
    point = rotation * point * 2.03 + vec2(13.7, 8.2);
    amplitude *= 0.49;
  }
  return value;
}

vec3 trailColour(int index) {
  if (index == 0 || index == 4 || index == 8) return u_colours[2];
  if (index == 1 || index == 5 || index == 9) return u_colours[1];
  if (index == 2 || index == 6 || index == 10) return u_colours[0];
  return u_colours[3];
}

float ribbon(vec2 point, float centre, float width, float drift, float scale) {
  float displacement = (fbm(vec2(point.x * scale + drift, point.y * 0.72 - drift * 0.31)) - 0.5) * 0.34;
  displacement += sin(point.x * 2.4 + drift * 1.7) * 0.028;
  float distanceToBand = abs(point.y - centre - displacement);
  return exp(-pow(distanceToBand / width, 2.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 point = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  point.y += u_scroll * 0.055;

  vec2 pointer = vec2((u_pointer.x - 0.5) * aspect, u_pointer.y - 0.5);
  vec2 velocity = vec2(u_velocity.x * aspect, u_velocity.y);
  float velocityLength = length(velocity);
  vec2 direction = velocityLength > 0.0001 ? velocity / velocityLength : vec2(1.0, 0.0);
  vec2 perpendicular = vec2(-direction.y, direction.x);
  vec2 relation = point - pointer;
  float pointerField = exp(-dot(relation, relation) * 18.0) * u_activity;
  float wake = exp(-dot(relation + direction * 0.10, relation + direction * 0.10) * 23.0);
  wake *= smoothstep(0.12, -0.18, dot(relation, direction)) * u_activity;
  float peacefulStrength = min(velocityLength * 5.5, 1.0);
  point += direction * pointerField * (0.008 + peacefulStrength * 0.015);
  point += perpendicular * (pointerField + wake * 0.7) * (0.007 + peacefulStrength * 0.021);

  vec3 plume = vec3(0.0);
  float plumeMask = 0.0;
  for (int index = 0; index < 12; index++) {
    vec3 trail = u_trails[index];
    vec2 trailPoint = vec2((trail.x - 0.5) * aspect, trail.y - 0.5);
    vec2 delta = point - trailPoint;
    float gaussian = exp(-dot(delta, delta) * 31.0) * trail.z;
    float filaments = 0.72 + 0.28 * sin((delta.x - delta.y) * 48.0 + float(index) * 1.91 + u_time * 0.055);
    float curl = gaussian * (0.0025 + trail.z * 0.006);
    point += vec2(-delta.y, delta.x) * curl;
    plume += trailColour(index) * gaussian * filaments;
    plumeMask += gaussian;
  }

  float slowTime = u_time * 0.018;
  float low = ribbon(point, -0.25, 0.20, slowTime * 0.71, 1.24);
  float middle = ribbon(point, 0.01, 0.17, -slowTime * 0.53 + 11.0, 1.48);
  float high = ribbon(point, 0.26, 0.18, slowTime * 0.39 + 23.0, 1.13);

  float dye = fbm(point * vec2(1.35, 2.1) + vec2(slowTime * 0.21, -slowTime * 0.13));
  vec3 aurora = u_colours[0] * low * (0.42 + dye * 0.58);
  aurora += u_colours[1] * middle * (0.38 + (1.0 - dye) * 0.62);
  aurora += u_colours[2] * high * (0.40 + dye * 0.60);
  aurora += u_colours[3] * (low * high + middle * 0.16) * 0.34;

  vec3 warmTint = vec3(0.86, 0.40, 0.43);
  aurora = mix(aurora, aurora * 0.72 + warmTint * length(aurora) * 0.43, u_warmth * 0.34);
  aurora += plume * (0.12 + u_energy * 0.15);

  float horizontalFade = smoothstep(0.0, 0.12, uv.x) * smoothstep(0.0, 0.12, 1.0 - uv.x);
  float verticalFade = smoothstep(0.0, 0.10, uv.y) * smoothstep(0.0, 0.10, 1.0 - uv.y);
  float edgeFade = horizontalFade * verticalFade;
  float grain = (hash21(gl_FragCoord.xy + floor(u_time * 3.0)) - 0.5) * 0.018;
  float alpha = clamp((low + middle + high) * 0.38 + plumeMask * 0.045, 0.0, 0.86);
  vec3 colour = max(vec3(0.0), aurora * (0.62 + u_energy * 0.68) + grain);

  gl_FragColor = vec4(colour * edgeFade, alpha * edgeFade);
}
`;
