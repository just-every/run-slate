# Base verification without private repository credentials

`pnpm verify-base` authenticates retained native Git objects against the approved
Base commit in `objects.mjs` (`PINS`: `0ed18342a1ca240f1ae698bb50e18385b6f509ec`,
the source of `rer-v0.2.50`, for every recorded copy), creates a temporary bare Git object repository whose HEAD is the newest
pin, and runs the unchanged copied command:

```
node scripts/edition-authoring/cli.mjs verify-base --base <temporary-repository>
```

The wrapper has no network or credential path. A missing or invalid proof fails.
The temporary repository is removed when verification completes. All copied Base
files and `base-copies.json` remain unchanged.

`pin-objects.json` contains zlib-compressed native objects, each indexed by its
native SHA-1 identity. The reader checks the hash of the complete Git object
header and body, its type and byte length. Each fixed commit authenticates its root
tree; native tree references authenticate all descendant trees and blob IDs.
Every tree of every pin is required. Only the blob bodies corresponding to recorded approved
copies, each at its own commit, are retained; extra objects are rejected. No parent history, unrelated
source file bodies, working tree, remote configuration, alternates, hooks, or
lazy-fetch configuration is included. Complete native trees necessarily retain
upstream filenames and object IDs, including files whose bodies are omitted.
This is source identity at the approved pin, not a fresh remote availability or
repository ownership check.

All three original verification checks run:

1. Local files are checked against the copy record, including modified, missing,
   unrecorded and nonregular files.
2. Recorded SHA-256 values are checked against the retained, independently
   authenticated origin blobs. Changing a local file and its recorded SHA-256
   together still fails against the native blob at the approved commit.
3. Unrecorded copies are detected against **every regular blob ID in each pin's full
   Base tree**, including files whose bodies are omitted. The copied verifier
   hashes edition bytes into native Git blob IDs, so those omitted bodies are
   unnecessary. The temporary HEAD is the newest pin; the comparison set is
   exactly the recorded revisions.

Existing `.edition/sources` snapshots retain selected comparison source, but do
not include the native commit and complete tree graph needed to authenticate the
pin or discover copies of unselected Base files. They cannot replace this proof.

To reproduce the proof from a maintainer-acquired local Base checkout, write a new file
and compare it with the retained artifact:

```
node scripts/base-proof/retain.mjs <Base-checkout> <absent-output.json>
```

Acquisition reads only the approved native commits, all their trees, and recorded blob
bodies through Git plumbing. It never changes Base or executes Base code. The
output is deterministic. Acquisition is an explicit maintenance operation and is
never called by CI or verification. Changing the approved pin requires a reviewed
source update; neither environment variables nor the record can override it.

`pnpm test:base-proof` runs isolated tests for the unchanged CLI, local/record
collusion, unrecorded copies, missing objects, tampering, and extra blob rejection.
These tests also run inside `rer verify`. Ordinary source locking binds the
retained proof and its wrapper as tracked edition inputs.

The proof's `repository` value is the `retained-native-base` custody label. It
identifies this embedded proof, not a fetchable repository or a claim of public
upstream availability. `base-copies.json` names no repository: each copy's full
commit, file digests and modes bind the copied bytes. Public checks authenticate the exact approved commit,
complete tree graph, copied blob bytes and executable modes offline. Maintainers
acquire Base separately and regenerate this same proof through the retention tool.
