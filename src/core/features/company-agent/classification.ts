/** Derive data kinds from typed record content, never a caller's classification flag. */
export function sensitiveKinds(record:unknown):string[] {
  const kinds=new Set<string>();
  const visit=(value:unknown,key='')=>{
    if(Array.isArray(value)){for(const item of value)visit(item,key);return;}
    if(value&&typeof value==='object'){for(const [name,item] of Object.entries(value))visit(item,name);return;}
    if(typeof value!=='string'&&typeof value!=='number')return;
    const text=String(value);
    if(/\b(?:SSN|social security number|national ID)\s*[:=]\s*\d{3}[- ]?\d{2}[- ]?\d{4}\b/i.test(text))kinds.add('regulated ID');
    if(/\bIBAN\s*[:=]\s*[A-Z]{2}\d{2}[A-Z0-9 ]{11,30}\b/i.test(text))kinds.add('bank');
    if(/\b(?:diagnosis|medical record|patient ID)\s*[:=]\s*\S+/i.test(text))kinds.add('health');
    if(/\b(?:payroll|salary)\s*[:=]\s*[$€£]?\d+/i.test(text))kinds.add('payroll');
    if(/^(ssn|socialSecurityNumber|nationalId|passportNumber)$/i.test(key)&&text.trim())kinds.add('regulated ID');
    if(/^(iban|bankAccount|routingNumber)$/i.test(key)&&text.trim())kinds.add('bank');
    if(/^(cardNumber|creditCardNumber|pan)$/i.test(key)&&/\d/.test(text))kinds.add('card');
    if(/^(diagnosis|medicalRecord|patientId)$/i.test(key)&&text.trim())kinds.add('health');
    if(/^(payroll|salary|payrollAmount)$/i.test(key)&&text.trim())kinds.add('payroll');
  };visit(record);return [...kinds].sort();
}
