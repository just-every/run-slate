import { heading, note, paragraph, starter, table, task } from './blocks';

export const teamStarters = [
  starter('meeting-notes', 'Meeting notes', 'Record attendees, an agenda, discussion and assigned follow-up tasks.', 'Meetings', [
    heading('Meeting context'), paragraph('Write the meeting purpose and date.'),
    heading('Attendees'), table(['Name', 'Role in this meeting']),
    heading('Agenda'), table(['Topic', 'Discussion lead', 'Desired outcome']),
    heading('Discussion and decisions'), paragraph('Capture the discussion, agreements and open questions. Link any decision records created after review.'),
    heading('Assigned tasks'), note('Replace the task prompt with an action, then choose its assignee and due date. Tasks start open and unassigned.'),
    task('Write the next action and assign its owner.'),
  ]),
  starter('retrospective', 'Retrospective', 'Reflect on the work, identify improvements and agree on next actions.', 'Meetings', [
    heading('Scope'), paragraph('Name the work and period being reviewed. Add the people taking part.'),
    heading('What went well'), paragraph('Record specific observations and supporting examples.'),
    heading('What could improve'), paragraph('Describe friction and its impact without assuming a cause.'),
    heading('What we learned'), paragraph('Separate observations from possible explanations and open questions.'),
    heading('Next actions'), task('Write an improvement to try, then assign an owner and due date.'),
    heading('Follow-up'), paragraph('Agree when to review the actions and what evidence would show an improvement.'),
  ]),
  starter('decision', 'Decision', 'Prepare the question, options, rationale and evidence for a native decision record.', 'Decisions', [
    note('This page is a decision draft. When it is ready, use More → Add decision record to create a Proposed decision, appoint its owner and cite the evidence. Acceptance is an explicit action on that record.'),
    heading('Question'), paragraph('State the decision to make and the scope it applies to.'),
    heading('Options considered'), table(['Option', 'Benefits', 'Costs and risks', 'Evidence']),
    heading('Proposed outcome'), paragraph('Describe the preferred option and the conditions it depends on.'),
    heading('Rationale'), paragraph('Explain the tradeoffs and why the evidence supports this proposal.'),
    heading('Evidence and review'), paragraph('Link the source pages and exact revisions to cite. Agree an owner and review date in the decision record.'),
  ]),
  starter('onboarding-page', 'Onboarding page', 'Orient a new teammate with contacts, reading and practical next steps.', 'People', [
    heading('Welcome and purpose'), paragraph('Describe the role, team and the purpose of this onboarding page.'),
    heading('People to meet'), table(['Contact', 'What to ask', 'How to reach them']),
    heading('Essential reading'), paragraph('Link the current team home, policies and role-specific guides.'),
    heading('Access and setup'), task('List a required access or setup step and assign the person responsible.'),
    heading('First work'), paragraph('Agree a first piece of real work and how to ask for help.'),
    heading('Check-in'), paragraph('Choose a check-in date and collect questions to discuss.'),
  ]),
  starter('team-home', 'Team home', 'Introduce the team, its responsibilities and the knowledge it maintains.', 'Company', [
    heading('Purpose and responsibilities'), paragraph('Describe the team’s remit, who it serves and what it owns.'),
    heading('People and contact'), table(['Responsibility', 'Contact', 'Contact route']),
    heading('Current priorities'), paragraph('Link the current plans and explain which priorities are active.'),
    heading('Team knowledge'), paragraph('Link the team’s guides, decisions, policies and runbooks.'),
    heading('Working together'), paragraph('Describe how to request help and where the team communicates.'),
    note('After creating this page, a space administrator can select it as the space home in the space settings.'),
  ]),
];
