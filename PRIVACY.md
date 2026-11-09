# LogiMind for Jira — Privacy Policy

Last updated: 3 November 2026

LogiMind for Jira ("the app") is an Atlassian Forge app developed by an independent developer for the Codegeist 2026 hackathon. This policy explains what data the app processes.

## Where data is stored
All data stays inside Atlassian's platform. The app runs on Atlassian Forge, stores data in Forge storage (key-value store) of the Jira site where it is installed, and makes **no calls to external services or AI providers**. The developer has no access to your site's data.

## What the app stores
- **Logistics data you upload:** shipment and inventory records from CSV files (IDs, suppliers, products, quantities, dates, warehouses). Please do not upload personal data in these files.
- **Import history:** file name, time, row counts and validation errors (last 10 imports).
- **Jira integration settings:** the chosen project and issue type.
- **Links between risks and Jira issues:** issue ID and key.
- **Atlassian account IDs** (personal data): the account that imported a file, changed the Jira settings, or created an issue from a risk — kept for audit.
- **LogiMind roles:** the account IDs of the owner and managers, and a log of the last 50 role changes (who, what, whom, when).

No names, e-mail addresses or other profile data are stored. To show the owner, managers and the role log, Import & Settings reads display names and avatars from Jira **as the person viewing the page** (scope `read:jira-user`), so Jira's own profile-visibility settings apply; people Jira does not show appear as "Unavailable user". The same applies to the owner's search for new managers. These names are shown, never saved.

## How data is used
Only to show dashboards, risks and answers inside the app and its Rovo agent, and to create Jira issues when a user asks for it. Issues are created with the permissions of the user who clicks the button. Data is not sold, shared or used for any other purpose.

## Retention and deletion
Data remains until the LogiMind owner or a manager (or a Jira administrator, while no owner is set) deletes it (Import & Settings → *Delete all data*) or the app is uninstalled, after which Atlassian removes the app's Forge storage in line with its platform policies. Jira issues created by the app belong to your Jira site and are not deleted by the app.

## Contact
Questions or requests: open an issue at https://github.com/Muhsin2007/logimind-for-jira/issues
