import type { FeatureContext } from '../../app/feature-context';
import type { BlockView } from '../../shared/api/content';
import { ApiProblem } from '../../app/problems';
import { serveMedia } from '../media/service';
import { xml } from './docx-xml';
export interface WordImage { path:string;type:string;extension:string;bytes:Uint8Array;relationship:string;id:number }
const imageTypes:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'};
export async function wordImages(ctx:FeatureContext,blocks:BlockView[]):Promise<Map<string,WordImage>> {
  const images=new Map<string,WordImage>();
  for(const block of blocks) {
    const content=block.content as {kind?:string;source?:{fileId?:string;url?:string}|null};
    const fileId=content.source?.fileId ?? /^\/api\/media\/([^/?#]+)/.exec(content.source?.url ?? '')?.[1];
    if(block.blockType!=='media'||content.kind!=='image'||!fileId||images.has(fileId))continue;
    let response:Response;
    try { response=await serveMedia(ctx,fileId); }
    catch(error) { if(error instanceof ApiProblem&&error.status===404)continue; throw error; }
    const type=response.headers.get('Content-Type')!,extension=imageTypes[type];
    if(!extension)throw new ApiProblem(400,'EXPORT_IMAGE_TYPE','This image format cannot be written to Word.');
    const id=images.size+1;
    images.set(fileId,{path:`media/image${id}.${extension}`,type,extension,bytes:new Uint8Array(await response.arrayBuffer()),relationship:`image${id}`,id});
  }
  return images;
}
export function wordDrawing(block:BlockView,images:ReadonlyMap<string,WordImage>,drawingId:number):string|undefined {
  const content=block.content as {alt?:string;source?:{fileId?:string;url?:string;name?:string}|null};
  const fileId=content.source?.fileId ?? /^\/api\/media\/([^/?#]+)/.exec(content.source?.url ?? '')?.[1];
  const image=fileId?images.get(fileId):undefined;
  if(!image)return undefined;
  // Natural PNG/GIF aspect ratio; other formats use Word's standard picture box.
  const view=new DataView(image.bytes.buffer,image.bytes.byteOffset,image.bytes.byteLength);
  const dimensions=image.extension==='png'&&view.byteLength>=24?[view.getUint32(16),view.getUint32(20)]:image.extension==='gif'&&view.byteLength>=10?[view.getUint16(6,true),view.getUint16(8,true)]:[640,480];
  const width=5486400,height=Math.round(width*Math.max(1,dimensions[1]!)/Math.max(1,dimensions[0]!));
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${drawingId}" name="${xml(content.source?.name)}" descr="${xml(content.alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${xml(content.source?.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
