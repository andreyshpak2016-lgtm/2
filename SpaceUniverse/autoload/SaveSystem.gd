extends Node
## Save/load for player state and persisted world session data.

const SAVE_PATH := "user://savegame.json"

func save_game() -> bool:
	var data := {
		"version": 2,
		"player_name": GameState.player_name,
		"credits": GameState.credits,
		"inventory": GameState.inventory,
		"current_mode": GameState.current_mode,
		"world": WorldManager.export_save_data(),
	}
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("Failed to open save file: %s" % SAVE_PATH)
		return false
	file.store_string(JSON.stringify(data, "\t"))
	return true

func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var data: Dictionary = parsed
	GameState.player_name = str(data.get("player_name", GameState.player_name))
	GameState.credits = int(data.get("credits", GameState.credits))
	var inv: Variant = data.get("inventory", {})
	GameState.inventory = inv if typeof(inv) == TYPE_DICTIONARY else {}
	GameState.current_mode = str(data.get("current_mode", GameState.current_mode))
	var world: Variant = data.get("world", {})
	if typeof(world) == TYPE_DICTIONARY:
		WorldManager.import_save_data(world)
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

