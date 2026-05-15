# Goal Coach

A NestJS Slack bot powered by Claude AI that helps you manage goals, plan projects, and stay on track — with Notion as the data store and Google Calendar for scheduling.

## Overview

Goal Coach lets you manage goals through natural conversation in Slack. Claude acts as your personal coach — it reads your goals from Notion, helps you prioritise and plan, and writes any changes back automatically. When you plan a project, it creates daily task rows in a Notion Daily Plans database and schedules them as events in Google Calendar, splitting tasks around existing calendar conflicts.

---

## Features

- **Goal CRUD** — create, update, and delete goals via chat, with optional description written to both the Notion page body and a property
- **Daily project planner** — break a goal into a day-by-day plan saved to Notion and Google Calendar
- **Calendar CRUD** — create, view, reschedule, recolor, and delete Google Calendar events via chat
- **Auto calendar colors** — meetings → banana, individual work → tomato, workouts → peacock
- **Evening check-in** — bot asks how today's tasks went and updates their status in Notion
- **Goal progress sync** — when a daily task is marked Done, the linked goal's status updates automatically
- **Progress bar** — rollup in Notion shows % of completed daily tasks as a visual bar
- **Scheduled digests** — morning focus, evening check-in, and weekly review posted to a Slack channel (timezone-aware)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```env
SLACK_BOT_TOKEN=          # Bot User OAuth Token (xoxb-...)
SLACK_SIGNING_SECRET=     # Signing secret from Slack app Basic Information
SLACK_APP_TOKEN=          # App-level token for Socket Mode (xapp-...)
NOTION_API_KEY=           # Notion integration secret
NOTION_GOALS_DB_ID=       # Goals database ID
NOTION_SESSIONS_DB_ID=    # Sessions log database ID (optional)
NOTION_DAILY_PLANS_DB_ID= # Daily Plans database ID
GOOGLE_CLIENT_ID=         # Google OAuth client ID
GOOGLE_CLIENT_SECRET=     # Google OAuth client secret
GOOGLE_REFRESH_TOKEN=     # Long-lived refresh token (see Google Calendar setup)
ANTHROPIC_API_KEY=        # Anthropic API key
SLACK_DIGEST_CHANNEL=     # Slack channel ID for scheduled digests (e.g. C012AB3CD)
PORT=3000
```

### 3. Set up Notion databases

Share all databases with your integration. Go to each database → **···** → **Connections** → add your integration.

**Goals Database**

| Property | Type | Notes |
|---|---|---|
| Project name | Title | |
| Status | Status | Not started, In progress, Done |
| Priority | Select | High, Medium, Low |
| Start date | Date | |
| End date | Date | |
| Start value | Number | Optional — for metric-based goals |
| End value | Number | Optional — for metric-based goals |
| Description | Rich Text | Short summary — shown to Claude in every message |
| Progress | Rollup | See progress bar setup below |

**Daily Plans Database**

| Property | Type | Notes |
|---|---|---|
| Name | Title | Auto-filled as `YYYY-MM-DD · Goal title` |
| Date | Date | |
| Projects | Relation → Goals DB | |
| Planned Hours | Number | |
| Tasks | Rich Text | |
| Status | Status | Not started, In progress, Done |

**Sessions Log Database** (optional)

| Property | Type |
|---|---|
| Goal | Relation → Goals DB |
| Date | Date |
| Duration | Number (minutes) |
| Outcome | Rich Text |

**Progress bar setup (rollup)**

1. In the Daily Plans DB, add a Formula property named `Done`: `prop("Status") == "Done"`
2. In the Goals DB, add a Rollup property named `Progress`:
   - Relation property: `Daily Plans` (the auto-created reverse relation)
   - Rollup property: `Done`
   - Calculate: **Percent checked**
3. Set the display to **Bar** or **Ring**

### 4. Set up Google Calendar

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create a project → enable the **Google Calendar API**
2. Create **OAuth 2.0 credentials** (Web application type)
3. Add `https://developers.google.com/oauthplayground` as an authorised redirect URI
4. Go to [OAuth Playground](https://developers.google.com/oauthplayground) → gear icon → **Use your own OAuth credentials** → enter your client ID and secret
5. Authorise `https://www.googleapis.com/auth/calendar` → exchange for tokens → copy the **Refresh token** into `.env` as `GOOGLE_REFRESH_TOKEN`
6. Add your Google account as a test user under **OAuth consent screen → Test users**

### 5. Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Under **Socket Mode**, enable it and generate an **App-Level Token** with `connections:write` scope
3. Under **OAuth & Permissions**, add Bot Token Scopes:
   - `app_mentions:read`, `chat:write`, `commands`, `im:history`, `im:read`, `im:write`, `channels:history`, `channels:read`
4. Install the app to your workspace
5. Under **Slash Commands**, create: `/goal-list`, `/goal-add`, `/focus`, `/done`, `/review`
6. Under **Event Subscriptions**, subscribe to: `app_mention`, `message.im`, `message.channels`

### 6. Run

```bash
# Development
npm run start:dev

# Production
npm run build && npm run start:prod
```

No ngrok or public URL needed — Slack communicates via Socket Mode WebSocket.

---

## Slash Commands

| Command | Description |
|---|---|
| `/goal-list` | Show all active goals |
| `/goal-add [title]` | Create a new goal |
| `/focus [title]` | Set a goal to In Progress and start a focus session |
| `/done [title]` | Mark a goal as done or end a focus session |
| `/review` | Claude-generated summary across all goals |

---

## Chatting with the Bot

Mention the bot (`@goal-coach`) or DM it. It keeps per-user conversation history (last 20 messages) and always has your current goals, upcoming daily plan tasks, and 60 days of calendar events in context.

**Example things you can say:**

- *"Create a goal to launch the new website by June 30 — description: build landing page, blog, and contact form"*
- *"Plan out the website goal — I can work 9am–6pm, 4 hours a day"*
- *"Mark today's task as done"*
- *"Delete all tasks for the test goal"*
- *"Add a team meeting on Friday 2–3pm"*
- *"Move my 3pm event to 4pm"*
- *"Change the colour of my Friday meeting to grape"*
- *"What should I focus on today?"*

Claude emits structured `ACTION:` blocks in its responses that the app parses and executes automatically — you only see the conversational reply.

---

## Scheduled Digests

| Time | Content |
|---|---|
| 8:00 AM daily | Morning focus message based on active goals |
| 6:00 PM daily | Evening check-in listing today's planned tasks and asking for status updates |
| 9:00 AM Monday | Weekly review summary |

---

## Project Structure

```
src/
├── notion/          # Notion API client + data mapper
├── goals/           # Goal service + REST controller + DTOs
├── ai/              # Claude API service + system prompt builder
├── calendar/        # Google Calendar service (CRUD + conflict-aware scheduling)
├── slack/           # Bolt app, slash commands, message handlers
├── focus/           # Focus session timer (in-memory)
├── scheduler/       # Cron jobs for digests
└── app.module.ts    # Root module
```
