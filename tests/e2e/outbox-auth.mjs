import {testDevKey,sourceDevOrigins} from './dev-key.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const mailbox = origin => fileURLToPath(new URL(`../../.artifacts/mail-edge/${new URL(origin).port}.jsonl`, import.meta.url));
export async function inbox(origin) {
  return (await readFile(mailbox(origin), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
}
export async function newOutboxLink(origin, before = []) {
  let messages;
  for (let attempt=0; attempt<100; attempt++) {
    messages = await inbox(origin);
    if (messages.length > before.length) break;
    await delay(50);
  }
  const message = messages.slice(before.length).at(-1);
  assert.ok(message, 'The mail transport received the message');
  const link = new URL(message.text.match(/https?:\/\/\S+/)[0]);
  assert.equal(link.origin, origin);
  return link.href;
}
/** Fake only the paid mail edge; confirmation uses the emitted production Worker. */
export async function signInWithOutbox(origin, email) {
  if(sourceDevOrigins.has(origin)) {
    const response=await fetch(origin+'/auth/dev/enter?as=owner',{headers:{'x-rer-dev-key':testDevKey},redirect:'manual'});
    assert.equal(response.status,303);
    const cookies=response.headers.getSetCookie().map(value=>value.split(';',1)[0]);
    const sessionCookie=cookies.find(value=>value.startsWith('slate_session='));
    assert.ok(sessionCookie);
    const cookie=[sessionCookie,...cookies.filter(value=>!value.startsWith('slate_session='))].join('; ');
    const session=await fetch(origin+'/api/session',{headers:{cookie}});
    assert.equal(session.status,200);
    const body=await session.json();assert.equal(body.member.email,email);
    return {cookie,body:{next:response.headers.get('location'),...body}};
  }
  const before = await inbox(origin);
  const request = await fetch(origin + '/api/auth/magic', {method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email,requestKey:randomUUID()})});
  assert.equal(request.status,200);
  const link = new URL(await newOutboxLink(origin,before));
  const response = await fetch(origin + '/auth/confirm', {method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')}),redirect:'manual'});
  assert.equal(response.status,303);
  const cookie=response.headers.get('set-cookie')?.split(';',1)[0];
  assert.ok(cookie?.startsWith('slate_session='));
  const session=await fetch(origin+'/api/session',{headers:{cookie}});
  assert.equal(session.status,200);
  return {cookie,body:{next:response.headers.get('location'),...(await session.json())}};
}
export async function signInBrowser(page, origin, email='jamie@aurora.example') {
  if(sourceDevOrigins.has(origin)) {
    const {cookie}=await signInWithOutbox(origin,email);
    await page.context().addCookies(cookie.split('; ').map(item=>{const [name,value]=item.split('=');return {name,value,url:origin};}));
    await page.goto(origin+'/app');return;
  }
  const before=await inbox(origin);
  await page.goto(origin+'/signin');
  await page.getByLabel('Email address',{exact:true}).fill(email);
  await page.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();
  await page.goto(await newOutboxLink(origin,before));
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.waitForURL(url=>url.origin===origin&&['/app','/setup'].includes(url.pathname));
}
