import { Copy } from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../ui";
import { richTextToPlain, type BlockRenderProps, type CodeBlockData } from "../types";
import { Editable } from "./Editable";

/** Code with a language and a copy action (`BLOCK-006`). */
export function CodeBlock({ block, canEdit, onChange, actions }: BlockRenderProps<CodeBlockData>) {
  return (
    <div className="my-2 overflow-hidden rounded-card border border-line bg-sidebar">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1">
        <Select
          disabled={!canEdit}
          onValueChange={(language) => onChange({ ...block, language })}
          value={block.language}
        >
          <SelectTrigger aria-label="Code language" className="h-7 w-44 border-transparent bg-transparent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {block.languages.map((language) => (
              <SelectItem key={language} value={language}>
                {language}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => actions?.onCopyCode?.(block.id)} size="sm" variant="ghost">
          <Copy aria-hidden="true" className="size-3.5" />
          Copy
        </Button>
      </div>
      <div className="overflow-x-auto">
        <pre className="min-w-full p-3">
          <Editable
            as="code"
            canEdit={canEdit}
            className="block font-mono text-small leading-relaxed text-ink"
            label={`Code, ${block.language}`}
            onChange={(code) => onChange({ ...block, code: richTextToPlain(code) })}
            placeholder="Write code"
            value={block.code.length > 0 ? [{ text: block.code }] : []}
          />
        </pre>
      </div>
    </div>
  );
}
