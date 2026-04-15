// One-shot: wipes all files from the `documents` storage bucket
// and all rows from the `documents` table.
//
// Run from the buildforge project root:
//   node scripts/wipe-documents.mjs
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (or env).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

// Load .env.local manually (no dotenv dependency assumed)
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function walk(prefix = '') {
  const files = [];
  const { data, error } = await supabase.storage
    .from('documents')
    .list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      files.push(...(await walk(full))); // folder
    } else {
      files.push(full);
    }
  }
  return files;
}

console.log('Listing all files in documents bucket...');
const paths = await walk();
console.log(`Found ${paths.length} files.`);

if (paths.length) {
  // Supabase remove() accepts batches; chunk to be safe
  const chunks = [];
  for (let i = 0; i < paths.length; i += 100) chunks.push(paths.slice(i, i + 100));
  for (const chunk of chunks) {
    const { error } = await supabase.storage.from('documents').remove(chunk);
    if (error) throw error;
  }
  console.log(`Deleted ${paths.length} storage objects.`);
}

console.log('Deleting rows from documents table...');
const { error: dbError, count } = await supabase
  .from('documents')
  .delete({ count: 'exact' })
  .not('id', 'is', null);
if (dbError) throw dbError;
console.log(`Deleted ${count ?? '?'} rows.`);
console.log('Done. Documents page should show 0.');
