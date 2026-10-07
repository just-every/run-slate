import { strToU8, zipSync } from "fflate";

// These are deliberately synthetic parser fixtures. They are not evidence for
// IMP-002 or IMP-003, which require incumbent-produced exports.
const utf8 = (value: string) => strToU8(value);

export function syntheticNotionArchive(): Uint8Array {
  return zipSync({
    // Notion drops the identifier from the child directory's name, so the
    // fixture spells the tree the way the real exporter does.
    "Project 11111111-1111-1111-1111-111111111111.md": utf8("# Project\n\n[Task](Project/Task 22222222-2222-2222-2222-222222222222.md)\n\n![Cover](files/cover.png)"),
    "Project/Task 22222222-2222-2222-2222-222222222222.md": utf8("# Task\n\nDone."),
    "Inventory.csv": utf8("Name,Done,Due\nWidget,Yes,2026-09-08\n"),
    "files/cover.png": new Uint8Array([137, 80, 78, 71]),
  });
}

export function syntheticConfluenceArchive(): Uint8Array {
  return zipSync({
    "entities.xml": utf8(`<?xml version="1.0"?>
      <hibernate-generic>
        <object class="Space"><property name="id">space-1</property><property name="name">Engineering</property><property name="key">ENG</property></object>
        <object class="Page"><property name="id">page-1</property><property name="spaceId">space-1</property><property name="title">Overview</property><property name="body"><![CDATA[<h1>Overview</h1><p><a href="/pages/viewpage.action?pageId=page-2">Next</a></p>]]></property><property name="restricted">true</property><property name="labels"><string>team</string></property></object>
        <object class="Page"><property name="id">page-2</property><property name="spaceId">space-1</property><property name="parentId">page-1</property><property name="title">Child</property><property name="body"><![CDATA[<p>Child body</p>]]></property></object>
        <object class="Folder"><property name="id">folder-1</property><property name="spaceId">space-1</property><property name="parentId">page-1</property><property name="title">Legacy folder</property></object>
        <object class="Version"><property name="id">version-1</property><property name="contentId">page-1</property><property name="versionNumber">3</property><property name="comment">Published</property></object>
        <object class="Attachment"><property name="id">attachment-1</property><property name="fileName">diagram.png</property></object>
        <object class="BlogPost"><property name="id">blog-1</property></object>
      </hibernate-generic>`),
    "attachments/diagram.png": new Uint8Array([137, 80, 78, 71]),
  });
}

export function syntheticDocx(): Uint8Array {
  return zipSync({
    "word/document.xml": utf8(`<?xml version="1.0"?>
      <w:document xmlns:w="w" xmlns:r="r"><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
        <w:p><w:r><w:t>Body text</w:t></w:r><w:r><w:drawing><a:blip xmlns:a="a" r:embed="rId1"/></w:drawing></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Bullet item</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Ordered item</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      </w:body></w:document>`),
    "word/numbering.xml": utf8(`<?xml version="1.0"?>
      <w:numbering xmlns:w="w">
        <w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
        <w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
        <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
        <w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
      </w:numbering>`),
    "word/_rels/document.xml.rels": utf8(`<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="media/image1.png"/></Relationships>`),
    "word/media/image1.png": new Uint8Array([137, 80, 78, 71]),
  });
}

export function syntheticEpub(): Uint8Array {
  return zipSync({
    "META-INF/container.xml": utf8(`<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>`),
    "OPS/book.opf": utf8(`<?xml version="1.0"?><package><metadata><dc:title xmlns:dc="dc">Sample Book</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`),
    "OPS/chapter.xhtml": utf8("<html><body><h1>Chapter one</h1><p>Book text</p></body></html>"),
  });
}

export function syntheticPdf(): Uint8Array {
  return utf8("%PDF-1.4\n1 0 obj\n<< /Length 37 >>\nstream\nBT /F1 12 Tf (A PDF paragraph) Tj ET\nendstream\nendobj\n%%EOF\n");
}
