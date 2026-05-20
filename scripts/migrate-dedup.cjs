// One-shot migration: drop legacy unique index, clear token_events + ingest_state,
// caller should rerun `ingest` after.
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.tokenpulse', 'usage.db');
const db = new Database(dbPath);

console.log('Before:');
console.log('  token_events rows:', db.prepare('SELECT COUNT(*) c FROM token_events').get().c);
console.log('  total USD:', db.prepare("SELECT ROUND(SUM(usd_estimate),2) s FROM token_events").get().s);

db.exec(`
  DROP INDEX IF EXISTS idx_token_events_unique;
  DELETE FROM token_events;
  DELETE FROM ingest_state;
`);

console.log('\nAfter wipe:');
console.log('  token_events rows:', db.prepare('SELECT COUNT(*) c FROM token_events').get().c);
console.log('  ingest_state rows:', db.prepare('SELECT COUNT(*) c FROM ingest_state').get().c);
console.log('\nIndexes on token_events:');
for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='token_events'").all()) {
  console.log('  -', row.name);
}
console.log('\nRun `npx tsx src/cli.ts ingest` next.');
