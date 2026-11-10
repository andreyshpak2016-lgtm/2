extends Node3D

@export var travel_direction: Vector3 = Vector3(1, -0.1, -0.3)
@export var speed: float = 18.0
@export var path_length: float = 1200.0
@export var reset_offset: float = 0.0

var _start_position: Vector3
var _distance: float = 0.0

func _ready() -> void:
	_start_position = global_position
	_distance = reset_offset
	travel_direction = travel_direction.normalized()

func _process(delta: float) -> void:
	_distance += speed * delta
	if _distance > path_length:
		_distance = 0.0
	global_position = _start_position + travel_direction * _distance
	# Orient along travel
	if travel_direction.length() > 0.001:
		look_at(global_position + travel_direction, Vector3.UP)
