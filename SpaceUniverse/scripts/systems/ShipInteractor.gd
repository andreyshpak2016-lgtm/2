extends Area3D
class_name ShipInteractor

@export var ship: Node

var _targets: Array[Node] = []

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	area_entered.connect(_on_area_entered)
	area_exited.connect(_on_area_exited)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact"):
		_try_interact()

func _physics_process(_delta: float) -> void:
	_targets = _targets.filter(func(t): return is_instance_valid(t))
	_update_prompt()

func _try_interact() -> void:
	var target := _get_current_target()
	if target == null:
		EventBus.notification.emit("No target in range")
		return
	if target.is_in_group("resource_node") and target.has_method("mine"):
		target.mine()
		return
	if target.is_in_group("landing_zone") and target.has_method("activate"):
		target.activate(ship)
		return
	if target.has_method("interact"):
		target.interact(ship)
		return
	EventBus.notification.emit("Nothing to do")

func _get_current_target() -> Node:
	_targets = _targets.filter(func(t): return is_instance_valid(t))
	if _targets.is_empty():
		return null
	var origin := global_position
	_targets.sort_custom(func(a, b): return a.global_position.distance_to(origin) < b.global_position.distance_to(origin))
	return _targets[0]

func _update_prompt() -> void:
	var target := _get_current_target()
	if target == null:
		return
	if target.has_method("get_prompt"):
		EventBus.notification.emit("[F] " + str(target.get_prompt()))

func _on_body_entered(body: Node) -> void:
	_register(body)
func _on_body_exited(body: Node) -> void:
	_unregister(body)
func _on_area_entered(area: Area3D) -> void:
	_register(area)
func _on_area_exited(area: Area3D) -> void:
	_unregister(area)

func _register(node: Node) -> void:
	if node == null:
		return
	if node.is_in_group("resource_node") or node.is_in_group("landing_zone") or node.is_in_group("interactable"):
		if not _targets.has(node):
			_targets.append(node)

func _unregister(node: Node) -> void:
	_targets.erase(node)
