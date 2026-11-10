extends CanvasLayer

@onready var speed_label: Label = $MarginContainer/VBoxContainer/SpeedLabel
@onready var hint_label: Label = $MarginContainer/VBoxContainer/HintLabel
@onready var build_tool_label: Label = $MarginContainer/VBoxContainer/BuildToolLabel
@onready var inventory_panel: PanelContainer = $InventoryPanel
@onready var inventory_items: RichTextLabel = $InventoryPanel/Margin/VBox/Items
@onready var build_panel: PanelContainer = $BuildPanel
@onready var build_status: Label = $BuildPanel/Margin/VBox/Status
@onready var build_items: ItemList = $BuildPanel/Margin/VBox/Items
@onready var build_tool_button: Button = $BuildPanel/Margin/VBox/Buttons/ToolButton
@onready var build_rotate_button: Button = $BuildPanel/Margin/VBox/Buttons/RotateButton

var _ship: Node = null
var _build_controller: Node = null
var _default_hint: String = ""
var _hint_timer: float = 0.0
var _inventory_open: bool = false

func _ready() -> void:
	EventBus.notification.connect(_on_notification)
	EventBus.resource_collected.connect(_on_resource_collected)
	EventBus.build_mode_toggled.connect(_on_build_mode_toggled)
	if build_items and not build_items.item_selected.is_connected(_on_build_item_selected):
		build_items.item_selected.connect(_on_build_item_selected)
	if build_tool_button and not build_tool_button.pressed.is_connected(_on_build_tool_pressed):
		build_tool_button.pressed.connect(_on_build_tool_pressed)
	if build_rotate_button and not build_rotate_button.pressed.is_connected(_on_build_rotate_pressed):
		build_rotate_button.pressed.connect(_on_build_rotate_pressed)
	_update_default_hint()
	_refresh_inventory()
	_update_inventory_visibility()
	_update_build_panel(false)
	build_tool_label.text = "Build Tool: off (B to toggle)"

func set_build_controller(controller: Node) -> void:
	_build_controller = controller
	_refresh_build_menu()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_inventory"):
		_inventory_open = not _inventory_open
		_update_inventory_visibility()
		if _inventory_open:
			_refresh_inventory()

func _update_inventory_visibility() -> void:
	if inventory_panel:
		inventory_panel.visible = _inventory_open

func _update_default_hint() -> void:
	if GameState.current_mode == "on_foot":
		_default_hint = "WASD move | Space jump | Mouse look | B build menu (1/2,T,R) | F gather/interact | Tab inventory"
	elif GameState.current_mode == "eva":
		_default_hint = "EVA: WASD/Space/Ctrl move | Mouse look | B build menu (1/2,T,R) | X enter ship | Tab inventory"
	else:
		_default_hint = "WASD/Space/Ctrl thrust | Q/E roll | Shift boost | RMB look | V camera | F interact | X EVA | Tab inventory"

func set_ship(ship: Node) -> void:
	_ship = ship
	_update_default_hint()

func _process(delta: float) -> void:
	if _ship and _ship.has_method("get_speed"):
		speed_label.text = "Speed: %.1f m/s" % _ship.get_speed()
	else:
		speed_label.text = "Speed: --"
	if _hint_timer > 0.0:
		_hint_timer -= delta
		if _hint_timer <= 0.0 and not hint_label.text.begins_with("[F]"):
			hint_label.text = _default_hint
	elif hint_label.text == "":
		hint_label.text = _default_hint
	if build_panel and build_panel.visible:
		_refresh_build_menu()

func _on_notification(message: String) -> void:
	if message == "":
		return
	hint_label.text = message
	# Show build status in dedicated label
	if message.begins_with("Build:") or message.begins_with("Build mode:") or message.begins_with("Build item:"):
		build_tool_label.text = message
	if message.begins_with("[F]"):
		_hint_timer = 0.0
	else:
		_hint_timer = 3.5

func _on_resource_collected(_resource_id: String, _amount: int) -> void:
	_refresh_inventory()

func _on_build_mode_toggled(enabled: bool) -> void:
	if not enabled:
		build_tool_label.text = "Build Tool: off (B to toggle)"
	_update_build_panel(enabled)
	if enabled:
		_refresh_build_menu()

func _update_build_panel(enabled: bool) -> void:
	if build_panel:
		build_panel.visible = enabled

func _refresh_build_menu() -> void:
	if not build_panel or not build_panel.visible or _build_controller == null:
		return
	if build_items:
		build_items.clear()
		var buildables: Array = []
		if _build_controller.has_method("get_buildables"):
			buildables = _build_controller.get_buildables()
		for i in range(buildables.size()):
			var b = buildables[i]
			var bname := "Объект"
			if typeof(b) == TYPE_DICTIONARY:
				bname = str((b as Dictionary).get("name", "Объект"))
			build_items.add_item("%d. %s" % [i + 1, bname])
		var sel := 0
		if _build_controller.has_method("get_selected_index"):
			sel = int(_build_controller.get_selected_index())
		if build_items.item_count > 0 and sel >= 0 and sel < build_items.item_count:
			build_items.select(sel)
	var tool_name := "-"
	var rot := 0
	if _build_controller.has_method("get_current_tool_name"):
		tool_name = str(_build_controller.get_current_tool_name())
	if _build_controller.has_method("get_rotation_degrees"):
		rot = int(_build_controller.get_rotation_degrees())
	if build_status:
		build_status.text = "Инструмент: %s | Поворот: %d°" % [tool_name, rot]
	build_tool_label.text = "Build: %s | Rot: %d° (B - меню)" % [tool_name, rot]

func _on_build_item_selected(index: int) -> void:
	if _build_controller and _build_controller.has_method("select_buildable"):
		_build_controller.select_buildable(index)
		_refresh_build_menu()

func _on_build_tool_pressed() -> void:
	if _build_controller and _build_controller.has_method("cycle_tool"):
		_build_controller.cycle_tool()
		_refresh_build_menu()

func _on_build_rotate_pressed() -> void:
	if _build_controller and _build_controller.has_method("rotate_preview"):
		_build_controller.rotate_preview()
		_refresh_build_menu()

func _refresh_inventory() -> void:
	if GameState.inventory.is_empty():
		if inventory_items:
			inventory_items.text = "[i]Пусто[/i]\n\nСобирайте ресурсы на планетах: [b]вода[/b], [b]дерево[/b], [b]руда[/b]."
		return
	var lines: Array[String] = []
	var names := {
		"water": "Вода",
		"wood": "Дерево",
		"ore": "Руда",
		"ore_iron": "Железная руда",
		"ice": "Лёд",
		"silicon": "Кремний",
	}
	var keys := GameState.inventory.keys()
	keys.sort()
	for key in keys:
		var id := str(key)
		var display := str(names.get(id, id))
		var count := int(GameState.inventory[key])
		lines.append("• [b]%s[/b]: %d" % [display, count])
	if inventory_items:
		inventory_items.text = "\n".join(lines)
