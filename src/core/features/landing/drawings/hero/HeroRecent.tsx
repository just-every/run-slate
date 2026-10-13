import { Icon } from "../../icons/Icon";

const recent = ["Roadmap", "Product specs", "Design system", "Engineering handbook", "Team updates"];

export function HeroRecent() {
  return (
    <div className="hw-recent">
      <p className="hw-recent-title"><Icon name="clock" />Recent</p>
      <ul>{recent.map(page => <li key={page}><Icon name="doc" />{page}</li>)}</ul>
    </div>
  );
}
