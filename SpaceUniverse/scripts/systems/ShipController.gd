extends RigidBody3D
class_name ShipController

@export var thrust_force: float = 30.0
@export var strafe_force: float = 20.0
@export var vertical_force: float = 20.0
@export var boost_multiplier: float = 3.0
@export var max_speed: float = 120.0
@export var max_boost_speed: float = 220.0

@export var mouse_sensitivity: float = 0.0025
@export var torque_strength: float = 8.0
@export var roll_torque: float = 10.0
@export var linear_damp_space: float = 0.4
@export var angular_damp_space: float = 1.8

var _look_delta := Vector2.ZERO

func _ready() -> void:
	gravity_scale = 0.0
	linear_damp = linear_damp_space
	angular_damp = angular_damp_space

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		_look_delta += event.relative
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		if event.pressed:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		else:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			_look_delta = Vector2.ZERO

func _physics_process(_delta: float) -> void:
	var boost := 1.0
	if Input.is_action_pressed("boost"):
		boost = boost_multiplier

	# Translation input (local space)
	var forward_input := Input.get_axis("thrust_backward", "thrust_forward")
	var strafe_input := Input.get_axis("strafe_left", "strafe_right")
	var vertical_input := Input.get_axis("thrust_down", "thrust_up")
	var local_force := Vector3(
		strafe_input * strafe_force,
		vertical_input * vertical_force,
		-forward_input * thrust_force
	) * boost
	if local_force != Vector3.ZERO:
		apply_central_force(global_transform.basis * local_force)

	# Rotation: mouse look (yaw/pitch) when RMB held, plus roll keys
	var yaw := 0.0
	var pitch := 0.0
	if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		yaw = -_look_delta.x * mouse_sensitivity
		pitch = -_look_delta.y * mouse_sensitivity
		_look_delta = Vector2.ZERO
	var roll_input := Input.get_axis("roll_right", "roll_left")
	var roll := roll_input * roll_torque
	var torque_local := Vector3(pitch * torque_strength, yaw * torque_strength, roll)
	if torque_local != Vector3.ZERO:
		apply_torque(global_transform.basis * torque_local)

	# Speed cap
	var speed_limit := max_speed
	if Input.is_action_pressed("boost"):
		speed_limit = max_boost_speed
	var speed := linear_velocity.length()
	if speed > speed_limit and speed > 0.001:
		linear_velocity = linear_velocity * (speed_limit / speed)

	# Interaction is handled by ShipInteractor sensor (mining, landing, etc.)

func get_speed() -> float:
	return linear_velocity.length()
