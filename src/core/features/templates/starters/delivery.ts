import { heading, note, paragraph, starter, table, task, taskReport } from './blocks';

export const deliveryStarters = [
  starter('product-requirements', 'Product requirements', 'Define the problem, requirements, open questions and a live task report.', 'Product', [
    heading('Problem and audience'), paragraph('Explain the user problem, who experiences it and the evidence that it matters.'),
    heading('Goals and scope'), paragraph('Define the intended outcome, success measures and work excluded from this proposal.'),
    heading('Requirements'), table(['Requirement', 'Why it matters', 'Acceptance evidence']),
    heading('Experience and constraints'), paragraph('Link the design and describe usability, accessibility, security and operational constraints.'),
    heading('Open questions and dependencies'), table(['Question or dependency', 'Owner', 'Resolution needed']),
    heading('Delivery tasks'), note('This live report starts with open tasks across spaces the reader can access. After creating the page, edit the report to choose the project’s actual scope.'),
    taskReport(),
    heading('Related issues'), note('Issue embeds are unavailable in this installation. Add links to real issues when they exist; this template does not create or display issue records.'),
  ]),
  starter('project-plan', 'Project plan', 'Plan outcomes, milestones, dependencies, responsibilities and next actions.', 'Projects', [
    heading('Outcome and scope'), paragraph('State the intended outcome, constraints and the work this project covers.'),
    heading('Responsibilities'), table(['Responsibility', 'Owner', 'Contact']),
    heading('Milestones'), table(['Milestone', 'Target date', 'Completion evidence']),
    heading('Dependencies and risks'), table(['Dependency or risk', 'Impact', 'Owner', 'Next action']),
    heading('Next actions'), task('Write the next project action, then assign an owner and due date.'),
    heading('Updates and decisions'), paragraph('Link progress updates and reviewed decision records as the project develops.'),
  ]),
];
