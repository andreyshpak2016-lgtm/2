shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

uniform vec4 albedo : source_color = vec4(0.08, 0.35, 0.55, 0.75);
uniform vec4 deep_color : source_color = vec4(0.03, 0.18, 0.35, 0.85);
uniform float roughness : hint_range(0.0, 1.0) = 0.05;
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float wave_speed : hint_range(0.0, 5.0) = 0.6;
uniform float wave_scale : hint_range(0.1, 20.0) = 4.0;
uniform float wave_strength : hint_range(0.0, 0.2) = 0.03;

void vertex() {
	float t = TIME * wave_speed;
	float w1 = sin(VERTEX.x * wave_scale + t) * cos(VERTEX.z * wave_scale * 0.8 + t * 1.2);
	float w2 = sin(VERTEX.x * wave_scale * 1.7 - t * 0.8) * 0.5;
	VERTEX.y += (w1 + w2) * wave_strength;
}

void fragment() {
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	float ripples = 0.5 + 0.5 * sin(UV.x * 18.0 + TIME * 0.5) * cos(UV.y * 14.0 - TIME * 0.35);
	vec3 base_col = mix(deep_color.rgb, albedo.rgb, 0.45 + 0.35 * ripples);
	vec3 sky_ref = vec3(0.55, 0.75, 0.95);
	ALBEDO = mix(base_col, sky_ref, fres * 0.55);
	ALPHA = mix(deep_color.a, albedo.a, 0.55 + 0.2 * fres);
	ROUGHNESS = mix(roughness * 1.8, 0.02, fres);
	METALLIC = metallic;
	SPECULAR = 0.9;
	EMISSION = base_col * 0.03;
}
