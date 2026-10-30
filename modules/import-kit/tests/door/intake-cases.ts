import type { IntakeFormat } from '../../src/door/types.ts';
export interface IntakeCase {name: string; format: IntakeFormat | 'xml'; bytes: Buffer; expected?: unknown[]; status?: number; row?: number}
export function intakeCases(marker: string): IntakeCase[] {
  const csv = (name: string, source: string, expected?: unknown[], status?: number, row?: number): IntakeCase => ({name,format:'csv',bytes:Buffer.from(source),expected,status,row});
  const json = (name: string, source: string, expected?: unknown[], status?: number, row?: number): IntakeCase => ({name,format:'json',bytes:Buffer.from(source),expected,status,row});
  const ndjson = (name: string, source: string, expected?: unknown[], status?: number, row?: number): IntakeCase => ({name,format:'ndjson',bytes:Buffer.from(source),expected,status,row});
  return [
    csv('CSV first forbidden column',`passwordHash,id,title\n${marker},a,A\n`,[{id:'a',title:'A'}]),
    csv('CSV last forbidden column',`id,title,passwordHash\na,A,${marker}\n`,[{id:'a',title:'A'}]),
    csv('CSV middle forbidden column',`id,passwordHash,title\na,${marker},A\n`,[{id:'a',title:'A'}]),
    csv('CSV quoted header',`"passwordHash",id\n"${marker}",a\n`,[{id:'a'}]),
    csv('CSV embedded comma',`id,passwordHash\na,"${marker},more"\n`,[{id:'a'}]),
    csv('CSV embedded newline',`id,passwordHash\na,"${marker}\nmore"\n`,[{id:'a'}]),
    csv('CSV escaped quote',`id,passwordHash\na,"${marker}""quote"\n`,[{id:'a'}]),
    csv('CSV allowed multiline',`id,title,passwordHash\na,"Réne, says ""hello""\n次",${marker}\n`,[{id:'a',title:'Réne, says "hello"\n次'}]),
    csv('CSV case variant',`id,PasswordHash,EMAIL\na,${marker},${marker}\n`,[{id:'a'}]),
    csv('CSV unicode lookalike',`id,еmail\na,${marker}\n`,[{id:'a'}]),
    csv('CSV duplicate allowed header',`id,id,passwordHash\na,b,${marker}\n`,undefined,422,1),
    csv('CSV duplicate forbidden header',`id,passwordHash,passwordHash\na,${marker},${marker}\n`,undefined,422,1),
    csv('CSV mismatched width',`id,passwordHash\na,${marker},extra\n`,undefined,422,2),
    csv('CSV unterminated quote',`id,passwordHash\na,"${marker}`,undefined,422,2),
    csv('CSV invalid quote',`id,passwordHash\na,${marker}"bad\n`,undefined,422,2),
    csv('CSV empty','',[]),
    csv('CSV header only','id,passwordHash\n',[]),
    csv('CSV BOM',`\ufeffid,passwordHash\na,${marker}\n`,[{id:'a'}]),
    csv('CSV CRLF',`id,title,passwordHash\r\na,Å😀,${marker}\r\n`,[{id:'a',title:'Å😀'}]),
    ndjson('NDJSON forbidden first',`{"passwordHash":"${marker}","id":"a"}\n`,[{id:'a'}]),
    ndjson('NDJSON forbidden last',`{"id":"a","factors":["${marker}"]}\n`,[{id:'a'}]),
    ndjson('NDJSON duplicate key',`{"id":"a","credentials":"${marker}","credentials":null}\n`,undefined,422,1),
    ndjson('NDJSON BOM CRLF',`\ufeff{"id":"a","credentials":"${marker}"}\r\n`,[{id:'a'}]),
    ndjson('NDJSON empty blank lines','\n\r\n',[]),
    ndjson('NDJSON malformed second row',`{"id":"a"}\n{"passwordHash":"${marker}","id":}\n`,undefined,422,2),
    ndjson('Allowed value resembling secret',`{"id":"a","title":"sk_live_synthetic_looks_sensitive","passwordHash":"${marker}"}\n`,[{id:'a',title:'sk_live_synthetic_looks_sensitive'}]),
    json('JSON first last nested',`[{"credentials":{"password":"${marker}"},"id":"a","factors":["${marker}"]}]`,[{id:'a'}]),
    json('Okta list nested projection',`[{"id":"a","status":"SUSPENDED","profile":{"email":"person@example.test","department":"Review only","passwordHash":"${marker}"},"credentials":{"password":"${marker}"},"factors":["${marker}"]}]`,[{id:'a',status:'SUSPENDED',profile:{email:'person@example.test',department:'Review only'}}]),
    json('JSON key escapes',`[{"id":"a","\\u0065mail":"person@example.test","PasswordHash":"${marker}","еmail":"${marker}"}]`,[{id:'a',email:'person@example.test'}]),
    json('JSON malformed mid stream',`[{"id":"a"},{"passwordHash":"${marker}","id":}]`,undefined,422,2),
    json('JSON trailing junk',`[{"id":"a","passwordHash":"${marker}"}]oops`,undefined,422,2),
    json('JSON missing comma',`[{"id":"a","passwordHash":"${marker}"}{"id":"b"}]`,undefined,422,2),
    json('JSON duplicate nested key',`[{"id":"a","profile":{"email":"x","email":"${marker}"}}]`,undefined,422,1),
    json('JSON selected object refused',`[{"id":"a","title":{"passwordHash":"${marker}"}}]`,undefined,422,1),
    json('JSON empty file','',undefined,422,1),
    json('JSON empty array','[]',[]),
    json('JSON BOM CRLF',`\ufeff[\r\n{"id":"a","title":"次😀","passwordHash":"${marker}"}\r\n]`,[{id:'a',title:'次😀'}]),
    {name:'Malformed UTF8',format:'ndjson',bytes:Buffer.concat([Buffer.from(`{"id":"a","credentials":"${marker}"}\n`),Buffer.from([0xc0,0xaf])]),status:422,row:2},
    {name:'Unknown format refused',format:'xml',bytes:Buffer.from(`<passwordHash>${marker}</passwordHash>`),status:415},
  ];
}
