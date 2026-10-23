/** A fixed same-origin script; form definitions remain inert HTML data. */
export const formClient=`
const form=document.querySelector('[data-database-form]');
if(form){
 const key=crypto.randomUUID(),questions=[...form.querySelectorAll('[data-question]')],status=document.querySelector('[data-form-status]');
 function value(input){if(input.type==='checkbox')return input.checked;if(input.multiple)return [...input.selectedOptions].map(option=>option.value);if(input.type==='number')return input.value===''?null:Number(input.value);return input.value;}
 function update(){for(const question of questions){const when=JSON.parse(question.dataset.when||'null'),source=when?form.elements.namedItem(when.fieldId):null;const shown=!when||source&&value(source)===when.equals;question.hidden=!shown;for(const input of question.querySelectorAll('input,select,textarea')){input.disabled=!shown;input.required=shown&&question.dataset.required==='true'&&input.type!=='checkbox';}}}
 form.addEventListener('input',update);form.addEventListener('change',update);update();form.dataset.formReady='true';
 form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;const submit=form.querySelector('[type=submit]');submit.disabled=true;status.textContent='Submitting…';try{
  const values={};for(const question of questions)if(!question.hidden){const input=question.querySelector('input,select,textarea');values[input.name]=value(input);}
  const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({submissionKey:key,expectedRevisionId:form.dataset.revision,title:form.elements.namedItem('title').value,website:form.elements.namedItem('website').value,values})});
  const result=await response.json();if(!response.ok)throw new Error(result.message||'The submission could not be accepted.');
  form.hidden=true;status.textContent='Submission received. Thank you.';status.focus();
 }catch(error){status.textContent=error instanceof Error?error.message:'The submission could not be confirmed.';submit.disabled=false;}});
}
`;
