export interface HubConfiguration {
  title: string;
  description: string;
  linkPageIds: string[];
  announcementPageIds: string[];
  keyPageIds: string[];
}
export interface HubPage {
  id: string;
  title: string;
  icon: string | null;
  containerId: string;
  containerName: string;
  isPost: boolean;
  verified: boolean;
}
export interface HubView {
  title: string;
  description: string;
  links: HubPage[];
  announcements: {pageId:string;title:string;containerId:string;containerName:string;postedAt:string;authorName:string}[];
  keyPages: HubPage[];
  canManage: boolean;
}
export interface HubEditorView { configuration: HubConfiguration; revisionId: string | null; unavailableSelections: number }
