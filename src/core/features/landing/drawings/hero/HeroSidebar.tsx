import { Icon } from "../../icons/Icon";

const tree = [
  { folder: "Product", pages: ["Roadmap", "Specs", "Design"] },
  { folder: "Engineering", pages: ["Architecture", "Deployments"] },
  { folder: "People", pages: ["Onboarding", "Handbook"] },
];

/** The workspace's page tree, with the Roadmap page selected. */
export function HeroSidebar() {
  return (
    <div className="hw-side">
      <p className="hw-space"><Icon name="book" />Team Wiki</p>
      <ul className="hw-tree">
        {tree.map(({ folder, pages }) => (
          <li key={folder}>
            <p className="hw-folder"><Icon name="chevronDown" className="ic ic--chev" /><Icon name="folder" />{folder}</p>
            <ul>
              {pages.map(page => (
                <li key={page} className={page === "Roadmap" ? "hw-leaf is-current" : "hw-leaf"}><Icon name="doc" />{page}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
