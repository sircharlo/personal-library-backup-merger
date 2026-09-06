import type { BlockRangeRow } from '../../jwlibrary/types';
import { groupBy, labelOf, warn, type MergeContext } from '../context';
import { blockRangeSignature } from '../identity';

/**
 * Stage 4 — BlockRange, keyed off the UserMark groups. For deduplicated (agreeing) UserMarks the
 * first copy's children are kept and the other copies' children are traced to them by structural
 * signature. For conflicting UserMarks every candidate's children get their own global ids and are
 * attached to the conflict candidates; `finalize()` keeps only the winner's.
 */
export function mergeBlockRange(ctx: MergeContext): void {
  const childrenBySource = ctx.sources.map((s) => groupBy(s.tables.BlockRange, (r) => r.UserMarkId));

  for (const group of ctx.userMarkGroups) {
    if (!group.conflict) {
      const [winner, ...others] = group.candidates;
      const winnerChildren = childrenBySource[winner.sourceIndex].get(winner.localId) ?? [];
      const pool = new Map<string, number[]>();
      for (const child of winnerChildren) {
        const gid = ctx.alloc.BlockRange.allocate();
        ctx.merged.BlockRange.push({ ...child, BlockRangeId: gid, UserMarkId: group.globalId });
        ctx.idMaps[winner.sourceIndex].set('BlockRange', child.BlockRangeId, { kind: 'mapped', globalId: gid, mergedInto: false });
        const sig = blockRangeSignature(child);
        const list = pool.get(sig);
        if (list) list.push(gid);
        else pool.set(sig, [gid]);
      }
      for (const other of others) {
        // Equal signature multisets are what made this group agree, so every child pairs off.
        const taken = new Map<string, number>();
        for (const child of childrenBySource[other.sourceIndex].get(other.localId) ?? []) {
          const sig = blockRangeSignature(child);
          const list = pool.get(sig) ?? [];
          const n = taken.get(sig) ?? 0;
          const gid = list[n];
          if (gid === undefined) {
            warn(ctx, `${labelOf(ctx, other.sourceIndex)}: highlight range #${child.BlockRangeId} could not be paired; skipped.`);
            ctx.idMaps[other.sourceIndex].set('BlockRange', child.BlockRangeId, { kind: 'dropped', reason: 'unpaired duplicate' });
            continue;
          }
          taken.set(sig, n + 1);
          ctx.idMaps[other.sourceIndex].set('BlockRange', child.BlockRangeId, { kind: 'mapped', globalId: gid, mergedInto: true });
          ctx.auto.blockRangesDeduped++;
        }
      }
      continue;
    }

    for (const cand of group.candidates) {
      const conflictCandidate = group.conflict.candidates.find((c) => c.sourceIndex === cand.sourceIndex);
      const rows: BlockRangeRow[] = [];
      for (const child of childrenBySource[cand.sourceIndex].get(cand.localId) ?? []) {
        const gid = ctx.alloc.BlockRange.allocate();
        rows.push({ ...child, BlockRangeId: gid, UserMarkId: group.globalId });
        ctx.idMaps[cand.sourceIndex].set('BlockRange', child.BlockRangeId, {
          kind: 'conflict',
          globalId: gid,
          conflictId: group.conflict.id,
        });
      }
      if (conflictCandidate) conflictCandidate.children = rows;
    }
  }

  // Anything left untraced (orphan ranges, children of dropped UserMarks) is dropped with a warning.
  for (const src of ctx.sources) {
    const idMap = ctx.idMaps[src.sourceIndex];
    for (const br of src.tables.BlockRange) {
      if (idMap.get('BlockRange', br.BlockRangeId)) continue;
      warn(ctx, `${labelOf(ctx, src.sourceIndex)}: highlight range #${br.BlockRangeId} has no parent highlight #${br.UserMarkId}; skipped.`);
      idMap.set('BlockRange', br.BlockRangeId, { kind: 'dropped', reason: 'dangling UserMarkId' });
    }
  }
}
