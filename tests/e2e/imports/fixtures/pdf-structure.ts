/** Genuine tagged PDF with a title, heading, table, image and remote-document link. */
export function syntheticStructuredPdf(options: {title?: string; heading?: string; link?: string} = {}): Uint8Array {
  const escape = (text: string) => text.replace(/[\\()]/g, ch => `\\${ch}`);
  const title = options.title ?? 'Synthetic slate PDF';
  const heading = options.heading ?? 'Recovery checklist';
  const target = options.link ?? 'Companion.pdf';
  const stream = (contents: string, dictionary = '') => `<< /Length ${contents.length} ${dictionary} >>\nstream\n${contents}\nendstream`;
  const contents = [
    `/H1 <</MCID 0>> BDC BT /F1 22 Tf 1 0 0 1 60 740 Tm (${escape(heading)}) Tj ET EMC`,
    '/TH <</MCID 1>> BDC BT /F1 12 Tf 1 0 0 1 60 680 Tm (Task) Tj ET EMC',
    '/TH <</MCID 2>> BDC BT /F1 12 Tf 1 0 0 1 240 680 Tm (Status) Tj ET EMC',
    '/TD <</MCID 3>> BDC BT /F1 12 Tf 1 0 0 1 60 650 Tm (Restore files) Tj ET EMC',
    '/TD <</MCID 4>> BDC BT /F1 12 Tf 1 0 0 1 240 650 Tm (Ready) Tj ET EMC',
    '/Figure <</MCID 5>> BDC q 60 0 0 60 60 540 cm /Im1 Do Q EMC',
    '/P <</MCID 6>> BDC BT /F1 12 Tf 1 0 0 1 60 500 Tm (Open companion) Tj ET EMC',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 8 0 R /MarkInfo <</Marked true>> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R /Annots [7 0 R] /StructParents 0 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    stream(contents),
    stream('\xff\x00\x00\x00\xff\x00\x00\x00\xff\xff\xff\x00', '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8'),
    `<< /Type /Annot /Subtype /Link /Rect [60 495 160 515] /Border [0 0 0] /A << /S /GoToR /F (${escape(target)}) /D [0 /Fit] >> >>`,
    '<< /Type /StructTreeRoot /K [9 0 R 10 0 R 17 0 R 18 0 R] /ParentTree 20 0 R /ParentTreeNextKey 1 >>',
    '<< /Type /StructElem /S /H1 /P 8 0 R /Pg 3 0 R /K 0 >>',
    '<< /Type /StructElem /S /Table /P 8 0 R /Pg 3 0 R /K [11 0 R 12 0 R] >>',
    '<< /Type /StructElem /S /TR /P 10 0 R /K [13 0 R 14 0 R] >>',
    '<< /Type /StructElem /S /TR /P 10 0 R /K [15 0 R 16 0 R] >>',
    '<< /Type /StructElem /S /TH /P 11 0 R /K 1 >>',
    '<< /Type /StructElem /S /TH /P 11 0 R /K 2 >>',
    '<< /Type /StructElem /S /TD /P 12 0 R /K 3 >>',
    '<< /Type /StructElem /S /TD /P 12 0 R /K 4 >>',
    '<< /Type /StructElem /S /Figure /P 8 0 R /Pg 3 0 R /Alt (Four colour recovery marker) /K 5 >>',
    '<< /Type /StructElem /S /P /P 8 0 R /Pg 3 0 R /K 6 >>',
    `<< /Title (${escape(title)}) /Producer (Synthetic Slate import fixture) >>`,
    '<< /Nums [0 [9 0 R 13 0 R 14 0 R 15 0 R 16 0 R 17 0 R 18 0 R]] >>',
  ];
  let result = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(result.length); result += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = result.length;
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets.slice(1).map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 19 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(result, ch => ch.charCodeAt(0));
}
