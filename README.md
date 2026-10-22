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
2. **How PruneGround solves it:** inspect full mesh → released pruned mesh →
   released MCDR text → target availability. This continues in the same room
   with the released TV query. If the doorway query was selected, a visible
   transition explains the query change. Two other released scenes remain
   available in the example selector and are explicitly marked as other rooms.

The official examples do **not** include downstream predicted target boxes.
The final stage shows a clearly labeled ScanNet reference box for the chair
example and an unavailable state for the other scenes. A retained-region box is
the axis-aligned extent of the pruned mesh, not the VLM's original crop box or a
grounded target prediction. `predictedBox` is intentionally `null` in each scene
definition; only populate it with a real, aligned downstream result.

Full/pruned PLYs and the unedited `reformulation.json` files originate from
[`leduckhai/PruneGround`](https://github.com/leduckhai/PruneGround/tree/main/examples).
MCDR statements are model output and may contain errors. These released scenes
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
as the viewer. The doorway description is authored for this demonstration; no
pruning/reformulation output is implied for it. Mesh statistics and source links
are in the collapsed details panel.
