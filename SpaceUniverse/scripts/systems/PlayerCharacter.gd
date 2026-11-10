extends CharacterBody3D
class_name PlayerCharacter

@export var move_speed: float = 6.0
@export var jump_velocity: float = 5.0
@export var mouse_sensitivity: float = 0.0025
@export var gravity: float = 9.8
@export var space_mode: bool = false
@export var space_move_speed: float = 8.0

@onready var camera_pivot: Node3D = $CameraPivot
@onready var camera: Camera3D = $CameraPivot/Camera3D

var _look_rotation := Vector2.ZERO

func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_look_rotation = Vector2(rotation.y, camera_pivot.rotation.x)
	if space_mode:
		EventBus.notification.emit("EVA: WASD move | Space/Ctrl up/down | Mouse look | B build | X/F near ship enter")
	else:
		EventBus.notification.emit("On foot: WASD move | Space jump | Mouse look | F interact | Esc release mouse")

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_look_rotation.x -= event.relative.x * mouse_sensitivity
		_look_rotation.y -= event.relative.y * mouse_sensitivity
		_look_rotation.y = clamp(_look_rotation.y, -1.2, 1.2)
		rotation.y = _look_rotation.x
		camera_pivot.rotation.x = _look_rotation.y
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	if space_mode:
		_physics_space(delta)
	else:
		_physics_ground(delta)

func _physics_ground(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = jump_velocity

	var input_dir := Input.get_vector("strafe_left", "strafe_right", "thrust_forward", "thrust_backward")
	var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
	if direction != Vector3.ZERO:
		velocity.x = direction.x * move_speed
		velocity.z = direction.z * move_speed
	else:
		velocity.x = move_toward(velocity.x, 0, move_speed)
		velocity.z = move_toward(velocity.z, 0, move_speed)
	move_and_slide()

func _physics_space(_delta: float) -> void:
	var input_dir := Input.get_vector("strafe_left", "strafe_right", "thrust_forward", "thrust_backward")
	var vertical := Input.get_axis("thrust_down", "thrust_up")
	var basis := camera.global_transform.basis if camera else global_transform.basis
	var direction := (basis * Vector3(input_dir.x, vertical, input_dir.y)).normalized()
	if direction != Vector3.ZERO:
		velocity = direction * space_move_speed
	else:
		velocity = velocity.move_toward(Vector3.ZERO, space_move_speed)
	move_and_slide()

func get_speed() -> float:
	if space_mode:
		return velocity.length()
	return Vector2(velocity.x, velocity.z).length()
