# UI retirement proof

The production AST graph identified exactly 75 TSX files without a runtime path from application routes, server, or extension client. Those files are deleted. No production TSX behavior was rewritten. The resulting graph reaches all 232 remaining TSX modules and reports no unresolved runtime imports.

The isolated preview now contains exactly 45 stories. These are component regressions and accessibility evidence inputs, not product journey or provider acceptance. All existing journey tests remain unchanged. Retired component stories cannot establish coverage of live product journeys; the editor, field-editing and page-move regressions remain separate.

Every production file retired below was absent from the production runtime graph; therefore removing its obsolete preview coverage drops no reachable application behavior. Shared live components previously exercised inside those wrappers remain covered by the retained and extracted stories described below.

## Retired source files

- `src/core/features/ai/ui/AiAnswerBoundaryNote.tsx` — deleted AiAnswerBoundaryNote; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/ai/ui/AiAnswerCard.tsx` — deleted AiAnswerCard; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/ai/ui/AiCitationList.tsx` — deleted AiCitationList; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/ai/ui/AiFailureNotice.tsx` — deleted AiFailureNotice; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/ai/ui/AiNoAuthorityNote.tsx` — deleted AiNoAuthorityNote; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/ai/ui/AiPanel.tsx` — deleted AiPanel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/ai/ui/AiRunStatus.tsx` — deleted AiRunStatus; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/archive/ui/ArchiveEntryMeta.tsx` — deleted EntryKindIcon, EntryKindBadge, EntryStampLine, EntryLocationLine; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/archive/ui/ArchiveKindFilterChips.tsx` — deleted ArchiveKindFilterChips; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/archive/ui/ArchiveList.tsx` — deleted ArchiveList; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/archive/ui/ArchiveRow.tsx` — deleted ArchiveRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/automation/ui/RuleList.tsx` — deleted RuleList; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/comments/ui/CommentComposer.tsx` — deleted CommentComposer; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/comments/ui/CommentItem.tsx` — deleted CommentItem; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/comments/ui/CommentThread.tsx` — deleted CommentThread; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/comments/ui/DiscussionsFilters.tsx` — deleted DiscussionsFilters; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/comments/ui/DiscussionsPanel.tsx` — deleted DiscussionsPanel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/comments/ui/OrphanedThreadNotice.tsx` — deleted OrphanedThreadNotice; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/containers/ui/ContainerHome.tsx` — deleted ContainerHome; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/databases/ui/DatabaseSurface.tsx` — deleted DatabaseSurface; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/databases/ui/LayoutGlyph.tsx` — deleted layoutLabel, layoutOrder, layoutRequirement, LayoutGlyph; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/databases/ui/ViewControls.tsx` — deleted ViewControls; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/databases/ui/ViewRulesBar.tsx` — deleted ViewRulesBar; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/databases/ui/ViewTabs.tsx` — deleted ViewTabs; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/decisions/ui/DecisionLog.tsx` — deleted DecisionLog; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/decisions/ui/DecisionLogFilters.tsx` — deleted DecisionLogFilters; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/decisions/ui/DecisionStateChip.tsx` — deleted DecisionStateChip; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/lifecycle/ui/DraftBanner.tsx` — deleted DraftBanner; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/lifecycle/ui/ScheduledNotice.tsx` — deleted ScheduledNotice; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/navigation/ui/ContainerIndex.tsx` — deleted ContainerIndex; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/navigation/ui/ContainerIndexFilters.tsx` — deleted ContainerIndexFilters; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/navigation/ui/HomeScreen.tsx` — deleted HomeScreen; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/navigation/ui/NavEntryRow.tsx` — deleted NavEntryRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/notifications/ui/InboxFilters.tsx` — deleted InboxFilters; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/notifications/ui/InboxPanel.tsx` — deleted InboxPanel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/notifications/ui/NotificationRow.tsx` — deleted NotificationRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/page-status/ui/LapsedVerificationNotice.tsx` — deleted LapsedVerificationNotice; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/page-status/ui/VerificationBadge.tsx` — deleted VerificationBadge; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/pages/ui/PageDetailsPanel.tsx` — deleted PageDetailsPanel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/pages/ui/PageStatusChip.tsx` — deleted PageStatusChip; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/pages/ui/PageTitle.tsx` — deleted PageTitle; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/publishing/ui/IndexingSwitch.tsx` — deleted IndexingSwitch; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/publishing/ui/PublishLinkFields.tsx` — deleted PublishLinkFields; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/publishing/ui/PublishSiteFields.tsx` — deleted PublishSiteFields; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/publishing/ui/PublishToWebPanel.tsx` — deleted PublishToWebPanel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/publishing/ui/SettingRow.tsx` — deleted SettingRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/AppliedFilters.tsx` — deleted AppliedFilters; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/DefaultVisibilityNote.tsx` — deleted DefaultVisibilityNote; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/FilterMenu.tsx` — deleted MultiFilterMenu, SingleFilterMenu; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/MatchedText.tsx` — deleted MatchedText, matchedPlainText; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/SearchEmpty.tsx` — deleted SearchEmpty; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/SearchFacetColumn.tsx` — deleted SearchFacetColumn; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/SearchFilters.tsx` — deleted SearchFilters; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/SearchResultRow.tsx` — deleted SearchResultRow, SearchResultMeta, SearchLifecycleBadge, SearchResultLine; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/SearchResultsPage.tsx` — deleted SearchResultsPage; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/SearchScopeNotice.tsx` — deleted SearchScopeNotice; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/kinds.tsx` — deleted searchKindLabel, SearchKindGlyph; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/sharing/ui/AccessLevelSelect.tsx` — deleted accessLevelLadder, accessLevelLabel, accessLevelDefinition, orderAccessLevels, AccessLevelSelect; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/sharing/ui/GeneralAccessRow.tsx` — deleted GeneralAccessRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/sharing/ui/GrantInviteField.tsx` — deleted GrantInviteField; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/sharing/ui/GrantRow.tsx` — deleted formatGrantDate, GrantRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/sharing/ui/SharePanel.tsx` — deleted SharePanel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/sharing/ui/principal.tsx` — deleted PrincipalIcon, PrincipalLabel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/templates/ui/TemplateCard.tsx` — deleted TemplateCard; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/templates/ui/TemplateGallery.tsx` — deleted noTemplateMatchMessage, allTemplateCategoriesId, TemplateGallery; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/versions/ui/VersionHistoryPanel.tsx` — deleted VersionHistoryPanel; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/versions/ui/VersionHistoryTable.tsx` — deleted compareLimitNotice, VersionHistoryTable; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/versions/ui/VersionTombstoneRow.tsx` — deleted VersionTombstoneRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/workspace-settings/ui/GuardedAction.tsx` — deleted GuardedAction; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/workspace-settings/ui/InvitationRow.tsx` — deleted InvitationRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/workspace-settings/ui/InviteMemberForm.tsx` — deleted InviteMemberForm; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/workspace-settings/ui/MemberRow.tsx` — deleted MemberRow; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/workspace-settings/ui/MembersSection.tsx` — deleted MembersSection; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/workspace-settings/ui/SettingsShell.tsx` — deleted workspaceSettingsNav, SettingsShell; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/workspace-settings/ui/WorkspaceIdentitySection.tsx` — deleted WorkspaceIdentitySection; no production runtime reachability, so no reachable behavior loses coverage.
- `src/core/features/search/ui/describe.ts` — deleted `filterGroupLabels`, `describeFilters`, `clearedFilters` and `removeFilter` helpers; the only former source consumers were retired SearchFilters and SearchResultsPage; a source/test import scan found no surviving consumer, so no reachable behavior loses coverage.

## Retired or extracted preview files

- `tests/ui/stories-comment-submit.tsx` — deleted CommentComposer retry fixture; CommentComposer is unreachable. The corresponding obsolete interaction is removed; live editor and database field interaction assertions remain unchanged. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-collaboration.tsx` — deleted DiscussionsPanel, SharePanel and InboxPanel fixtures; each top-level wrapper and its retired feature descendants is unreachable. Shared controls remain exercised by retained live stories and the primitive fixture; no live collaboration journey acceptance is claimed. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-collaboration-documents.tsx` — deleted TemplateGallery, VersionHistoryPanel and PublishToWebPanel fixtures; those wrappers and feature descendants are unreachable. Badge tones, Tabs states, ScrollArea and DropdownMenuCheckboxItem coverage moves to the primitive fixture; retained stories still render the other live shared controls. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-operation-lists.tsx` — deleted RuleList, ArchiveList and DecisionLog fixtures; those wrappers and feature descendants are unreachable. Retained database layouts continue rendering live Table and field descendants; primitive and state fixtures preserve live shared control coverage. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-operation-notices.tsx` — deleted AiPanel, DraftBanner, ScheduledNotice, VerificationBadge and LapsedVerificationNotice fixtures; those wrappers and feature descendants are unreachable. Retained stories render live state components and Badge tones remain explicitly exercised by the primitive fixture. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-operations.tsx` — deleted aggregation of the RuleList, ArchiveList, DecisionLog, AiPanel, DraftBanner, ScheduledNotice, VerificationBadge and LapsedVerificationNotice fixtures; it contained no separate live component fixture. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories.tsx` — retired HomeScreen fixture and deleted-story imports only; BlockEditor ready/loading/empty/error/denied and all five SaveStatus stories keep their prior rendering and callbacks. Adds retained primitive fixtures to the index. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-workspace.tsx` — retired ContainerHome, WorkspaceIdentitySection, MembersSection and SettingsShell fixtures. SignInScreen and FirstRunWizard fixtures retain their prior states and callbacks. The reachable SettingsSection heading, description, child content, subheading and members state composition move to direct fixtures in stories-settings-section.tsx; obsolete identity/member controls are not presented as product coverage. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-discovery.tsx` — retired SearchResultsPage, ContainerIndex, PageDetailsPanel and PageTitle fixtures. All five PageMovePicker stories preserve their original props and callbacks. PageOutline headings, active selection and callback move from the ready PageDetailsPanel fixture into a direct PageOutline story. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-databases.tsx` — replaces deleted DatabaseSurface/ViewTabs/ViewControls/ViewRulesBar wrapper with test-only section scaffolding. TableView, BoardView, ListView, GalleryView, CalendarView, TimelineView and their FieldCell descendants retain original fixtures, props and callbacks. The four state stories directly render the same live EmptyState, DeniedState, LoadingState and ErrorState components with retry/request-access/new-record callbacks. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/interactions.mjs` — retires only CommentComposer rejection/retry assertions; preserves checkEditorInteractions invocation, its assertions and browser-context cleanup. editor-interactions.mjs is byte-identical. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/capture.mjs` — retires only the obsolete at-least-100 story count assumption, replacing it with exact 45-ID retained inventory equality. Field browser test invocation, editor invocation, ID uniqueness, requested-story validation, screenshots, browser/axe/page-error/console-error/overflow assertions and cleanup remain unchanged. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/README.md` — removes the retired CommentComposer interaction claim and documents the retained exact-inventory harness; introduces no test behavior change. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-settings-section.tsx` — extracted direct live SettingsSection fixture from deleted WorkspaceIdentitySection/MembersSection wrappers, preserving heading/description/content composition and member loading/empty/error descendants; adds a direct section action sample. It is component coverage only. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/stories-primitives.tsx` — extracts live Badge tones, both Tabs active states, constrained ScrollArea overflow and enabled/disabled DropdownMenuCheckboxItem states from retired wrappers. Real shared components retain their state handlers; these test fixtures do not simulate retired application workflows. Live coverage is preserved, so no reachable behavior loses coverage.
- `tests/ui/story-inventory.mjs` — records all 45 retained and extracted story IDs for exact capture-inventory validation; contains no application data or production behavior. Live coverage is preserved, so no reachable behavior loses coverage.

## Verification performed

- `node scripts/ui-reachability.mjs`: all 232 remaining production TSX modules reachable; no unresolved runtime imports.
- `node --check tests/ui/capture.mjs`, `node --check tests/ui/interactions.mjs`, `node --check tests/ui/story-inventory.mjs`: passed.
- Imported the actual story modules with `node --import tsx` and compared sorted IDs against story-inventory.mjs using assert.deepEqual: exactly 45 unique retained stories.
- TypeScript module-resolution scan of all relative imports in src and tests/ui, including type-only declarations: no missing source/story imports.
- Before/after story dependency import audit: all 61 shared primitive runtime symbols previously imported by the preview remain imported by retained or extracted live-component stories. This audit is a preservation check, not browser or product acceptance.
- `git diff --exit-code` on stories-field-editing.tsx, field-editing.test.tsx, tests/e2e/editor, page-move-state.test.tsx, editor-interactions.mjs, fixtures.ts and tests/qualification/ui-convergence: byte-identical.
- `git diff --check`: passed.
- Browser, build, full verify and release/source-lock checks are reserved to integration and are not claimed by this retirement proof. No server, browser or watcher was started.
