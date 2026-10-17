import {ActionDialog} from '../../../../app/ui/ActionDialog';
import type {StatusColour} from '../types';

export function StatusLabelDialog({text='',colour='grey',onSave,onClose}:{text?:string;colour?:StatusColour;onSave:(text:string,colour:StatusColour)=>Promise<void>|void;onClose:()=>void}) {
  return <ActionDialog title={text?'Edit status label':'Insert status label'} action={text?'Save label':'Insert label'} onClose={onClose} onSubmit={async data=>{
    const label=String(data.get('label')??'').trim();
    if(!label)throw new Error('Enter label text.');
    await onSave(label,String(data.get('colour')) as StatusColour);
  }}>
    <label>Label text<input name="label" aria-label="Label text" defaultValue={text} maxLength={80} required autoFocus/></label>
    <label>Colour<select name="colour" aria-label="Label colour" defaultValue={colour}>{(['grey','blue','green','yellow','red','purple'] as const).map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label>
  </ActionDialog>;
}
