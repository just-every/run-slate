import {useEffect, useLayoutEffect, useState} from 'react';
import {configLoader, createOwnerEditor} from '../../../editor';
const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
export function EditorMount({ownerId}: {ownerId: string}) {
  const [failure, setFailure] = useState<string>();
  useClientLayoutEffect(() => {
    const editor = createOwnerEditor();
    editor.setOwner(true);
    const load = configLoader('/api/editor/config', location.origin);
    let active = true;
    const refresh = () => { void editor.refresh(load).then(() => {if (active) setFailure(undefined);}).catch(() => {if (active) setFailure('Editor authorization is unavailable.');}); };
    const revoke = () => editor.setOwner(false);
    refresh();
    const timer = setInterval(refresh, 20_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('slate:session-ended', revoke);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('slate:session-ended', revoke); editor.dispose(); };
  }, [ownerId]);
  return failure ? <p role="alert">{failure}</p> : null;
}
