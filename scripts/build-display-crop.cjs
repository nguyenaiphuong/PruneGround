// Build the presentation crop for chair B; preserve the original model outputs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
global.THREE = require(path.join(root, 'assets/vendor/three-r128/three.min.js'));
require(path.join(root, 'assets/vendor/three-r128/PLYLoader.js'));
const sceneDir = path.join(root, 'assets/3d/scene0011_00');
const fullBytes = fs.readFileSync(path.join(sceneDir, 'full.ply'));
const referenceBytes = fs.readFileSync(path.join(sceneDir, 'reference-targets.json'));
const reference = JSON.parse(referenceBytes);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const mesh = new THREE.PLYLoader().parse(fullBytes.buffer.slice(fullBytes.byteOffset, fullBytes.byteOffset + fullBytes.byteLength));
mesh.applyMatrix4(new THREE.Matrix4().set(-.996195,.087156,0,3.881280,-.087156,-.996195,0,4.119080,0,0,1,-.071016,0,0,0,1));
const target = reference.objects[9];
const margin = .12;
const minExtent = 1;
const crop = [0, 1].map(axis => {
  const center = (target.min[axis] + target.max[axis]) / 2;
  const half = Math.max((target.max[axis] - target.min[axis]) / 2 + margin, minExtent / 2);
  return [center - half, center + half];
});
const positions = mesh.attributes.position;
const colors = mesh.attributes.color;
const inside = new Uint8Array(positions.count);
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i), y = positions.getY(i);
  inside[i] = x >= crop[0][0] && x <= crop[0][1] && y >= crop[1][0] && y <= crop[1][1];
}
const faces = [];
const used = new Set();
const indices = mesh.index.array;
for (let i = 0; i < indices.length; i += 3) {
  const face = [indices[i], indices[i + 1], indices[i + 2]];
  if (face.every(id => inside[id])) {
    faces.push(face);
    face.forEach(id => used.add(id));
  }
}
const coverage = {};
for (const id of [4, 9]) {
  let total = 0, retained = 0;
  for (const [start, end] of reference.objects[id].vertexRanges) {
    for (let i = start; i <= end; i++) { total++; if (used.has(i)) retained++; }
  }
  coverage[id] = { retained, total, fraction: retained / total };
}
assert.equal(coverage[9].fraction, 1, 'The display crop must preserve all chair B vertices');
assert.equal(coverage[4].fraction, 0, 'The display crop must exclude chair A');
assert.ok(faces.length > 0);
const vertexIds = [...used].sort((a, b) => a - b);
const remap = new Map(vertexIds.map((id, index) => [id, index]));
const header = Buffer.from([
  'ply', 'format binary_little_endian 1.0',
  'comment Presentation crop around reference chair 9; not a model-predicted region',
  'element vertex ' + vertexIds.length,
  'property float x', 'property float y', 'property float z',
  'property uchar red', 'property uchar green', 'property uchar blue',
  'element face ' + faces.length, 'property list uchar int vertex_indices', 'end_header', ''
].join('\n'));
const body = Buffer.alloc(vertexIds.length * 15 + faces.length * 13);
let offset = 0;
for (const id of vertexIds) {
  for (const value of [positions.getX(id), positions.getY(id), positions.getZ(id)]) {
    body.writeFloatLE(value, offset); offset += 4;
  }
  for (const value of [colors.getX(id), colors.getY(id), colors.getZ(id)]) body[offset++] = Math.round(value * 255);
}
for (const face of faces) {
  body[offset++] = 3;
  for (const id of face) { body.writeInt32LE(remap.get(id), offset); offset += 4; }
}
const bytes = Buffer.concat([header, body]);
const metadata = {
  kind: 'reference_based_presentation_crop', model_prediction: false,
  scene_id: 'scene0011_00', reference_object_id: 9,
  construction: 'XY crop around the reference chair bounds, 0.12 m context margin, minimum 1 m extent on each axis; retain full height and complete triangles.',
  xy_bounds: crop, vertices: vertexIds.length, triangles: faces.length,
  full_triangles: indices.length / 3, reference_coverage: coverage,
  full_mesh_sha256: hash(fullBytes), reference_sha256: hash(referenceBytes),
  display_mesh_sha256: hash(bytes),
  original_inference_mesh: 'pruned.ply',
  reformulation_source: 'Unedited MCDR output rerun on two fresh local views of this presentation crop using Qwen2.5-VL-7B-Instruct.',
  reformulation_manifest: '../../../inference/mcdr-door-crop-5dnil1dt/manifest.json'
};
const plyPath = path.join(sceneDir, 'door/display-crop.ply');
const metadataPath = path.join(sceneDir, 'door/display-crop.json');
if (process.argv.includes('--check')) {
  assert.equal(hash(fs.readFileSync(plyPath)), metadata.display_mesh_sha256);
  assert.deepEqual(JSON.parse(fs.readFileSync(metadataPath)), metadata);
  // Check serialized geometry too, not just the construction arrays.
  const parsed = new THREE.PLYLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(parsed.attributes.position.count, vertexIds.length);
  assert.equal(parsed.index.count / 3, faces.length);
  vertexIds.forEach((id, i) => {
    assert.equal(parsed.attributes.position.getX(i), positions.getX(id));
    assert.equal(parsed.attributes.position.getY(i), positions.getY(id));
    assert.equal(parsed.attributes.position.getZ(i), positions.getZ(id));
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(parsed.attributes.color.array[i * 3 + c] - colors.array[id * 3 + c]) < 1e-6);
  });
} else {
  fs.writeFileSync(plyPath, bytes);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
}
console.log(JSON.stringify(metadata, null, 2));
