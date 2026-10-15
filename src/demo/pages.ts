import type { PageCreateInput, BlockInput } from '../core/features/pages/types';

const topics = [
  ['start', 'Start here', 'A small studio, one shared source of truth', 'Northstar designs thoughtful tools for independent teams. Start with our working agreements, meet the team, then explore the current launch plan.'],
  ['team', 'Meet the team', 'People and responsibilities', 'Maya Chen leads product and customer research. Sam Rivera owns engineering and reliability. You coordinate delivery and keep the handbook current.'],
  ['agreements', 'Working agreements', 'Make work easy to follow', 'Write decisions down. Share a short update before stand-up. Protect two afternoons each week for focused work. Give feedback on the work, with a concrete next step.'],
  ['onboarding', 'Your first week', 'Settle in at your own pace', 'Day one: read the handbook and meet your buddy. Day two: join a customer call. By Friday, ship a small improvement and write down anything that was confusing.'],
  ['launch', 'Autumn launch plan', 'A calmer first-run experience', 'We are simplifying onboarding and refreshing the help centre. Maya owns customer feedback; Sam owns release readiness. The team reviews the launch checklist every Thursday.'],
  ['research', 'Customer research', 'What we heard this month', 'Five small teams tested the new onboarding flow. Clear examples helped them get started; unclear permissions slowed them down. Next round: test the invitation and sharing language.'],
  ['decisions', 'Decision log', 'Keep the reasoning with the decision', 'We chose to improve activation before adding more integrations. Success means a new team publishes its first useful page during the first session. Review this decision after the next research round.'],
  ['engineering', 'Engineering handbook', 'Small changes, clear ownership', 'Start with the smallest complete user flow. Keep migrations reversible where possible. A release owner watches the rollout and records any follow-up before closing the work.'],
  ['support', 'Support playbook', 'Help people keep moving', 'Acknowledge the problem, reproduce it, and give a clear next step. Link the relevant guide and improve it when the same question appears twice. Escalate account access issues to the workspace owner.'],
  ['weekly', 'Weekly planning', 'This week’s commitments', 'Finish the onboarding copy, review the help-centre draft, and test the release checklist. Each person names one outcome and one risk. Carry unfinished work forward with a reason.'],
  ['release', 'Release checklist', 'Ready to share', 'Confirm the main journey works on mobile. Check permissions and recovery. Prepare a short release note. After launch, review support feedback and capture the next improvement.'],
  ['glossary', 'Team glossary', 'A shared vocabulary', 'Activation: a team creates its first useful shared page. Review: another teammate checks the work in context. Owner: the person responsible for keeping a page accurate.'],
];
export const demoPages: Omit<PageCreateInput, 'containerId' | 'operationKey'>[] = topics.map<Omit<PageCreateInput, 'containerId' | 'operationKey'>>(([slug, title, heading, text], index) => {
  const blocks: BlockInput[] = [
    { id: `demo-${slug}-heading`, blockType: 'heading', treePosition: '001', content: { level: 1, text: [{ text: heading! }] } },
    { id: `demo-${slug}-intro`, blockType: 'paragraph', treePosition: '002', content: { text: [{ text: text! }] } },
    { id: `demo-${slug}-related`, blockType: 'paragraph', treePosition: '003', content: { text: [{ text: 'Read next: ' }, { text: topics[(index + 1) % topics.length]![1]!, mention: { kind: 'page', id: `demo-${topics[(index + 1) % topics.length]![0]}` } }] } },
  ];
  return { id: `demo-${slug}`, title: title!, treePosition: String(index + 1).padStart(3, '0'), blocks };
});
