import {statusLabelStyles} from './block-styles';
/** The anonymous reader uses Slate's paper, sage palette and reading geometry. */
export const publicDocumentStyles = `
:root{color-scheme:light;--canvas:#f9faf8;--paper:#fdfefd;--ink:#2d3a37;--strong:#15221e;--muted:#4d5955;--line:#e0e5e1;--accent:#46694d;--wash:#e6eee4}
${statusLabelStyles}
.table-of-contents{border:1px solid var(--line);border-radius:6px;padding:12px 18px;margin:24px 0}.table-of-contents ul{padding-left:22px;margin:0}.table-of-contents>ul{padding-left:18px}.page-body h1[id],.page-body h2[id],.page-body h3[id]{scroll-margin-top:24px}
[data-theme=dark]{color-scheme:dark;--canvas:#090e0d;--paper:#0d1411;--ink:#f1f2ee;--strong:#fbfcf8;--muted:#b7c0b9;--line:#29332d;--accent:#a8c49e;--wash:#17231b}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}button,input{font:inherit}button,a,input,summary{-webkit-tap-highlight-color:transparent}
:focus-visible{outline:2px solid var(--accent);outline-offset:4px}.public-header{border-bottom:1px solid var(--line);background:var(--paper)}
.public-header-inner{max-width:1200px;margin:auto;min-height:76px;padding:16px 32px;display:flex;align-items:center;gap:16px 28px;flex-wrap:wrap}
.public-brand{display:inline-flex;align-items:center;gap:10px;color:var(--strong);font:24px Georgia,serif;text-decoration:none}.public-brand img{width:34px;height:34px}
.public-crumbs{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;min-width:0;font-size:13px;flex:1}.public-crumbs span,.public-crumbs a{overflow-wrap:anywhere}.public-crumbs [aria-current]{color:var(--muted)}
.public-search{display:flex;gap:8px;margin-left:auto;max-width:100%;align-items:end}.public-search label{display:grid;gap:3px;font-size:12px;color:var(--muted);min-width:0}
.public-search input{width:220px;max-width:100%;min-width:0;min-height:40px;border:1px solid var(--line);border-radius:6px;padding:7px 10px;background:var(--canvas);color:var(--ink);font-size:14px}
.public-search button,.public-action{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border:1px solid var(--accent);border-radius:6px;padding:7px 14px;background:var(--accent);color:var(--paper);font-size:14px;cursor:pointer;text-decoration:none}
[data-theme=dark] .public-search button,[data-theme=dark] .public-action{color:var(--canvas)}
.public-main{max-width:780px;margin:64px auto 96px;padding:0 32px;overflow-wrap:anywhere}.public-main[data-full-width=true]{max-width:1200px}
.public-document[data-typeface=serif]{font-family:Georgia,serif}.public-document[data-typeface=mono]{font-family:ui-monospace,monospace}.public-document[data-small-text=true]{font-size:14px}
.page-title{font-family:Georgia,serif;font-size:40px;font-weight:400;letter-spacing:-.025em;line-height:1.2;margin:0 0 16px;color:var(--strong)}
.page-byline,.public-footer{color:var(--muted);font-size:13px}.page-byline{margin:0 0 28px}.page-body{margin-top:30px}.page-body h1,.page-body h2,.page-body h3{font-family:inherit;color:var(--strong);line-height:1.3;margin:28px 0 12px;font-weight:600}
.page-body h1{font-size:30px}.page-body h2{font-size:24px}.page-body h3{font-size:20px}.page-body p{margin:12px 0;white-space:pre-wrap}.page-body li,.page-body blockquote,.page-body aside{white-space:pre-wrap}
.page-body img,.page-body video,.page-cover{max-width:100%;height:auto;border-radius:6px}.page-cover{width:100%;max-height:240px;object-fit:cover;margin-bottom:28px}.page-icon{font-size:36px;margin-bottom:12px}.page-icon img{width:44px;height:44px;object-fit:contain}
figure{margin:24px 0}figcaption,cite{color:var(--muted);font-size:13px}cite{display:block}audio{max-width:100%}pre{overflow:auto;white-space:pre;background:var(--wash);border:1px solid var(--line);border-radius:6px;padding:16px}code{font: .9em ui-monospace,monospace;background:var(--wash);border-radius:3px;padding:2px 4px}pre code{padding:0}
blockquote,aside{border-left:3px solid var(--accent);padding:12px 18px;margin:20px 0}aside{background:var(--wash);border-radius:4px}.nested{margin-left:24px}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--line);padding:8px 12px;text-align:left}th{background:var(--wash)}hr{border:0;border-top:1px solid var(--line);margin:28px 0}
.mention{border-radius:4px;background:var(--wash);padding:2px 5px;color:var(--accent);text-decoration:none;box-decoration-break:clone}.task{display:flex;align-items:baseline;gap:10px}.task-marker{color:var(--accent)}.task[data-done=true] .task-text{text-decoration:line-through;color:var(--muted)}
mark{background:#fbf3db;color:#2d3a37}mark.blue{background:#edf3e9}mark.green{background:#e4f3ea}mark.red{background:#fbeae9}mark.purple{background:#efeafc}summary{cursor:pointer;padding:8px 0}
.public-results{border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:36px}.public-results h2{font-size:20px}.public-footer{max-width:1200px;margin:auto;padding:24px 32px;border-top:1px solid var(--line)}.public-unavailable{padding-block:32px}.public-unavailable p{max-width:480px;margin:20px 0 28px}
@media(max-width:600px){.public-header-inner{padding:14px 20px;gap:12px 20px}.public-brand{font-size:22px}.public-crumbs{flex-basis:calc(100% - 140px)}.public-search{width:100%;margin:0}.public-search label{flex:1}.public-search input{width:100%}.public-search button,.public-action{min-height:44px}.public-main{margin:36px auto 64px;padding:0 24px}.page-title{font-size:34px}.page-body h1{font-size:27px}.nested{margin-left:16px}.public-footer{padding:20px 24px}}
@media print{.public-search,.public-footer,.public-action{display:none}.public-main{margin:24px auto}.public-header{background:none}}
`;
