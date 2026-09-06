import { describe, expect, it } from 'vitest';
import { createEmptyDatabase, initSqlJsOnce, openDatabase, queryRows, queryScalar, tableExists } from './sqlite';

describe('sqlite bootstrap', () => {
  it('memoizes the sql.js runtime', async () => {
    const a = await initSqlJsOnce();
    const b = await initSqlJsOnce();
    expect(a).toBe(b);
  });

  it('creates, exports and re-opens a database with foreign keys and triggers', async () => {
    const db = await createEmptyDatabase();
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('CREATE TABLE p (id INTEGER PRIMARY KEY, name TEXT)');
    db.exec('CREATE TABLE c (id INTEGER PRIMARY KEY, pid INTEGER NOT NULL, FOREIGN KEY(pid) REFERENCES p(id))');
    db.exec("INSERT INTO p VALUES (1, 'x')");
    db.exec('INSERT INTO c VALUES (1, 1)');
    // FK enforcement must be compiled into the wasm build (the validation pass relies on it).
    expect(() => db.exec('INSERT INTO c VALUES (2, 99)')).toThrow();
    db.exec("CREATE TRIGGER guard BEFORE DELETE ON p BEGIN SELECT RAISE(FAIL, 'nope'); END");
    expect(() => db.exec('DELETE FROM p')).toThrow(/nope/);

    const bytes = db.export();
    db.close();
    const reopened = await openDatabase(bytes);
    expect(tableExists(reopened, 'p')).toBe(true);
    expect(tableExists(reopened, 'zzz')).toBe(false);
    expect(queryScalar<number>(reopened, 'SELECT count(*) FROM c')).toBe(1);
    expect(queryRows<{ id: number; name: string }>(reopened, 'SELECT id, name FROM p')).toEqual([{ id: 1, name: 'x' }]);
    expect(queryScalar<string>(reopened, 'PRAGMA integrity_check')).toBe('ok');
    reopened.close();
  });
});
