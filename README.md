# Margin

This workspace contains two frontends:

- `artifacts/margin` - the main Expo mobile app
- `artifacts/mockup-sandbox` - the web mockup playground

## First-time setup

Install dependencies from the repo root. This pulls every workspace package at once, so there is no separate `requirements.txt` or `venv` step for this project:

```bash
pnpm install
```

## Run

Start the main frontend:

```bash
pnpm --filter @workspace/margin dev
```

Start the web mockup frontend:

```bash
pnpm --filter @workspace/mockup-sandbox dev
```

## Other useful commands

```bash
pnpm run typecheck
pnpm run build
```
