import { checkEditorInteractions } from './editor-interactions.mjs';
export async function checkInteractions(browser, base) {
 const context=await browser.newContext();
 try {
  const page=await context.newPage();
  const editor = await checkEditorInteractions(page,base);
  return [editor];
 }finally{await context.close();}
}
