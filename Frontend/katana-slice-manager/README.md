# Katana Slice Manager UI

Use Node 24.14.1 (`.nvmrc`) and npm 10.9.3 (`packageManager`). Dependencies are recorded in `package-lock.json`.

```sh
nvm install
nvm use
npm install --global npm@10.9.3
npm ci
npm start
```

The development server is at http://localhost:4200. Both development and `npm run start:local-network` forward `/api` to `http://localhost:8000` using `proxy.conf.json`. Set that proxy target to a disposable local backend when needed; do not commit lab credentials. A proxy target is server-side development configuration, not a browser secret.

All tracked environment files use the public same-origin `apiBase: '/api'`. Production hosting must forward `/api` to the NBI. Environment files are compiled into the public browser bundle: never put passwords, tokens, or kubeconfigs there. No personal environment files are required.

```sh
npm test -- --watch=false
npm run build
npm run build -- --configuration development
npm run build -- --configuration local-network
```

The production build preserves the existing bundle/style budgets. Output is under `dist/katana-slice-manager`. There is no configured `ng e2e` target. Existing optional browser workflow checks are described in `../../Backend/docs/workflow-verification.md`.

Kubernetes submission IDs are saved before sending requests. History refreshes OSM status using that identity; an accepted request or completed OSM operation does not establish workload readiness. Unknown submissions must be reconciled before starting a new deployment.
