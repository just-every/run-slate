type Send = (method: string, route: string, data?: any, who?: string) => Promise<{status: number; data: any}>;
export interface DuplicationFixture {
  call: (method: string, route: string, data?: any, who?: string) => Promise<any>;
  send: Send;
  ownerId: string;
  readerId: string;
  sourceSpace: string;
  destinationSpace: string;
  destinationParent: string;
  sourceIds: string[];
  root: string;
  earlier: string;
  later: string;
  grandchild: string;
}
export function duplicationFixture(send: Send, options: {ownerId: string; readerId: string; host: string}): Promise<DuplicationFixture>;
export function duplicationSnapshot(fixture: DuplicationFixture, ids?: string[]): Promise<any>;
export function assertDuplication(fixture: DuplicationFixture, before: any, copyId: string, includeChildren: boolean): Promise<any>;
