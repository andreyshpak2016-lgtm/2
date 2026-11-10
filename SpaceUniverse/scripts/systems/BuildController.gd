extends Node3D
class_name BuildController

@export var camera: Camera3D
@export var build_root: Node3D
@export var grid_size: float = 0.5
@export var max_distance: float = 12.0
@export var block_scene: PackedScene

enum Tool { PLACE, REMOVE }

var build_mode: bool = false
var current_tool: int = Tool.PLACE
var _preview: Node3D = null
var _preview_valid: bool = false
var _preview_material_ok: StandardMaterial3D
var _preview_material_bad: StandardMaterial3D
var _preview_rotation_steps: int = 0

var _buildables: Array[Dictionary] = []
var _selected_index: int = 0

func _ready() -> void:
	_preview_material_ok = StandardMaterial3D.new()
	_preview_material_ok.albedo_color = Color(0.2, 0.9, 0.4, 0.45)
	_preview_material_ok.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_preview_material_bad = StandardMaterial3D.new()
	_preview_material_bad.albedo_color = Color(0.9, 0.2, 0.2, 0.45)
	_preview_material_bad.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_setup_buildables()
	set_build_mode(false)

func _setup_buildables() -> void:
	_buildables = [
		{"name": "Block", "scene": "res://scenes/buildables/BuildBlock.tscn"},
		{"name": "Character", "scene": "res://scenes/buildables/BuildableCharacter.tscn"},
	]
	if block_scene != null:
		_buildables[0]["scene"] = block_scene.resource_path if block_scene.resource_path != "" else _buildables[0]["scene"]

func _get_current_buildable() -> Dictionary:
	if _buildables.is_empty():
		return {}
	return _buildables[clampi(_selected_index, 0, _buildables.size() - 1)]

func _get_current_scene() -> PackedScene:
	var b := _get_current_buildable()
	if b.is_empty():
		return load("res://scenes/buildables/BuildBlock.tscn")
	return load(str(b.get("scene", "res://scenes/buildables/BuildBlock.tscn"))) as PackedScene

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_build_mode"):
		set_build_mode(not build_mode)
		return
	if not build_mode:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_1:
			_select_buildable(0)
			return
		elif event.keycode == KEY_2:
			_select_buildable(1)
			return
		elif event.keycode == KEY_T:
			_cycle_tool()
			return
		elif event.keycode == KEY_R:
			_rotate_preview()
			return
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if current_tool == Tool.PLACE and _preview_valid:
				_place_block()
			elif current_tool == Tool.REMOVE:
				_remove_target_block()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			_remove_target_block()

func _cycle_tool() -> void:
	current_tool = Tool.REMOVE if current_tool == Tool.PLACE else Tool.PLACE
	_emit_build_status()

func _rotate_preview() -> void:
	_preview_rotation_steps = (_preview_rotation_steps + 1) % 4
	_emit_build_status()

func _get_tool_name() -> String:
	return "Place" if current_tool == Tool.PLACE else "Remove"

func _emit_build_status() -> void:
	var b := _get_current_buildable()
	var rot_deg := _preview_rotation_steps * 90
	EventBus.notification.emit("Build: %s | Tool: %s | Rot: %d° | 1-Block 2-Character T-Tool R-Rotate B-Exit" % [str(b.get("name", "Block")), _get_tool_name(), rot_deg])

func get_buildables() -> Array[Dictionary]:
	return _buildables

func get_selected_index() -> int:
	return _selected_index

func get_current_tool_name() -> String:
	return _get_tool_name()

func get_rotation_degrees() -> int:
	return _preview_rotation_steps * 90

func select_buildable(index: int) -> void:
	_select_buildable(index)

func cycle_tool() -> void:
	_cycle_tool()

func rotate_preview() -> void:
	_rotate_preview()

func _select_buildable(index: int) -> void:
	if index < 0 or index >= _buildables.size():
		return
	_selected_index = index
	_preview_rotation_steps = 0
	_clear_preview()
	_ensure_preview()
	_emit_build_status()

func _physics_process(_delta: float) -> void:
	if not build_mode:
		return
	_update_preview()

func set_build_mode(enabled: bool) -> void:
	build_mode = enabled
	EventBus.build_mode_toggled.emit(build_mode)
	if build_mode:
		_emit_build_status()
		_ensure_preview()
	else:
		EventBus.notification.emit("Build mode: OFF")
		_clear_preview()

func _ensure_preview() -> void:
	if _preview and is_instance_valid(_preview):
		_preview.visible = true
		return
	var scene := _get_current_scene()
	if scene == null:
		return
	_preview = scene.instantiate()
	if _preview == null:
		return
	_preview.process_mode = Node.PROCESS_MODE_DISABLED
	# disable collision on preview
	_disable_collisions_recursive(_preview)
	add_child(_preview)

func _disable_collisions_recursive(node: Node) -> void:
	if node is CollisionShape3D or node is CollisionPolygon3D:
		node.disabled = true
	for child in node.get_children():
		_disable_collisions_recursive(child)

func _clear_preview() -> void:
	if _preview and is_instance_valid(_preview):
		_preview.queue_free()
	_preview = null

func _update_preview() -> void:
	if not camera or not _preview:
		return
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var to := from + dir * max_distance
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.exclude = [get_parent().get_rid()] if get_parent() is CollisionObject3D else []
	var hit := space.intersect_ray(query)
	_preview_valid = not hit.is_empty()
	if not _preview_valid:
		_preview.visible = false
		return
	var collider: Variant = hit.get("collider")
	var on_valid_surface := false
	if collider is Node:
		on_valid_surface = collider.is_in_group("build_surface") or collider.is_in_group("buildable")
	if not on_valid_surface:
		_preview.visible = true
		_preview_valid = false
		# still show preview near hit but invalid
		var bad_pos: Vector3 = hit.position
		bad_pos.x = snappedf(bad_pos.x, grid_size)
		bad_pos.z = snappedf(bad_pos.z, grid_size)
		bad_pos.y = snappedf(bad_pos.y + grid_size * 0.5, grid_size)
		_preview.global_position = bad_pos
		_apply_preview_material(_preview_material_bad)
		return
	_preview.visible = true
	var pos: Vector3 = hit.position
	# snap to grid on XZ
	pos.x = snappedf(pos.x, grid_size)
	pos.z = snappedf(pos.z, grid_size)
	# Adjust height by type (character stands on ground, block centered on grid)
	var b := _get_current_buildable()
	if str(b.get("name", "")) == "Character":
		pos.y = snappedf(pos.y, grid_size)
	else:
		pos.y = snappedf(pos.y + grid_size * 0.5, grid_size)
	_preview.global_position = pos
	_preview.global_rotation = Vector3(0, deg_to_rad(_preview_rotation_steps * 90), 0)
	if current_tool == Tool.REMOVE:
		_apply_preview_material(_preview_material_bad)
		_preview_valid = false
	else:
		_apply_preview_material(_preview_material_ok if _can_place_at(pos) else _preview_material_bad)
		_preview_valid = _can_place_at(pos)

func _can_place_at(pos: Vector3) -> bool:
	# Simple overlap check using a box query
	var space := get_world_3d().direct_space_state
	var shape := BoxShape3D.new()
	var b := _get_current_buildable()
	if str(b.get("name", "")) == "Character":
		shape.size = Vector3(grid_size * 0.95, 1.6, grid_size * 0.95)
	else:
		shape.size = Vector3(grid_size * 0.95, grid_size * 0.95, grid_size * 0.95)
	var params := PhysicsShapeQueryParameters3D.new()
	params.shape = shape
	# Character origin at feet-level snap point, block centered at pos
	var check_pos := pos
	if str(b.get("name", "")) == "Character":
		check_pos = pos + Vector3(0, 0.8, 0)
	params.transform = Transform3D(Basis.IDENTITY, check_pos)
	params.collide_with_bodies = true
	params.collide_with_areas = false
	var results := space.intersect_shape(params, 8)
	for r in results:
		var col: Variant = r.get("collider")
		if col is Node and (col == get_parent()):
			continue
		# allow placing on ground/build surface but reject overlap with existing buildables
		if col is Node and col.is_in_group("buildable"):
			return false
	return true

func _apply_preview_material(mat: Material) -> void:
	if not _preview:
		return
	_apply_preview_material_recursive(_preview, mat)

func _apply_preview_material_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		node.set_surface_override_material(0, mat)
	for child in node.get_children():
		_apply_preview_material_recursive(child, mat)

func _place_block() -> void:
	if not _preview or not build_root:
		return
	var scene := _get_current_scene()
	if scene == null:
		return
	var pos := _preview.global_position
	var rot := Vector3(0, deg_to_rad(_preview_rotation_steps * 90), 0)
	var inst := scene.instantiate()
	if inst == null:
		return
	build_root.add_child(inst)
	if inst is Node3D:
		(inst as Node3D).global_position = pos
		(inst as Node3D).global_rotation = rot
		_register_placed(inst as Node3D, scene.resource_path)
	var b := _get_current_buildable()
	EventBus.notification.emit("%s placed" % str(b.get("name", "Object")))
	SaveSystem.save_game()

func _remove_target_block() -> void:
	if not camera:
		return
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var to := from + dir * max_distance
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, to)
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return
	var col: Variant = hit.get("collider")
	if col is Node and col.is_in_group("buildable"):
		_unregister_placed(col)
		col.queue_free()
		EventBus.notification.emit("Block removed")
		SaveSystem.save_game()

func _register_placed(node: Node3D, scene_path: String = "res://scenes/buildables/BuildBlock.tscn") -> void:
	if not node.has_meta("build_id"):
		node.set_meta("build_id", "%d_%d" % [Time.get_ticks_msec(), randi()])
	WorldManager.register_buildable({
		"id": str(node.get_meta("build_id")),
		"scene": scene_path,
		"position": [node.global_position.x, node.global_position.y, node.global_position.z],
		"rotation": [node.global_rotation.x, node.global_rotation.y, node.global_rotation.z],
	})

func _unregister_placed(node: Node) -> void:
	if node and node.has_meta("build_id"):
		WorldManager.unregister_buildable(str(node.get_meta("build_id")))

func load_saved_builds() -> void:
	if not build_root:
		return
	for data in WorldManager.get_buildables():
		if typeof(data) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = data
		var scene_path := str(d.get("scene", "res://scenes/buildables/BuildBlock.tscn"))
		var scene := load(scene_path) as PackedScene
		if scene == null and block_scene != null:
			scene = block_scene
		if scene == null:
			continue
		var inst := scene.instantiate()
		if inst == null:
			continue
		build_root.add_child(inst)
		if inst is Node3D:
			var p: Variant = d.get("position", [0,0,0])
			var r: Variant = d.get("rotation", [0,0,0])
			if typeof(p) == TYPE_ARRAY and (p as Array).size() >= 3:
				(inst as Node3D).global_position = Vector3(float(p[0]), float(p[1]), float(p[2]))
			if typeof(r) == TYPE_ARRAY and (r as Array).size() >= 3:
				(inst as Node3D).global_rotation = Vector3(float(r[0]), float(r[1]), float(r[2]))
			inst.set_meta("build_id", str(d.get("id", "")))
