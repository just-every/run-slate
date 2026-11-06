import {chromium} from '/home/agent/rer-consolidation/work/sd-slate-c-f199/slate/node_modules/@playwright/test/index.mjs';
import {automationRestartJourney} from '/home/agent/rer-consolidation/work/sd-slate-c-f199/slate/tests/qualification/ui-convergence/automation-restart-journey.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
const context=await browser.newContext();
try {await automationRestartJourney({context});}
finally {await context.close();await browser.close();}
