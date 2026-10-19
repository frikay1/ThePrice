# The Price

The Price is a React/Vite frontend backed by Laravel 12 and the existing Supabase PostgreSQL database. The Android app packages the built frontend locally; guest products remain in the device's WebView storage.

## Local checks

```powershell
cd frontend
npm ci
npm run lint
npm run build

cd ..\backend
composer install
php artisan test
```

Local `.env` files are intentionally not committed. Use the existing local files for development; do not copy production credentials into this repository.

## Private GitHub repository

The local Git repository has been initialized on `main`, but nothing has been staged, committed, or pushed. First create an empty **private** repository on GitHub, then replace the owner/repository placeholders below:

```powershell
git add --all
git status --short
git diff --cached --check
git commit -m "Prepare The Price for Android and Render"
git remote add origin https://github.com/<OWNER>/<PRIVATE_REPOSITORY>.git
git push -u origin main
```

Before committing, confirm that `.env`, `frontend/.env.local`, database files, logs, `vendor`, `node_modules`, and generated build output are absent from `git status`.

## Render backend (existing Supabase database)

The root `render.yaml` and `backend/Dockerfile` prepare a Docker web service on Render. The container serves Laravel's `public` directory over Apache, exposes Laravel's `/up` health endpoint, uses PostgreSQL with SSL, and does **not** run migrations, seeders, or data initialization commands on startup.

1. Create a **private** GitHub repository, push this project only after reviewing the files, then connect it to Render using the root `render.yaml` Blueprint.
2. In Render, provide the private values requested by the Blueprint:
   - `APP_KEY`: generate locally with `cd backend; php artisan key:generate --show`, then paste the output directly into Render's secret field. Do not commit it or send it in chat.
   - `APP_URL`: the HTTPS URL Render assigns to this API.
   - `CORS_ALLOWED_ORIGINS`: comma-separated exact origins, including the HTTPS frontend origin and `https://localhost` for the Android WebView. For local development, add `http://localhost:5173` and `http://127.0.0.1:5173` only when needed.
   - `SANCTUM_STATEFUL_DOMAINS`: hostnames (no scheme), including the frontend hostname and `localhost`; include local Vite hostnames only for development.
   - `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`: copy the connection details for the existing Supabase project from its dashboard. Never use a connection URL containing credentials in a tracked file.
3. Keep `DB_SSLMODE=require`, `SESSION_DRIVER=file`, `SESSION_SECURE_COOKIE=true`, `SESSION_SAME_SITE=none`, and `SESSION_DOMAIN` empty. `SameSite=None` plus HTTPS is required for the cross-origin browser session cookie. Keep the deployed web frontend hostname in `SANCTUM_STATEFUL_DOMAINS`; do **not** add the Android origin `localhost` there because native calls use stateless bearer authentication rather than the browser CSRF pipeline.
4. For Render hosts without direct IPv6 connectivity, use Supabase's pooler host and port from **Connect**. Prefer the Supavisor session pooler when available. If using the transaction pooler, copy its exact host, port, database, username format, and password from Supabase. No new database is created.
5. After deployment, confirm Render reports `/up` healthy and test authentication using the deployed frontend origin. Do not run migrations automatically; inspect and separately authorize any schema operation if one ever becomes necessary.

The committed `frontend/.env.production` deliberately leaves `VITE_API_BASE_URL` empty, overriding any developer-specific `.env.local` value during a production build. The application therefore opens directly in guest mode and does not contact Laravel unless a real API URL is explicitly provided at build time. The production build also refuses a localhost API URL.

## Android APK

Prerequisites: Node.js 20+, JDK 17, Android Studio with Android SDK Platform 35 and Android Build Tools installed. Set `JAVA_HOME` and `ANDROID_HOME`/`ANDROID_SDK_ROOT`, then reopen the terminal.

From `frontend`:

```powershell
npm ci
npx cap add android
npm run android:sync
npx cap open android
```

Android Studio can build an installable debug APK with **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The typical output is `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Verify that file exists before distributing it.

Without a Render URL, leave `VITE_API_BASE_URL` empty; the APK is a guest-only local demo and guest products persist on that device. After the API is deployed, build/sync with the real URL, for example:

```powershell
$env:VITE_API_BASE_URL = "https://<your-render-api-host>/api"
npm run android:sync
Remove-Item Env:VITE_API_BASE_URL
```

Replace the example host before running the command; it is not a working URL. The web app keeps its existing Sanctum cookie-session flow. Android uses separate rate-limited Sanctum personal-access-token login/registration endpoints, with the token stored by Android Keystore-backed encrypted storage; it is never written to localStorage. The access token expires according to `SANCTUM_EXPIRATION` and is revoked on logout. Verify mobile auth on a physical Android device after Render is configured.

No repository is published, no Render service is deployed, and no APK is generated by these preparation steps.
