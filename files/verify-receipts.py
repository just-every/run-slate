"""Independently verify the public, synthetic browser revision receipts."""
import hashlib,json,re,unicodedata
from pathlib import Path
root=Path(__file__).parent
results=[]
for width in (1440,390):
    receipt=json.loads((root/f'receipts-{width}.json').read_text())
    assert receipt['width']==width and receipt['reopenedAfterReload']
    retained=receipt['retained'];rows=receipt['storedRows']
    assert len(retained)==len(rows)==9
    assert len({item['receipt']['revisionId'] for item in retained})==len(retained)
    assert sum(item['origin']=='publish' for item in retained)==1
    for item,row in zip(retained,rows):
        normalized=re.sub(r'\s+',' ',unicodedata.normalize('NFC',item['expectedText'])).strip()
        independent=hashlib.sha256(normalized.encode()).hexdigest()
        assert row['content_hash']==item['expectedHash']==independent
        assert row['id']==item['receipt']['revisionId']==item['snapshot']['id']
        assert row['created_at']==item['receipt']['committedAt']==item['snapshot']['createdAt']
        assert row['origin']==item['origin']
        assert row['author_member_id']=='browser-owner'
        assert json.loads(row['body_json'])==item['snapshot']['blocks']
        assert json.loads(row['properties_json'])==item['snapshot']['properties']
    assert retained[0]['snapshot']['properties']['cover']=={'kind':'gallery','id':'ocean'}
    assert all(item['snapshot']['properties']['cover'] is None for item in retained[-3:])
    assert retained[-2]['expectedHash']!=retained[-1]['expectedHash']
    results.append(dict(width=width,retained=len(retained),uniqueRevisionIds=True,independentSha256Matches=True,completeRowsMatch=True,explicitClearedCoverRetained=True,changedLinkTextChangesHash=True,reopenedAfterReload=True))
(root/'receipt-verification.json').write_text(json.dumps(dict(schema=1,results=results,passed=True),indent=2)+'\n')
print('RECEIPT_VERIFICATION passed=true widths=1440,390 snapshots=18')
