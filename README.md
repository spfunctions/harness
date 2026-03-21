# SparkCo Harness

A dual pi-agent runtime harness. Client runs locally, server runs on
Cloudflare. Both start as empty shells and self-modify based on tasks.

## Quick Start

```bash
npx tsx bin/sparkco.ts init
```

The setup wizard will:
1. Check your environment (git, node, wrangler)
2. Configure Cloudflare credentials
3. Deploy the server runtime
4. Configure LLM models for both agents
5. Optionally install pi/Claude Code skill

## Prerequisites

- **Node.js** >= 18
- **git**
- **wrangler** (`npm install -g wrangler`)
- **pi** (optional) (`npm install -g @anthropic-ai/claude-code`)

## Cloudflare Setup

You need a Cloudflare API Token with these permissions:

| Permission | Level | Why |
|---|---|---|
| Workers Scripts | Edit | Deploy/update Workers |
| Workers KV Storage | Edit | Create/read/write KV |
| Workers Routes | Edit | Configure routing |
| Durable Objects | Edit | Create DO namespace |
| Account Settings | Read | Verify account |

**Create your token:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Choose "Create Custom Token"
4. Add the permissions listed above
5. Zone Resources: All zones (or specific zone)
6. Click "Continue to summary" then "Create Token"
7. Copy the token — you'll need it during `sparkco init`

## Agent Model Configuration

SparkCo Harness runs two pi-agent runtimes that need LLM access
to autonomously write code and modify environments.

### During Setup

The setup wizard will ask you to configure an LLM provider.
**Recommended: [OpenRouter](https://openrouter.ai/keys)** — one key
accesses all models.

Default model: `minimax/minimax-m2.7` ($0.30/$1.20 per M tokens).
Best cost-performance ratio for continuous agent operation.

### Environment Variables (non-interactive mode)

| Variable | Required | Default |
|---|---|---|
| `SPARKCO_LLM_PROVIDER` | No | `openrouter` |
| `SPARKCO_LLM_API_KEY` | **Yes** | — |
| `SPARKCO_CLIENT_MODEL` | No | `minimax/minimax-m2.7` |
| `SPARKCO_SERVER_MODEL` | No | Same as client |

### After Setup

```bash
sparkco model              # View current config
sparkco model test         # Verify both agents can respond
sparkco model set both anthropic/claude-sonnet-4-6  # Switch models
sparkco model key set <new-key>                      # Update API key
```

### Costs

At default settings (MiniMax M2.7), continuous operation costs
roughly **$1-2/day** depending on activity level. This covers
both client and server pi runtimes.

## Commands

| Command | Description |
|---|---|
| `sparkco init` | Interactive setup wizard |
| `sparkco status` | System overview |
| `sparkco daemon start\|stop\|restart` | Manage client daemon |
| `sparkco send <type> <content>` | Send protocol message |
| `sparkco inbox` | View pending requests |
| `sparkco routes list\|add\|remove` | Manage local endpoints |
| `sparkco ps` | Process management |
| `sparkco manifest show\|history\|rollback` | Version control |
| `sparkco logs [name]` | View logs |
| `sparkco deploy` | Deploy/redeploy server |
| `sparkco secret set\|list\|delete` | Manage secrets |
| `sparkco model show\|set\|list\|key\|test` | Manage LLM models |
| `sparkco improve status\|issues\|fixes\|pause\|resume` | Self-improvement engine |
| `sparkco destroy` | Tear down everything |

All commands support `--json` for machine-readable output (useful for pi).

## Architecture

```
CLIENT (local)              SERVER (Cloudflare)
+--------------+            +-------------------+
| pi-agent     |<--- SSE -->| Worker + DO       |
| daemon       |--- REST -->| KV / R2 / Queues  |
| local HTTP   |            | Edge Functions     |
+--------------+            +-------------------+
```

The communication protocol has 5 message types:
- **capability-request** — "I need you to have X capability"
- **capability-ready** — "X is ready at endpoint Y"
- **data** — Payload on an established channel
- **state-sync** — Heartbeat + version + process status
- **negotiate** — Free-form discussion about capabilities

## Pi Integration

After init, install the sparkco skill:

```bash
# For pi
cp src/pi/skill.md ~/.pi/agent/skills/sparkco/SKILL.md

# For Claude Code
cp src/pi/skill.md ~/.claude/skills/sparkco/SKILL.md
```

Or let the setup wizard handle it automatically.

Pi can then use all `sparkco` commands via bash to coordinate
client-server workflows autonomously.

## Configuration

Config lives at `~/.sparkco/config.json`. See `sparkco status` for current values.

## Development

```bash
npm install
npm test                    # all tests
npm run test:unit           # unit tests only
npm run test:integration    # integration tests only
npx tsx scripts/dev.ts      # local dev server + daemon
```

## Uninstall

```bash
sparkco destroy
npm uninstall -g @sparkco/harness
```

## License

Apache-2.0
