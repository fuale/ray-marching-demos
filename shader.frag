precision mediump float;
uniform float u_time;
uniform vec2 u_size;
uniform vec2 u_mouse;

const int MAX_STEPS = 256;
const float MIN_DST = 0.0;
const float MAX_DST = 100.0;
const float EPS = 0.0003;

mat3 rotate(vec3 v, float fAngle)
{
    vec4 q = vec4(normalize(v) * sin(fAngle), cos(fAngle));
    vec4 qSq = q * q;
    float xy2 = q.x * q.y * 2.0;
    float xz2 = q.x * q.z * 2.0;
    float yz2 = q.y * q.z * 2.0;
    float wx2 = q.w * q.x * 2.0;
    float wy2 = q.w * q.y * 2.0;
    float wz2 = q.w * q.z * 2.0;

    return mat3(
        qSq.w + qSq.x - qSq.y - qSq.z, xy2 - wz2, xz2 + wy2, xy2 + wz2,
        qSq.w - qSq.x + qSq.y - qSq.z, yz2 - wx2, xz2 - wy2, yz2 + wx2,
        qSq.w - qSq.x - qSq.y + qSq.z);
}

vec2 sdf(vec3 p)
{
    float r = dot(p, p);
    float maxr = 10.0;
    float scale = 2.0;
    float n = 0.0;
    float t = 1.0;
    float rk = sin(u_time / 4.) / 3.6;
    for (int i = 0; i < 10; i++) {
        if (r > maxr)
            break;
        p = abs(p);

        if (p.x - p.y < 0.0)
            p.xy = p.yx;
        if (p.x - p.z < 0.0)
            p.xz = p.zx;
        if (p.y - p.z < 0.0)
            p.yz = p.zy;

        p *= rotate(vec3(0.8, 0.4, 1.0), rk);
        p = p * scale - scale + 1.0;
        r = dot(p, p);
        n += 1.0;
        t = min(t, length(p) - 1.0);
    }

    float f = (sqrt(r) - 2.0) * pow(scale, -n);
    return vec2(f, t);
}

vec3 trace(vec3 o, vec3 d)
{
    float depth = MIN_DST;
    float closest = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec2 sdf_res = sdf(o + depth * d);
        float dst = sdf_res.x;
        closest = float(i);

        if (dst < EPS) {
            return vec3(depth, 1.0 - closest / float(MAX_STEPS), sdf_res.y);
        }

        depth += dst;
        if (depth > MAX_DST) {
            return vec3(MAX_DST, 1.0 - closest / float(MAX_STEPS), sdf_res.y);
        }
    }

    return vec3(MAX_DST, closest / float(MAX_STEPS), 0.0);
}

mat3 getCamera(vec3 o, vec3 t, float a)
{
    vec3 w = normalize(t - o);
    vec3 p = vec3(sin(a), cos(a), 0.0);
    vec3 u = normalize(cross(w, p));
    vec3 v = cross(u, w);
    return mat3(u, v, w);
}

vec3 getNormal(vec3 p)
{
    vec3 eps = vec3(EPS, 0.0, 0.0);
    return normalize(vec3(sdf(p + eps.xyy).x - sdf(p - eps.xyy).x,
        sdf(p + eps.yxy).x - sdf(p - eps.yxy).x,
        sdf(p + eps.yyx).x - sdf(p - eps.yyx).x));
}

float getShadow(vec3 light, vec3 os)
{
    float ldist = EPS * 100.;
    vec3 d = normalize(light - os);
    for (int i = 0; i < MAX_STEPS; i++) {
        float dst = sdf(os + ldist * d).x;
        if (dst < EPS) {
            return 0.0;
        }

        ldist += dst;
        if (dst > MAX_DST) {
            return 1.0;
        }
    }

    return 0.0;
}

float getSoftShadow(vec3 os, vec3 light, float s)
{
    float maxt = 100.;
    float f = 1.0;
    float ph = 1e10;
    vec3 d = normalize(light - os);
    float v = EPS * 100.;

    for (int i = 0; i < MAX_STEPS; i++) {
        float h = sdf(os + d * v).x;
        if (h < EPS)
            return 0.0;
        float y = h * h / (2.0 * ph);
        float sq = sqrt(h * h - y * y);
        f = min(f, s * sq / max(0.0, v - y));
        ph = h;
        v += h;
        if (v > MAX_DST)
            break;
    }

    return f;
}

vec3 render(vec3 o, vec3 d)
{
    vec3 background = vec3(0.0, 0.0, 0.04);
    vec3 final = background * 0.8;

    vec3 traced = trace(o, d);
    if (traced.x >= MAX_DST) {
        return background;
    }

    vec3 os = o + traced.x * d;
    vec3 normal = getNormal(os);

    float tx = clamp(pow(traced.z + 0.9, 6.0), 0.0, 1.0);
    vec3 glowcolor = mix(vec3(0., 1., 1.), vec3(1.0, 0.0, 0.4), sin(u_time / 8.) / 2.0);
    vec3 scolor = mix(vec3(0.8, 1.0, 0.1), glowcolor, tx);

    float spec = 0.0;
    float lambert = dot(normal, normalize(vec3(30., 100., 200.) - os));

    float ao = pow(traced.y, 16.);
    float hk = clamp((traced.x - 2.4) / 3.0, 0.0, 1.0);

    final += mix(ao * lambert * scolor, background * 0.5, hk);
    final += glowcolor * 0.8 * smoothstep(0.9, 1.0, tx) * pow(max(sin(u_time - length(os)), 0.3), 64.0);
    return final;
}

void main(void)
{
    float distance = 3.2 + 0.6 * cos(u_time / 10.7);
    vec3 o = vec3(
        cos(u_mouse.x * 6.28) * distance, 1.,
        sin(u_mouse.x * 6.28) * distance);

    vec3 target = vec3(0.0, 0.0, 0.0);
    mat3 cam = getCamera(o, target, 0.0);
    vec2 p = (-u_size.xy + 2.0 * gl_FragCoord.xy) / u_size.y;
    vec3 d = cam * normalize(vec3(p.xy, 2.0));
    vec3 color = render(o, d);
    gl_FragColor = vec4(color, 1.0);
}