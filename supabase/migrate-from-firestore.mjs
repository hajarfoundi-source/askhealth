// One-off copy of Firestore data into Supabase.
// Usage (Node 18+):
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_KEY=<service_role or anon key> node supabase/migrate-from-firestore.mjs
// Safe to re-run: rows are upserted by id.

const FB_PROJECT = 'casamed-5d746';
const FB_KEY     = 'AIzaSyApxLSG_aScoSnbTm465yu09LpXaVsJCJU';
const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_KEY.');
  process.exit(1);
}

// Firestore REST typed values → plain JSON
function decode(v) {
  if ('stringValue' in v)    return v.stringValue;
  if ('integerValue' in v)   return Number(v.integerValue);
  if ('doubleValue' in v)    return v.doubleValue;
  if ('booleanValue' in v)   return v.booleanValue;
  if ('nullValue' in v)      return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v)     return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v)       return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

async function readCollection(name) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/${name}` +
      `?pageSize=300&key=${FB_KEY}` + (pageToken ? `&pageToken=${pageToken}` : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${name}: ${res.status} ${await res.text()}`);
    const json = await res.json();
    for (const d of json.documents || []) {
      docs.push({ id: d.name.split('/').pop(), data: decodeFields(d.fields || {}) });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function upsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
}

for (const name of ['users', 'leads', 'exhibitors']) {
  const docs = await readCollection(name);
  await upsert(name, docs.map(d => ({ id: d.id, data: d.data, updated_at: new Date().toISOString() })));
  console.log(`${name}: ${docs.length} copied`);
}

const config = await readCollection('config');
await upsert('config', config.map(d => ({ id: d.id, value: String(d.data.value ?? '0'), updated_at: new Date().toISOString() })));
console.log(`config: ${config.length} copied`);
