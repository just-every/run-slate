# Moving in

Slate reads the files you export from Notion, Confluence and Google Docs, and ordinary Word, Markdown, HTML, text, CSV, PDF and EPUB files. File imports use only the file you give them. You can also connect your own Google Drive or SharePoint account to preview and import a folder. Keep your current wiki running while you check the result.

## Before you import

- **Export from the old tool first.** Slate keeps a copy of every file you import, so you can download the original again, but it does not replace your export.
- **You need to be allowed to create a container.** An import from Settings creates new containers (the app calls them spaces). Workspace owners can always do this. Other members can when the workspace allows members to create them, and guests cannot.
- **Mind the size limits.** A file can be up to 256 MiB. A zip archive can hold up to 20,000 files, each up to 64 MiB, and can expand to at most 512 MiB. A zip that is unusually compressed, encrypted or ZIP64 is refused, and so is one with file names that are not UTF-8.
- **Text files must be UTF-8.** Markdown, HTML, plain text and CSV files in another encoding are refused with a message that says so.

## Choose the format

Open **Settings**, then **Import & export**. The **Format** list offers these:

| Format | Give it | What you get |
|---|---|---|
| Notion workspace | The zip from Notion's export as Markdown and CSV | Pages in their tree. CSV databases become databases with typed fields and records. Files become media. Links between exported pages are kept. |
| Confluence space | The zip of a space export, in either form Confluence writes: the Cloud table export (`content.csv` and `bodycontent.csv`) or a Server or Data Center export (`entities.xml`) | Pages in their tree with their labels, versions, status and published state. Page and attachment links are kept, and named user and group restrictions are kept as named access. A folder becomes an empty page so its children keep their place. |
| Word document | A `.docx` file | One container with one page. Headings, text, lists and tables become blocks. |
| Google Docs (Word export) | A Google Doc downloaded as Word (`.docx`) | The same as a Word document. |
| Google Docs (HTML archive) | A Google Doc downloaded as a zipped web page | One page, with its images. |
| Markdown | A `.md` file | One container with one page. |
| HTML | An `.html` file | One container with one page. Unsafe elements are removed and reported. |
| Plain text | A `.txt` file | One page, with a paragraph for each run of text between blank lines. |
| CSV | A `.csv` file whose first row names the columns | One container with a database in it, and one record for each row. |
| PDF | A `.pdf` file | One page with supported tagged headings, tables, images and links. Slate reports unsupported PDF structure. |
| EPUB | An `.epub` file | One container named after the book, with a page for each chapter, in reading order. |

A document import names the container and page after the file, minus its extension.

## Run the import

1. Pick the format and choose your file.
2. Select **Upload and review**.

A single document (Word, Google Docs, Markdown, HTML, text, CSV, PDF or EPUB) imports straight away. The status moves from queued to running to completed, or to failed, with counts of what was created.

A Notion workspace or Confluence space stops at a preview first, and nothing is created until you apply it:

1. **Read the preview.** **Would create** counts the containers, pages, databases, records, files and versions the import will make. **What did not cross** lists everything it could not map, and **Warnings** lists things that will arrive changed. The preview also shows the size of the reviewed plan against the import's limit; a plan over the limit cannot be applied.
2. **Map the people, if asked.** A Confluence space with page restrictions lists the users and groups it names. Choose an existing member or group for each one you want to keep access, then select **Review these mappings**. Anyone you leave unmapped stays an inactive historical member, and the pages they were named on stay closed.
3. Select **Apply reviewed import**. The status moves through preparing, running and indexing, with a count of what is done. Each step is saved as it finishes, so if you close the page or the server stops, select **Resume import** and it carries on from the last saved step. Nothing appears in the workspace until the whole tree is ready; then all of it appears at once.
4. When it says completed, read the lists under the status:
   - **Created entries** names every container, page, database, record and file Slate made.
   - **What did not cross** names everything it could not map, so nothing disappears silently.
   - **Warnings** name things that arrived changed, such as an image that became a link because the file was not in the archive.
5. Select **Find imported pages** to open search, or **Download original archive** to get your file back.

If an import fails, Slate publishes nothing: no half-made tree is left behind. Fix the problem or read the message, then select **Retry retained original**. The retry uses the copy Slate kept, so you do not upload the file again.

### Undo an import

A Notion or Confluence import can be undone while it is running or after it has completed: select **Undo import**. Undo removes what the import created. A page someone has edited since the import is kept, along with anything people added under it, and it is listed under **Native changes preserved** with the code `NATIVE_EDIT_CONFLICT`. The original archive stays downloadable, so you can import it again later.

For the step-by-step moves, see [Move from Notion](MOVE-FROM-NOTION.md) and [Move from Confluence](MOVE-FROM-CONFLUENCE.md).

## What to expect

- **New containers start private.** You own them, and other people can open them only once you share them, apart from any named access the export carried over.
- **Imported pages are live inside Slate**, except that a draft in the source stays a draft. None of them is published to the web. A member has to publish a page before anyone outside can see it.
- **People in an export do not get accounts.** Users and groups named in a Confluence export become inactive historical members and groups, so their restrictions are kept. Nobody can sign in as them until you invite a real person.
- **Safe by design.** Slate cleans imported markup and files the same way it cleans anything you paste, and a file import fetches nothing from the network. Folder imports read only through your connected provider account. A link to a file that is not in the archive stays a link, and is listed under **What did not cross**.
- **Search is ready when the import is.** An import is not Completed until the imported pages can be found by search.

## A tidy way to move

1. Import one small export first, and read its report.
2. Check a few pages, a database, a link and a file against the original.
3. Import the rest, container by container.
4. Invite your team when you are happy, as in [Install and deploy](INSTALL.md).

Going the other way, you can export one page, a page with its children or a whole container as Markdown, HTML or PDF from the **Export page** and **Export space** actions. To keep a copy of everything, see [Backup and restore](BACKUP.md).

## Import a provider folder

In **Settings → Import & export → Folder imports**, a workspace owner first enables Google Drive or SharePoint / OneDrive. Connect your own account using a delegated access token for the same email you use in Slate. SharePoint also needs the document library or OneDrive drive ID. Tokens are stored encrypted and the credential field clears when you submit. Disconnecting destroys the saved token.

Choose the connected account, folder ID and an existing page you can edit, then select **Preview folder**. Review the tree, private-access summary and **Not imported** list. The preview creates no pages. Select **Import reviewed folder** to create the tree beneath that page. If the source changes, create a fresh preview.

Imported pages and images are private to you, even when the destination page is shared. Source sharing permissions are not copied. Google Docs and Word files become blocks; supported tagged PDFs preserve headings, tables, images and links. A file whose structure cannot be preserved is listed as not imported. Unreadable folders are not explored. Every imported document links back to its original, and links between imported documents point to their Slate pages. The retained report names omitted files and survives reload. Provider folder imports keep the source backlink rather than a downloadable copy of the original document.

Real Google Drive and SharePoint acceptance, Google console redirect setup and consent remain unproven.
