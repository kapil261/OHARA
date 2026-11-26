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
// UTF-8 explicitly: on Windows initdb otherwise picks WIN1252, which cannot store Assamese or Hindi text.
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (!existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
try {
  // template0 lets the database be UTF-8 even when an older data folder was initialised with another encoding.
  await client.query(`CREATE DATABASE ohara ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
} catch {
  // already exists
} finally {
  await client.end();
}
console.log('Local Postgres ready on postgresql://postgres:postgres@localhost:5433/ohara');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
