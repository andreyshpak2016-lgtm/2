extends Area3D

@export var target_scene_path: String = "res://scenes/world/Main.tscn"
@export var prompt_text: String = "Return to ship (space)"

func _ready() -> void:
	add_to_group("interactable")
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func get_prompt() -> String:
	return prompt_text

func interact(_actor: Node) -> void:
	GameState.current_mode = "ship"
	# pending_launch_transform (set during landing) will be applied in Main on return
	SaveSystem.save_game()
	EventBus.notification.emit("Launching to space...")
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	get_tree().call_deferred("change_scene_to_file", target_scene_path)


func _on_body_entered(body: Node) -> void:
	if body is CharacterBody3D:
		EventBus.notification.emit("[F] " + get_prompt())

func _on_body_exited(body: Node) -> void:
	if body is CharacterBody3D:
		EventBus.notification.emit("On foot: WASD move | Space jump | Mouse look | F interact")
