extends Area3D
class_name LandingZone

@export var target_scene_path: String = "res://scenes/world/PlanetSurface.tscn"
@export var location_name: String = "Planet Surface"

func _ready() -> void:
	add_to_group("landing_zone")

func get_prompt() -> String:
	return "Land at %s" % location_name

func activate(ship: Node) -> void:
	if target_scene_path == "":
		EventBus.notification.emit("Landing unavailable")
		return
	var main_scene := get_tree().current_scene
	if main_scene:
		WorldManager.save_space_state(main_scene)
	# Prepare a sensible launch position above this landing zone for return continuity
	var launch_pos := global_position + global_transform.basis.y * 25.0 + global_transform.basis.z * -20.0
	WorldManager.set_pending_launch(launch_pos, Vector3.ZERO)
	SaveSystem.save_game()
	GameState.current_mode = "on_foot"
	EventBus.notification.emit("Landing at %s..." % location_name)
	# Defer to avoid issues during physics callback
	get_tree().call_deferred("change_scene_to_file", target_scene_path)

