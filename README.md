# LWTMT Cloud Dashboard

Separate frontend/backend rebuild of the LWTMT cloud dashboard.

- `frontend/` — React (Vite), built as a static site
- `backend/` — Node/Express API
- Database — PostgreSQL (works locally, or Render's managed Postgres)

Pages: **Login → Time Range → Station No → Graphs** (Gauge, Crossover, Absolute Tilt,
Cumulative Tilt, each plotted against chainage).

The ingest endpoint the BeagleBone already posts to — `POST /api/survey` with
`{ filename, data: [...] }` — is unchanged, so `push_latest_csv.sh` /
`launch_railgui25_backend.py` on the trolley don't need any edits. Point them at
your new backend's URL instead of the old Flask app.

---

## Prerequisites (Windows)

- [Node.js 20 LTS](https://nodejs.org/) (includes npm)
- [PostgreSQL](https://www.postgresql.org/download/windows/) installed locally,
  **or** a Render managed Postgres instance (recommended for the actual cloud
  deployment — see below)

Check versions in PowerShell or Command Prompt:

```powershell
node -v
npm -v
```

---

## 1. Backend setup

```powershell
cd backend
copy .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — your local Postgres connection string, e.g.
  `postgresql://postgres:yourpassword@localhost:5432/lwtmt_db`
  (create the `lwtmt_db` database first with pgAdmin or `createdb lwtmt_db`)
- `DATABASE_SSL` — leave `false` for local Postgres
- `JWT_SECRET` — replace with any long random string
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — the admin login you'll use to sign in

Install dependencies, create the tables, and seed the admin user:

```powershell
npm install
npm run init-db
npm run seed-admin
```

To create ten days of simulated data for testing the daily graph lines, run:

```powershell
npm run seed-demo
```

This creates ten daily surveys for `SIM-STN-01`, with 120 samples per day. Use
the printed start and end timestamps in the dashboard, then select
`SIM-STN-01`. You can override the defaults with
`npm run seed-demo -- STATION_CODE DAYS ROWS_PER_DAY`.

Start the backend:

```powershell
npm run dev
```

It listens on `http://localhost:4000` by default. Check it's alive:

```powershell
curl http://localhost:4000/health
```

## 2. Frontend setup

Open a **second** terminal window (leave the backend running in the first):

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

This opens the dashboard at `http://localhost:5173`. Log in with the
`ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in `backend/.env`.

---

## Deploying to Render

- **Backend**: new Web Service, root directory `backend`, build command
  `npm install`, start command `npm start`. Add the same environment variables
  as `.env` (use Render's managed Postgres connection string for `DATABASE_URL`,
  and set `DATABASE_SSL=true`). Run `npm run init-db` and `npm run seed-admin`
  once via Render's shell after the first deploy.
- **Frontend**: new Static Site, root directory `frontend`, build command
  `npm install && npm run build`, publish directory `dist`. Set
  `VITE_API_BASE_URL` to your backend's Render URL + `/api`.
- **Database**: Render managed PostgreSQL — copy its connection string into the
  backend's `DATABASE_URL`.
- Update `CORS_ORIGIN` in the backend's env vars to your deployed frontend URL
  once it exists.

---

## Project structure

```
lwtmt-cloud/
  backend/
    schema.sql              Postgres schema (users, surveys, survey_records)
    src/
      server.js              Express entry point
      db/pool.js              Postgres connection pool
      middleware/auth.js      JWT session cookie logic
      routes/auth.js          /login /logout /session
      routes/ingest.js        POST /survey (BeagleBone upload, unchanged wire format)
      routes/data.js          /stations /graph-data
      scripts/initSchema.js   npm run init-db
      scripts/seedAdmin.js    npm run seed-admin
  frontend/
    src/
      pages/Login.jsx
      pages/TimeRange.jsx
      pages/StationSelect.jsx
      pages/Graphs.jsx
      context/AuthContext.jsx
      context/FilterContext.jsx
      api.js                  fetch wrapper for the backend
```
