extends Node3D

@export var engine_meshes: Array[MeshInstance3D] = []
@export var engine_light: Light3D
@export var headlight_left: Light3D
@export var headlight_right: Light3D

var _time: float = 0.0
var _base_engine_emission: float = 1.5

func _process(delta: float) -> void:
	_time += delta
	var thrusting := Input.is_action_pressed("thrust_forward") or Input.is_action_pressed("thrust_backward") \
		or Input.is_action_pressed("strafe_left") or Input.is_action_pressed("strafe_right") \
		or Input.is_action_pressed("thrust_up") or Input.is_action_pressed("thrust_down")
	var boosting := Input.is_action_pressed("boost")
	var pulse := 0.85 + 0.15 * sin(_time * (10.0 if boosting else 6.0))
	var intensity := 0.3
	if thrusting:
		intensity = (2.2 if boosting else 1.2) * pulse
	else:
		intensity = 0.35 * pulse

	# Animate engine light
	if engine_light:
		engine_light.light_energy = intensity

	# Animate engine emissive materials
	for m in engine_meshes:
		if m == null:
			continue
		var mat := m.get_active_material(0)
		if mat is StandardMaterial3D:
			mat.emission_energy_multiplier = intensity

	# Subtle headlight flicker-free steady glow (can be toggled later)
	var head_on := true
	if headlight_left:
		headlight_left.visible = head_on
		headlight_left.light_energy = 2.5
	if headlight_right:
		headlight_right.visible = head_on
		headlight_right.light_energy = 2.5
