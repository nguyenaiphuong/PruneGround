# PruneGround project page

Project website for **PruneGround: Plug-and-play Spatial Pruning for 3D Visual Grounding**.

- Paper: [arXiv:2606.31148](https://arxiv.org/abs/2606.31148)
- Official code and models: [leduckhai/PruneGround](https://github.com/leduckhai/PruneGround)

This branch is a static GitHub Pages site. Open `index.html` directly or serve the
directory with any static HTTP server.

## Interactive 3D Explorer

One Three.js canvas tells a two-step story:

1. **Why spatial reasoning matters:** switch between the chair nearest the TV
   and the chair nearest the doorway in `scene0011_00`. Surface highlights and
   boxes come from ScanNet instance annotations (chairs 4 and 9; TV 18 and doors
   30), not model predictions. The two descriptions identify opposite ends of
   the same table. Orbit, zoom, top view and reset work throughout.
2. **How PruneGround solves it:** inspect full mesh → pruned mesh →
   refined description → target availability. This continues in the same room with the
   selected query: the authors' released TV output for A, or a compact
   reference-based presentation crop for B. Both chairs use user-supplied
   descriptions with full-room spatial context (see below).
   Two other released scenes remain
   available in the example selector and are explicitly marked as other rooms.

The official examples do **not** include downstream predicted target boxes.
The final stage shows a clearly labeled ScanNet reference box for the chair
example and an unavailable state for the other scenes. A retained-region box is
the axis-aligned extent of the pruned mesh, not the VLM's original crop box or a
grounded target prediction. `predictedBox` is intentionally `null` in each scene
definition; only populate it with a real, aligned downstream result.

Full PLYs, TV-query and other-room outputs originate from
[`leduckhai/PruneGround`](https://github.com/leduckhai/PruneGround/tree/main/examples).
The original doorway `assets/3d/scene0011_00/door/pruned.ply` was generated
on an L40S using the unmodified public code, Qwen2.5-VL-7B and its full prompt.
Its original reformulation is archived in
`assets/inference/chair-door-57_q9bo2/reformulation.json`. The original mesh retains
all reference vertices of chair B **and chair A** and 35.4% of full-scene
triangles. This is broad pruning, not completed grounding. Two short-prompt
configurations failed to retain chair B completely; all attempts, raw outputs
and provenance are documented in [the inference record](assets/inference/README.md).
This is one demo, not a reproduction of benchmark metrics. The browser loads
saved assets; it never runs the model. Full-scene geometry is shared across
query variants, with separate pruning/reformulation caches.

The viewer now loads **`door/display-crop.ply`**, a manually specified 1 m × 1 m
XY crop centered on the reference bounds of chair B. It retains all 3,356
reference vertices of B, none of A, and 18,650 triangles. It is a presentation
crop, not an improved inference result. The original model mesh and logs are
unchanged. MCDR was subsequently rerun on two fresh 512×512 local views of this
exact presentation crop, using the same Qwen2.5-VL-7B model snapshot and unchanged
upstream prompt. The preserved `door/reformulation.json` contains that new raw
output. See `assets/inference/mcdr-door-crop-5dnil1dt/` for the two images,
manifest, old/new JSON and log. No LGSP rerun was performed. The collapsed data-sources panel
records this distinction without adding a label over the scene.

Regenerate or verify the presentation artifact with:

```sh
node scripts/build-display-crop.cjs
node scripts/build-display-crop.cjs --check
```

`display-crop.json` records source/output hashes, construction, geometry counts
and reference coverage. The generator writes only the separate display assets.

For chair A and B, the viewer loads separate **`display-description.json`** files
instead of the original `reformulation.json` files. As of 2026-10-25 these contain
the user's exact replacement wording, not Qwen output or a new MCDR run. The UI
restores four groups: Target properties, Visual additions, Target–anchor relations,
and Additional relations, with `Target: chair` and no narrative summary.
The sofa-chair scene (`scene0050_01`) also uses a separate display file: only
“behind the black coffee table” changes to “behind the brown coffee table and
near the piano chair”; all other statements are retained. These user-authored
changes are not claimed as independently validated model results. The UI uses
neutral “Spatial description” wording, with provenance in collapsed data sources only.
Original A/B model JSON, logs, images and hashes are unchanged.

The sofa-by-door scene's MCDR statements remain unedited model output and may contain errors. These scenes
are not claimed to be the source scenes of paper Figures 1 and 3. The static
Figure 1 illustration has been removed from the page.

Reference annotations come from the ScanNet `aggregation.json` and
`_vh_clean_2.0.010000.segs.json` files, accessed via this
[public mirror](https://huggingface.co/datasets/marvex/scannet-dataset/tree/main/scene0011_00).
`reference-targets.json` records source hashes, the full mesh hash, object
bounds and inclusive vertex-index ranges. Regenerate it with:

```sh
node scripts/build-reference-targets.cjs /path/to/scene0011_00.aggregation.json /path/to/scene0011_00_vh_clean_2.0.010000.segs.json
```

The generator verifies vertex-count agreement and the nearest-chair relations
against all annotated chairs. It applies the same ScanNet axis-alignment matrix
as the viewer. The doorway description is authored for this demonstration.
Reference labels were not provided to model inference. They are used for
post-inference validation, object highlights and the separate presentation crop.
Mesh statistics and source links are in the collapsed details panel.

## Viewer regression check

With Playwright and its Chromium browser installed, serve this directory with
`python3 -m http.server 8765 --bind 127.0.0.1`, then run
`node scripts/test-explorer.cjs` in another terminal. `EXPLORER_URL` can point to
a deployed copy. The test checks both query-specific meshes and reference targets,
the reviewed A/B descriptions and preserved raw inference hashes, one shared full-room download, rapid query
changes, other scenes, orbit/top view, keyboard controls and mobile overflow.
Screenshots are saved to a temporary directory reported by the test.
