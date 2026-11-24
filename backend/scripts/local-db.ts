/**
 * Local Postgres for development without Docker or Supabase.
 *   npm run db:local     (leave it running; Ctrl+C stops it)
 * Data lives in ~/.local/share/ohara-pg (override with LOCAL_PG_DIR). Connection: postgresql://postgres:postgres@localhost:5433/ohara
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Kept in the Linux home: Postgres needs 0700 permissions, which Windows drives (/mnt/c, /mnt/e under WSL) cannot provide.
const dir = process.env.LOCAL_PG_DIR ?? join(homedir(), '.local', 'share', 'ohara-pg');
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 5433, persistent: true });

if (!existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('ohara');
} catch {
  // already exists
}
console.log('Local Postgres ready on postgresql://postgres:postgres@localhost:5433/ohara');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
