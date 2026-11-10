extends Node3D

@onready var player: Node = $PlayerCharacter
@onready var hud: CanvasLayer = $HUD
@onready var build_controller: Node = $BuildController

func _ready() -> void:
	GameState.current_mode = "on_foot"
	if hud and hud.has_method("set_ship"):
		hud.set_ship(player)
	# Wire build controller (camera from player)
	if build_controller:
		var cam := player.get_node_or_null("CameraPivot/Camera3D")
		if cam:
			build_controller.camera = cam
		if build_controller.has_method("load_saved_builds"):
			build_controller.load_saved_builds()
		if hud and hud.has_method("set_build_controller"):
			hud.set_build_controller(build_controller)
	# Lower gravity feel for moon
	if player and "gravity" in player:
		player.gravity = 3.2
		player.jump_velocity = 6.5
	EventBus.notification.emit("Moon: WASD move | Space jump (low gravity) | B build mode")
