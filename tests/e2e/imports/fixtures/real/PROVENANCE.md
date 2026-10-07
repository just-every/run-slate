# Anonymized incumbent export fixtures

These fixtures originate from Notion, Confluence Cloud and Google Docs exports produced on 11 September 2026. Public copies replace personal names, emails, site names and account/export identifiers with synthetic identities. They are test data, not customer records or untouched original bytes.

Anonymization preserves the 57 Notion entries (35 Markdown pages, seven CSV databases and 15 media files), 50 Confluence entries and nine Google Docs package parts. Confluence files named `.csv.gz` remain plain CSV where that is what the exporter emitted. Entry order, compression method, CSV quoting, line endings, internal link relationships, duplicate titles, filtered views, missing media and document XML structure are retained. All 15 Notion PNG/JPEG payloads are owner-created synthetic geometric images; no original pixels, EXIF, source credits or creator portrait/device screenshots remain. Each retains its original filename, format, dimensions and exact byte length. External content links use reserved example hosts except exporter-semantic Notion relation URLs (`app.notion.com`/`notion.so`) with the existing synthetic IDs; these retain the inferred relation field types and Study Scheduler marketing/creator copy is synthetic. The Confluence and Google Docs archives contain no binary media parts. Confluence remote image targets and its separate protocol-relative link index use reserved example hosts; absent attachment behavior is retained. The checked-in `tests/release/fixture-policy.json` records every member name, order, compression method and byte length, plus synthetic image dimensions and hashes. Every existing structural and behavioral test assertion is retained unchanged.

| File | SHA-256 |
| --- | --- |
| `confluence-space-export.zip` | `e2e8caaf19ab3edb9c3375608d562412ab5e11fc3248f4e93e7858c9de72363a` |
| `google-docs-download.docx` | `3d0500a282d90ad5a4d50456f80322dc966b10736f89dee7f856220bc93f5b1f` |
| `notion-workspace-export.zip` | `315ed82a80abf502d2a01ec7abf2ee9ca5a10919db6964ee0cd2fada910dccbc` |

## Why `google-docs-download.docx` is a Google Docs download and not a Word save

The file was supplied without a stated producer. It is a Google Docs download,
proven from the package itself and asserted by
`tests/e2e/imports/real-exports.test.ts`:

- The package has **no `docProps/` parts**. `[Content_Types].xml` declares
  overrides only for `word/settings.xml`, `styles.xml`, `fontTable.xml`,
  `numbering.xml`, `document.xml` and `theme/theme1.xml`; there is no
  `docProps/core.xml` or `docProps/app.xml`. Word always writes both.
- `_rels/.rels` carries **exactly one** relationship, to `word/document.xml`.
  Word additionally relates `docProps/core.xml` and `docProps/app.xml`.
- Every `w:rsid*` attribute in `word/document.xml` is `00000000`, and
  `word/settings.xml` contains **no `w:rsids` element**. Word writes real
  revision-save ids and a populated `w:rsids` table.
- `word/document.xml` and `word/settings.xml` declare a default namespace of
  `http://schemas.microsoft.com/office/tasks/2019/documenttasks`, which is the
  namespace block Google's exporter emits verbatim on every part.

## Word fixture and remaining acceptance

`IMP-003` also names a document downloaded from **Word**. The anonymized,
publisher-produced fixture is committed at
`tests/flagship/federation/fixtures/word-government-impact-assessment.docx`.
Its 49-part package retains `Microsoft Office Word` producer metadata; see the
[Word fixture provenance](../../../../flagship/federation/fixtures/PROVENANCE.md)
for the public source, licence, anonymization and checksum.
`tests/flagship/federation/federation.test.ts` includes an import regression for
that document.

Fixture availability and regression coverage do not establish full `IMP-003`
acceptance. The clause remains registered through `contract.todo` in
`tests/e2e/contract-coverage.test.ts`; its complete import journey is still
planned. Synthetic OOXML fixtures in `tests/e2e/imports/fixtures/synthetic.ts`
and parser regressions cover additional structures and edge cases, but do not
satisfy that journey.
