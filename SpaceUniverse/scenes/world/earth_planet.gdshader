shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;

uniform vec4 ocean_color : source_color = vec4(0.03, 0.18, 0.45, 1.0);
uniform vec4 shallow_color : source_color = vec4(0.08, 0.35, 0.55, 1.0);
uniform vec4 land_color : source_color = vec4(0.18, 0.42, 0.16, 1.0);
uniform vec4 meadow_color : source_color = vec4(0.28, 0.55, 0.22, 1.0);
uniform vec4 mountain_color : source_color = vec4(0.45, 0.40, 0.32, 1.0);
uniform vec4 snow_color : source_color = vec4(0.92, 0.95, 1.0, 1.0);
uniform float land_threshold : hint_range(-1.0, 1.0) = 0.02;
uniform float noise_scale : hint_range(0.5, 20.0) = 5.0;
uniform float roughness : hint_range(0.0, 1.0) = 0.85;

float hash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash(i + vec3(0,0,0));
	float n100 = hash(i + vec3(1,0,0));
	float n010 = hash(i + vec3(0,1,0));
	float n110 = hash(i + vec3(1,1,0));
	float n001 = hash(i + vec3(0,0,1));
	float n101 = hash(i + vec3(1,0,1));
	float n011 = hash(i + vec3(0,1,1));
	float n111 = hash(i + vec3(1,1,1));
	float nx00 = mix(n000, n100, f.x);
	float nx10 = mix(n010, n110, f.x);
	float nx01 = mix(n001, n101, f.x);
	float nx11 = mix(n011, n111, f.x);
	float nxy0 = mix(nx00, nx10, f.y);
	float nxy1 = mix(nx01, nx11, f.y);
	return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) {
		v += a * noise(p);
		p *= 2.02;
		a *= 0.5;
	}
	return v;
}

void fragment() {
	vec3 n = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 p = normalize(n) * noise_scale;
	float continents = fbm(p) * 2.0 - 1.0;
	float detail = fbm(p * 3.5 + vec3(10.0)) * 2.0 - 1.0;
	float h = continents * 0.75 + detail * 0.25;
	float lat = abs(n.y);

	vec3 col;
	if (h < land_threshold) {
		float depth = smoothstep(land_threshold, land_threshold - 0.25, h);
		col = mix(shallow_color.rgb, ocean_color.rgb, depth);
		ROUGHNESS = 0.15;
		METALLIC = 0.0;
	} else {
		float elev = smoothstep(land_threshold, land_threshold + 0.35, h);
		col = mix(meadow_color.rgb, land_color.rgb, smoothstep(0.3, 0.7, elev));
		col = mix(col, mountain_color.rgb, smoothstep(0.55, 0.85, elev));
		col = mix(col, snow_color.rgb, smoothstep(0.78, 0.95, elev) * smoothstep(0.2, 0.8, lat));
		ROUGHNESS = roughness;
		METALLIC = 0.0;
	}
	ALBEDO = col;
}
