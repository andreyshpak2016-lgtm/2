extends Node

@export var actor: Node3D
@export var interaction_area: Area3D

var _targets: Array[Node] = []

func _ready() -> void:
	if interaction_area:
		interaction_area.body_entered.connect(_on_body_entered)
		interaction_area.body_exited.connect(_on_body_exited)
		interaction_area.area_entered.connect(_on_area_entered)
		interaction_area.area_exited.connect(_on_area_exited)

func _physics_process(_delta: float) -> void:
	_targets = _targets.filter(func(t): return is_instance_valid(t))
	var current := _get_current_target()
	if current and current.has_method("get_prompt"):
		EventBus.notification.emit("[F] " + str(current.get_prompt()))

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact"):
		var current := _get_current_target()
		if current == null:
			return
		if current.is_in_group("resource_node") and current.has_method("mine"):
			current.mine()
			return
		if current.has_method("interact"):
			current.interact(actor)
			return
		if current.has_method("activate"):
			current.activate(actor)

func _get_current_target() -> Node:
	_targets = _targets.filter(func(t): return is_instance_valid(t))
	if _targets.is_empty():
		return null
	var origin := (actor.global_position if actor else interaction_area.global_position)
	_targets.sort_custom(func(a, b): return a.global_position.distance_to(origin) < b.global_position.distance_to(origin))
	return _targets[0]

func _register(node: Node) -> void:
	if node and (node.is_in_group("interactable") or node.is_in_group("resource_node") or node.is_in_group("landing_zone")):
		if not _targets.has(node):
			_targets.append(node)

func _unregister(node: Node) -> void:
	_targets.erase(node)

func _on_body_entered(body: Node) -> void:
	_register(body)
func _on_body_exited(body: Node) -> void:
	_unregister(body)
func _on_area_entered(area: Area3D) -> void:
	_register(area)
func _on_area_exited(area: Area3D) -> void:
	_unregister(area)
