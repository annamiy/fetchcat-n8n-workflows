# Paperclip role skills

These skills define the same-issue workflow for the existing Paperclip
`Internal workflows` project. They do not create agents or routines.

| Skill | Existing role | Handoff |
| --- | --- | --- |
| `n8n-workflow-idea-research` | Idea Researcher | GO to Developer; DROP closes the proposal |
| `n8n-workflow-builder` | Developer | Commit and assertions to QA |
| `n8n-workflow-qa` | QA | Failures to Developer; pass to Publisher |
| `n8n-workflow-publisher` | Publisher | Merge and prepare Creator Portal draft |

Credentials and environment values are injected through Paperclip company
secret/environment bindings. No skill file contains a token, password, cookie,
credential ID, destination ID, or private evidence.

