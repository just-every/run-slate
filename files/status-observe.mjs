import { chromium } from '@playwright/test';
const launch=chromium.launch.bind(chromium);
chromium.launch=async (...args)=>{
 const browser=await launch(...args), create=browser.newContext.bind(browser);
 browser.newContext=async (...args)=>{
  const context=await create(...args);
  context.on('request',request=>{
   if(new URL(request.url()).pathname==='/api/status'&&request.method()==='POST') console.log('STATUS_REQUEST',JSON.stringify({at:Date.now(),data:request.postDataJSON()}));
  });
  context.on('response',response=>{
   if(new URL(response.url()).pathname==='/api/status') void response.json().then(body=>console.log('STATUS_RESPONSE',JSON.stringify({at:Date.now(),status:response.status(),method:response.request().method(),body})),()=>{});
  });
  return context;
 };
 return browser;
};
