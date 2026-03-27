# 🖥️ Dev Dashboard

Your personal developer command center. Pulls Jira issues and Bitbucket PRs assigned to you, uses AI to prioritize your day, and parses Google Chat messages into action items.

---

## ✨ Features

- **Jira integration** — all open issues assigned to you, across multiple projects, sorted by priority
- **Bitbucket integration** — open PRs you authored or are reviewing, with comment counts
- **AI Daily Briefing** — Claude analyzes your workload and tells you what to focus on, what's overdue, and what's blocked
- **Google Chat Parser** — paste morning messages, AI extracts action items automatically
- **Live refresh** — one-click data refresh, 5-minute cache

---

## 🚀 Setup

### 1. Clone / copy this project

```bash
cd dev-dashboard
npm install
```

### 2. Configure environment variables

Copy the example file:

```bash
cp .env.local.example .env.local
```

Then fill in your credentials in `.env.local`:

#### Anthropic API Key
1. Go to https://console.anthropic.com
2. Create an API key
3. Set `ANTHROPIC_API_KEY=sk-ant-...`

#### Jira API Token
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Set:
   - `JIRA_BASE_URL=https://your-company.atlassian.net`
   - `JIRA_EMAIL=your-email@company.com`
   - `JIRA_API_TOKEN=your_token`

#### Bitbucket API Token
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Use the same page to create a token for Bitbucket (Atlassian account)
3. Set:
   - `BITBUCKET_WORKSPACE=your-workspace-slug`
   - `BITBUCKET_API_TOKEN=your_token`
   > Note: `JIRA_EMAIL` is reused for Bitbucket authentication — no extra email variable needed.

#### Google OAuth (Gmail integration)
1. Go to https://console.cloud.google.com
2. Create a project → Enable the **Gmail API**
3. Create **OAuth 2.0 credentials** (Web application)
4. Add the redirect URIs in the Google Console:
   - Local: `http://localhost:3002/api/auth/google/callback`
   - Production: `https://dev-dashboard-xi.vercel.app/api/auth/google/callback`
5. Set:
   - `NEXTAUTH_URL=http://localhost:3002` (locally) or `https://dev-dashboard-xi.vercel.app` (production)
   - `GOOGLE_CLIENT_ID=your_client_id`
   - `GOOGLE_CLIENT_SECRET=your_client_secret`
6. After running the app, visit `/api/auth/google` once to authorize Gmail access

### 3. Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you're live! 🎉

---

## ☁️ Deploy to Vercel

### Option A: Vercel CLI (fastest)

```bash
npm install -g vercel
vercel
```

Follow the prompts. Then add your environment variables:

```bash
vercel env add ANTHROPIC_API_KEY
vercel env add JIRA_BASE_URL
vercel env add JIRA_EMAIL
vercel env add JIRA_API_TOKEN
vercel env add BITBUCKET_WORKSPACE
vercel env add BITBUCKET_API_TOKEN
vercel env add NEXTAUTH_URL
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
```

Then deploy:

```bash
vercel --prod
```

### Option B: GitHub + Vercel dashboard

1. Push this folder to a GitHub repo
2. Go to https://vercel.com/new and import the repo
3. Add all environment variables in the Vercel dashboard under **Settings → Environment Variables**
4. Deploy!

---

## 📁 Project structure

```
dev-dashboard/
├── app/
│   ├── api/
│   │   ├── dashboard/route.ts   # Fetches Jira + Bitbucket + AI summary
│   │   └── parse-chat/route.ts  # Parses Google Chat messages
│   ├── globals.css              # Design system & theme
│   ├── layout.tsx
│   └── page.tsx                 # Main dashboard UI
├── lib/
│   ├── jira.ts                  # Jira REST API client
│   ├── bitbucket.ts             # Bitbucket REST API client
│   └── ai.ts                    # Anthropic AI integration
├── .env.local.example           # Template for credentials
└── README.md
```

---

## 🛠️ Customization

- **Change the JQL query** in `lib/jira.ts` to filter different issues (e.g., specific projects, sprints)
- **Add more projects** — the dashboard auto-detects all projects from your Jira issues
- **Adjust cache time** — change `revalidate: 300` in the lib files (seconds)
- **Dark/light theme** — edit CSS variables in `app/globals.css`

---

## 🔒 Security notes

- API keys are stored in `.env.local` which is gitignored by Next.js by default
- All API calls happen server-side (Next.js API routes) — credentials never reach the browser
- On Vercel, environment variables are encrypted at rest
