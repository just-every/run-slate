import { targets } from './fixtures.ts';
import type { D1TargetAdapter } from '../../src/d1/types.ts';
/** Same two-table fixture contract; one set read instead of a query per row. */
export const scaleTargets: D1TargetAdapter = { ...targets,
  async list(db, destination) {
    const { results } = await db.prepare('SELECT c.*,e.detail FROM contacts c JOIN evidence e ON e.id=c.id WHERE c.destination=?').bind(destination).all();
    return results.map(r => ({ destination, targetKind: r.kind, targetId: r.id, revision: r.revision, value: { email: r.email, evidence: r.detail } }));
  }
};
