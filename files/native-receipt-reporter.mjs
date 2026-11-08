import {writeFileSync} from 'node:fs';
export default class ReceiptReporter {
 onTestCaseResult(test) {
  const receipt=test.meta().automationReceipt;
  if(receipt)writeFileSync('/home/agent/rer-consolidation/work/sd-slate-c-f221/packet/native-receipt.json',JSON.stringify({test:test.fullName,state:test.result().state,receipt},null,2)+'\n');
 }
}
