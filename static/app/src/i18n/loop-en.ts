/**
 * English text for the daily check, automation settings and supplier follow-up (week 3).
 * Mounted as `t.loop` in both dictionaries; Russian must have exactly the same shape.
 */
export const loopEn = {
  briefingTitle: 'Daily briefing',
  briefingDesc: 'What changed since the previous daily check. Deterministic: computed from the imported data and the risk rules, no AI.',
  lastCheck: (when: string, manual: boolean) => `Last check ${when} · ${manual ? 'run manually' : 'scheduled'}`,
  noCheckYet: 'No daily check has run yet. Jira runs the scheduled check once a day at a time it chooses; an administrator can run it now.',
  baseline: 'First check: the open risks were recorded. From the next check on, new and resolved risks are listed here.',
  newRisks: 'New',
  resolved: 'Resolved in data',
  stillCritical: 'Still critical',
  none: 'None',
  more: (n: number) => `+${n} more`,
  openTotal: (n: number) => `${n} open in total`,
  autoOn: 'Auto-create on',
  autoOff: 'Auto-create off',
  issuesCreated: 'Issues created automatically',
  notCreated: (n: number) => `${n} newly critical ${n === 1 ? 'risk has' : 'risks have'} no issue yet.`,
  commentsAdded: (n: number) => `"Resolved in data" comment added to ${n} linked ${n === 1 ? 'issue' : 'issues'}.`,
  autoForbidden: 'The LogiMind app cannot create issues in the chosen project. Give the app\'s user ("LogiMind for Jira") the Browse projects and Create issues permissions there, or turn auto-create off.',
  autoNotConfigured: 'Choose a Jira project and issue type in Jira settings before issues can be created automatically.',
  runNow: 'Run check now',
  running: 'Checking…',
  busy: 'A check is already running. Try again in a few minutes.',
  dayChange: 'Jira picks the time of the scheduled check; it cannot be set.',

  automationTitle: 'Automation',
  autoCreateLabel: 'Create Jira issues for new critical risks during the daily check',
  autoCreateHelp: 'Off by default. At most 5 issues per check, never for a risk that already has an issue, and never on the first check. The LogiMind app creates them (the app is the reporter), so it needs the Browse projects and Create issues permissions in the chosen project.',
  commentsHelp: 'When a risk disappears from the data, the daily check adds one "resolved in data" comment to its linked issue. LogiMind never changes or closes issues.',
  savedOn: 'Auto-create turned on.',
  savedOff: 'Auto-create turned off.',
  lastChanged: (when: string) => `Changed ${when}`,
  adminOnly: 'Only Jira administrators can change automation.',
  lastRunErrors: 'Problems in the last check',

  draftButton: 'Draft supplier follow-up',
  drafting: 'Drafting…',
  draftTitle: 'Follow-up to the supplier (draft)',
  draftNeverSent: 'Draft only: LogiMind never sends it. Check it, then copy it into your e-mail or chat.',
  draftAi: 'Written by AI from the shipment facts; every date, number and ID was checked against the data.',
  draftTemplate: 'Standard message filled in from the shipment facts.',
  draftFallback: 'The AI draft was not available or did not match the data, so the standard message is shown.',
  subject: 'Subject',
  message: 'Message',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Could not copy. Select the text and copy it yourself.',
  noDraft: 'This shipment has no open shipment risk, so there is nothing to follow up.',
};

export type LoopMessages = typeof loopEn;
