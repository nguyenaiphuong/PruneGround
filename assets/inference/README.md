# Doorway-query inference record

This is a single-scene demonstration, not a benchmark or a reproduction of paper scores.
The authors' released TV query is unchanged. The doorway output was generated separately
on 22 October 2026 using their unmodified public LGSP and MCDR scripts.

- Code: [leduckhai/PruneGround at 680945d](https://github.com/leduckhai/PruneGround/tree/680945de5c3a474f942b3e5645dd628ba2178552).
- Scene: `scene0011_00`; original full mesh, top view and, for the full prompt, four RGB/depth side-view pairs.
- Exact query: **The chair nearest the doorway, at the opposite end of the table from the TV.**
- Hardware: NVIDIA L40S; PyTorch 2.8.0+cu128, Transformers 4.51.3, Open3D 0.19.0.
- Decoding: upstream greedy generation (`do_sample=False`); prune padding 0.25 m, minimum crop size 1 m.
- No reference object IDs, boxes or instance labels were provided to the model.

## All attempts

| Run record | Model / prompt | Full-room triangles retained | Chair B reference vertices retained | Chair A reference vertices retained |
| --- | --- | --- | --- | --- |
| [chair-door-32zgr1z_](chair-door-32zgr1z_/manifest.json) | Qwen2.5-VL-3B / simple | 10.73% | 20.65% | 0% |
| [chair-door-57_q9bo2](chair-door-57_q9bo2/manifest.json) | Qwen2.5-VL-7B / full | 35.44% | 100% | 100% |
| [chair-door-uunuwn0w](chair-door-uunuwn0w/manifest.json) | Qwen2.5-VL-7B / simple | 6.99% | 0% | 0% |

The **7B/full** run is displayed because it preserves the intended chair. Its crop
is broad: it retains both A and B and other furniture. It does not isolate or
ground the target. The short-prompt attempts clip or miss B and are not shown as
successful examples. This choice was made after checking reference annotations;
these three attempts must not be interpreted as a held-out accuracy estimate.

Each run directory contains `manifest.json`, `pruning-prediction.json`,
`reference-validation.json`, `lgsp.log`, `mcdr.log`, `pip-freeze.txt`,
the unedited `reformulation.json` and `topview_pred.png`.
Manifests record the model snapshot, input/output SHA-256 hashes, original commands
and runtime. `status: completed` means execution completed, not semantic success.
All original mesh/local-view outputs were also archived locally before GPU teardown.

## Validation and limitations

Validation matches the actual pruned mesh vertices against the axis-aligned full
mesh's ScanNet reference vertices, with 0.00002 m tolerance. Chair B is instance 9
(3,356 vertices); chair A is instance 4 (3,781 vertices). Triangle retention is
pruned triangle count / 451,905 full-scene triangles, not an accuracy metric.

The validation field `differentFromTVQuery` means less than 10% of chair A is
retained. It is only an extra selectivity diagnostic, not an LGSP success criterion
or a claim that the two meshes are identical. It is false for the broad 7B/full crop.

The full-prompt MCDR output contains questionable visual claims, including
“wooden, brown.” Text is displayed without manual correction; it is not verified fact.

The public checkout supplies LGSP pruning and MCDR reformulation, **not a downstream
3D grounding implementation/output**. `predicted_target_box` remains null. The
viewer therefore labels the final chair box **reference only**, derived from
ScanNet annotations. A pruning rectangle, a retained-mesh extent and an object
prediction are different things.

The website serves precomputed assets. Clicking a description does not start GPU
inference. This demonstration is not claimed to use the original scenes of paper
Figures 1 or 3.
