import { Plus } from 'lucide-react';
import { errorMessage } from '../../client/transport';
import { DEFAULT_PAGE_TITLE } from './pageDestination';
import { useCreatePage } from './useCreatePage';

/** The tree footer names its destination before it creates a root page. */
export function TreeCreatePage({ containerId, name }: { containerId: string; name: string }) {
  const creation = useCreatePage();
  return <>
    <button className="navlink tree-create-page" disabled={creation.pending} aria-busy={creation.pending || undefined}
      onClick={() => void creation.create(async () => ({ containerId, title: DEFAULT_PAGE_TITLE }))}>
      <Plus aria-hidden="true" /><span>Create page in {name}</span>
    </button>
    {creation.error ? <p role="alert">{errorMessage(creation.error)}</p> : null}
  </>;
}
