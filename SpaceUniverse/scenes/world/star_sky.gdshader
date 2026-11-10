shader_type sky;

uniform vec3 sky_color : source_color = vec3(0.01, 0.015, 0.04);
uniform vec3 horizon_color : source_color = vec3(0.03, 0.04, 0.08);
uniform float star_density : hint_range(100.0, 2000.0) = 700.0;
uniform float star_brightness : hint_range(0.0, 3.0) = 1.4;
uniform float star_size : hint_range(0.001, 0.02) = 0.006;

float hash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void sky() {
	vec3 dir = normalize(EYEDIR);
	float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
	vec3 col = mix(horizon_color, sky_color, pow(t, 0.7));

	// Star field (dense layers)
	vec3 p = dir * star_density;
	vec3 cell = floor(p);
	vec3 f = fract(p) - 0.5;
	float h = hash(cell);
	float star = 0.0;
	if (h > 0.93) {
		vec3 star_pos = vec3(hash(cell + 1.3), hash(cell + 2.1), hash(cell + 3.7)) - 0.5;
		star_pos *= 0.7;
		float d = length(f - star_pos.xy);
		float size = star_size * (0.6 + 1.2 * hash(cell + 5.0));
		float s = smoothstep(size, 0.0, d);
		float twinkle = 0.7 + 0.3 * sin(TIME * (1.5 + h * 6.0) + h * 100.0);
		star = s * twinkle * (0.5 + 0.5 * hash(cell + 9.0));
	}
	// Extra small/dim stars layer
	vec3 p2 = dir * (star_density * 2.2);
	vec3 cell2 = floor(p2);
	vec3 f2 = fract(p2) - 0.5;
	float h2 = hash(cell2 + 17.0);
	if (h2 > 0.955) {
		float d2 = length(f2);
		float s2 = smoothstep(star_size * 0.5, 0.0, d2);
		star += s2 * 0.45;
	}
	col += vec3(star) * star_brightness;

	COLOR = col;
}
