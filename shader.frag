precision mediump float;

uniform float u_time; // delta for animations
uniform vec2  u_size;  // size of canvas
uniform vec2  u_mouse; // mouse position
uniform float u_fb; // phisyx

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
        qSq.w + qSq.x - qSq.y - qSq.z, xy2 - wz2,                     xz2 + wy2, 
        xy2 + wz2,                     qSq.w - qSq.x + qSq.y - qSq.z, yz2 - wx2, 
        xz2 - wy2,                     yz2 + wx2,                     qSq.w - qSq.x - qSq.y + qSq.z
    );
}

float julia(vec3 pos){
    float delta = sin(u_time / 2.0) / 4.0;
    vec4 c = vec4(-0.2, -.6, delta, 0.0);
    vec4 z = vec4(pos, 0.0);
    vec4 nz;

    float dr2   = 1.0;
    float r2    = dot(z,z);

    for(int i = 0; i < 8; i++)
    {
        dr2    *= 4.0 * r2;
        nz.x    = z.x * z.x - dot(z.yzw, z.yzw);
        nz.yzw  = 2.0 * z.x * z.yzw;

        z = nz + c;

        r2 = dot(z, z);
        if(r2 > 4.0) {
            break; 
        }
    }

    return 0.25 * sqrt(r2 / dr2) * log(r2);
}

float intersectSDF(float distA, float distB) 
{
    return min(distA, distB);
}

float sdBox(vec3 p, vec3 b)
{
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

float smin( float a, float b, float k )
{
    float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}

vec2 repeat(vec2 p, float s)
{
    return mod(p+s*0.5,s)-s*0.5;
}

// substraction of two cubes
float sdBoxFrame( vec3 p, vec3 b, float e)
{
  p = abs(p) - b;
  vec3 q = abs(p + e) - e;
  return min(min(
      length(max(vec3(p.x,q.y,q.z),0.0))+min(max(p.x,max(q.y,q.z)),0.0),
      length(max(vec3(q.x,p.y,q.z),0.0))+min(max(q.x,max(p.y,q.z)),0.0)),
      length(max(vec3(q.x,q.y,p.z),0.0))+min(max(q.x,max(q.y,p.z)),0.0));
}

vec2 sdf(vec3 p) 
{
    float juliad = julia(p);
    float box = sdBoxFrame(p, vec3(1.1, 1.1, 1.1), 0.04);

    float final = smin(box, juliad, .1);

    return vec2(
        final,
        1.0
    );
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

    return normalize(
        vec3(
            sdf(p + eps.xyy).x - sdf(p - eps.xyy).x,
            sdf(p + eps.yxy).x - sdf(p - eps.yxy).x,
            sdf(p + eps.yyx).x - sdf(p - eps.yyx).x
        )
    );
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

// d - direction of camera
// o - mouse position
vec3 render(vec3 o, vec3 d){

		vec3 background = vec3(.0, .1, .16);

		vec3 traced = trace(o, d);
		if (traced.x >= MAX_DST){
			float gc = 1.0 - pow(traced.y, 3.0);
			return background;// - vec3(gc * .2, gc * .18, gc * .1);
		}
		vec3 os = o + traced.x * d;
		vec3 normal = getNormal(os);

		vec3 scolor = mix(vec3(.1, .1, .1), vec3(.2,.2,.2), traced.z);
		//vec3 scolor = vec3(.6,.6,.6);
		vec3 sund = normalize(vec3(-1.0, 15.6, -0.3));
		//vec3 sund = normalize(vec3(cos(u_time / 3.0), sin(u_time / 3.0) * 0.6, -0.3));
		vec3 sunc = vec3(1.0, 0.9, 0.4) * 2.0;
		vec3 fillc = vec3(0.0, 0.1, 0.2);
		vec3 refc = vec3(0.4, 0.3, 0.2);
		//vec3 glowc = vec3(1.0, 0.3, 0.1) * 64.0;

		float ao = clamp(pow(traced.y, 16.) + 0.3, 0.0, 1.0);
		float shadow = getShadow(sund, os);
		float sunv = clamp(dot(normal, sund), 0.0, 1.0);
		float fillv = clamp(0.5 + 0.5 * normal.y, 0.0, 1.0);
		float refv = clamp(dot(normal, normalize(-sund)), 0.0, 1.0);
		float specv = pow(clamp(dot(reflect(d, normal), sund), 0.0, 0.4), 32.);
		//float fresv = getShadow(reflect(d, normal), os) * pow(1.0 - abs(dot(d, normal)), 4.);

		//vec3 final = vec3(0.0);
		vec3 final = sunv * sunc * shadow;
		final += fillv * fillc * ao;
		final += refv * refc * ao;

		final += 1.0 * sunc * specv * shadow;
		//final += fresv * 4. * background;
		//final += glowc * bloom;

		final *= scolor;
        final *= vec3(traced.z * 10.0, 12.0, traced.y * 10.0);
        final *= vec3(
            1.0, 
            clamp(sin(u_time / 4.0), 0.4, 1.0), 
            clamp(cos(u_time / 4.0), 0.4, 1.0)
        );

		//final = mix(final, background, clamp((traced.x - 1.0) / 48.0, 0.0, 1.0));

		final = pow(final, vec3(0.45));
		return vec3(final);

	}


void main(void)
{
    float distance = u_fb;
    vec3 o = vec3(
        cos(u_mouse.x * 6.28) * distance, 1.,
        sin(u_mouse.x * 6.28) * distance);

    vec3 target = vec3(0.0, 0.0, 0.0);
    mat3 cam = getCamera(o, target, 0.0);
    vec2 p = (-u_size.xy + 2.0 * gl_FragCoord.xy) / u_size.y;
    vec3 d = cam * normalize(vec3(p.xy, 2.0));
    vec3 color = render(o, d);

    gl_FragColor = vec4(color + vec3(0.1, 0.1, 0.1), 1.0);
}