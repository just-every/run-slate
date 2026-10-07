import { useEffect, useState } from "react";
import { mutate } from "./transport";
import type { FieldDto, RecordDto } from "./records";
export interface ReferenceLabel {
  id: string;
  label: string;
  kind: "person" | "file" | "record";
  url?: string;
}
export function useRecordReferences(fields: FieldDto[], records: RecordDto[]) {
  const [labels, setLabels] = useState<Map<string, ReferenceLabel>>(new Map());
  const body = {
    memberIds: [] as string[],
    fileIds: [] as string[],
    pageIds: [] as string[],
  };
  for (const field of fields) {
    const key =
      field.type === "person"
        ? "memberIds"
        : field.type === "file"
          ? "fileIds"
          : field.type === "relation"
            ? "pageIds"
            : null;
    if (key)
      for (const record of records) {
        const values = record.values[field.id];
        if (Array.isArray(values))
          body[key].push(
            ...values.filter(
              (value): value is string => typeof value === "string",
            ),
          );
      }
  }
  for (const key of Object.keys(body) as (keyof typeof body)[])
    body[key] = [...new Set(body[key])];
  const serialized = JSON.stringify(body);
  useEffect(() => {
    let alive = true;
    setLabels(new Map());
    if (
      Object.values(JSON.parse(serialized)).every(
        (value) => !(value as unknown[]).length,
      )
    )
      return;
    void mutate<{ items: ReferenceLabel[] }>(
      "/api/databases/references",
      JSON.parse(serialized),
    )
      .then((result) => {
        if (alive)
          setLabels(new Map(result.items.map((item) => [item.id, item])));
      })
      .catch(() => {
        if (alive) setLabels(new Map());
      });
    return () => {
      alive = false;
    };
  }, [serialized]);
  return labels;
}
