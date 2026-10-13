import {installCompiledLiveEdits, setLiveEditsReady} from './editor';
import compiled from './editor/visual-edits.json';
if (typeof document !== 'undefined') {
  setLiveEditsReady(false);
  installCompiledLiveEdits(compiled);
}
