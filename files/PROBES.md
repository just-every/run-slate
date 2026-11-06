# Candidate public-door probes

Head: 725e1940848467c19b70fbc68f4a5d8997e7ec18

PROBE LIFE-002 1: native author, address grant and group sessions -> exact body and persisted grants; ungranted owner and member refused; same sessions refused after full revocation, replay unchanged.
PROBE LIFE-002 1 link: actual delivered draft invitation -> pending grant, explicit acceptance, native guest session and readable body; cancelled link and revoked guest session refused; replay does not restore access.
PROBE LIFE-002 2: both access profiles -> general grants and anonymous publication refused; sessionless document, grant, sharing, invitation and publication requests refused; content, grants, exposure, receipts and activity unchanged.
PROBE LIFE-002 4: native lifecycle profile switches and reload -> retained draft and named grants unchanged, author and grantees read, owner and anonymous refused.
PROBE LIFE-002 author group: Share panel as ordinary member author -> saved group grant after reload, named group reader reads, owner alone cannot read, next request after removal refuses.
PROBE LIFE-002 directory: authorized page-sharing route with an unrelated workspace fixture -> exact local principal inventory, no foreign identity, membership list or email field; ungranted and view-only sessions refused.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs check exit=0; views=node src/base/runtime/contract-docs.mjs write then check, restored from origin main exit=0; ledger=none exit=0.
