export function wordColumnsFixture(uuid:()=>string): {
  blocks: Array<{id:string;blockType:string;content:Record<string,unknown>;treePosition:string;parentBlockId?:string}>;
  sections: Array<{count:number;cells:Array<{heading:string;text:string;end:string;level:number}>;after:string}>;
  before:string;
};
