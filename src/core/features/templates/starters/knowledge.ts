import { heading, note, paragraph, starter, table } from './blocks';

export const knowledgeStarters = [
  starter('how-to', 'How-to', 'Explain a repeatable task with prerequisites, ordered steps and checks.', 'Guides', [
    heading('Goal'), paragraph('Describe what the reader will accomplish and who this guide is for.'),
    heading('Before you start'), paragraph('List the access, tools and prerequisites required.'),
    heading('Steps'), table(['Step', 'Action', 'Expected observation']),
    heading('Check the result'), paragraph('Explain how the reader can verify the outcome and recover if it differs.'),
    heading('Related references'), paragraph('Link the authoritative documentation and the person or team to ask for help.'),
  ]),
  starter('troubleshooting', 'Troubleshooting', 'Investigate a symptom using evidence, diagnostic checks and safe recovery.', 'Guides', [
    heading('Symptoms and impact'), paragraph('Describe the observed behaviour, affected scope and when it began.'),
    heading('Diagnostic checks'), table(['Check', 'Evidence to collect', 'Interpretation']),
    heading('Possible causes'), paragraph('Record hypotheses separately from confirmed findings.'),
    heading('Recovery steps'), table(['Action', 'Required authority', 'Expected observation', 'Rollback']),
    heading('Escalation'), paragraph('Name the responsible team and the evidence needed when requesting help.'),
    heading('References'), paragraph('Link current runbooks, incidents and authoritative documentation.'),
  ]),
  starter('runbook', 'Runbook', 'Write an operational procedure with authority, checks, rollback and escalation.', 'Operations', [
    heading('Purpose and scope'), paragraph('Name the procedure, the systems it covers and when to use it.'),
    heading('Authority and prerequisites'), paragraph('State the required access, explicit approvals and safe test resources. Name stop conditions before any action.'),
    heading('Procedure'), table(['Step', 'Action or command', 'Expected evidence', 'Stop condition']),
    heading('Validation'), paragraph('Record how an authorized operator checks the result and retains the evidence.'),
    heading('Rollback and escalation'), paragraph('Describe recovery steps and the contact responsible when a check fails.'),
    heading('Maintenance'), paragraph('Link the source documentation and record the last actual review when one has taken place.'),
    note('This is a procedure-writing scaffold. Automated checked-runbook execution is unavailable; no steps have been dry-run or verified by creating this page.'),
  ]),
  starter('policy-page', 'Policy page', 'Draft a policy with a real page owner and an explicitly chosen review date.', 'Governance', [
    note('The member creating this page becomes its owner and chooses its review date. This draft is not an approved policy until the responsible authority approves it.'),
    heading('Purpose and scope'), paragraph('Explain what the policy governs, who it applies to and any exceptions.'),
    heading('Policy'), paragraph('Write the requirements clearly and cite the authority supporting them.'),
    heading('Responsibilities'), table(['Responsibility', 'Accountable role or member']),
    heading('Approval and effective date'), paragraph('Record the approving authority and effective date after approval occurs.'),
    heading('Exceptions and questions'), paragraph('Explain how to ask a question or request an exception and who decides.'),
    heading('Review'), paragraph('Use the page’s Owner and Review date properties to maintain accountability. Record the outcome of each actual review here.'),
  ], { owner: 'applying-member', reviewDate: 'choose-date' }),
];
