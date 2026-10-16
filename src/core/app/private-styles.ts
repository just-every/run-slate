import appCss from './styles.css?inline';
import fontCss from '../../../public/fonts/fonts.css?raw';
import latinFont from '../../../public/fonts/outfit/outfit-latin-wght-normal.woff2?inline';

// The signed-in document carries the same build output and font bytes as the
// linked stylesheets. Public documents retain their existing asset links.
export const privateAppCss=appCss;
export const privateFontCss=fontCss.replace("url('/fonts/outfit/outfit-latin-wght-normal.woff2')",`url('${latinFont}')`);
export const isWorkspacePath=(path:string)=>/^\/app(?:\/|$)/.test(path);
