extends Node3D
class_name OrbitBody

@export var orbit_center_path: NodePath
@export var orbit_radius: float = 500.0
@export var orbit_speed: float = 0.05 ## radians per second
@export var orbit_axis: Vector3 = Vector3.UP
@export var initial_angle: float = 0.0
@export var self_rotation_speed: Vector3 = Vector3(0.0, 0.2, 0.0) ## radians per second

var _angle: float = 0.0
var _center_node: Node3D

func _ready() -> void:
	_angle = initial_angle
	if orbit_center_path != NodePath(""):
		_center_node = get_node_or_null(orbit_center_path) as Node3D
	_update_orbit_position()

func _process(delta: float) -> void:
	_angle += orbit_speed * delta
	_update_orbit_position()
	# Self rotation
	rotate_x(self_rotation_speed.x * delta)
	rotate_y(self_rotation_speed.y * delta)
	rotate_z(self_rotation_speed.z * delta)

func _get_center() -> Vector3:
	if _center_node and is_instance_valid(_center_node):
		return _center_node.global_position
	return Vector3.ZERO

func _update_orbit_position() -> void:
	var center := _get_center()
	var axis := orbit_axis.normalized()
	# Build orthonormal basis for orbit plane
	var ref := Vector3.FORWARD
	if abs(axis.dot(ref)) > 0.95:
		ref = Vector3.RIGHT
	var x_dir := ref.cross(axis).normalized()
	var z_dir := axis.cross(x_dir).normalized()
	var offset := (x_dir * cos(_angle) + z_dir * sin(_angle)) * orbit_radius
	global_position = center + offset
