import { useState } from 'react';
import type { Story } from './stories';
import { Badge, Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '../../src/core/ui';
function PrimitiveStory({ tab, checked }: { tab: string; checked: boolean }) {
 const [selected, setSelected] = useState(tab);
 const [enabled, setEnabled] = useState(checked);
 const [selectedItem, setSelectedItem] = useState<number | null>(null);
 return <main className="max-w-reading p-6"><h1 className="mb-4 text-h1">Shared component states</h1>
  <div className="mb-4 flex flex-wrap gap-2">{(['neutral','accent','good','warn','danger','draft','outline'] as const).map(tone => <Badge key={tone} tone={tone}>{tone}</Badge>)}</div>
  <Tabs value={selected} onValueChange={setSelected}><TabsList aria-label="Component samples"><TabsTrigger value="first">First</TabsTrigger><TabsTrigger value="second">Second</TabsTrigger></TabsList><TabsContent value="first"><p>First tab content</p></TabsContent><TabsContent value="second"><p>Second tab content</p></TabsContent></Tabs>
  <ScrollArea className="mt-4 h-40 rounded-card border border-line"><ul className="p-3">{Array.from({length:20},(_,index)=><li key={index}><Button variant="ghost" size="sm" aria-pressed={selectedItem===index} onClick={()=>setSelectedItem(index)}>Scrollable item {index+1}</Button></li>)}</ul></ScrollArea>
  {/* Keep this sample nonmodal so the open checkbox states and sibling primitives are accessible together. */}
  <DropdownMenu defaultOpen modal={false}><DropdownMenuTrigger asChild><Button className="mt-4" variant="secondary">Checkbox menu</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuCheckboxItem checked={enabled} onCheckedChange={setEnabled}>Show details</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem disabled checked>Required detail</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu>
 </main>;
}
export const primitiveStories: Story[] = ['first','second'].flatMap(tab => [true,false].map(checked => ({id:`primitives-${tab}-${checked?'checked':'unchecked'}`,title:`Shared primitives · ${tab} tab, ${checked?'checked':'unchecked'}`,clauses:[],render:()=> <PrimitiveStory tab={tab} checked={checked}/>})));
