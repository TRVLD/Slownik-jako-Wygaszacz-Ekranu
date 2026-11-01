
export const COMMON_DECLARATIONS = `
uniform float time;
uniform vec2 resolution;
uniform vec2 origin;
uniform float darken;

float wz_hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float wz_noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = wz_hash(i);
    float b = wz_hash(i + vec2(1.0, 0.0));
    float c = wz_hash(i + vec2(0.0, 1.0));
    float d = wz_hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float wz_fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        v += amp * wz_noise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        amp *= 0.5;
    }
    return v;
}

vec3 wz_finish(vec3 col, vec2 tc) {
    // Delikatne przyciemnienie środka (czytelność tekstu) i winieta.
    vec2 q = (tc - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    col *= 1.0 - darken * exp(-dot(q, q) * 5.0);
    float v = length((tc - 0.5) * vec2(1.25, 1.0));
    col *= mix(1.0, 0.62, smoothstep(0.35, 0.95, v));
    // Dithering przeciw prążkowaniu gradientów.
    col += (wz_hash(tc * resolution + fract(time) * 61.0) - 0.5) / 255.0;
    return clamp(col, 0.0, 1.0);
}
`;

export const AURORA_CODE = `
vec2 tc = cogl_tex_coord_in[0].xy;
float t = time;
float x = (tc.x * resolution.x + origin.x) / resolution.y;
float y = tc.y;

// Nocne niebo.
vec3 col = mix(vec3(0.004, 0.008, 0.030), vec3(0.020, 0.055, 0.085),
               smoothstep(0.0, 1.0, y));

// Gwiazdy z lekkim migotaniem. Niebo powoli obraca się w bok (ok. 1/3
// wysokości ekranu na 10 minut), a każda gwiazda dodatkowo leniwie krąży
// wokół swojego miejsca, więc z czasem układ gwiazd nieco się zmienia.
vec2 sp = vec2(x + t * 0.00055, y + 0.004 * sin(t * 0.011)) * 140.0;
vec2 sid = floor(sp);
float sh = wz_hash(sid);
float sw = 6.2832 * wz_hash(sid + 11.3);
vec2 wander = 0.12 * vec2(sin(t * (0.05 + 0.07 * sh) + sw), cos(t * (0.04 + 0.06 * sh) + sw * 1.7));
vec2 so = fract(sp) - 0.5 - (vec2(wz_hash(sid + 3.1), wz_hash(sid + 7.7)) - 0.5) * 0.3 - wander;
float star = step(0.9955, sh) * smoothstep(0.16, 0.0, length(so));
star *= 0.55 + 0.45 * sin(t * (0.8 + sh * 2.0) + sh * 50.0);
col += star * vec3(0.75, 0.85, 1.0) * (1.0 - smoothstep(0.55, 0.85, y));

// Zorza: trzy falujące, pofałdowane kurtyny z pionowymi promieniami,
// pojawiające się płatami w różnych częściach nieba.
for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float base = 0.33 + 0.11 * fi
        + 0.10 * sin(x * (1.05 + 0.35 * fi) + t * (0.050 + 0.020 * fi) + fi * 2.0)
        + 0.045 * sin(x * (2.9 + fi) - t * 0.07 + fi * 4.1)
        + 0.10 * (wz_fbm(vec2(x * 1.2 + fi * 7.3, t * 0.04 + fi)) - 0.5);
    float d = base - y;                       // > 0 nad dolną krawędzią
    float edge = smoothstep(-0.006, 0.014, d);
    float fall = exp(-max(d, 0.0) * (6.0 + 2.5 * fi));
    float below = exp(-max(-d, 0.0) * 30.0) * (1.0 - edge) * 0.22;
    float xr = x + 0.025 * sin(y * 9.0 + t * 0.12 + fi);
    float rays = wz_noise(vec2(xr * 52.0 + fi * 13.0, t * 0.30 + fi * 4.0));
    rays = 0.35 + 0.65 * rays * rays;
    rays *= 0.6 + 0.4 * wz_noise(vec2(xr * 9.0 - t * 0.05, fi * 3.0 + t * 0.03));
    float blot = 0.2 + 0.8 * smoothstep(0.22, 0.56, wz_fbm(vec2(x * 0.42 + fi * 5.0 - t * 0.012, fi * 2.7 + t * 0.008)));
    float pulse = 0.75 + 0.25 * sin(t * 0.23 + x * 1.7 + fi * 1.9);
    float a = (edge * fall * rays + below) * blot * pulse * (1.0 - 0.2 * fi);
    vec3 green = mix(vec3(0.12, 1.00, 0.52), vec3(0.06, 0.90, 0.78), fi * 0.5);
    vec3 c = mix(green, vec3(0.62, 0.30, 0.98), smoothstep(0.04, 0.32, d));
    c = mix(mix(c, vec3(0.95, 0.40, 0.60), 0.45), c, smoothstep(-0.02, 0.012, d)); // różowy rąbek
    col += c * a * 1.05;
}

// Poświata nad horyzontem.
col += vec3(0.02, 0.10, 0.07) * smoothstep(0.55, 0.95, y) * 0.6;

// Sylwetka gór.
float ridge = 0.86 + 0.055 * wz_fbm(vec2(x * 1.6 + 3.0, 1.7)) + 0.02 * sin(x * 3.1);
float m = smoothstep(ridge - 0.002, ridge + 0.002, y);
col = mix(col, vec3(0.006, 0.012, 0.018) + col * 0.08, m);

cogl_color_out = vec4(wz_finish(col, tc), 1.0);
`;

export const OCEAN_CODE = `
vec2 tc = cogl_tex_coord_in[0].xy;
float t = time;
float x = (tc.x * resolution.x + origin.x) / resolution.y;
float y = tc.y;

// Głębia: jaśniej przy powierzchni, granat w dole.
float depth = pow(y, 0.85);
vec3 col = mix(vec3(0.030, 0.300, 0.420), vec3(0.000, 0.025, 0.075), depth);

// Snopy światła spod powierzchni.
float sx = 0.85 + 0.25 * sin(t * 0.03);
vec2 rd = vec2(x - sx, y + 0.45);
float ang = atan(rd.x, rd.y);
float shafts = 0.0;
shafts += sin(ang * 23.0 + t * 0.21);
shafts += sin(ang * 37.0 - t * 0.17 + 1.3);
shafts += sin(ang * 13.0 + t * 0.11 + 2.1);
shafts = smoothstep(0.6, 2.6, shafts + 1.2 * wz_noise(vec2(ang * 9.0, t * 0.1)));
col += vec3(0.25, 0.55, 0.65) * shafts * (1.0 - smoothstep(0.0, 0.85, y)) * 0.32;

// Kaustyki: jasna siateczka tam, gdzie dwa pola szumu się przecinają.
vec2 p = vec2(x, y * 0.7) * 9.0;
float n1 = wz_noise(p + vec2(t * 0.16, t * 0.10)) + 0.5 * wz_noise(p * 2.1 - vec2(t * 0.13, 0.0));
float n2 = wz_noise(p * 1.13 + vec2(-t * 0.12, t * 0.14) + 5.2) + 0.5 * wz_noise(p * 2.3 + vec2(0.0, t * 0.17) + 9.1);
float web = smoothstep(0.10, 0.0, abs(n1 - n2));
web *= 0.5 + 0.5 * wz_noise(p * 0.35 + t * 0.05);
col += vec3(0.40, 0.80, 0.88) * web * (1.0 - smoothstep(0.0, 0.6, y)) * 0.22;

// Unoszące się drobinki.
for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float sc = 18.0 + fi * 11.0;
    vec2 q = vec2(x + sin(t * 0.05 + fi) * 0.05, y + t * (0.006 + fi * 0.004)) * sc;
    vec2 id = floor(q);
    float h = wz_hash(id + fi * 31.0);
    vec2 o = fract(q) - 0.5 - (vec2(wz_hash(id + 2.3), wz_hash(id + 5.9)) - 0.5) * 0.6;
    float mote = step(0.93, h) * smoothstep(0.12, 0.0, length(o));
    col += vec3(0.55, 0.85, 0.95) * mote * (0.25 + 0.2 * sin(t + h * 40.0)) * (1.0 - 0.5 * y);
}

cogl_color_out = vec4(wz_finish(col, tc), 1.0);
`;

export const WROCLAW_DECLARATIONS = `
uniform vec4 u_base;
uniform vec4 u_target;
uniform vec4 u_prog;
uniform vec4 u_seed;
`;

export const WROCLAW_CODE = `
vec2 tc = cogl_tex_coord_in[0].xy;
vec2 px = tc * resolution;
float aspect = resolution.x / resolution.y;

// Granice ćwiartek nieregularne, jak styk dwóch farb na płótnie.
// Do tego „palce” włosia pędzla wchodzące jednym kolorem w drugi.
float bx = 0.5 + 0.026 * (wz_fbm(vec2(tc.y * 7.0, 3.1)) - 0.5)
               + 0.008 * (wz_noise(vec2(tc.y * 55.0, 8.0)) - 0.5)
               + 0.014 * (wz_noise(vec2(tc.y * 170.0, tc.x * 9.0)) - 0.5);
float by = 0.5 + 0.040 * (wz_fbm(vec2(tc.x * 6.0, 9.7)) - 0.5)
               + 0.011 * (wz_noise(vec2(tc.x * 48.0, 2.0)) - 0.5)
               + 0.020 * (wz_noise(vec2(tc.x * 150.0, tc.y * 8.0)) - 0.5);
float qx = step(bx, tc.x);
float qy = step(by, tc.y);
float base   = mix(mix(u_base.x,   u_base.y,   qx), mix(u_base.z,   u_base.w,   qx), qy);
float target = mix(mix(u_target.x, u_target.y, qx), mix(u_target.z, u_target.w, qx), qy);
float s      = mix(mix(u_prog.x,   u_prog.y,   qx), mix(u_prog.z,   u_prog.w,   qx), qy);
float sd     = mix(mix(u_seed.x,   u_seed.y,   qx), mix(u_seed.z,   u_seed.w,   qx), qy);

vec3 yellow = vec3(0.992, 0.812, 0.0);
vec3 red = vec3(0.965, 0.239, 0.216);
vec3 baseCol = mix(yellow, red, base);
vec3 paintCol = mix(yellow, red, target);

vec2 u = (tc - vec2(qx, qy) * 0.5) * 2.0;   // współrzędne w ćwiartce
vec2 lu = u * vec2(aspect, 1.0);            // w jednostkach wysokości ćwiartki

float cov = 0.0;     // krycie nowym kolorem
float dens = 0.0;    // ilość farby (nakładanie się pociągnięć = głębszy kolor)

if (s > 0.0) {
    // Pociągnięcia pędzla: losowe miejsce, kąt, długość, grubość i chwila.
    for (int i = 0; i < 22; i++) {
        float fi = float(i);
        float h1 = wz_hash(vec2(fi * 1.31 + 0.5, sd * 0.73 + 1.1));
        float h2 = wz_hash(vec2(sd * 1.7 + 3.3, fi * 2.11 + 0.2));
        float h3 = wz_hash(vec2(fi * 0.57 + sd * 2.3, 9.1));
        float h4 = wz_hash(vec2(fi + 17.0, sd * 0.37 + 4.0));
        float h5 = wz_hash(vec2(sd + fi * 3.7, 6.6));
        float st = h1 * 0.66;
        float pr = clamp((s - st) / (0.08 + 0.2 * h2), 0.0, 1.0);
        if (pr <= 0.0)
            continue;
        vec2 c = vec2((h3 * 1.2 - 0.1) * aspect, h5 * 1.2 - 0.1);
        float ang = (h4 - 0.5) * 1.5 + step(0.8, h2) * 1.5708;
        float len = 0.45 + 1.1 * h3 * h4 + 0.3 * h1;
        float wid = 0.08 + 0.2 * wz_hash(vec2(fi * 4.1, sd + 2.0));
        vec2 d = lu - c;
        float ca = cos(ang), sa = sin(ang);
        vec2 p = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
        float along = p.x / len + 0.5;
        float wave = 0.35 * sin(along * (2.0 + 3.0 * h5) + fi);
        float across = (p.y / (wid * 0.5)) - wave;
        float taper = 1.0 - 0.4 * smoothstep(0.7, 1.05, along) - 0.25 * smoothstep(0.15, -0.05, along);
        float rag = 0.22 * (wz_noise(vec2(along * 16.0, fi * 7.0 + sd)) - 0.5);
        float aw = smoothstep(1.0 + rag, 0.8 + rag, abs(across) / max(taper, 0.05));
        float head = pr * 1.1 + 0.06 * (wz_noise(vec2(across * 5.0, fi * 3.0 + sd)) - 0.5);
        float al = smoothstep(head, head - 0.035, along) * smoothstep(-0.05, 0.02, along);
        float br = wz_noise(vec2(along * 2.5 + fi, across * 8.0));
        float dry = smoothstep(0.5, 0.95, along) * (1.0 - smoothstep(0.3, 0.6, br));
        float a = aw * al * (1.0 - 0.8 * dry);
        cov = 1.0 - (1.0 - cov) * (1.0 - a);
        dens += a * (0.8 + 0.2 * br);
    }

    // Ciapki gąbki i kleksy różnej wielkości.
    for (int j = 0; j < 16; j++) {
        float fj = float(j);
        float g1 = wz_hash(vec2(fj * 2.7 + 0.3, sd * 1.9 + 7.0));
        float g2 = wz_hash(vec2(sd * 0.61 + 5.0, fj * 1.3 + 2.0));
        float g3 = wz_hash(vec2(fj * 0.77 + sd, 3.3));
        float g4 = wz_hash(vec2(fj + 40.0, sd * 2.9));
        float st = g1 * 0.8;
        float pr = clamp((s - st) / (0.04 + 0.08 * g2), 0.0, 1.0);
        if (pr <= 0.0)
            continue;
        vec2 c = vec2(g3 * aspect, g4);
        float rad = mix(0.015, 0.14, g2 * g2) * (0.4 + 0.6 * pr);
        vec2 q = lu - c;
        float wob = 0.75 + 0.5 * wz_noise(q / rad * 2.2 + fj * 5.0 + sd);
        float dd = length(q) / (rad * wob);
        float sponge = smoothstep(0.25, 0.65, wz_noise(lu * 60.0 + fj * 9.0));
        float a = smoothstep(1.0, 0.82, dd) * mix(0.55 + 0.45 * sponge, 1.0, smoothstep(0.7, 1.0, s));
        cov = 1.0 - (1.0 - cov) * (1.0 - a);
        dens += a * 0.9;
    }

    // Pod koniec nowy kolor zalewa resztę, jak gąbka dociskana do płótna.
    float flood = smoothstep(0.8, 0.97, s + 0.14 * (wz_fbm(lu * 5.0 + sd) - 0.5));
    cov = max(cov, flood);
    dens = max(dens, flood);
}

// Farba plakatowa / akwarela: cieńsza warstwa przepuszcza spodni kolor
// (żółć na czerwieni robi się pomarańczowa), gruba kryje; w optimum syto.
float gran = 0.82 + 0.18 * wz_fbm(lu * 3.0 + sd * 5.0);
float paint = cov * gran;
paint = mix(paint, cov, smoothstep(0.86, 1.0, s));
float over = max(dens - 1.0, 0.0) * (1.0 - smoothstep(0.9, 1.0, s));
vec3 deep = paintCol * vec3(0.97, 0.86, 0.74);
vec3 ink = mix(paintCol, deep, min(over, 1.0));
vec3 col = mix(baseCol, ink, clamp(paint, 0.0, 1.0));

// Delikatna faktura płótna, żeby duże płaszczyzny nie były martwe.
col *= 1.0 - 0.025 * wz_noise(px * 0.32) - 0.015 * wz_noise(px * 0.05 + 7.0);
col += (wz_hash(px * 1.37 + 3.1) - 0.5) / 255.0;   // stały dithering (obraz nie zależy od czasu)
cogl_color_out = vec4(clamp(col, 0.0, 1.0), 1.0);
`;
