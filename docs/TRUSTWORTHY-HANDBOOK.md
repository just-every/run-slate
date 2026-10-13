# Keep your handbook trustworthy

A handbook is only useful while people can tell which pages are still right. In Slate a person says so: they verify a page. This page explains what that means, how long it lasts, and what a team lead does each week to keep the handbook current.

## What verifying means

Verifying is a person's statement that they read a page as it is now and that it is right. Slate records three things with it:

- **Who verified it.** The member who verified becomes the page's verifier.
- **Which revision.** The exact version of the page they read. You can only verify the version you have opened; if someone changed the page after you opened it, Slate asks you to read the new version first.
- **Until when.** 7 days, 30 days or 90 days from the moment you verify, a date you choose, or no expiry. 90 days is selected for you.

No automated check, rule or model can verify a page. Only a member with edit access, who opened that exact revision, can do it.

To verify a page, open it, choose **Page status** from the page's menu, and pick a status marked *human verification* (Slate ships one called **Verified**). Choose how long it should last and confirm with **I reviewed this revision**.

The page's status chip then shows the verifier and the expiry, for example *Verified · Sam · until 10 Jan 2027*. The **Page status** panel also shows which revision was verified.

## When a verification stops holding

A verification stops reading as verified in two cases.

- **The page changed.** As soon as anyone edits the page, the chip reads **Changed since verification**. The **Page status** panel says the verified revision is not the current one, how many revisions came after it and who made them. From there, **See what changed** compares the verified revision with the page as it is now, and **Open the verified revision** shows the version that was verified.
- **It lapsed.** When the expiry passes, the chip reads **Verification lapsed**, and the verifier gets one notice in their **Inbox**. The original verification stays in the page's history.

In both cases the page is no longer presented as verified anywhere: not on the page, not in search results (it appears with the status *lapsed*), not in a content query that lists verified pages, not on a published page's content queries, and not in the readable export, whose `slate-readable.json` records the verification's actual state.

Nothing renews a verification automatically. A person reviews the page and verifies it again.

## The Needs review list

**Needs review**, in the sidebar under **Inbox**, lists the pages you can read whose verification:

- **has lapsed**,
- **expires within 14 days**,
- **was made on an older revision**, with the number of revisions since and who made them, or
- **has no active verifier** because the person who verified it has left the workspace. Only workspace owners see this group, because they decide who takes those pages over.

Use **Mine** for the pages you verified and **Everyone** for the whole handbook. The number beside **Needs review** in the sidebar counts your own pages that need review, plus, for owners, the pages without an active verifier.

Each row has one **Review** action. For a page that changed, it opens the comparison between the verified revision and the page as it is now. Once you have opened the current version, the row also offers **Verify again**, which opens the same verify dialog as the page.

The list shows only pages you can read today. If your access to a page is removed, it disappears from your list and from the sidebar count on your next visit. Nothing in the list verifies pages for you, and there is no way to verify many pages at once.

## A weekly routine for a team lead

1. Open **Needs review** and choose **Everyone**.
2. Start with **Lapsed** pages. Open each with **Review**, read it, fix what is out of date, and **Verify again**, or ask the right person to.
3. Then **Changed since verified** pages. **Review** shows exactly what changed; if the change is right, verify the page again.
4. Then pages that **Expire soon**, so they do not lapse.
5. If you are a workspace owner, check **No active verifier** and give each page a new verifier by verifying it yourself or asking a teammate to.

A short expiry suits pages that change often, such as on-call rotas or prices. 90 days suits most policy pages. No expiry suits pages that a change would make obviously wrong anyway.

## What this edition does not do

- It does not renew verifications on a schedule or after an edit.
- It has no language model or other automation that reads, summarises or verifies your pages.
- It sends lapse notices to the in-app **Inbox** only, not by email.
- It does not import verification history from another product.
