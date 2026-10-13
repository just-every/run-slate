import {asArray,walkXml,xmlAttribute,xmlText,type XmlObject,type XmlValue} from "../xml";
export interface ConfluenceEntity {
  node: XmlObject;
  className: string;
  id: string;
  properties: Map<string, XmlValue>;
}

function className(node: XmlObject): string {
  return xmlAttribute(node, "class") ?? xmlAttribute(node, "className") ?? "";
}

export function nameMatches(entity: ConfluenceEntity, suffix: string): boolean {
  return entity.className.toLowerCase().split(".").at(-1) === suffix.toLowerCase();
}

export function objectId(node: XmlObject, properties: Map<string, XmlValue>): string | undefined {
  const direct = xmlAttribute(node, "id") ?? xmlText(properties.get("id"));
  if (direct) return direct.trim();
  const child = asArray(node.id as XmlValue | XmlValue[] | undefined)[0];
  return xmlText(child).trim() || undefined;
}

function propertiesFor(node: XmlObject): Map<string, XmlValue> {
  const values = new Map<string, XmlValue>();
  for (const property of [...asArray(node.property as XmlObject | XmlObject[] | undefined),...asArray(node.collection as XmlObject | XmlObject[] | undefined)]) {
    if (!property || typeof property !== "object") continue;
    const name = xmlAttribute(property, "name");
    if (name) {
      const previous = values.get(name);
      values.set(name, previous === undefined ? property : [...asArray(previous), property]);
    }
  }
  return values;
}

export function entities(xml: XmlObject): ConfluenceEntity[] {
  const result: ConfluenceEntity[] = [];
  walkXml(xml, (node) => {
    const type = className(node);
    if (!type) return;
    const properties = propertiesFor(node);
    const id = objectId(node, properties);
    if (id && properties.size) result.push({ node, className: type, id, properties });
  });
  return result;
}

export function property(entity: ConfluenceEntity, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = xmlText(entity.properties.get(name)).trim();
    if (value) return value;
  }
  return undefined;
}

/** All scalar assertions, including duplicate properties and synonymous field
 * names. Authority readers must check agreement before selecting a value. */
export function propertyValues(entity: ConfluenceEntity, ...names: string[]): string[] {
  const values = new Set<string>();
  for (const name of names) for (const value of asArray(entity.properties.get(name))) {
    const text = xmlText(value).trim();
    if (text) values.add(text);
  }
  return [...values];
}

export function propertyId(entity: ConfluenceEntity, ...names: string[]): string | undefined {
  for(const name of names){
    const value=entity.properties.get(name);if(!value)continue;
    const ids=referenceIds(value);if(ids.length)return ids[0];
    const text=xmlText(value).trim();if(/^[A-Za-z0-9_.:-]+$/.test(text))return text;
  }
  return undefined;
}

/** All explicit identities, so conflicting aliases cannot silently pick a winner. */
export function propertyIds(entity: ConfluenceEntity, ...names: string[]): string[] {
  const ids = new Set<string>();
  for (const name of names) for (const value of asArray(entity.properties.get(name))) {
    const refs = referenceIds(value);
    for (const id of refs) ids.add(id);
    const scalar = xmlText(value).trim();
    if (!refs.length && /^[A-Za-z0-9_.:-]+$/.test(scalar)) ids.add(scalar);
  }
  return [...ids];
}


/** References in exported object/collection properties are identities, never
 * labels. Preserve opaque keys rather than inferring people by display name. */
export function referenceIds(value:XmlValue|undefined):string[] {
  const ids=new Set<string>();
  walkXml(value,node=>{
    const id=xmlAttribute(node,'id');if(id)ids.add(id);
    for(const child of asArray(node.id as XmlValue|XmlValue[]|undefined)){const text=xmlText(child).trim();if(text)ids.add(text);}
  });
  return [...ids];
}
