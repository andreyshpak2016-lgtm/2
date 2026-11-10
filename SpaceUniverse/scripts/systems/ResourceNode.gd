extends StaticBody3D
class_name ResourceNode

@export var resource_id: String = "ore_iron"
@export var resource_name: String = "Iron Ore"
@export var amount: int = 25
@export var amount_per_mine: int = 5

func mine(amount_requested: int = -1) -> int:
	var take := amount_per_mine if amount_requested < 0 else mini(amount_requested, amount_per_mine)
	take = mini(take, amount)
	if take <= 0:
		return 0
	amount -= take
	GameState.add_item(resource_id, take)
	EventBus.notification.emit("Mined %d %s (left: %d)" % [take, resource_name, amount])
	if amount <= 0:
		_depleted()
	return take

func get_prompt() -> String:
	return "Mine %s (%d)" % [resource_name, amount]

func get_save_data() -> Dictionary:
	return {
		"present": amount > 0,
		"amount": amount,
		"resource_id": resource_id,
		"resource_name": resource_name,
	}

func _depleted() -> void:
	WorldManager.mark_resource_depleted(str(name))
	EventBus.notification.emit("%s depleted" % resource_name)
	queue_free()

