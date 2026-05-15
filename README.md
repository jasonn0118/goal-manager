# Goal Coach

A NestJS app that runs a conversational Slack bot powered by Claude AI, using Notion as the goal data store.

## Overview

Goal Coach lets you manage your goals through natural conversation in Slack. Claude AI acts as your personal coach — it reads your current goals from Notion, helps you prioritise, celebrate wins, and unblock stuck items. Any goal updates Claude suggests are automatically written back to Notion.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env` and fill in the values:

```bash
cp .env .env.local
```

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token from your Slack app (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Signing secret from your Slack app's Basic Information |
| `SLACK_APP_TOKEN` | App-level token for Socket Mode (`xapp-...`) |
| `NOTION_API_KEY` | Notion Integration secret |
| `NOTION_GOALS_DB_ID` | ID of your Goals Notion database |
| `NOTION_SESSIONS_DB_ID` | ID of your Sessions Log Notion database |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `SLACK_DIGEST_CHANNEL` | Slack channel ID for scheduled digests (e.g. `C012AB3CD`) |
| `PORT` | HTTP port (default: `3000`) |

### 3. Set up Notion databases

Create two databases in Notion and share them with your integration.

**Goals Database**

| Property | Type | Options |
|---|---|---|
| Name | Title | |
| Status | Select | Not Started, In Progress, Blocked, Done |
| Priority | Select | High, Medium, Low |
| Horizon | Select | Daily, Sprint, Long-term |
| Due Date | Date | |
| Progress | Number | 0–100 |
| Notes | Rich Text | |
| Last Adjusted | Date | |

**Sessions Log Database**

| Property | Type |
|---|---|
| Goal | Relation → Goals DB |
| Date | Date |
| Duration | Number (minutes) |
| Outcome | Rich Text |

Copy each database ID from the URL:
`https://notion.so/yourworkspace/<DATABASE_ID>?v=...`

### 4. Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Under **Socket Mode**, enable it and generate an **App-Level Token** with `connections:write` scope — this is your `SLACK_APP_TOKEN`
3. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `app_mentions:read`
   - `chat:write`
   - `commands`
   - `im:history`
   - `im:read`
   - `im:write`
4. Install the app to your workspace — copy the **Bot User OAuth Token** as `SLACK_BOT_TOKEN`
5. Under **Basic Information** → **App Credentials**, copy the **Signing Secret**
6. Under **Slash Commands**, create these commands (Request URL can be anything — Socket Mode ignores it):
   - `/goal-list`
   - `/goal-add`
   - `/focus`
   - `/done`
   - `/review`
7. Under **Event Subscriptions**, enable events and subscribe to:
   - `app_mention`
   - `message.im`

### 5. Run the app

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

No ngrok or public URL needed — Slack communicates via Socket Mode WebSocket.

---

## Slash Commands

| Command | Description |
|---|---|
| `/goal-list` | Show all active goals as a formatted Block Kit list |
| `/goal-add [title]` | Create a new goal in Notion |
| `/focus [title]` | Set a goal to "In Progress" and start a timed focus session |
| `/done [title]` | Mark a goal as done, or end your active focus session |
| `/review` | Get a Claude-generated progress summary across all goals |

---

## Chatting with the Bot

Mention the bot in any channel (`@goal-coach how should I prioritise today?`) or send it a direct message. It maintains per-user conversation history (last 20 messages) and always has your current goals in context.

When Claude decides to update a goal, it includes a structured `ACTION:` block in its response that the app parses and executes automatically against Notion — the user just sees the conversational reply.

---

## Scheduled Digests

The scheduler posts to `SLACK_DIGEST_CHANNEL` automatically:

| Schedule | Content |
|---|---|
| 8:00 AM daily | Morning focus message based on daily + sprint goals |
| 6:00 PM daily | Evening check-in prompt |
| 9:00 AM Monday | Weekly review summary |

---

## Project Structure

```
src/
├── notion/          # Notion API client + data mapper
├── goals/           # Goal CRUD service + REST controller + DTOs
├── ai/              # Claude API service + system prompt builder
├── slack/           # Bolt app, slash commands, message handlers
├── focus/           # Focus session timer (in-memory)
├── scheduler/       # Cron jobs for digests
└── app.module.ts    # Root module wiring
```
