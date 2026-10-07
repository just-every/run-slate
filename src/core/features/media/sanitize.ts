import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { ApiProblem } from '../../app/problems';
const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use']);
const attrs = new Set(['xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'clip-path', 'mask', 'font-size', 'text-anchor', 'href', 'xlink:href']);
export function sanitizeSvg(value: string): string {
    if (/<!DOCTYPE|<!ENTITY/i.test(value))
        throw new ApiProblem(400, 'UNSAFE_SVG', 'SVG entities are forbidden.');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false });
    let doc: Record<string, any>;
    try {
        doc = parser.parse(value);
    }
    catch {
        throw new ApiProblem(400, 'INVALID_SVG', 'Invalid SVG.');
    }
    if (!doc.svg)
        throw new ApiProblem(400, 'INVALID_SVG', 'SVG root is required.');
    function clean(v: any): any {
        if (Array.isArray(v))
            return v.map(clean);
        if (typeof v !== 'object' || v === null)
            return String(v);
        const out: Record<string, any> = {};
        for (const [key, val] of Object.entries(v)) {
            if (key === '#text')
                out[key] = String(val);
            else if (key.startsWith('@_')) {
                const a = key.slice(2), s = String(val);
                if (!attrs.has(a) || /javascript:|data:|https?:|\/\//i.test(s) && a !== 'xmlns')
                    continue;
                if ((a === 'href' || a === 'xlink:href') && !/^#[A-Za-z_][\w:.-]*$/.test(s))
                    continue;
                if (/url\(/i.test(s) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(s))
                    continue;
                out[key] = s;
            }
            else if (tags.has(key))
                out[key] = clean(val);
        }
        return out;
    }
    return new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true }).build({ svg: clean(doc.svg) });
}
export function fileDisposition(name: string, inline: boolean) { const safe = name.replace(/[\r\n"\\]/g, '_'); return `${inline ? 'inline' : 'attachment'}; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`; }
