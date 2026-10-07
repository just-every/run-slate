import assert from 'node:assert/strict';
const choices={
 'page.lifecycle.v1':['always-live','draft-then-publish'],
 'page.access.v1':['workspace-general','container-general'],
 'page.public-access.v1':['site','link'],
 'page.version.v1':['autosnapshot','labelled'],
 'page.status.v1':['verification-only','open-vocabulary'],
 'record.page-parity.v1':['record-is-page','record-is-row'],
 'automation.scope.v1':['source','container','site'],
 'container.access.v1':['class-led','grant-led']};
export async function policyChecks({page,context,runtime,id,check,databaseId,recordId}){
 const request=async path=>(await context.request.get(runtime.origin+path)).json();
 const before=await request('/api/pages/'+id),containerId=before.page.containerId;
 for(const round of [0,1,2,0]){
  const profile=Object.fromEntries(Object.entries(choices).map(([key,values])=>[key,values[Math.min(round,values.length-1)]]));
  await page.goto(runtime.origin+'/app/settings');await page.getByRole('button',{name:'Edit workspace & policies'}).click();
  for(const [key,value]of Object.entries(profile))await page.locator(`select[name="${key}"]`).selectOption(value);
  for(const key of ['guestAccess','publicLinkAccess','anonymousAccess'])await page.locator(`select[name=${key}]`).selectOption('allowed');
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.deepEqual((await request('/api/workspace')).policies,profile);
  await page.goto(runtime.origin+'/app/pages/'+id);await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('button',{name:profile['page.public-access.v1']==='site'?'Set up public page':'Enable public link',exact:true}).click();
  const dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Host',{exact:true}).count(),profile['page.public-access.v1']==='site'?1:0);
  assert.equal(await dialog.locator('select[name=theme]').count(),profile['page.public-access.v1']==='site'?1:0);
  if(profile['page.public-access.v1']==='site')await dialog.locator('input[name=slug]').fill('qualification-public-'+round);
  await dialog.getByRole('button',{name:'Save public page',exact:true}).click();await dialog.waitFor({state:'hidden'});const exposure=(await request('/api/publishing/'+id)).exposure;assert.ok(exposure&&!exposure.revokedAt);
  await page.getByRole('button',{name:'Stop public access',exact:true}).click();await dialog.getByRole('button',{name:'Stop public access',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.ok((await request('/api/publishing/'+id)).exposure.revokedAt);
  await page.getByRole('button',{name:'Close details ×'}).click();await page.getByRole('button',{name:'Details',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Create a custom status',exact:true}).count(),profile['page.status.v1']==='open-vocabulary'?1:0);
  await page.goto(runtime.origin+'/app/containers/'+containerId);await page.getByRole('button',{name:'settings',exact:true}).click();
  await page.getByRole('button',{name:profile['container.access.v1']==='class-led'?'Visibility & public access':'External access',exact:true}).click();
  assert.equal(await page.getByRole('dialog').locator('select[name=visibility]').count(),profile['container.access.v1']==='class-led'?1:0);
  for(const name of ['guestAccess','publicLinkAccess','anonymousAccess'])await page.getByRole('dialog').locator(`select[name=${name}]`).waitFor();
  for(const key of ['guestAccess','publicLinkAccess','anonymousAccess'])await dialog.locator(`select[name=${key}]`).selectOption('allowed');
  await dialog.getByRole('button',{name:'Save settings',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal((await request('/api/containers/'+containerId)).guestAccess,'allowed');
  await page.goto(runtime.origin+'/app/settings?section=automation');
  if(profile['automation.scope.v1']==='source'){await page.getByText('Create and review source automations from a database’s toolbar.').waitFor();assert.equal(await page.getByRole('button',{name:'New automation',exact:true}).count(),0);}
  else {await page.getByRole('button',{name:'New automation',exact:true}).click();await page.getByRole('dialog').getByLabel('Run across').waitFor();await page.getByRole('dialog').getByLabel('Apply actions to').waitFor();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();}
  await page.goto(runtime.origin+'/app/databases/'+databaseId);await page.getByRole('button',{name:'Automations',exact:true}).click();await page.getByRole('button',{name:'New automation',exact:true}).click();const rule=page.getByRole('dialog');await rule.getByLabel('Name',{exact:true}).fill('Policy '+profile['automation.scope.v1']+' rule '+round);
  if(profile['automation.scope.v1']!=='source'){await rule.getByLabel('Run across').selectOption(profile['automation.scope.v1']);if(profile['automation.scope.v1']==='container')await rule.getByRole('combobox',{name:/^Space/}).selectOption(containerId);}else{assert.equal(await rule.getByLabel('Run across').count(),0);assert.equal(await rule.getByLabel('Apply actions to').count(),0);}
  await rule.getByRole('button',{name:'Add action',exact:true}).click();await rule.getByLabel('Comment',{exact:true}).fill('Local policy comment');await rule.getByLabel('Keep this automation disabled').check();await rule.getByRole('button',{name:'Save automation',exact:true}).click();await rule.waitFor({state:'hidden'});assert.ok((await request('/api/automation')).items.some(r=>r.scope===profile['automation.scope.v1']));
  await page.goto(runtime.origin+`/app/databases/${databaseId}/records/${recordId}`);await page.getByRole('heading',{name:'Routed record',exact:true}).first().waitFor();if(profile['record.page-parity.v1']==='record-is-row'){assert.equal(await page.locator('[data-page-editor]').count(),0);await page.getByText('Record comments',{exact:true}).click();await page.getByRole('heading',{name:'Discussion',exact:true}).waitFor();await page.getByText('Record history',{exact:true}).click();await page.getByRole('heading',{name:'Version history',exact:true}).waitFor();}else await page.locator('[data-page-editor]').waitFor();
  const after=await request('/api/pages/'+id);assert.deepEqual(after.blocks,before.blocks);assert.deepEqual(after.properties,before.properties);
  await page.screenshot({path:`${runtime.directory}/policy-round-${round}.png`,fullPage:true});
  check(['LIFE-006','SHARE-005','WEB-007','REV-007','STAT-005','DB-010','AUTO-005','CONT-008'],`Persisted profile round ${round}: ${JSON.stringify(profile)}; visible policy controls and unchanged stored page body/properties`);
 }
}
