extends Node
## Global event bus for decoupled communication between systems.

signal player_spawned(player: Node)
signal ship_entered(ship: Node)
signal ship_exited(ship: Node)
signal resource_collected(resource_id: String, amount: int)
signal build_mode_toggled(enabled: bool)
signal notification(message: String)
