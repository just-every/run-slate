import { withFixtureEvidence } from './fixture-evidence.ts';
import { sqliteRuntime as originalSqliteRuntime } from './sqlite-runtime.ts';
import { nativeStagingFixture as originalNativeStagingFixture } from './native-staging-fixture.ts';
import { boundedRuntime as originalBoundedRuntime } from './bounded-runtime.ts';

export const sqliteRuntime=withFixtureEvidence(originalSqliteRuntime);
export const nativeStagingFixture=withFixtureEvidence(originalNativeStagingFixture);
export const boundedRuntime=withFixtureEvidence(originalBoundedRuntime);
