/** Portable criteria; results, cursors and the saving member's authority are never embedded. */
export interface EmbeddedSearchQuery {
  query:string;
  kind?:string;
  containerId?:string;
  contributorId?:string;
  status?:string;
  label?:string;
  sort?:'relevance'|'updated'|'views';
  updatedFrom?:string;
  updatedTo?:string;
  includeArchived?:boolean;
  includeTrashed?:boolean;
}
