/**
 * Writes docs/DATABASE.md from the live database schema (tables, columns, keys, rules, indexes).
 *   DATABASE_URL=… node scripts/db-doc.js
 */
const fs = require('fs');
const path = require('path');
require('../src/config');
const { createPool } = require('../src/db/postgres');

(async () => {
  const db = createPool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const q = async (sql) => (await db.query(sql)).rows;
  const tables =
    await q(`SELECT c.relname AS t, obj_description(c.oid) AS note FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                           WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations' ORDER BY 1`);
  const cols =
    await q(`SELECT table_name AS t, column_name AS c, data_type AS type, is_nullable = 'NO' AS req, column_default AS def
                         FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
  const cons =
    await q(`SELECT conrelid::regclass::text AS t, contype AS k, pg_get_constraintdef(oid) AS def FROM pg_constraint
                         WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2, 3`);
  const idx = await q(
    `SELECT tablename AS t, indexdef AS def FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`,
  );
  const out = [
    '# BQuee database',
    '',
    'Generated from the live schema by `scripts/db-doc.js`. PostgreSQL; ids are random text keys.',
    '',
  ];
  out.push(
    `${tables.length} tables · ${cons.filter((c) => c.k === 'f').length} foreign keys · ${cons.filter((c) => c.k === 'c').length} value rules · ${idx.length} indexes`,
    '',
  );
  for (const { t } of tables) {
    out.push(`## ${t}`, '', '| Column | Type | Required | Default |', '|---|---|---|---|');
    for (const c of cols.filter((x) => x.t === t))
      out.push(`| ${c.c} | ${c.type} | ${c.req ? 'yes' : ''} | ${(c.def || '').replace(/\|/g, '\\|')} |`);
    const rules = cons.filter((c) => c.t === t);
    if (rules.length) {
      out.push('', 'Keys and rules:', '');
      for (const r of rules)
        out.push(`- ${{ p: 'Primary key', f: 'Links to', u: 'Unique', c: 'Rule' }[r.k] || r.k}: \`${r.def}\``);
    }
    const ix = idx.filter((x) => x.t === t);
    if (ix.length)
      out.push(
        '',
        'Indexes: ' +
          ix
            .map(
              (x) =>
                '`' + x.def.replace(/^CREATE (UNIQUE )?INDEX (\S+) ON public\.\S+ USING btree /, '$1').trim() + '`',
            )
            .join(', '),
      );
    out.push('');
  }
  fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'DATABASE.md'), out.join('\n'));
  console.log('docs/DATABASE.md written:', tables.length, 'tables');
  await db.end();
})();
