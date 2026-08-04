/**
 * FSEG2 Archive Upload
 * - Flattened filenames: S1_2023-2024_Sessions Deuxieme annee.pdf
 * - Track detected from path (\EN\ or \FR\) or filename suffix (_fr / _en)
 * - Upserts into archive_documents with full metadata
 */

import { createClient } from '@supabase/supabase-js';
import fs   from 'fs';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://ahqcjymeeifftcrglani.supabase.co';
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocWNqeW1lZWlmZnRjcmdsYW5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU2MTQyOSwiZXhwIjoyMDg4MTM3NDI5fQ.b1zhiMZgb3aOvIRFQoDosPPRIrn67nZPPEAnm-naJsU';
const BUCKET        = 'exam-papers';
const ARCHIVE_ROOT  = 'C:/Users/User/Desktop/FSEG2_Student_Council_Archive';
const BATCH_SIZE    = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Track detection ───────────────────────────────────────────────────────────
function detectTrack(relativePath) {
  const p = relativePath.replace(/\\/g, '/');
  const segments = p.split('/');
  const filename = segments[segments.length - 1].replace('.pdf', '').toLowerCase();

  // Explicit folder segment: .../EN/... or .../FR/...
  for (const seg of segments) {
    if (seg === 'EN') return 'english';
    if (seg === 'FR') return 'french';
  }

  // Filename suffix: _en, _en , (en), _fr, _fr , (fr)
  if (/[_\s(]en[)\s]?$/.test(filename) || filename.endsWith('_en') || filename.endsWith(' en')) return 'english';
  if (/[_\s(]fr[)\s]?$/.test(filename) || filename.endsWith('_fr') || filename.endsWith(' fr')) return 'french';
  if (filename.endsWith('_fr.pdf') || filename.includes('_fr '))  return 'french';
  if (filename.endsWith('_en.pdf') || filename.includes('_en '))  return 'english';

  // Keywords in path segments
  if (p.toLowerCase().includes('/english') || p.toLowerCase().includes('\\english')) return 'english';
  if (p.toLowerCase().includes('/french')  || p.toLowerCase().includes('\\french'))  return 'french';

  return null; // not explicitly set
}

// ── Metadata extraction ───────────────────────────────────────────────────────
function parseMeta(absolutePath) {
  const relative = absolutePath
    .replace(/\\/g, '/')
    .replace(ARCHIVE_ROOT.replace(/\\/g, '/') + '/', '');

  const parts    = relative.split('/');
  const filename = parts[parts.length - 1];
  const filePath = parts.map(p => p.trim()).join('_'); // flattened

  const semester     = parts[0]; // S1, S2, Master, Concours-Master
  const academicYear = parts.length >= 3 && /^\d{4}-\d{4}$/.test(parts[1])
    ? parts[1]
    : null;

  const track = detectTrack(relative);

  return { original_path: relative, semester, academic_year: academicYear, filename, file_path: filePath, track };
}

// ── Upload ────────────────────────────────────────────────────────────────────
async function uploadOne(absolutePath, meta) {
  const buf = fs.readFileSync(absolutePath);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(meta.file_path, buf, { contentType: 'application/pdf', upsert: true });

  if (upErr) throw new Error(`Storage: ${upErr.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(meta.file_path);

  const { error: dbErr } = await supabase
    .from('archive_documents')
    .upsert(
      { ...meta, storage_url: data.publicUrl, uploaded_at: new Date().toISOString() },
      { onConflict: 'file_path' }
    );

  if (dbErr) throw new Error(`DB: ${dbErr.message}`);
  return data.publicUrl;
}

// ── Walk ──────────────────────────────────────────────────────────────────────
function walkPdfs(dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPdfs(full, list);
    else if (entry.name.toLowerCase().endsWith('.pdf')) list.push(full);
  }
  return list.sort();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Uploading FSEG2 archive to Supabase...');
  console.log(`Bucket  : ${BUCKET}`);
  console.log(`Table   : archive_documents`);
  console.log(`Source  : ${ARCHIVE_ROOT}\n`);

  const files = walkPdfs(ARCHIVE_ROOT);
  const stats = { ok: 0, fail: 0, errors: [], byTrack: { english: 0, french: 0, unknown: 0 } };

  console.log(`Found ${files.length} PDFs. Uploading in batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (fp) => {
      const meta = parseMeta(fp);
      const n    = i + batch.indexOf(fp) + 1;
      try {
        await uploadOne(fp, meta);
        stats.ok++;
        const trackLabel = meta.track ?? 'unknown';
        stats.byTrack[trackLabel] = (stats.byTrack[trackLabel] ?? 0) + 1;
        console.log(`  [${n}/${files.length}] OK  [${trackLabel.padEnd(7)}] ${meta.file_path}`);
      } catch (err) {
        stats.fail++;
        stats.errors.push({ file: meta.original_path, error: err.message });
        console.error(`  [${n}/${files.length}] ERR ${meta.original_path}: ${err.message}`);
      }
    }));
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`Uploaded : ${stats.ok}/${files.length}`);
  console.log(`Failed   : ${stats.fail}`);
  console.log(`Track breakdown:`);
  for (const [t, c] of Object.entries(stats.byTrack)) console.log(`  ${t.padEnd(10)}: ${c}`);

  if (stats.errors.length) {
    console.log('\nFailed files:');
    stats.errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }

  fs.writeFileSync('scripts/upload-report.json', JSON.stringify({ ...stats, run_at: new Date().toISOString() }, null, 2));
  console.log('\nReport saved to scripts/upload-report.json');
}

main().catch(console.error);
