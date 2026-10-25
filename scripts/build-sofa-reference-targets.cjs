// Derive reference boxes, never predictions, from the exact ScanNet mesh/segments.
// Usage: node scripts/build-sofa-reference-targets.cjs <annotation-directory> [--check]
// Without --check, emit an apply_patch patch for the generated JSON assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const input = process.argv[2];
assert.ok(input, 'Pass a directory containing each scene aggregation, segments and .txt file.');
global.THREE = require(path.join(root, 'assets/vendor/three-r128/three.min.js'));
require(path.join(root, 'assets/vendor/three-r128/PLYLoader.js'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const parse = bytes => new THREE.PLYLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
const specs = [
  {id: 'scene0025_00', target: 3, fullHash: 'b32e7c910ac77944f96f9ae69b214b36c8e151b8120bf7e7eb9b9bcb04d848b1',
    reason: 'Manually associated with the black sofa shown in the released pruned example, next to the doorway and file cabinet. Object 3 is retained; the other couch (4) is outside the crop.'},
  {id: 'scene0050_01', target: 0, fullHash: '80603cf10d517b7459bc35cec79f6adbba4b9b3d4a72e1deb7bf7c0fd405b2db',
    reason: 'Manually associated with the large brown sofa beside the window in the released pruned example. ScanNet labels this object couch (0). The separately annotated sofa chair (11) is elsewhere in the room and is not the displayed target.'}
];
let patch = '*** Begin Patch\n';
for (const spec of specs) {
  const read = suffix => fs.readFileSync(path.join(input, spec.id + suffix));
  const aggregationBytes = read('.aggregation.json');
  const segmentsBytes = read('_vh_clean_2.0.010000.segs.json');
  const alignmentBytes = read('.txt');
  const aggregation = JSON.parse(aggregationBytes);
  const {segIndices} = JSON.parse(segmentsBytes);
  const alignment = alignmentBytes.toString().match(/axisAlignment = (.*)/)[1].trim().split(/\s+/).map(Number);
  assert.equal(alignment.length, 16);
  const meshBytes = fs.readFileSync(path.join(root, 'assets/3d', spec.id, 'full.ply'));
  assert.equal(hash(meshBytes), spec.fullHash, 'Full mesh must match the public annotation mesh byte-for-byte');
  const mesh = parse(meshBytes);
  assert.equal(mesh.attributes.position.count, segIndices.length);
  mesh.applyMatrix4(new THREE.Matrix4().set(...alignment));
  const instance = aggregation.segGroups.find(g => g.objectId === spec.target);
  assert.equal(instance.label, 'couch');
  const segments = new Set(instance.segments);
  const bounds = new THREE.Box3();
  const vertexRanges = [];
  const vertices = [];
  for (let i = 0; i < segIndices.length; i++) {
    if (!segments.has(segIndices[i])) continue;
    const p = new THREE.Vector3().fromBufferAttribute(mesh.attributes.position, i);
    bounds.expandByPoint(p);
    vertices.push(p);
    const last = vertexRanges.at(-1);
    if (last && last[1] === i-1) last[1] = i;
    else vertexRanges.push([i,i]);
  }
  const prunedBytes = fs.readFileSync(path.join(root, 'assets/3d', spec.id, 'pruned.ply'));
  const pruned = parse(prunedBytes);
  pruned.computeBoundingBox();
  // Check actual retained points, not just overlap with a broad crop bounding box.
  const tolerance = 0.0001;
  const cells = new Map();
  const cell = p => p.toArray().map(v => Math.floor(v / tolerance));
  for (let i = 0; i < pruned.attributes.position.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pruned.attributes.position, i);
    const key = cell(p).join(',');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }
  let retained = 0;
  for (const p of vertices) {
    const [x,y,z] = cell(p);
    let found = false;
    for (let dx=-1; dx<=1 && !found; dx++) for (let dy=-1; dy<=1 && !found; dy++) for (let dz=-1; dz<=1 && !found; dz++) {
      found = (cells.get([x+dx,y+dy,z+dz].join(',')) || []).some(q => q.distanceToSquared(p) <= tolerance*tolerance);
    }
    if (found) retained++;
  }
  assert.equal(retained, vertices.length, 'Target must be entirely present in the released pruned mesh');
  const output = {
    sceneId: spec.id, kind: 'reference_annotation', model_prediction: false,
    coordinateSystem: 'ScanNet axis-aligned, z-up', axisAlignment: alignment,
    targetObjectId: spec.target,
    provenance: {
      dataset: 'ScanNet instance annotations, accessed through a public dataset mirror',
      source: 'https://huggingface.co/datasets/marvex/scannet-dataset/tree/main/' + spec.id,
      aggregationSha256: hash(aggregationBytes), segmentsSha256: hash(segmentsBytes),
      alignmentSha256: hash(alignmentBytes), fullMeshSha256: hash(meshBytes), prunedMeshSha256: hash(prunedBytes),
      selection: spec.reason,
      note: 'Box coordinates are exact bounds of annotated object vertices. The query-to-instance association is manually checked against the released scene, not a grounding prediction or an official query-ground-truth release.'
    },
    validation: {targetVertices: vertices.length, retainedTargetVertices: retained, matchingToleranceMetres: tolerance},
    objects: {[spec.target]: {label: instance.label, displayLabel: 'sofa', vertexCount: vertices.length, min: bounds.min.toArray(), max: bounds.max.toArray(), vertexRanges}}
  };
  const file = path.join(root, 'assets/3d', spec.id, 'reference-targets.json');
  const content = JSON.stringify(output) + '\n';
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(file, 'utf8'), content);
  else {
    patch += (fs.existsSync(file) ? '*** Update File: ' + file + '\n@@\n-' + fs.readFileSync(file, 'utf8').trimEnd() : '*** Add File: ' + file) + '\n+' + content;
  }
}
if (process.argv.includes('--check')) console.log('Both sofa reference boxes verified against exact mesh hashes, instance segments and complete retained target geometry.');
else console.log(patch + '*** End Patch');
