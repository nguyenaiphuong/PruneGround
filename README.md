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
   MCDR text → target availability. This continues in the same room with the
   selected query: the authors' released TV output for A, or new Runpod
   inference for the doorway query B. Two other released scenes remain
   available in the example selector and are explicitly marked as other rooms.

The official examples do **not** include downstream predicted target boxes.
The final stage shows a clearly labeled ScanNet reference box for the chair
example and an unavailable state for the other scenes. A retained-region box is
the axis-aligned extent of the pruned mesh, not the VLM's original crop box or a
grounded target prediction. `predictedBox` is intentionally `null` in each scene
definition; only populate it with a real, aligned downstream result.

Full PLYs, TV-query and other-room outputs originate from
[`leduckhai/PruneGround`](https://github.com/leduckhai/PruneGround/tree/main/examples).
The doorway variant in `assets/3d/scene0011_00/door/` was generated on an L40S
using the unmodified public code, Qwen2.5-VL-7B and its full prompt. It retains
all reference vertices of chair B **and chair A** and 35.4% of full-scene
triangles. This is broad pruning, not completed grounding. Two short-prompt
configurations failed to retain chair B completely; all attempts, raw outputs
and provenance are documented in [the inference record](assets/inference/README.md).
This is one demo, not a reproduction of benchmark metrics. The browser loads
saved assets; it never runs the model. Full-scene geometry is shared across
query variants, with separate pruning/reformulation caches.

MCDR statements are unedited model output and may contain errors. These scenes
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
Reference labels were used only to validate outputs after inference, not as
model input. Mesh statistics and source links are in the collapsed details panel.

## Viewer regression check

With Playwright and its Chromium browser installed, serve this directory with
`python3 -m http.server 8765 --bind 127.0.0.1`, then run
`node scripts/test-explorer.cjs` in another terminal. `EXPLORER_URL` can point to
a deployed copy. The test checks both query-specific meshes and reference targets,
the unedited doorway reformulation, one shared full-room download, rapid query
changes, other scenes, orbit/top view, keyboard controls and mobile overflow.
Screenshots are saved to a temporary directory reported by the test.
