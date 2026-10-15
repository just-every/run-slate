import ts from 'typescript';

/** Remove only the rendered HTML string of a docs record, leaving its code visible. */
export function withoutRenderedDocs(text) {
  const source = ts.createSourceFile('docs.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const ranges = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'html'
      && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
      ranges.push([node.initializer.getStart(source), node.initializer.end]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) text = text.slice(0, start) + '""' + text.slice(end);
  return text;
}
