extends Node3D
class_name ShipCameraRig

@export var first_person_camera: Camera3D
@export var third_person_camera: Camera3D
@export var spring_arm: SpringArm3D

@export_range(50.0, 110.0, 1.0) var first_person_fov: float = 75.0
@export_range(50.0, 110.0, 1.0) var third_person_fov: float = 80.0
@export_range(1.0, 20.0, 0.5) var third_person_distance: float = 8.0
@export_range(0.0, 20.0, 0.5) var follow_smoothing: float = 8.0

var _use_third_person: bool = true

func _ready() -> void:
	_apply_settings()
	_apply_mode()

func _process(delta: float) -> void:
	if spring_arm:
		var target_len := third_person_distance
		if follow_smoothing > 0.0:
			spring_arm.spring_length = lerpf(spring_arm.spring_length, target_len, clampf(follow_smoothing * delta, 0.0, 1.0))
		else:
			spring_arm.spring_length = target_len
	if first_person_camera:
		first_person_camera.fov = first_person_fov
	if third_person_camera:
		third_person_camera.fov = third_person_fov

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_camera"):
		_use_third_person = not _use_third_person
		_apply_mode()
		if Engine.has_singleton("EventBus") or true:
			EventBus.notification.emit("Camera: %s" % ("Third-person" if _use_third_person else "First-person"))

func _apply_settings() -> void:
	if spring_arm:
		spring_arm.spring_length = third_person_distance
	if first_person_camera:
		first_person_camera.fov = first_person_fov
	if third_person_camera:
		third_person_camera.fov = third_person_fov

func _apply_mode() -> void:
	if first_person_camera:
		first_person_camera.current = not _use_third_person
	if third_person_camera:
		third_person_camera.current = _use_third_person
