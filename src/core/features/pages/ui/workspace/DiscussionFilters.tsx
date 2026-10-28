interface DiscussionFiltersProps {
  status: string;
  kind: string;
  person: string;
  people: [string, string][];
  onStatus: (value: string) => void;
  onKind: (value: string) => void;
  onPerson: (value: string) => void;
}

export function DiscussionFilters({status, kind, person, people, onStatus, onKind, onPerson}: DiscussionFiltersProps) {
  return <>
    <label className="panel-filter"><span>Threads</span>
      <select aria-label="Threads" value={status} onChange={event => onStatus(event.target.value)}>
        <option value="all">All threads</option><option value="open">Open threads</option><option value="resolved">Resolved threads</option>
      </select>
    </label>
    <label className="panel-filter"><span>Kind</span>
      <select aria-label="Thread kind" value={kind} onChange={event => onKind(event.target.value)}>
        <option value="all">All kinds</option><option value="page">Page comments</option><option value="inline">Selected text</option>
      </select>
    </label>
    <label className="panel-filter"><span>Person</span>
      <select aria-label="Thread person" value={person} onChange={event => onPerson(event.target.value)}>
        <option value="all">Everyone</option>
        {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  </>;
}
