import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Explicit evidence destinations are optional; each default run owns a fresh directory.
export const evidence=process.env.QUAL_EVIDENCE??await mkdtemp(join(tmpdir(),'slate-search-'));
