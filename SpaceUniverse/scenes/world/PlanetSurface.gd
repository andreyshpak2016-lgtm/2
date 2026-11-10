extends Node3D

@onready var player: Node = $PlayerCharacter
@onready var hud: CanvasLayer = $HUD
@onready var build_controller: Node = $BuildController
@onready var terrain: Node = get_node_or_null("NoiseTerrain")

func _ready() -> void:
	GameState.current_mode = "on_foot"
	if hud and hud.has_method("set_ship"):
		hud.set_ship(player)
	# Place key objects on generated noise terrain
	if terrain and terrain.has_method("get_height_at"):
		_snap_to_terrain($Base, 0.0)
		_snap_to_terrain(player, 0.2)
		if has_node("Trees"):
			for n in $Trees.get_children():
				_snap_to_terrain(n, 0.0)
		if has_node("Resources"):
			for n in $Resources.get_children():
				var wl := float(terrain.get("water_level")) if terrain.get("water_level") != null else -1.2
				# keep water pickups near water surface
				if "Water" in str(n.name):
					n.global_position.y = wl + 0.15
				else:
					_snap_to_terrain(n, 0.0)
	# Wire build controller (camera from player)
	if build_controller:
		var cam := player.get_node_or_null("CameraPivot/Camera3D")
		if cam:
			build_controller.camera = cam
		if build_controller.has_method("load_saved_builds"):
			build_controller.load_saved_builds()
		if hud and hud.has_method("set_build_controller"):
			hud.set_build_controller(build_controller)
	EventBus.notification.emit("On foot: WASD move | Space jump | Mouse look | B build mode | F gather")

func _snap_to_terrain(node: Node, offset: float) -> void:
	if node == null or terrain == null or not terrain.has_method("get_height_at"):
		return
	if node is Node3D:
		var p: Vector3 = (node as Node3D).global_position
		var h: float = float(terrain.get_height_at(p.x, p.z))
		var wl := float(terrain.get("water_level")) if terrain.get("water_level") != null else -1.2
		# avoid placing on deep underwater bottom for land objects
		if h < wl + 0.2:
			h = wl + 0.2
		(node as Node3D).global_position = Vector3(p.x, h + offset, p.z)

