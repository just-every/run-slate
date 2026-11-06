from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import fitz

root=Path('/home/agent/rer-consolidation/work/sd-slate-c-f190/run-slate')
packet=Path('/home/agent/rer-consolidation/work/sd-slate-c-f190/packet')
source=root/'.artifacts/ui-convergence/columns-word-1440.docx'
pdf=root/'.artifacts/ui-convergence/word-pagination/columns-word-1440.pdf'
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {wordColumnsFixture} from './tests/helpers/word-columns-fixture.mjs';console.log(JSON.stringify(wordColumnsFixture(()=>crypto.randomUUID())))"],cwd=root,text=True))
document=fitz.open(pdf)
assert len(document)>1
words=[word for page in document for word in page.get_text('words')]
expected=['Recovery handover in Word',fixture['before']]
for section in fixture['sections']:
    for cell in section['cells']:
        expected += [cell['heading'],cell['text'],cell['end']]
    expected.append(section['after'])
actual=Counter(word[4] for word in words)
wanted=Counter(' '.join(expected).split())
assert actual==wanted,dict(missing=list((wanted-actual).items()),extra=list((actual-wanted).items()))
text='\n'.join(page.get_text() for page in document)
found=re.findall(r'Checkpoint\s+(\d+)\.(\d+)\.(\d+):',text)
assert len(found)==len(set(found))==155
# The same long left cell continues across pages at the same horizontal edge.
continuations=[]
for number,page in enumerate(document):
    runs=[word for word in page.get_text('words') if re.match(r'2\.1\.\d+:',word[4])]
    if runs:continuations.append({'page':number+1,'minimum_x':min(word[0] for word in runs),'maximum_x':max(word[0] for word in runs),'checkpoints':len(runs)})
assert len(continuations)>=2
assert max(row['minimum_x'] for row in continuations)-min(row['minimum_x'] for row in continuations)<1
# First page has both column headings on one baseline at different x positions.
headings=[block for block in document[0].get_text('blocks') if 'Section 2 column ' in block[4]]
assert len(headings)==2 and headings[0][0]<headings[1][0]
assert abs(headings[0][1]-headings[1][1])<1
# Section 2's ordinary paragraph follows the tall left cell, not the short right one.
end=[(n,b) for n,page in enumerate(document) for b in page.get_text('blocks') if 'End of section 2 column 1.' in b[4]]
following=[(n,b) for n,page in enumerate(document) for b in page.get_text('blocks') if 'After section 2:' in b[4]]
assert len(end)==len(following)==1
assert following[0][0]>end[0][0] or (following[0][0]==end[0][0] and following[0][1][1]>end[0][1][3])
receipt={
 'probe':'BLOCK-012 Word page boundary','renderer':'LibreOffice Writer PDF export with PyMuPDF readback',
 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'rendered_sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),
 'pages':len(document),'exact_word_multiset':True,'checkpoint_count':len(found),
 'continuations':continuations,'side_by_side_heading_baseline':True,
 'following_paragraph_after_tall_cell':True,'exit':0,
}
(packet/'word-pagination-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
for page_number in [0,1,len(document)-1]:
    document[page_number].get_pixmap(matrix=fitz.Matrix(1,1)).save(packet/f'word-page-{page_number+1}.png')
print(json.dumps(receipt))
