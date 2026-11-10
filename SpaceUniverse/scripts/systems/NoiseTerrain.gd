extends Node3D

@export var size: Vector2 = Vector2(400, 400)
@export var resolution: int = 96
@export var height_scale: float = 10.0
@export var noise_frequency: float = 0.012
@export var noise_seed: int = 1337
@export var water_level: float = -1.5
@export var water_margin: float = 20.0

var _ground_mat := StandardMaterial3D.new()
var _noise: FastNoiseLite
var _noise_m: FastNoiseLite
var _noise_basin: FastNoiseLite

func _ready() -> void:
	_ground_mat.albedo_color = Color(0.23, 0.5, 0.2, 1.0)
	_ground_mat.roughness = 0.95
	_ground_mat.rim_enabled = true
	_ground_mat.rim = 0.12
	_ground_mat.rim_tint = 0.35
	_ground_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_ground_mat.vertex_color_use_as_albedo = true
	_init_noises()
	generate()

func _init_noises() -> void:
	_noise = FastNoiseLite.new()
	_noise.seed = noise_seed
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_noise.frequency = noise_frequency
	_noise.fractal_octaves = 5
	_noise.fractal_lacunarity = 2.0
	_noise.fractal_gain = 0.5

	_noise_m = FastNoiseLite.new()
	_noise_m.seed = noise_seed + 911
	_noise_m.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_noise_m.frequency = noise_frequency * 0.55
	_noise_m.fractal_octaves = 4
	_noise_m.fractal_lacunarity = 2.1
	_noise_m.fractal_gain = 0.45

	_noise_basin = FastNoiseLite.new()
	_noise_basin.seed = noise_seed + 77
	_noise_basin.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_noise_basin.frequency = 0.008

func _height_at(wx: float, wz: float) -> float:
	if _noise == null:
		_init_noises()
	var base_n := _noise.get_noise_2d(wx, wz)
	var m_n := _noise_m.get_noise_2d(wx + 120.0, wz - 80.0)
	# ridged component for mountains
	var ridged := 1.0 - absf(m_n)
	ridged = ridged * ridged
	var h := base_n * height_scale * 0.55
	h += ridged * height_scale * 1.6
	# soften spawn area near center
	var d := Vector2(wx, wz).length()
	var flat := smoothstep(0.0, 40.0, d)
	h = lerpf(0.6, h, flat)
	# natural basins/lakes in some areas
	var basin := _noise_basin.get_noise_2d(wx, wz)
	if basin < -0.22:
		h -= (-0.22 - basin) * 9.0
	# make some mountain regions higher away from center
	if d > 70.0 and ridged > 0.35:
		h += (ridged - 0.35) * 10.0
	return h

func generate() -> void:
	# Clear previous generated children
	for c in get_children():
		c.queue_free()
	if _noise == null:
		_init_noises()

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var half_x := size.x * 0.5
	var half_z := size.y * 0.5
	var step_x := size.x / float(resolution)
	var step_z := size.y / float(resolution)

	# Vertex grid
	var heights: Array = []
	heights.resize((resolution + 1) * (resolution + 1))
	for z in range(resolution + 1):
		for x in range(resolution + 1):
			var wx := -half_x + x * step_x
			var wz := -half_z + z * step_z
			heights[z * (resolution + 1) + x] = _height_at(wx, wz)

	# Build triangles
	for z in range(resolution):
		for x in range(resolution):
			var i00 := z * (resolution + 1) + x
			var i10 := z * (resolution + 1) + x + 1
			var i01 := (z + 1) * (resolution + 1) + x
			var i11 := (z + 1) * (resolution + 1) + x + 1

			var x0 := -half_x + x * step_x
			var x1 := -half_x + (x + 1) * step_x
			var z0 := -half_z + z * step_z
			var z1 := -half_z + (z + 1) * step_z

			var v00 := Vector3(x0, float(heights[i00]), z0)
			var v10 := Vector3(x1, float(heights[i10]), z0)
			var v01 := Vector3(x0, float(heights[i01]), z1)
			var v11 := Vector3(x1, float(heights[i11]), z1)

			var uv00 := Vector2(float(x) / resolution, float(z) / resolution)
			var uv10 := Vector2(float(x + 1) / resolution, float(z) / resolution)
			var uv01 := Vector2(float(x) / resolution, float(z + 1) / resolution)
			var uv11 := Vector2(float(x + 1) / resolution, float(z + 1) / resolution)

			_add_tri(st, v00, v10, v11, uv00, uv10, uv11)
			_add_tri(st, v00, v11, v01, uv00, uv11, uv01)

	st.generate_normals()
	st.generate_tangents()
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.name = "TerrainMesh"
	mi.mesh = mesh
	mi.material_override = _ground_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)

	# Collision
	var body := StaticBody3D.new()
	body.name = "TerrainBody"
	body.add_to_group("build_surface")
	add_child(body)
	var shape := mesh.create_trimesh_shape()
	var col := CollisionShape3D.new()
	col.shape = shape
	body.add_child(col)

	# Water plane
	var water_mesh := PlaneMesh.new()
	water_mesh.size = size + Vector2(water_margin, water_margin)
	water_mesh.subdivide_width = 32
	water_mesh.subdivide_depth = 32
	var water_mi := MeshInstance3D.new()
	water_mi.name = "WaterPlane"
	water_mi.mesh = water_mesh
	water_mi.position = Vector3(0, water_level, 0)
	var wm := StandardMaterial3D.new()
	wm.albedo_color = Color(0.08, 0.38, 0.62, 0.72)
	wm.roughness = 0.04
	wm.metallic = 0.0
	wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	wm.cull_mode = BaseMaterial3D.CULL_DISABLED
	water_mi.material_override = wm
	add_child(water_mi)

	_generate_caves()

func _generate_caves() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = noise_seed + 4242
	var placed := 0
	var attempts := 0
	while placed < 4 and attempts < 80:
		attempts += 1
		var x := rng.randf_range(-size.x * 0.38, size.x * 0.38)
		var z := rng.randf_range(-size.y * 0.38, size.y * 0.38)
		if Vector2(x, z).length() < 55.0:
			continue
		var h := _height_at(x, z)
		if h < water_level + 2.5 or h < 3.0 or h > 16.0:
			continue
		# estimate slope
		var h2 := _height_at(x + 2.0, z)
		var slope := absf(h2 - h)
		if slope < 0.2:
			continue
		_spawn_cave(Vector3(x, h, z), rng.randf_range(0.0, TAU))
		placed += 1

func _spawn_cave(pos: Vector3, rot_y: float) -> void:
	var cave := Node3D.new()
	cave.name = "CaveEntrance"
	cave.position = pos
	cave.rotation = Vector3(0, rot_y, 0)
	add_child(cave)

	var rock_mat := StandardMaterial3D.new()
	rock_mat.albedo_color = Color(0.38, 0.36, 0.33, 1.0)
	rock_mat.roughness = 1.0

	var dark_mat := StandardMaterial3D.new()
	dark_mat.albedo_color = Color(0.02, 0.02, 0.03, 1.0)
	dark_mat.roughness = 1.0
	dark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	# Surrounding rock mound
	var mound := MeshInstance3D.new()
	var mound_mesh := SphereMesh.new()
	mound_mesh.radius = 3.2
	mound_mesh.height = 4.8
	mound.mesh = mound_mesh
	mound.material_override = rock_mat
	mound.position = Vector3(0, 0.8, -0.2)
	mound.scale = Vector3(1.4, 1.0, 1.3)
	cave.add_child(mound)

	# Dark tunnel interior (visual cave)
	var inner := MeshInstance3D.new()
	var inner_mesh := BoxMesh.new()
	inner_mesh.size = Vector3(2.2, 2.2, 4.5)
	inner.mesh = inner_mesh
	inner.material_override = dark_mat
	inner.position = Vector3(0, 1.0, -1.4)
	cave.add_child(inner)

	# Entrance frame rocks
	var left := MeshInstance3D.new()
	var lm := BoxMesh.new()
	lm.size = Vector3(0.9, 2.4, 1.2)
	left.mesh = lm
	left.material_override = rock_mat
	left.position = Vector3(-1.35, 1.1, 0.5)
	left.rotation_degrees = Vector3(0, 8, -6)
	cave.add_child(left)

	var right := MeshInstance3D.new()
	var rm := BoxMesh.new()
	rm.size = Vector3(0.9, 2.4, 1.2)
	right.mesh = rm
	right.material_override = rock_mat
	right.position = Vector3(1.35, 1.1, 0.5)
	right.rotation_degrees = Vector3(0, -8, 6)
	cave.add_child(right)

	var top := MeshInstance3D.new()
	var tm := BoxMesh.new()
	tm.size = Vector3(3.4, 0.9, 1.4)
	top.mesh = tm
	top.material_override = rock_mat
	top.position = Vector3(0, 2.35, 0.4)
	top.rotation_degrees = Vector3(4, 0, 0)
	cave.add_child(top)

	# Simple collision for cave rocks
	var body := StaticBody3D.new()
	body.add_to_group("build_surface")
	cave.add_child(body)
	for mdata in [
		{"pos": Vector3(0, 0.8, -0.2), "size": Vector3(4.0, 2.2, 3.6)},
		{"pos": Vector3(-1.35, 1.1, 0.5), "size": Vector3(0.9, 2.4, 1.2)},
		{"pos": Vector3(1.35, 1.1, 0.5), "size": Vector3(0.9, 2.4, 1.2)},
		{"pos": Vector3(0, 2.35, 0.4), "size": Vector3(3.4, 0.9, 1.4)},
	]:
		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = mdata["size"]
		cs.shape = bs
		cs.position = mdata["pos"]
		body.add_child(cs)

func _add_tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, uva: Vector2, uvb: Vector2, uvc: Vector2) -> void:
	st.set_color(_height_color(a.y))
	st.set_uv(uva)
	st.add_vertex(a)
	st.set_color(_height_color(b.y))
	st.set_uv(uvb)
	st.add_vertex(b)
	st.set_color(_height_color(c.y))
	st.set_uv(uvc)
	st.add_vertex(c)

func _height_color(h: float) -> Color:
	if h < water_level + 0.3:
		return Color(0.58, 0.52, 0.36, 1.0) # shore/sand
	elif h < 2.5:
		return Color(0.23, 0.5, 0.21, 1.0) # grass
	elif h < 7.0:
		return Color(0.3, 0.45, 0.24, 1.0) # hills
	elif h < 12.0:
		return Color(0.45, 0.43, 0.38, 1.0) # mountain rock
	else:
		return Color(0.82, 0.84, 0.86, 1.0) # snowy peaks

func get_height_at(world_x: float, world_z: float) -> float:
	return _height_at(world_x, world_z)
