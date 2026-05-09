# TEAME — AI-Powered Virtual Company OS

A full-stack web app that gives solo entrepreneurs a virtual AI team to run their company.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL via Prisma ORM |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| Auth | JWT |

## Pages

- `/login` — Register / sign in
- `/onboarding` — Set up your company + AI team generation
- `/dashboard` — Company overview, stats, recent activity
- `/org-chart` — Interactive org chart grouped by department
- `/agents/:id` — Agent profile + live chat
- `/tasks` — Kanban board with AI-generated task outputs
- `/meeting-room` — Schedule + run async meetings with agent presentations

## Setup

### 1. PostgreSQL database

You need a PostgreSQL database. The easiest free options:

- **[Neon](https://neon.tech)** — serverless PostgreSQL, generous free tier
- **[Supabase](https://supabase.com)** — PostgreSQL with a dashboard
- **[Railway](https://railway.app)** — one-click PostgreSQL

Create a database and copy the connection string.

### 2. Anthropic API key

Get one from [console.anthropic.com](https://console.anthropic.com).

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
DATABASE_URL="postgresql://..."    # your PostgreSQL connection string
JWT_SECRET="a-long-random-string"  # generate with: openssl rand -base64 32
ANTHROPIC_API_KEY="sk-ant-..."     # from console.anthropic.com
FRONTEND_URL="http://localhost:3000"
PORT=3001
```

### 4. Install & migrate

```bash
# Backend
cd backend
npm install
npx prisma migrate dev --name init
npx prisma generate

# Frontend
cd ../frontend
npm install
```

### 5. Run

In two terminals:

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Development

```bash
# Backend TypeScript check
cd backend && npx tsc --noEmit

# Frontend TypeScript check
cd frontend && npx tsc --noEmit

# Prisma Studio (DB browser)
cd backend && npm run db:studio
```
