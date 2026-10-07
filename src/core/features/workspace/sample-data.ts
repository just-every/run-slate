import membersFixture from "../../../../sample-data/aurora/members.json";
import workspaceFixture from "../../../../sample-data/aurora/workspace.json";

export const sampleWorkspace = workspaceFixture;
export const sampleMembers = membersFixture as Array<typeof membersFixture[number] & { role: "owner" | "member" }>;

/** The member the loopback local sign-in opens a real D1 session for. */
export const SAMPLE_OWNER_MEMBER_ID = "01JBF2JH4M0D3S8ZJ1TQW7K0B1";
