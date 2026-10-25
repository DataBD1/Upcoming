const { Client } = require('module').createRequire('/home/user/upcoming/dhk-predicts-features/app/x.js')('pg');
(async () => { const c = new Client({ connectionString: 'postgres://t:t@localhost:54410/postgres' }); await c.connect();
  const q = async s => (await c.query(s)).rows;
  console.log(await q("select key, count(*) snapshots, pg_size_pretty(sum(pg_column_size(data))::bigint) history_total, pg_size_pretty(max(pg_column_size(data))::bigint) biggest from app_state_history group by key order by key"));
  console.log(await q("select key, pg_size_pretty(pg_column_size(data)::bigint) main_row, length(data::text) main_text_bytes from app_state order by key"));
  console.log(await q("select key, count(*) rows, pg_size_pretty(sum(pg_column_size(data))::bigint) shard_bytes from app_shards group by key order by key"));
  console.log(await q("select key, count(*) events from app_events group by key order by key"));
  console.log(await q("select pg_size_pretty(pg_database_size('postgres')) db"));
  await c.end(); })();
