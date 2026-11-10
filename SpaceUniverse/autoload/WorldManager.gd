extends Node
## World state for space sector (persistence between scene transitions and saves).

var current_sector: String = "starter_sector"
var world_origin_offset: Vector3 = Vector3.ZERO

# Saved space session state
var _space_state: Dictionary = {}
# Tracks depleted/removed resource nodes by id (persists across scene reloads)
var _resource_depletions: Dictionary = {} # id -> true
# When returning from surface, spawn ship at this transform (continuity of landing/takeoff)
var pending_launch_transform: Dictionary = {} # {position:[x,y,z], rotation:[x,y,z]} or empty
# Placed buildables (simple global list for current prototype; keyed by id)
var _buildables: Dictionary = {} # id -> {id, scene, position, rotation}

func set_sector(sector_id: String) -> void:
	current_sector = sector_id

func rebase_origin(new_offset: Vector3) -> void:
	# Placeholder for floating-origin rebasing to maintain precision in large space.
	world_origin_offset += new_offset

func has_space_state() -> bool:
	return not _space_state.is_empty()

func clear_space_state() -> void:
	_space_state.clear()
	_resource_depletions.clear()
	pending_launch_transform.clear()

func register_buildable(data: Dictionary) -> void:
	var id := str(data.get("id", ""))
	if id == "":
		return
	_buildables[id] = data

func unregister_buildable(id: String) -> void:
	_buildables.erase(id)

func get_buildables() -> Array:
	return _buildables.values()

func clear_buildables() -> void:
	_buildables.clear()

func mark_resource_depleted(resource_node_id: String) -> void:
	_resource_depletions[resource_node_id] = true
	var res: Variant = _space_state.get("resources", null)
	if typeof(res) == TYPE_DICTIONARY:
		(res as Dictionary)[resource_node_id] = {"present": false, "amount": 0}

func set_pending_launch(position: Vector3, rotation: Vector3 = Vector3.ZERO) -> void:
	pending_launch_transform = {
		"position": _vec_to_arr(position),
		"rotation": _vec_to_arr(rotation),
	}

func save_space_state(main_scene: Node) -> void:
	var resources: Dictionary = {}
	# Start with known depletions
	for id in _resource_depletions.keys():
		resources[str(id)] = {"present": false, "amount": 0}
	var state: Dictionary = {
		"sector": current_sector,
		"ship": {},
		"resources": resources,
	}
	var ship := main_scene.get_node_or_null("PlayerShip")
	if ship is Node3D:
		state["ship"] = {
			"position": _vec_to_arr(ship.global_position),
			"rotation": _vec_to_arr(ship.global_rotation),
		}
		if ship is RigidBody3D:
			state["ship"]["linear_velocity"] = _vec_to_arr(ship.linear_velocity)
			state["ship"]["angular_velocity"] = _vec_to_arr(ship.angular_velocity)

	var resources_root := main_scene.get_node_or_null("Resources")
	if resources_root:
		for child in resources_root.get_children():
			if child == null:
				continue
			var id := str(child.name)
			if child.has_method("get_save_data"):
				state["resources"][id] = child.get_save_data()
			elif "amount" in child:
				state["resources"][id] = {
					"present": true,
					"amount": int(child.amount),
					"resource_id": str(child.get("resource_id")) if "resource_id" in child else "",
				}
	_space_state = state

func apply_space_state(main_scene: Node) -> void:
	if _space_state.is_empty() and pending_launch_transform.is_empty():
		return
	var ship := main_scene.get_node_or_null("PlayerShip")
	if ship is Node3D:
		if not pending_launch_transform.is_empty():
			ship.global_position = _arr_to_vec(pending_launch_transform.get("position", []), ship.global_position)
			ship.global_rotation = _arr_to_vec(pending_launch_transform.get("rotation", []), ship.global_rotation)
			if ship is RigidBody3D:
				ship.linear_velocity = Vector3.ZERO
				ship.angular_velocity = Vector3.ZERO
			pending_launch_transform.clear()
		else:
			var ship_data: Variant = _space_state.get("ship", {})
			if typeof(ship_data) == TYPE_DICTIONARY:
				var sd: Dictionary = ship_data
				if sd.has("position"):
					ship.global_position = _arr_to_vec(sd["position"], ship.global_position)
				if sd.has("rotation"):
					ship.global_rotation = _arr_to_vec(sd["rotation"], ship.global_rotation)
				if ship is RigidBody3D:
					if sd.has("linear_velocity"):
						ship.linear_velocity = _arr_to_vec(sd["linear_velocity"], Vector3.ZERO)
					if sd.has("angular_velocity"):
						ship.angular_velocity = _arr_to_vec(sd["angular_velocity"], Vector3.ZERO)

	var resources_state: Variant = _space_state.get("resources", {})
	if typeof(resources_state) == TYPE_DICTIONARY:
		var rs: Dictionary = resources_state
		var resources_root := main_scene.get_node_or_null("Resources")
		if resources_root:
			for child in resources_root.get_children():
				if child == null:
					continue
				var id := str(child.name)
				if not rs.has(id):
					# No saved info: keep as-is
					continue
				var data: Variant = rs[id]
				if typeof(data) != TYPE_DICTIONARY:
					continue
				var d: Dictionary = data
				if not bool(d.get("present", true)) or int(d.get("amount", 1)) <= 0:
					child.queue_free()
				elif "amount" in child:
					child.amount = int(d.get("amount", child.amount))

func export_save_data() -> Dictionary:
	return {
		"current_sector": current_sector,
		"world_origin_offset": _vec_to_arr(world_origin_offset),
		"space_state": _space_state,
		"resource_depletions": _resource_depletions,
		"pending_launch_transform": pending_launch_transform,
		"buildables": _buildables,
	}

func import_save_data(data: Dictionary) -> void:
	current_sector = str(data.get("current_sector", current_sector))
	world_origin_offset = _arr_to_vec(data.get("world_origin_offset", _vec_to_arr(world_origin_offset)), world_origin_offset)
	var ss: Variant = data.get("space_state", {})
	_space_state = ss if typeof(ss) == TYPE_DICTIONARY else {}
	var rd: Variant = data.get("resource_depletions", {})
	_resource_depletions = rd if typeof(rd) == TYPE_DICTIONARY else {}
	var plt: Variant = data.get("pending_launch_transform", {})
	pending_launch_transform = plt if typeof(plt) == TYPE_DICTIONARY else {}
	var b: Variant = data.get("buildables", {})
	_buildables = b if typeof(b) == TYPE_DICTIONARY else {}
	# Backfill depletions from saved resource states if needed
	var res: Variant = _space_state.get("resources", {})
	if typeof(res) == TYPE_DICTIONARY:
		for k in (res as Dictionary).keys():
			var v: Variant = (res as Dictionary)[k]
			if typeof(v) == TYPE_DICTIONARY and not bool((v as Dictionary).get("present", true)):
				_resource_depletions[str(k)] = true

func _vec_to_arr(v: Vector3) -> Array:
	return [v.x, v.y, v.z]

func _arr_to_vec(a: Variant, fallback: Vector3) -> Vector3:
	if typeof(a) == TYPE_ARRAY and (a as Array).size() >= 3:
		var arr := a as Array
		return Vector3(float(arr[0]), float(arr[1]), float(arr[2]))
	return fallback

