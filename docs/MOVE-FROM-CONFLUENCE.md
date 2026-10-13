# Move from Confluence

Bring a Confluence space into Slate from Confluence's own export. Slate never connects to Confluence: everything comes from the zip you download. You see a preview of what will be created, and choose who keeps access to restricted pages, before anything is written. You can undo the import afterwards.

## Export from Confluence

Slate reads both forms of space export Confluence writes:

- **Confluence Server or Data Center:** in the space, open **Space tools**, then **Content tools**, then **Export**. Choose **XML** and **Full export**. The zip contains `entities.xml` and the attachments.
- **Confluence Cloud:** the table export, a zip with `content.csv` and `bodycontent.csv` (each may be gzipped) and the related tables such as labels, content permissions and user mapping.

Keep the zip: Slate keeps a copy too, but your export is your record.

## Before you import: the people

Restrictions in Confluence name users and groups. Slate never creates an account for them. Before you import, invite the people who should keep access into Slate (**Settings**, then **People**, then **Invite a member**), so you can choose them in the preview. Anyone you do not map stays an inactive historical member, and the pages restricted to them stay closed.

## Import into Slate

1. Open **Settings**, then **Import & export**.
2. Choose **Confluence space** as the format, choose the zip and select **Upload and review**.
3. Read the preview. **Would create** counts what the import will make. **Restriction and recovery access** counts restricted pages, the named grants in the source, how many are mapped to live members, and how many pages have restrictions nobody is mapped to. **What did not cross** and **Warnings** list everything that will be left out or arrive changed. The preview also shows the reviewed plan's size against the import limit. Nothing has been written yet.
4. Under **Review access mappings**, choose an existing member or group for each Confluence user or group that should keep access, or leave them unmapped. Select **Review these mappings**; the preview is rebuilt with your choices.
5. Select **Apply reviewed import**. The status moves through preparing, running and indexing with a count of what is done. If the page closes or the server stops, open the panel and select **Resume import**; it carries on from the last saved step. Nothing appears in the workspace until the whole space is ready, then it all appears at once.
6. When it says completed, every imported page can already be found by search, by the people allowed to read it. Select **Find imported pages**, or **Download original archive** to get the zip back.

To take it back out, select **Undo import**. Undo removes what the import created, keeps any page someone has edited since (listed under **Native changes preserved** as `NATIVE_EDIT_CONFLICT`), and keeps the original archive.

## Restricted pages stay restricted

A page restricted in Confluence arrives restricted in Slate:

| Who | Restricted page that names a user you mapped | Restricted page that names only people you did not map |
|---|---|---|
| The member you mapped | Can open it and find it in search | Cannot open it or find it |
| Any other member | Cannot open it or find it | Cannot open it or find it |
| A guest | Cannot open it or find it | Cannot open it or find it |
| You, the importing owner | Can open it (recovery access) | Can open it (recovery access) |

Search never shows a restricted page, its title, a snippet or a count to someone who cannot read it. Space permissions and role assignments are not imported: the new container starts private to you, and only the page restrictions carry over.

## What comes across

| From Confluence | In Slate |
|---|---|
| The space | One new private container |
| Pages and their tree | Pages in the same tree |
| Page bodies in storage format: headings, paragraphs, lists, tables, task lists, code, quotes | The matching blocks; info, note, tip and warning panels become callouts, and expand sections stay expandable |
| Page history (earlier versions) | Page history, with each version kept |
| Labels | Page labels |
| Draft pages that were never published | Private drafts |
| Links between pages and to attachments | Links to the imported pages and files |
| Attachments in the export (Server and Data Center) | Media attached to their page |
| Page emoji (Cloud `titleEmoji`) | Page icons |
| Named user and group restrictions | Named access, for the people and groups you map |
| Folders | An empty page, so its children keep their place |

## What is reported

These arrive changed or are left out, and each one is named in the preview and the completed report:

| In the export | What happens |
|---|---|
| An image hosted outside the archive | Kept as a link |
| Layout sections | Flattened into the page |
| Inline comment markers | Marker dropped, text kept |
| Placeholder text | Dropped |
| Macros with no Slate equivalent (for example `blog-posts`, `recently-updated`) | Not imported; a macro with a body keeps its body as plain blocks |
| A table with no text | Its cell contents become blocks |
| Content properties (for example `collabService`, `share-id`) | Not imported, counted by name |
| Comments, blog posts, whiteboards, slides, databases and other custom content | Not imported, listed by type |
| A member's personal "favourite" label | Not a page label, so not imported |
| Restrictions naming no one Slate can map | The page stays closed, with recovery access for you |
| Space permissions and role assignments | Not imported |
| Content of another space, or of an unknown type or status | Listed |

## What does not come across

Likes, watchers, page analytics, and the people's accounts themselves. Users and groups named in the export become inactive historical members and groups; nobody can sign in as them.

## Size limits

| Limit | Documented | Measured locally |
|---|---|---|
| Files in the zip | 20,000 | 20,000 imported; 20,001 refused |
| Expanded size | 512 MiB | 512 MiB exactly imported; one byte more refused |
| One file | 64 MiB | 64 MiB exactly imported; one byte more refused |
| Reviewed plan | 300,000,000 bytes | 214 MB for a 3,000-page Cloud space with 7,000 versions (the largest measured) |

An archive over a limit is refused before anything is created, with a plain message and a failed import you can read. On a local Slate, a generated Confluence Cloud space of 3,000 restricted pages with 7,000 versions took about 65 seconds to preview, about 21 minutes to apply and index, and about 11 minutes to undo; a Server/Data Center space of 3,000 restricted pages with 6,000 versions and attachments took about 23 seconds to preview, about 4 minutes to apply and about 6 minutes to undo. Every page was searchable, by the people allowed to read it, the moment the import said completed.

These figures were measured on a local Slate (Worker and D1 running on one computer). They are not hosted measurements. They were generated at scale from anonymised exports; no real large export was supplied.

## Check the result

1. Import one small space first and read its report.
2. Sign in as a mapped member and as someone else, and check one restricted page each way.
3. Open a few pages, a page's history, a label and an attachment, and compare them with Confluence.
4. Then import the rest, and invite your team.
