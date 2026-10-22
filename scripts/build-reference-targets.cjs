// Generate the viewer's reference annotations from ScanNet instance segments.
// Usage: node scripts/build-reference-targets.cjs <aggregation.json> <segs.json>
// The input vertex order must match the released scene0011_00 full mesh.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
global.THREE = require(path.join(root, 'assets/vendor/three-r128/three.min.js'));
require(path.join(root, 'assets/vendor/three-r128/PLYLoader.js'));
const [aggregationPath, segmentsPath] = process.argv.slice(2);
if (!aggregationPath || !segmentsPath) throw new Error('Pass aggregation.json and segs.json paths.');
const aggregationBytes = fs.readFileSync(aggregationPath);
const segmentBytes = fs.readFileSync(segmentsPath);
const aggregation = JSON.parse(aggregationBytes);
const { segIndices } = JSON.parse(segmentBytes);
const meshBytes = fs.readFileSync(path.join(root, 'assets/3d/scene0011_00/full.ply'));
const geometry = new THREE.PLYLoader().parse(meshBytes.buffer.slice(meshBytes.byteOffset, meshBytes.byteOffset + meshBytes.byteLength));
assert.equal(segIndices.length, geometry.attributes.position.count, 'Segmentation and mesh vertex counts differ');
geometry.applyMatrix4(new THREE.Matrix4().set(
  -0.996195, 0.087156, 0, 3.881280, -0.087156, -0.996195, 0, 4.119080,
  0, 0, 1, -0.071016, 0, 0, 0, 1
));
const objects = {};
for (const id of [4, 9, 18, 30]) {
  const instance = aggregation.segGroups.find((group) => group.objectId === id);
  assert.ok(instance, `Missing object ${id}`);
  const segments = new Set(instance.segments);
  const bounds = new THREE.Box3();
  const vertexRanges = [];
  let count = 0;
  for (let i = 0; i < segIndices.length; i++) {
    if (!segments.has(segIndices[i])) continue;
    count++;
    bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i));
    const last = vertexRanges[vertexRanges.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else vertexRanges.push([i, i]);
  }
  assert.ok(count > 0);
  objects[id] = { label: instance.label, vertexCount: count, min: bounds.min.toArray(), max: bounds.max.toArray(), vertexRanges };
}
assert.equal(objects[4].label, 'chair');
assert.equal(objects[9].label, 'chair');
// Validate the two authored spatial descriptions against all annotated chairs.
for (const [anchorId, targetId] of [[18, 4], [30, 9]]) {
  const anchor = new THREE.Box3(new THREE.Vector3(...objects[anchorId].min), new THREE.Vector3(...objects[anchorId].max)).getCenter(new THREE.Vector3());
  const distances = aggregation.segGroups.filter((o) => o.label === 'chair').map((o) => {
    const segments = new Set(o.segments);
    const box = new THREE.Box3();
    for (let i = 0; i < segIndices.length; i++) if (segments.has(segIndices[i])) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i));
    return { id: o.objectId, distance: box.getCenter(new THREE.Vector3()).distanceTo(anchor) };
  }).sort((a, b) => a.distance - b.distance);
  assert.equal(distances[0].id, targetId, 'Spatial description does not match the nearest annotated chair');
}
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const output = {
  sceneId: 'scene0011_00', kind: 'reference_annotation', coordinateSystem: 'ScanNet axis-aligned, z-up',
  provenance: {
    dataset: 'ScanNet instance annotations, accessed through a public dataset mirror',
    source: 'https://huggingface.co/datasets/marvex/scannet-dataset/tree/main/scene0011_00',
    format: 'https://github.com/ScanNet/ScanNet',
    aggregationSha256: digest(aggregationBytes), segmentsSha256: digest(segmentBytes), fullMeshSha256: digest(meshBytes),
    note: 'Boxes are bounds of annotated vertices, not PruneGround predictions. The doorway query is authored for this demo; no pruning or reformulation result is supplied for it.'
  }, objects
};
fs.writeFileSync(path.join(root, 'assets/3d/scene0011_00/reference-targets.json'), JSON.stringify(output) + '\n');
console.log('Generated reference targets: chairs 4 and 9; anchors TV 18 and doorway 30. Nearest-chair checks passed.');
