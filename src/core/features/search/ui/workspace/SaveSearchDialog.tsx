import {ActionDialog} from '../../../../app/ui/ActionDialog';
import {mutate,operationKey} from '../../../../client/transport';
export function SaveSearchDialog({query,onClose,onSaved}:{query:Record<string,unknown>;onClose:()=>void;onSaved:()=>void}) {
  return <ActionDialog title="Save search" action="Save search" onClose={onClose} onSubmit={async form=>{
    await mutate('/api/search/saved',{operationKey:operationKey(),name:String(form.get('name')),query});
    onSaved();
  }}>
    <label>Search name<input name="name" required maxLength={120} defaultValue={String(query.query||'All accessible content').slice(0,120)}/></label>
    <p>Your saved criteria run with your current access each time you open them.</p>
  </ActionDialog>;
}
