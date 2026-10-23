import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ok} from './two-people-support.mjs';
import {touchWriteJourney} from './touch-page.mjs';

/** An ordinary member uses a touch context in the existing real-journey launch. */
export async function beginTouchJourney(state,width) {
  const workspace=await state.api('/api/workspace');
  async function policies(profile) {
    const current=await state.api('/api/workspace');
    const {name,mark,description,guestAccess,publicLinkAccess,anonymousAccess}=current;
    await ok(state.context,state.origin,'PUT','/api/workspace',{
      operationKey:randomUUID(),expectedRevisionId:current.revisionId,
      name,mark,description,guestAccess,publicLinkAccess,anonymousAccess,policies:profile,
    });
  }
  const context=await state.context.browser().newContext({
    viewport:{width,height:width===390?844:1000},hasTouch:true,isMobile:width===390,locale:'en-US',
  });
  const errors=[];
  try {
    await policies({...workspace.policies,'page.lifecycle.v1':'draft-then-publish'});
    await context.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:state.origin}]);
    const page=await context.newPage();
    page.on('pageerror',cause=>errors.push(String(cause)));
    page.on('response',response=>{if(response.status()>=400)errors.push(`${new URL(response.url()).pathname}: ${response.status()}`);});
    page.on('requestfailed',request=>errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    const api=async route=>{
      const response=await context.request.get(state.origin+route,{maxRetries:0});
      assert.equal(response.status(),200,await response.text());return response.json();
    };
    assert.equal((await api('/api/members/current')).role,'member');
    const container=(await ok(context,state.origin,'POST','/api/containers',{operationKey:randomUUID(),name:'Response operations',visibility:'private'})).value;
    const touch={page,context,origin:state.origin,api,containerId:container.id,containerName:container.name};
    touch.pageId=await touchWriteJourney(touch);
    touch.close=async()=>{try{assert.deepEqual(errors,[],'Touch surfaces have no browser errors or hydration mismatch.');}finally{await context.close();}};
    return touch;
  } catch(cause) {await context.close();throw cause;}
  finally {await policies(workspace.policies);}
}
