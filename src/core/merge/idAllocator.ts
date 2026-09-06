import type { DataTableName } from '../jwlibrary/types';

/**
 * Map-or-allocate over string identity keys. Global ids are sequential from 1 and never reused.
 * One allocator per table.
 */
export class GlobalIdAllocator {
  private nextId = 1;
  private readonly byKey = new Map<string, number>();

  lookup(key: string): number | undefined {
    return this.byKey.get(key);
  }

  mapOrAllocate(key: string): { id: number; isNew: boolean } {
    const existing = this.byKey.get(key);
    if (existing !== undefined) return { id: existing, isNew: false };
    const id = this.nextId++;
    this.byKey.set(key, id);
    return { id, isNew: true };
  }

  /** Fresh id with no key (for tables whose identity lives elsewhere, e.g. BlockRange). */
  allocate(): number {
    return this.nextId++;
  }

  /** Register an additional key for an existing id (no-op if the key is already taken). */
  alias(key: string, id: number): boolean {
    if (this.byKey.has(key)) return false;
    this.byKey.set(key, id);
    return true;
  }

  get count(): number {
    return this.nextId - 1;
  }
}

/**
 * Identity index that never merges two rows of the *same* source: a source may legitimately hold
 * several rows sharing an identity key when SQLite's NULL semantics keep a UNIQUE constraint from
 * firing (e.g. two `Location` rows for one document with `Track` NULL, or two `IndependentMedia`
 * rows with the same `Hash`). Each key maps to an ordered list of global ids, and a source only
 * matches the first id it has not itself contributed to.
 */
export class MultiKeyIndex {
  private readonly byKey = new Map<string, { globalId: number; contributors: Set<number> }[]>();

  match(key: string, sourceIndex: number): number | undefined {
    const list = this.byKey.get(key);
    if (!list) return undefined;
    for (const entry of list) if (!entry.contributors.has(sourceIndex)) return entry.globalId;
    return undefined;
  }

  add(key: string, sourceIndex: number, globalId: number): void {
    let list = this.byKey.get(key);
    if (!list) {
      list = [];
      this.byKey.set(key, list);
    }
    const existing = list.find((e) => e.globalId === globalId);
    if (existing) existing.contributors.add(sourceIndex);
    else list.push({ globalId, contributors: new Set([sourceIndex]) });
  }
}

export type LocalKey = number | string;
export type GlobalKey = number | string;

export type IdMapEntry =
  /** Row is present in the output under `globalId`; `mergedInto` = it was deduplicated into a row first seen elsewhere. */
  | { kind: 'mapped'; globalId: GlobalKey; mergedInto: boolean }
  /** Row is one candidate of a user-facing conflict; it is in the output only if its candidate wins. */
  | { kind: 'conflict'; globalId: GlobalKey; conflictId: string }
  /** Row could not be carried over (e.g. dangling foreign key in the source). Always accompanied by a warning. */
  | { kind: 'dropped'; reason: string };

/** Per-source local-id → global-id bookkeeping, consumed by every later merge stage and by the tests' traceability invariant. */
export class SourceIdMaps {
  private readonly maps = new Map<DataTableName, Map<LocalKey, IdMapEntry>>();

  constructor(readonly sourceIndex: number) {}

  table(name: DataTableName): Map<LocalKey, IdMapEntry> {
    let m = this.maps.get(name);
    if (!m) {
      m = new Map();
      this.maps.set(name, m);
    }
    return m;
  }

  set(name: DataTableName, localKey: LocalKey, entry: IdMapEntry): void {
    this.table(name).set(localKey, entry);
  }

  get(name: DataTableName, localKey: LocalKey): IdMapEntry | undefined {
    return this.maps.get(name)?.get(localKey);
  }

  /** Global key for rows that made it (mapped or conflict candidates); undefined for dropped/unknown. */
  globalKey(name: DataTableName, localKey: LocalKey): GlobalKey | undefined {
    const e = this.get(name, localKey);
    if (!e || e.kind === 'dropped') return undefined;
    return e.globalId;
  }

  /** Numeric global id (for single-integer-PK tables). */
  globalId(name: DataTableName, localKey: LocalKey): number | undefined {
    const g = this.globalKey(name, localKey);
    return typeof g === 'number' ? g : undefined;
  }
}
