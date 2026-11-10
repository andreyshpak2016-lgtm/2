extends Node
## Global game state (player, inventory, progression stubs).

var player_name: String = "Pilot"
var credits: int = 0
var inventory: Dictionary = {} # resource_id -> amount
var current_mode: String = "ship" # "ship" or "on_foot"

func add_item(resource_id: String, amount: int = 1) -> void:
	inventory[resource_id] = int(inventory.get(resource_id, 0)) + amount
	EventBus.resource_collected.emit(resource_id, amount)

func remove_item(resource_id: String, amount: int = 1) -> bool:
	var current: int = int(inventory.get(resource_id, 0))
	if current < amount:
		return false
	var remaining := current - amount
	if remaining <= 0:
		inventory.erase(resource_id)
	else:
		inventory[resource_id] = remaining
	return true

func get_item_count(resource_id: String) -> int:
	return int(inventory.get(resource_id, 0))
