extends Node3D

@onready var hud: CanvasLayer = $HUD

func _ready() -> void:
	GameState.current_mode = "ship"
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if not WorldManager.has_space_state():
		SaveSystem.load_game()
	if hud:
		hud.visible = true
	EventBus.notification.emit("Space scene (no ship). Main gameplay starts on planet surface.")
