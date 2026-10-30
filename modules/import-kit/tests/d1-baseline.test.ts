import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { captureD1Baseline } from '../../../tests/support/d1-baseline.mjs';

test('shared D1 reset removes prior-case state and restores seeded schema and protections', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-baseline-'));
  let mf: Miniflare | undefined;
  try {
    const options = { ...convertV4MiniflareOptions({ modules: true, script: 'export default { fetch(){return new Response("ok")} }', compatibilityDate: '2026-09-01', d1Databases: { DB: 'baseline' } }), resourcePersistencePath: directory };
    mf = new Miniflare(options);
    const native = await mf.getD1Database('DB');
    for (const n of [100, 101]) {
      const query = 'SELECT ' + Array(n).fill("'x'").join('||') + ' AS value';
      if (n === 100) assert.equal((await native.prepare(query).first())?.value, 'x'.repeat(n));
      else await assert.rejects(native.prepare(query).first(), /Expression tree is too large|expression depth/i);
      const columns = `CREATE TABLE native_base_${n}(${Array.from({length:n},(_,i)=>`c${i} TEXT`).join(',')})`;
      if (n === 100) { await native.prepare(columns).run(); await native.prepare('DROP TABLE native_base_100').run(); }
      else await assert.rejects(native.prepare(columns).run(), /too many columns/i);
    }
    for (const operator of ['LIKE', 'GLOB']) {
      await native.prepare(`SELECT 'x' ${operator} ?`).bind('x'.repeat(50)).first();
      await assert.rejects(native.prepare(`SELECT 'x' ${operator} ?`).bind('x'.repeat(51)).first(), /LIKE or GLOB pattern too complex/i);
    }
    assert.equal((await native.prepare(`SELECT max(${Array(33).fill(1).join(',')}) AS value`).first())?.value, 1, 'workerd does not enforce the D1 function-argument limit');
    await native.prepare('CREATE TABLE native_base_row(a TEXT,b TEXT)').run();
    await native.prepare('INSERT INTO native_base_row VALUES(?,?)').bind('a'.repeat(999996), 'b'.repeat(999998)).run();
    assert.equal((await native.prepare('SELECT count(*) AS n FROM native_base_row').first())?.n, 1, 'native workerd accepts an encoded row one byte beyond the documented D1 limit');
    await native.prepare('DROP TABLE native_base_row').run();
    t.diagnostic('Native workerd accepts 33 function arguments and an encoded 2000001-byte row; shared guards close both gaps.');
    await mf.dispose();
    const { Miniflare: LimitedMiniflare } = await import('../../container/adapters/d1-workerd.mjs');
    mf = new LimitedMiniflare(options);
    const db = await mf.getD1Database('DB');
    await db.batch([
      'CREATE TABLE parent(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)',
      'CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE RESTRICT)',
      "INSERT INTO parent(id,value) VALUES(7,'baseline')", 'INSERT INTO child VALUES(1,7)',
      "CREATE TRIGGER preserve_seed BEFORE DELETE ON parent BEGIN SELECT RAISE(ABORT,'seed_protected'); END",
      'CREATE INDEX seed_value ON parent(value)',
    ].map(sql => db.prepare(sql)));
    // Native workerd and the public preflight agree on both sides of the
    // observed depth and documented column and pattern boundaries.
    const { D1 } = await import('../../container/adapters/d1.mjs');
    const node = new D1(join(directory, 'synthetic-base-1.sqlite'));
    try {
      for (const connection of [db, node]) {
        for (const n of [100, 101]) {
          const query = 'SELECT ' + Array(n).fill("'x'").join('||') + ' AS value';
          if (n === 100) assert.equal((await connection.prepare(query).first())?.value, 'x'.repeat(n));
          else await assert.rejects(connection.prepare(query).first(), /D1 limit exceeded: expression depth estimate.*maximum 100, measured 101/);
        }
        for (const n of [100, 101]) {
          const query = `CREATE TABLE synthetic_base_${n}(${Array.from({length:n},(_,i)=>`c${i} TEXT`).join(',')})`;
          if (n === 100) await connection.prepare(query).run();
          else await assert.rejects(connection.prepare(query).run(), /D1 limit exceeded: columns per table maximum 100, measured 101/);
        }
        await assert.rejects(connection.prepare('ALTER TABLE synthetic_base_100 ADD COLUMN extra TEXT').run(), /columns per table maximum 100, measured 101/);
        for (const operator of ['LIKE', 'GLOB']) {
          assert.equal((await connection.prepare(`SELECT 'x' ${operator} ? AS value`).bind('x'.repeat(50)).first())?.value, 0);
          await assert.rejects(connection.prepare(`SELECT 'x' ${operator} ? AS value`).bind('x'.repeat(51)).first(), /D1 limit exceeded: LIKE or GLOB pattern bytes maximum 50, measured 51/);
        }
        for (const operator of ['LIKE', 'GLOB']) {
          assert.equal((await connection.prepare(`SELECT 'x' ${operator} lower(?) AS value`).bind('X'.repeat(50)).first())?.value, 0);
          await assert.rejects(connection.prepare(`SELECT 'x' ${operator} lower(?) AS value`).bind('X'.repeat(51)).first(), /pattern bytes maximum 50, measured 51|LIKE or GLOB pattern too complex/i);
        }
        const parameters = n => `SELECT 1 AS value WHERE 1 IN (${Array(n).fill('?').join(',')})`;
        assert.equal((await connection.prepare(parameters(100)).bind(...Array(100).fill(1)).first())?.value, 1);
        await assert.rejects(connection.prepare(parameters(101)).bind(...Array(101).fill(1)).first(), /bound parameters maximum 100, measured 101/);
        await connection.batch([0,1].map(() => connection.prepare(parameters(100)).bind(...Array(100).fill(1))));
        const padded = n => 'SELECT 1 AS value /*' + 'x'.repeat(n - Buffer.byteLength('SELECT 1 AS value /**/')) + '*/';
        assert.equal(Buffer.byteLength(padded(100000)), 100000);
        assert.equal((await connection.prepare(padded(100000)).first())?.value, 1);
        await assert.rejects(connection.prepare(padded(100001)).first(), /SQL statement bytes maximum 100000, measured 100001/);
        for (const value of ['é'.repeat(1000000), new Uint8Array(2000000)]) {
          const result = await connection.prepare('SELECT length(CAST(? AS BLOB)) AS value').bind(value).first();
          assert.equal(result?.value, 2000000);
        }
        for (const value of ['é'.repeat(1000000) + 'x', new Uint8Array(2000001)]) {
          await assert.rejects(connection.prepare('SELECT ?').bind(value).first(), /string or BLOB bytes maximum 2000000, measured 2000001/);
        }
        assert.equal((await connection.prepare('SELECT length(zeroblob(2000000)) AS value').first())?.value, 2000000);
        await assert.rejects(connection.prepare('SELECT zeroblob(2000001)').first(), /string or BLOB bytes maximum 2000000, measured 2000001/);
        await connection.prepare('CREATE TABLE synthetic_base_row(a TEXT,b TEXT)').run();
        await connection.prepare('INSERT INTO synthetic_base_row VALUES(?,?)').bind('a'.repeat(999996), 'b'.repeat(999997)).run();
        await assert.rejects(connection.prepare('INSERT INTO synthetic_base_row VALUES(?,?)').bind('a'.repeat(999996), 'b'.repeat(999998)).run(), /table row bytes maximum 2000000, measured 2000001|string or blob too big/i);
        assert.equal((await connection.prepare('SELECT count(*) AS n FROM synthetic_base_row').first())?.n, 1);
        await connection.prepare('CREATE TABLE synthetic_base_source(a TEXT,b TEXT)').run();
        await connection.prepare('CREATE TRIGGER synthetic_base_copy AFTER INSERT ON synthetic_base_source BEGIN INSERT INTO SYNTHETIC_BASE_ROW VALUES(NEW.a,NEW.b||\'x\'); END').run();
        await assert.rejects(connection.prepare('INSERT INTO SYNTHETIC_BASE_SOURCE VALUES(?,?)').bind('a'.repeat(999996), 'b'.repeat(999997)).run(), /table row bytes maximum 2000000, measured 2000001/);
        assert.equal((await connection.prepare('SELECT count(*) AS n FROM synthetic_base_source').first())?.n, 0);
        assert.equal((await connection.prepare('SELECT count(*) AS n FROM synthetic_base_row').first())?.n, 1);
        await connection.prepare('CREATE TABLE synthetic_base_alias(id INTEGER PRIMARY KEY,value TEXT)').run();
        await connection.prepare('INSERT INTO synthetic_base_alias VALUES(?,?)').bind(2,'x'.repeat(1999994)).run();
        for (const [name, declaration] of [['synthetic_base_stored','id INTEGER PRIMARY KEY DESC,value TEXT'],['sqlitedata','id INTEGER PRIMARY KEY DESC,value TEXT'],['synthetic_base_stored_Ω','id INTEGER PRIMARY KEY DESC,value TEXT'],['synthetic_base_without','id INTEGER PRIMARY KEY,value TEXT']]) {
          await connection.prepare(`CREATE TABLE ${name}(${declaration})${name === 'synthetic_base_without' ? ' WITHOUT ROWID' : ''}`).run();
          const insert = `INSERT INTO ${name.toUpperCase()} VALUES(?,?)`;
          await connection.prepare(insert).bind(2,'x'.repeat(1999993)).run();
          await assert.rejects(connection.prepare(insert).bind(3,'x'.repeat(1999994)).run(), /table row bytes maximum 2000000, measured 2000001/);
        }
        await connection.prepare('CREATE TABLE synthetic_base_alter(a TEXT,b TEXT)').run();
        await connection.prepare('ALTER TABLE synthetic_base_alter DROP COLUMN b').run();
        await connection.prepare('INSERT INTO synthetic_base_alter VALUES(?)').bind('retained').run();
        await assert.rejects(connection.prepare('INSERT INTO synthetic_base_alter VALUES(?)').bind('x'.repeat(1999996)).run(), /table row bytes maximum 2000000, measured 2000001/);
        assert.equal((await connection.prepare('SELECT count(*) AS n FROM synthetic_base_alter').first())?.n, 1);
        const longNames = Array.from({length:99},(_,i)=>'c'+i+'_'+'x'.repeat(550));
        for (const suffix of ['', '_without']) {
          const table = 'synthetic_base_wide'+suffix;
          await connection.prepare('CREATE TABLE '+table+'(id INTEGER PRIMARY KEY,'+longNames.map(name=>'"'+name+'" TEXT').join(',')+')'+(suffix?' WITHOUT ROWID':'')).run();
          await connection.prepare('CREATE INDEX '+table+'_cover ON '+table+'("'+longNames[0]+'")').run();
          const insertWide = 'INSERT INTO '+table+' VALUES('+Array(100).fill('?').join(',')+')';
          const wideValues = longNames.map(()=> 'x'.repeat(20199));
          wideValues[0] = wideValues[0].slice(1);
          await connection.prepare(insertWide).bind(0,...wideValues).run();
          wideValues[0] += 'x';
          await assert.rejects(connection.prepare(insertWide).bind(1,...wideValues).run(), /table row bytes maximum 2000000, measured 2000001/);
          assert.equal((await connection.prepare('SELECT count(*) AS n FROM '+table).first())?.n, 1);
        }
        assert.equal((await connection.prepare(`SELECT max(${Array(32).fill(1).join(',')}) AS value`).first())?.value, 1);
        await assert.rejects(connection.prepare(`SELECT max(${Array(33).fill(1).join(',')})`).first(), /D1 limit exceeded: SQL function arguments maximum 32, measured 33/);
      }
      const { DatabaseSync } = await import('../../container/adapters/d1-sqlite.mjs');
      const schemaDb = new DatabaseSync(':memory:');
      try {
        schemaDb.exec("BEGIN; CREATE TABLE synthetic_base_1(a TEXT,b TEXT); INSERT INTO synthetic_base_1 VALUES('retained',NULL); ALTER TABLE synthetic_base_1 DROP COLUMN b; COMMIT; -- trailing comment");
        assert.equal(schemaDb.prepare('SELECT a FROM synthetic_base_1').get()?.a, 'retained');
        const addColumn = schemaDb.prepare('ALTER TABLE synthetic_base_1 ADD COLUMN b TEXT').iterate();
        assert.equal(schemaDb.prepare('PRAGMA table_info(synthetic_base_1)').all().length, 1);
        assert.deepEqual(Array.from(addColumn), []);
        const dropColumn = schemaDb.prepare('ALTER TABLE synthetic_base_1 DROP COLUMN b').iterate();
        assert.equal(schemaDb.prepare('PRAGMA table_info(synthetic_base_1)').all().length, 2);
        assert.deepEqual(Array.from(dropColumn), []);
        assert.equal(schemaDb.prepare('PRAGMA table_info(synthetic_base_1)').all().length, 1);
        assert.throws(()=>schemaDb.exec('ALTER TABLE synthetic_base_1 ADD COLUMN b TEXT; SELECT * FROM synthetic_base_missing'), /no such table/);
        assert.equal(schemaDb.prepare('PRAGMA table_info(synthetic_base_1)').all().length, 2);
        assert.throws(()=>schemaDb.exec("ALTER TABLE synthetic_base_1 DROP COLUMN b; INSERT INTO synthetic_base_1 VALUES(printf('%.*c',1999996,'x'))"), /table row bytes maximum 2000000, measured 2000001/);
        assert.equal(schemaDb.prepare('SELECT count(*) AS n FROM synthetic_base_1').get()?.n, 1);
      } finally { schemaDb.close(); }
      t.diagnostic('Statement bytes 100000 PASS, 100001 rejected; per-statement binds 100 PASS, 101 rejected, two 100-bind batch statements PASS; UTF-8 strings and BLOBs 2000000 PASS, 2000001 rejected; encoded rows 2000000 PASS, 2000001 rejected without a write.');
      t.diagnostic('Native workerd and preflight agree: depth 100 PASS, 101 rejected; columns 100 PASS, 101 rejected; LIKE and GLOB 50 PASS, 51 rejected. Function arguments 33 pass native workerd and are rejected only by preflight.');
    } finally { await node.close(); }
    const preload = new URL('../../container/adapters/d1-workerd-preload.mjs', import.meta.url).href;
    const childOptions = { ...options, resourcePersistencePath: join(directory, 'child') };
    const childPath = join(directory, 'synthetic-base-1.mjs');
    await writeFile(childPath, `
      import {createRequire} from 'node:module';
      const {Miniflare}=createRequire(${JSON.stringify(join(process.cwd(), 'package.json'))})('miniflare');
      const mf=new Miniflare(${JSON.stringify(childOptions)});
      try {const db=await mf.getD1Database('DB');await db.prepare('SELECT max(${Array(33).fill(1).join(',')})').first();process.exitCode=1;}
      catch(error){if(!/SQL function arguments maximum 32, measured 33/.test(error.message))throw error;console.log('Wrangler child preflight rejects 33 arguments');}
      finally{await mf.dispose();}
    `);
    const child = await promisify(execFile)(process.execPath, ['--import', preload, childPath]);
    assert.match(child.stdout, /Wrangler child preflight rejects 33 arguments/);
    const restore = await captureD1Baseline(db);

    // A case changes rows, advances a sequence, alters a baseline table and adds
    // protected schema. The next case must use the original state on this binding.
    await db.batch([
      "UPDATE parent SET value='prior-case'", "INSERT INTO parent(value) VALUES('extra')",
      'INSERT INTO child VALUES(2,8)', 'DROP INDEX seed_value',
      'ALTER TABLE child ADD COLUMN prior_case TEXT',
      'CREATE TABLE added(id INTEGER PRIMARY KEY)', 'INSERT INTO added VALUES(1)',
      "CREATE TRIGGER protect_added BEFORE DELETE ON added BEGIN SELECT RAISE(ABORT,'added_protected'); END",
    ].map(sql => db.prepare(sql)));
    assert.equal((await db.prepare("SELECT seq FROM sqlite_sequence WHERE name='parent'").first())?.seq, 8);

    await restore();
    assert.deepEqual((await db.prepare('SELECT * FROM parent').all()).results, [{ id: 7, value: 'baseline' }]);
    assert.deepEqual((await db.prepare('SELECT * FROM child').all()).results, [{ id: 1, parent_id: 7 }]);
    assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name='added'").first(), null);
    assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='seed_value'").first());
    assert.equal((await db.prepare("INSERT INTO parent(value) VALUES('next') RETURNING id").first())?.id, 8);
    await assert.rejects(db.prepare('DELETE FROM parent WHERE id=8').run(), /seed_protected/);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally {
    try { await mf?.dispose(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});
