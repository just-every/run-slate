export type FolderProvider = 'google-drive' | 'sharepoint';
export const folderProviders: Record<FolderProvider, string> = {
  'google-drive': 'Google Drive',
  sharepoint: 'SharePoint / OneDrive',
};
export interface FolderPolicy { provider: FolderProvider; enabled: number | boolean; revisionId: string }
export interface FolderConnection { id: string; provider: FolderProvider; label: string; driveId: string | null; state: string; revisionId: string }
export interface FolderSource { sourceId: string; name: string; url: string; pageId?: string }
export interface FolderOmission extends FolderSource { reason: string; detail?: string }
export interface FolderTreeEntry { sourceId: string; parentSourceId?: string; title: string; folder: boolean }
export interface FolderReport {
  imported: FolderSource[];
  notImported: FolderOmission[];
  warnings: FolderOmission[];
  folders: number;
  counts?: Record<string, number>;
  failure?: string;
  tree?: FolderTreeEntry[];
}
export interface FolderPreview { fingerprint: string; tree: FolderTreeEntry[]; report: FolderReport; privateAccess: 'importing-member-only' }
export interface FolderRun { id: string; state: string; report: FolderReport; revisionId: string; provider?: FolderProvider; folderId?: string; destinationPageId?: string }
export interface FolderImportIndex {
  policies: FolderPolicy[];
  connections: FolderConnection[];
  runs: { id: string; state: string; createdAt: string | number }[];
}
export interface FolderDestination { id: string; title: string; revisionId: string }
export interface FolderSelection { connectionId: string; folderId: string; destination: { pageId: string; expectedRevisionId: string } }
export const folderImportPath = '/api/imports/provider-folders';
