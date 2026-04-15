---
name: "Resolver Issue"
description: "Resolve an issue or task in the Estacionamiento repository using the project issue workflow"
agent: "Issue Resolver"
argument-hint: "Paste the issue text, issue URL, or the acceptance criteria"
---

Resolve the provided GitHub issue for this repository.

Requirements:
- Follow the repository guidance in [AGENTS.md](../../AGENTS.md).
- Keep the change minimal and focused on the requested issue.
- Inspect the affected files before editing.
- Validate the result with npm run check.
- If the issue changes behavior, explain the impact and any follow-up needed.

Return:
- Short diagnosis
- Proposed implementation
- Validation result
- Any unresolved risk