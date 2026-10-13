import { ChevronDown, Ellipsis, Printer } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../../ui";

/** The "Print record" menu item. It belongs in the page More menu, beside the other things you can do with the record. */
export function RecordPrintItem() {
  return (
    <DropdownMenuItem onSelect={() => window.print()}>
      <Printer aria-hidden="true" />
      <span>Print record</span>
    </DropdownMenuItem>
  );
}

/** The More menu of a record that is shown as a row, not a page: it holds the same "Print record" item as a page's More menu. */
export function RecordMoreMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="tool" type="button" data-page-more>
          <Ellipsis aria-hidden="true" />
          More
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="page-more-menu" tabIndex={0}>
        <RecordPrintItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
