# Move from Notion

Bring a Notion workspace into Slate from Notion's own export. Slate never connects to Notion: everything comes from the zip you download. You see a preview of what will be created before anything is written, and you can undo the import afterwards.

## Export from Notion

1. In Notion, open **Settings**, then **General**, and choose **Export all workspace content**. To move one part, use **Export** on its top-level page instead.
2. Choose **Markdown & CSV**, include subpages, and turn on **Create folders for subpages**.
3. Download the zip. Keep it: Slate keeps a copy too, but your export is your record.

If Notion splits a large workspace into several zips, import them one at a time.

## Import into Slate

1. Open **Settings**, then **Import & export**.
2. Choose **Notion workspace** as the format, choose the zip and select **Upload and review**.
3. Read the preview. **Would create** counts what the import will make. **What did not cross** and **Warnings** list everything that will be left out or arrive changed. The preview also shows the reviewed plan's size against the import limit. Nothing has been written yet.
4. Select **Apply reviewed import**. The status moves through preparing, running and indexing with a count of what is done. If the page closes or the server stops, open the panel and select **Resume import**; it carries on from the last saved step. Nothing appears in the workspace until the whole tree is ready, then it all appears at once.
5. When it says completed, every imported page can already be found by search. Select **Find imported pages**, or **Download original archive** to get the zip back.

To take it back out, select **Undo import**. Undo removes what the import created, keeps any page someone has edited since (listed under **Native changes preserved** as `NATIVE_EDIT_CONFLICT`), and keeps the original archive.

## What comes across

| From Notion | In Slate |
|---|---|
| Pages and their nesting | Pages in the same tree, in one new private container |
| Headings, paragraphs, lists, to-dos, quotes, code, dividers and tables in Markdown | The matching blocks |
| Links between exported pages | Links to the imported pages |
| Images and files that are in the zip | Media attached to their page |
| CSV databases (`_all.csv`) | Databases, one record per row |
| Database columns | Fields. The first column is the title. Date, checkbox, number, email, URL, select, multi-select and relation columns are recognised from their values; anything else is text |
| Database row pages that are in the export | The record's page |
| Each page's content | Its first version in page history |

## What is reported

These arrive changed or are left out, and each one is named in the preview and the completed report, so nothing disappears silently:

| In the export | What happens |
|---|---|
| A database column with no values, or with too few distinct values to tell a select from text | Arrives as text, listed under **Warnings** |
| An image that is not in the zip | Kept as a link, listed under **What did not cross** |
| A file a page links to that is not in the zip | Listed under **What did not cross** |
| Database views (filters, sorts, board and calendar layouts) | Not imported, listed |
| A filtered view Notion exported as a loose CSV with no page | Not imported, listed |
| Two databases with the same name in one folder | Listed, so you can check which is which |
| A row page whose database row is not in the exported view | Imported as a page, listed |

## What does not come across

Notion's export does not contain these, so Slate cannot import them: comments and discussions, page history before the export, people and their permissions, sharing settings, column types (Notion's CSV carries values only, so Slate infers each type from the values, and rollups, formulas and people columns arrive as text), synced blocks as live copies, and embeds of other services beyond their link. Imported pages start private to you; share them in Slate when you are ready.

## Size limits

| Limit | Documented | Measured locally |
|---|---|---|
| Files in the zip | 20,000 | 20,000 imported; 20,001 refused |
| Expanded size | 512 MiB | 512 MiB exactly imported; one byte more refused |
| One file | 64 MiB | 64 MiB exactly imported; one byte more refused |
| Reviewed plan | 300,000,000 bytes | 25.7 MB for the 3,066-page workspace |

An archive over a limit is refused before anything is created, with the message "The archive expands beyond the import safety limits." and a failed import you can read. On a local Slate, a generated Notion workspace of 3,066 pages with 7 databases and 17 files took about 19 seconds from upload to preview, about 4 minutes to apply and index, and about 5 minutes to undo; a generated export of 20,000 files took about 40 minutes to apply and about 28 minutes to undo. Every page was searchable the moment the import said completed.

These figures were measured on a local Slate (Worker and D1 running on one computer). They are not hosted measurements. They were generated at scale from anonymised exports; no real large export was supplied.

## Check the result

1. Import one small export first and read its report.
2. Open a few pages at different depths, a database, a link between pages and an attachment, and compare them with Notion.
3. Search for a word from the middle of a page.
4. Then import the rest, and invite your team.
