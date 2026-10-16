import { lazy, Suspense, useEffect, useState } from "react";
const PageTransferDialog=lazy(()=>import("../../features/pages/ui/workspace/PageTransferDialog").then(module=>({default:module.PageTransferDialog})));
export function PublicDuplicate() {
  const [source, setSource] = useState<{
    pageId: string;
    host: string;
    slug: string;
  } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pageId = params.get("duplicatePublic"),
      host = params.get("publicHost"),
      slug = params.get("publicSlug");
    if (pageId && host && slug) setSource({ pageId, host, slug });
  }, []);
  if (!source) return null;
  return (
    <Suspense fallback={null}><PageTransferDialog
      pageId={source.pageId}
      publicSource={{ host: source.host, slug: source.slug }}
      kind="duplicate"
      onClose={() => {
        setSource(null);
        history.replaceState(null, "", window.location.pathname);
      }}
      onDone={(id) => window.location.assign(`/app/pages/${id}`)}
    /></Suspense>
  );
}
