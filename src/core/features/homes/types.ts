export interface HomePageLink { id: string; title: string; href: string }
export interface ContainerHomeConfiguration { pageId: string | null }
export interface CompanyHubConfiguration extends ContainerHomeConfiguration {
  linkPageIds: string[];
  keyPageIds: string[];
}
export interface HomeView {
  state: 'ready' | 'unconfigured' | 'unavailable';
  page?: HomePageLink;
  canConfigure: boolean;
  configuration?: ContainerHomeConfiguration & { revisionId: string | null };
}
export interface CompanyHubView extends Omit<HomeView, 'configuration'> {
  links: HomePageLink[];
  keyPages: HomePageLink[];
  configuration?: CompanyHubConfiguration & { revisionId: string | null };
}
export interface HomePageChoice extends HomePageLink {
  homeEligible: boolean;
  workspaceReadable: boolean;
  verified: boolean;
}
