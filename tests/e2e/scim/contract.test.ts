import { admissionJourney } from './admission';
import { scimCustody } from './custody';
import { test } from 'vitest';
import { scimFixture } from './support';
import { protocolJourney, credentialJourney } from './security';
import { userJourney } from './users';
import { groupJourney } from './groups';
import { lifecycleJourney } from './lifecycle';

test('SCIM RFC7643/7644 HTTP sequence uses native invitations, Members, groups and revocation authority',async()=>{
  const f=await scimFixture();
  try{
    await protocolJourney(f);
    await admissionJourney(f);
    const person=await userJourney(f);
    await groupJourney(f,person.id,person.memberId);
    await lifecycleJourney(f,person);
    await scimCustody(f);
    await credentialJourney(f);
  }finally{f.mail.restore();}
});
