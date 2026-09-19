# n8n for BioGraph

This is a local, self-hosted n8n setup. It is intentionally a workflow orchestrator, not the location for BioGraph's clinical logic. Keep validation, medical safety rules, retrieval, and data processing in the application code that will be added to this repository.

## Start locally

1. Copy `.env.example` to `.env`.
2. Replace `N8N_ENCRYPTION_KEY` with a new random secret. Do not share or commit `.env`.
3. Run `docker compose up -d`.
4. Open `http://localhost:5678` and create the local n8n owner account.
5. Import `workflows/biograph-healthcheck.json` in n8n, activate it, then call `http://localhost:5678/webhook/biograph-health`.

The response confirms local workflow execution and deliberately handles no patient data.

## Team workflow

- Keep reviewed workflow exports in `workflows/` and commit them with the related code.
- Do not commit credentials, `.env`, execution data, API keys, or patient data.
- Each teammate runs their own local instance; only the exported workflow JSON is shared in Git.
- Use n8n for triggers, integration retries, and notifications. The application code remains the source of truth for BioGraph logic.

## Hackathon disclosure

In the final README, disclose n8n as a self-hosted orchestration tool and list any imported templates or community nodes. Before using a nontrivial workflow in the submission, get organiser confirmation that this use of n8n meets the competition's technical-implementation criterion.
