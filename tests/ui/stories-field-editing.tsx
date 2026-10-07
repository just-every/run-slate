import { useState } from 'react';
import type { Story } from './stories';
import { FieldCell } from '../../src/core/features/databases/ui/fields/FieldCell';
import type { DatabaseField, FieldValue } from '../../src/core/features/databases/ui/types';
const fields: DatabaseField[] = [
  { id: 'text', name: 'Text value', type: 'text', editable: true },
  { id: 'number', name: 'Number value', type: 'number', editable: true },
  { id: 'url', name: 'URL value', type: 'url', editable: true },
];
function FieldEditing() {
  const [values, setValues] = useState<Record<string, FieldValue | null>>({});
  return <div>{fields.map(field => <FieldCell key={field.id} field={field} value={values[field.id]} onValueChange={(id, value) => setValues(current => ({ ...current, [id]: value }))} />)}<output data-testid="field-values">{JSON.stringify(values)}</output></div>;
}
export const fieldEditingStories: Story[] = [{ id: 'field-editing', title: 'Database fields · controlled editing', clauses: ['DB-002'], render: () => <FieldEditing /> }];
