// Emit a patch for static, accessible tables, or verify that HTML matches data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/benchmark-tables.json')));
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function panel(id, name, rows, offset, count, table) {
  const ranks = Array.from({length: count}, (_, i) => [...new Set(rows.map(r => r[3 + offset + i]).filter(v => v !== null))].sort((a,b) => b-a));
  const head = id === 'scanrefer'
    ? '<tr><th rowspan="2" scope="col">Method</th><th rowspan="2" scope="col">Venue</th><th colspan="2" scope="colgroup">Unique</th><th colspan="2" scope="colgroup">Multiple</th><th colspan="2" scope="colgroup">Overall</th></tr><tr>' + ['Acc@0.25','Acc@0.5','Acc@0.25','Acc@0.5','Acc@0.25','Acc@0.5'].map(v=>`<th scope="col">${v}</th>`).join('') + '</tr>'
    : '<tr>' + ['Method','Venue','Easy','Hard','View-D','View-I','Overall'].map(v=>`<th scope="col">${v}</th>`).join('') + '</tr>';
  const body = rows.map(row => {
    const cells = row.slice(3+offset, 3+offset+count).map((n,i) => {
      if (n === null) return '<td aria-label="Not reported">—</td>';
      const text = n.toFixed(1);
      return `<td>${n === ranks[i][0] ? `<strong>${text}</strong>` : n === ranks[i][1] ? `<u>${text}</u>` : text}</td>`;
    }).join('');
    return `                  <tr${row[0] === 'PruneGround' ? ' class="ours-row"' : ''}><th scope="row">${esc(row[0])}<small>${esc(row[1])}</small></th><td>${esc(row[2])}</td>${cells}</tr>`;
  }).join('\n');
  return `          <div class="result-panel" id="panel-${id}" role="tabpanel" aria-labelledby="tab-${id}"${id === 'scanrefer' ? '' : ' hidden'}>
            <div class="table-meta"><span>Table ${table} · ${name}</span><span>Accuracy (%) · ↑ higher is better</span></div>
            <div class="table-scroll" tabindex="0" role="region" aria-label="${name} results; scroll horizontally for all columns">
              <table>
                <caption class="sr-only">${name} grounding accuracy from paper Table ${table}, page 7. ${id === 'scanrefer' ? 'Acc@0.25 and Acc@0.5 (IoU).' : 'Acc@0.5 (IoU).'}</caption>
                <thead>${head}</thead>
                <tbody>
${body}
                </tbody>
              </table>
            </div>
            <p class="table-note"><strong>Bold:</strong> best · <u>Underline:</u> second-best · —: not reported. <a href="PruneGround.pdf#page=7" target="_blank" rel="noopener">Paper Table ${table} ↗</a>${id === 'scanrefer' ? '' : ' View-D: view-dependent; View-I: view-independent.'}</p>
          </div>`;
}
const tables = [panel('scanrefer','ScanRefer',data.scanrefer.rows,0,6,1), panel('nr3d','Nr3D',data.referit3d.rows,0,5,2),panel('sr3d','Sr3D',data.referit3d.rows,5,5,2)].join('\n\n');
const html = fs.readFileSync(path.join(root, 'index.html'),'utf8');
const start = html.indexOf('          <div class="result-panel" id="panel-scanrefer"');
const end = html.indexOf('\n        </div>\n', start);
assert.ok(start > 0 && end > start);
const current = html.slice(start,end);
if (process.argv.includes('--check')) {
  assert.equal(current, tables);
  console.log('Verified all 38 displayed rows / 204 accuracy cells from Tables 1–2.');
} else {
  console.log('*** Begin Patch\n*** Update File: ' + path.join(root,'index.html') + '\n@@\n' + current.split('\n').map(s=>'-'+s).join('\n') + '\n' + tables.split('\n').map(s=>'+'+s).join('\n') + '\n*** End Patch');
}
