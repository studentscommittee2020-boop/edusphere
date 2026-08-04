import os, json

# Manual overrides: key = substring of normalized rel path (lowercase, forward slashes)
# Value = 'english' | 'french' | 'both'
MANUAL_OVERRIDES = {
    # All files under S1/2023-2024
    's1/2023-2024': 'both',
    # S1/21 22/1er semester folder — french
    '1er eco sem-1-': 'french',
    # S2/21 22/2emme specific files
    's2/21 22/2emme/2 em  eng 21 22': 'english',
    's2/21 22/2emme/2eme annee sem 2 21 22': 'both',
    's2/21 22/2emme/2eme eco sem 2': 'both',
    # S2/21 22/3emme specific files
    's2/21 22/3emme/3eme sem2 eng 21-22': 'english',
    's2/21 22/3emme/3eme eco sem 2 21-22': 'french',
    's2/21 22/3emme/3eme sem2 21-22': 'french',
}

def detect_track(rel):
    norm = rel.replace('\\', '/').lower()
    # Check manual overrides first (most specific wins — longer key)
    matches = [(k, v) for k, v in MANUAL_OVERRIDES.items() if k in norm]
    if matches:
        return max(matches, key=lambda x: len(x[0]))[1]

    parts = rel.replace('\\', '/').split('/')
    fn = parts[-1].replace('.pdf','').lower()
    for seg in parts:
        if seg == 'EN': return 'english'
        if seg == 'FR': return 'french'
    if fn.endswith('_fr') or fn.endswith(' fr'): return 'french'
    if fn.endswith('_en') or fn.endswith(' en'): return 'english'
    return None

root = r'C:\Users\User\Desktop\FSEG2_Student_Council_Archive'
files = []
for dp, _, flist in os.walk(root):
    for f in sorted(flist):
        if not f.lower().endswith('.pdf'): continue
        rel  = os.path.relpath(os.path.join(dp, f), root)
        flat = rel.replace('\\', '_').replace('/', '_')
        t    = detect_track(rel)
        files.append({'rel': rel, 'flat': flat, 'filename': f, 'track': t})

files.sort(key=lambda x: x['rel'])

HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FSEG2 Archive — Track Assignment</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #e5e5e5; min-height: 100vh; }
  header { background: #1a1a1a; border-bottom: 1px solid #2a2a2a; padding: 18px 24px; display:flex; align-items:center; gap:16px; justify-content:space-between; position:sticky; top:0; z-index:10; }
  h1 { font-size: 1rem; font-weight: 600; color: #fff; }
  .stats { font-size: 0.75rem; color: #888; display:flex; gap:16px; }
  .stat { display:flex; align-items:center; gap:6px; }
  .dot { width:8px; height:8px; border-radius:50%; }
  .dot.en { background:#3b82f6; } .dot.fr { background:#ef4444; } .dot.both { background:#a855f7; } .dot.none { background:#444; }
  .toolbar { background:#161616; border-bottom:1px solid #222; padding:10px 24px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .toolbar input { background:#222; border:1px solid #333; color:#e5e5e5; padding:6px 12px; border-radius:6px; font-size:0.8rem; width:260px; outline:none; }
  .toolbar input:focus { border-color:#555; }
  .btn { padding:6px 14px; border-radius:6px; font-size:0.75rem; cursor:pointer; border:none; font-weight:500; transition:opacity .15s; }
  .btn:hover { opacity:.85; }
  .btn-blue { background:#3b82f6; color:#fff; }
  .btn-red  { background:#ef4444; color:#fff; }
  .btn-purple { background:#a855f7; color:#fff; }
  .btn-gray  { background:#333; color:#ccc; }
  .btn-green { background:#22c55e; color:#000; }
  .filter-btns { display:flex; gap:6px; margin-left:auto; }
  .fbtn { padding:5px 12px; border-radius:6px; font-size:0.75rem; cursor:pointer; border:1px solid #333; background:transparent; color:#aaa; }
  .fbtn.active { background:#222; color:#fff; border-color:#555; }
  table { width:100%; border-collapse:collapse; }
  thead th { background:#1a1a1a; padding:10px 16px; font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em; color:#666; text-align:left; position:sticky; top:57px; }
  tbody tr { border-bottom:1px solid #1e1e1e; transition:background .1s; }
  tbody tr:hover { background:#171717; }
  tbody tr.hidden { display:none; }
  td { padding:9px 16px; font-size:0.8rem; vertical-align:middle; }
  td.num { color:#555; width:48px; font-size:0.7rem; }
  td.name { color:#e5e5e5; font-weight:500; }
  td.path { color:#666; font-size:0.72rem; max-width:340px; word-break:break-all; }
  .checks { display:flex; gap:8px; }
  label { display:flex; align-items:center; gap:5px; cursor:pointer; padding:4px 10px; border-radius:5px; font-size:0.75rem; border:1px solid transparent; user-select:none; transition:all .1s; }
  label:hover { background:#222; }
  input[type=checkbox] { accent-color:#3b82f6; width:14px; height:14px; cursor:pointer; }
  label.lbl-en  { color:#93c5fd; } label.lbl-en input  { accent-color:#3b82f6; }
  label.lbl-fr  { color:#fca5a5; } label.lbl-fr input  { accent-color:#ef4444; }
  label.lbl-both{ color:#d8b4fe; } label.lbl-both input{ accent-color:#a855f7; }
  tr.track-en   td.name { border-left:2px solid #3b82f6; padding-left:14px; }
  tr.track-fr   td.name { border-left:2px solid #ef4444; padding-left:14px; }
  tr.track-both td.name { border-left:2px solid #a855f7; padding-left:14px; }
  tr.track-none td.name { border-left:2px solid #2a2a2a; padding-left:14px; }
  .export-area { display:none; background:#111; border:1px solid #333; border-radius:8px; margin:16px 24px; padding:16px; }
  .export-area textarea { width:100%; background:#0a0a0a; border:1px solid #222; color:#aaa; font-size:0.72rem; font-family:monospace; border-radius:6px; padding:12px; min-height:120px; resize:vertical; }
  .section-header { background:#141414; padding:8px 16px; font-size:0.7rem; color:#555; text-transform:uppercase; letter-spacing:.08em; border-bottom:1px solid #1a1a1a; }
</style>
</head>
<body>
<header>
  <div>
    <h1>FSEG2 Student Council Archive — Track Assignment</h1>
    <div style="font-size:0.72rem;color:#666;margin-top:3px;">Check EN / FR / BOTH for each file. Pre-filled from path detection.</div>
  </div>
  <div class="stats">
    <span class="stat"><span class="dot en"></span><span id="cnt-en">0</span> English</span>
    <span class="stat"><span class="dot fr"></span><span id="cnt-fr">0</span> French</span>
    <span class="stat"><span class="dot both"></span><span id="cnt-both">0</span> Both</span>
    <span class="stat"><span class="dot none"></span><span id="cnt-none">0</span> Unset</span>
  </div>
</header>

<div class="toolbar">
  <input type="text" id="search" placeholder="Search filename or path...">
  <button class="btn btn-blue" onclick="bulkSet('en')">Set EN</button>
  <button class="btn btn-red"  onclick="bulkSet('fr')">Set FR</button>
  <button class="btn btn-purple" onclick="bulkSet('both')">Set Both</button>
  <button class="btn btn-gray"   onclick="bulkClear()">Clear selection</button>
  <button class="btn btn-green"  onclick="exportJSON()">Export JSON</button>
  <div class="filter-btns">
    <button class="fbtn active" onclick="filterRows('all',this)">All</button>
    <button class="fbtn" onclick="filterRows('en',this)">EN</button>
    <button class="fbtn" onclick="filterRows('fr',this)">FR</button>
    <button class="fbtn" onclick="filterRows('both',this)">Both</button>
    <button class="fbtn" onclick="filterRows('none',this)">Unset</button>
  </div>
</div>

<div class="export-area" id="export-area">
  <div style="font-size:0.75rem;color:#888;margin-bottom:8px;">JSON output — paste this into the chat:</div>
  <textarea id="export-txt" readonly></textarea>
  <button class="btn btn-gray" style="margin-top:8px" onclick="copyExport()">Copy to clipboard</button>
  <button class="btn btn-gray" style="margin-top:8px;margin-left:8px" onclick="document.getElementById('export-area').style.display='none'">Close</button>
</div>

<table id="main-table">
<thead>
  <tr>
    <th style="width:48px">#</th>
    <th>Filename</th>
    <th>Path</th>
    <th style="width:260px">Track</th>
  </tr>
</thead>
<tbody id="tbody">
'''

for i, f in enumerate(files, 1):
    rel_escaped = f['rel'].replace('\\', '\\\\').replace("'", "\\'")
    fn_escaped  = f['filename'].replace("'", "\\'")
    t = f['track']
    en_chk   = 'checked' if t == 'english' else ''
    fr_chk   = 'checked' if t == 'french'  else ''
    both_chk = 'checked' if t == 'both'    else ''
    tr_class = f'track-{t if t else "none"}'
    path_parts = f['rel'].replace('\\', ' / ')
    # Remove filename from path display
    path_dir = path_parts.rsplit(' / ', 1)[0] if ' / ' in path_parts else ''

    HTML += f'''  <tr class="{tr_class}" data-idx="{i}" data-path="{rel_escaped}" data-name="{fn_escaped}">
    <td class="num">{i}</td>
    <td class="name">{f["filename"]}</td>
    <td class="path">{path_dir}</td>
    <td>
      <div class="checks">
        <label class="lbl-en"><input type="checkbox" {en_chk} onchange="onCheck(this,{i},'en')"> EN</label>
        <label class="lbl-fr"><input type="checkbox" {fr_chk} onchange="onCheck(this,{i},'fr')"> FR</label>
        <label class="lbl-both"><input type="checkbox" {both_chk} onchange="onCheck(this,{i},'both')"> Both</label>
      </div>
    </td>
  </tr>
'''

HTML += '''</tbody>
</table>

<script>
const rows = Array.from(document.querySelectorAll('#tbody tr'));
let currentFilter = 'all';

function getTrack(row) {
  const [en, fr, both] = row.querySelectorAll('input[type=checkbox]');
  if (both.checked) return 'both';
  if (en.checked && fr.checked) return 'both';
  if (en.checked) return 'en';
  if (fr.checked) return 'fr';
  return 'none';
}

function setRowClass(row) {
  row.className = row.className.replace(/track-\\w+/, '').trim();
  row.classList.add('track-' + getTrack(row));
}

function updateStats() {
  let en=0, fr=0, both=0, none=0;
  rows.forEach(r => {
    const t = getTrack(r);
    if(t==='en') en++;
    else if(t==='fr') fr++;
    else if(t==='both') both++;
    else none++;
  });
  document.getElementById('cnt-en').textContent   = en;
  document.getElementById('cnt-fr').textContent   = fr;
  document.getElementById('cnt-both').textContent = both;
  document.getElementById('cnt-none').textContent = none;
}

function applyFilter() {
  const q = document.getElementById('search').value.toLowerCase();
  rows.forEach(r => {
    const name = r.dataset.name.toLowerCase();
    const path = r.dataset.path.toLowerCase();
    const matchSearch = !q || name.includes(q) || path.includes(q);
    const t = getTrack(r);
    const matchFilter = currentFilter === 'all' || t === currentFilter || (currentFilter==='none' && t==='none');
    r.classList.toggle('hidden', !(matchSearch && matchFilter));
  });
}

function onCheck(cb, idx, type) {
  const row = document.querySelector(`tr[data-idx="${idx}"]`);
  const [en, fr, both] = row.querySelectorAll('input[type=checkbox]');
  // "Both" is exclusive — if checked, uncheck en/fr; if en/fr checked, uncheck both
  if (type === 'both' && cb.checked) { en.checked = false; fr.checked = false; }
  if ((type==='en'||type==='fr') && cb.checked) { both.checked = false; }
  setRowClass(row);
  updateStats();
  applyFilter();
}

function filterRows(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilter();
}

function getVisibleRows() {
  return rows.filter(r => !r.classList.contains('hidden'));
}

function bulkSet(track) {
  getVisibleRows().forEach(r => {
    const [en, fr, both] = r.querySelectorAll('input[type=checkbox]');
    en.checked = track === 'en'; fr.checked = track === 'fr'; both.checked = track === 'both';
    setRowClass(r);
  });
  updateStats(); applyFilter();
}

function bulkClear() {
  getVisibleRows().forEach(r => {
    r.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
    setRowClass(r);
  });
  updateStats(); applyFilter();
}

function exportJSON() {
  const result = rows.map(r => ({
    file: r.dataset.path,
    track: getTrack(r) === 'none' ? null : getTrack(r)
  }));
  const txt = JSON.stringify(result, null, 2);
  document.getElementById('export-txt').value = txt;
  document.getElementById('export-area').style.display = 'block';
  document.getElementById('export-area').scrollIntoView({behavior:'smooth'});
}

function copyExport() {
  navigator.clipboard.writeText(document.getElementById('export-txt').value)
    .then(() => alert('Copied!'));
}

document.getElementById('search').addEventListener('input', applyFilter);
updateStats();
</script>
</body>
</html>'''

out = r'C:\Users\User\Desktop\fseg2-track-assignment.html'
with open(out, 'w', encoding='utf-8') as fh:
    fh.write(HTML)

print(f'Generated: {out}')
print(f'Total files: {len(files)}')
