# Project Guidelines

## Scope

This repository contains a web application for parking administration.
Agents working here should prioritize small, safe changes tied to a specific issue.

## Stack

- Node.js with Express for the backend
- Static frontend files under public
- SQLite database managed from src/db.js

## Project Layout

- src/server.js: HTTP API and static file hosting
- src/db.js: SQLite schema, seed data, and business operations
- src/parkingLayout.js: fixed parking spot definition
- public/: admin and tenant frontend
- .github/: prompts, agents, workflows, and repository automation

## Build And Validation

- Install dependencies with npm ci
- Run the application with npm start
- Validate server-side syntax with npm run check
- Health endpoint: http://127.0.0.1:3000/api/health

## Working Rules

- Fix the issue at the root cause instead of applying cosmetic edits.
- Preserve the current API shape unless the issue explicitly changes behavior.
- Keep parking spot assignments and payment rules consistent with the existing business rules.
- Avoid modifying generated SQLite files under data.
- Prefer minimal diffs and update only the files needed for the task.

## Issue Workflow

- Start by restating the requested behavior and the acceptance criteria.
- Inspect the affected route, database operation, and UI flow before editing.
- After changes, run npm run check and, when possible, verify the health endpoint.
- Summarize the user-facing impact, risks, and any manual verification still needed.