from pathlib import Path
import sys
root=Path(sys.argv[1])
s=(root/'tests/qualification/ui-convergence/comments-journey.mjs').read_text()
s=s.replace("from './", "from '../tests/qualification/ui-convergence/")
s=s.replace("      await openPageAction(person.page, 'Comments');", "      if (person.probeFinal) await globalThis.commentsGate.arm(person, commentsPath);\n      await openPageAction(person.page, 'Comments');")
s=s.replace('    for (const person of [alice, bob]) {\n      await open(person);', '    for (const person of [alice, bob]) {\n      person.probeFinal = true;\n      await open(person);')
a,b=s.split('    for (const person of [alice, bob]) {')
b=b.replace("await expect(article(person, comment.id)).toContainText('Comment deleted');", "await globalThis.commentsGate.visible(person, () => expect(article(person, comment.id)).toContainText('Comment deleted'));")
line="      assert.deepEqual(await article(person, first.id).locator('..').locator('.comment').evaluateAll(items => items.map(item => item.id)), order.map(id => `comment-${id}`));"
assert line in b
b=b.replace(line,"      await globalThis.commentsGate.captured();\n      try {\n"+line+"\n      } finally { globalThis.commentsGate.release(); }")
(root/'.artifacts/comments-gated-subject.mjs').write_text(a+'    for (const person of [alice, bob]) {'+b)
r=(root/'.artifacts/isolate-comments.mjs').read_text()
r=r.replace("from '../tests/qualification/ui-convergence/comments-journey.mjs'", "from './comments-gated-subject.mjs'")
r=r.replace('const width =', '''globalThis.commentsGate = {
 async arm(person, path) {
  let done, release;
  const captured = new Promise(resolve => { done = resolve; });
  this.captured = () => captured;
  const held = new Promise(resolve => { release = resolve; });
  this.release = release;
  await person.page.route(url => url.pathname === path, async route => {
   const response = await route.fetch({maxRetries:0});
   const data = await response.json();
   console.log('CONTROLLED_RESPONSE '+JSON.stringify({status:response.status(),comments:data.comments.map(c=>({id:c.id,body:c.body,deletedAt:c.deletedAt}))}));
   done();
   await held;
   await route.fulfill({response});
  });
 },
 async visible(person, check) {
  const pending = check();
  await this.captured();
  const before = await person.page.locator('.comment').evaluateAll(items=>items.map(item=>item.id));
  this.release();
  await pending;
  const after = await person.page.locator('.comment').evaluateAll(items=>items.map(item=>item.id));
  console.log('CONTROLLED_RENDER '+JSON.stringify({before,after}));
 }
};
const width =''')
(root/'.artifacts/isolate-comments-gated.mjs').write_text(r)
