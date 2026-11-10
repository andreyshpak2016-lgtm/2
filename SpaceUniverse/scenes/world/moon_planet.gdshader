shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;

uniform vec4 base_color : source_color = vec4(0.58, 0.57, 0.55, 1.0);
uniform vec4 dark_color : source_color = vec4(0.38, 0.37, 0.36, 1.0);
uniform vec4 light_color : source_color = vec4(0.72, 0.71, 0.69, 1.0);
uniform float noise_scale : hint_range(1.0, 30.0) = 10.0;

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
		p *= 2.1;
		a *= 0.5;
	}
	return v;
}

void fragment() {
	vec3 n = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 p = normalize(n) * noise_scale;
	float h = fbm(p);
	float craters = fbm(p * 2.5 + vec3(3.7));
	float detail = smoothstep(0.45, 0.7, craters);
	vec3 col = mix(dark_color.rgb, base_color.rgb, h);
	col = mix(col, light_color.rgb, detail * 0.5);
	// crater-like dark spots
	float c = smoothstep(0.72, 0.78, fbm(p * 4.0 + vec3(9.0)));
	col = mix(col, dark_color.rgb * 0.8, c * 0.6);
	ALBEDO = col;
	ROUGHNESS = 0.98;
	METALLIC = 0.0;
}
