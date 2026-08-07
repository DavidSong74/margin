## 2025-07-30 - [CRITICAL] Hardcoded Dev Credentials
**Vulnerability:** A hardcoded email and password (`dev@margin.app` / `devdevdev`) were found in `artifacts/margin/app/index.tsx` for a developer bypass button.
**Learning:** While guarded by `__DEV__`, having hardcoded credentials in the frontend codebase is extremely dangerous. They can easily leak into public repositories, or an accidental misconfiguration of the bundler environment could ship them to production, creating a severe backdoor for attackers.
**Prevention:** Never hardcode credentials, even for development purposes. Use environment variables (e.g., `process.env.EXPO_PUBLIC_DEV_PASSWORD`) or require developers to manually input test credentials.
