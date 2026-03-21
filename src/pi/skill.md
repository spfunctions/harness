---
name: sparkco
description: >
  Control the SparkCo dual-runtime harness. Send messages between client and
  server, manage local processes, check inbox for capability requests, add
  webhook routes, and manage deployment. Use this skill when you need to
  coordinate work between local and cloud environments, set up signal
  pipelines, or create long-running workflows.
---

# SparkCo Harness Skill

## Available Commands

All commands support `--json` for machine-readable output.

### Status & Health
```bash
sparkco status                    # System overview
sparkco status --json             # JSON output for parsing
```

### Inbox (Pending Capability Requests)
```bash
sparkco inbox                     # List pending requests from server
sparkco inbox view <id>           # View full request details
sparkco inbox clear               # Clear processed requests
```

When you see a capability-request in the inbox, evaluate what the server
needs and respond appropriately:

```bash
# If you can fulfill it, set up the capability and respond:
sparkco routes add /signals/my-channel
sparkco send capability-ready --ref <request-id> "http://localhost:<port>/signals/my-channel"

# If you need to negotiate:
sparkco send negotiate --ref <request-id> "I can do X but not Y, how about Z?"
```

### Sending Messages
```bash
sparkco send capability-request "描述你需要 server 端具备的能力"
sparkco send capability-ready --ref <id> "<endpoint>"
sparkco send negotiate --ref <id> "协商内容"
sparkco send data --channel <ch> '<json payload>'
```

### Local Routes (Webhook Receivers)
```bash
sparkco routes                    # List active routes
sparkco routes add /my/endpoint   # Add a new route
sparkco routes remove /my/endpoint
```

### Process Management
```bash
sparkco ps                        # List managed processes
sparkco ps start <name>           # Start a declared process
sparkco ps stop <name>
sparkco ps restart <name>
```

### Version Control
```bash
sparkco manifest                  # Show current manifest
sparkco manifest history          # Version history
sparkco manifest rollback <ver>   # Rollback to a previous version
```

### Server Deployment
```bash
sparkco deploy                    # Redeploy server Worker
sparkco deploy --status           # Check deployment status
```

### Secrets
```bash
sparkco secret set KEY value      # Store in CF Worker Secrets
sparkco secret list               # List secret names
sparkco secret delete KEY
```

### Logs
```bash
sparkco logs                      # List available logs
sparkco logs <name> --tail        # Follow log output
```

### Model Management
```bash
sparkco model                     # Show current model config
sparkco model set client <model>  # Change client model
sparkco model set server <model>  # Change server model
sparkco model set both <model>    # Change both
sparkco model list                # Available model presets
sparkco model key                 # Show API key (masked)
sparkco model key set <key>       # Update API key
sparkco model test                # Verify both models respond
```

## Typical Workflows

### Setting up a new signal pipeline
1. `sparkco send capability-request "需要一个 RSS 监控，目标: https://example.com/feed, 间隔 30 分钟"`
2. Wait for server to set up and respond
3. Check `sparkco inbox` for any negotiation or ready confirmation
4. Once ready, data will flow to the channel endpoint automatically

### Responding to a server request
1. `sparkco inbox` — see what the server needs
2. Create the local capability (add route, start process, write code)
3. `sparkco send capability-ready --ref <id> "<endpoint>"`

### Checking system state
1. `sparkco status --json` — parse for programmatic decisions
2. `sparkco ps` — see if all processes are healthy
3. `sparkco manifest` — verify version consistency
