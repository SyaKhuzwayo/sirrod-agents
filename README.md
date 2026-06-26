# Sirrod Publishings — Agent MCP Servers

Three independent MCP servers, one per Sirrod agent role. Each is a self-contained
Node/TypeScript project (own `package.json`) using the [mcp-use](https://docs.mcp-use.com)
framework, SQLite for storage, and a matching pair of `export_backup` / `import_backup`
tools for manual data safety around redeploys.

```
sirrod-agents/
  production-design/      Manuscripts & illustration briefs (CRUD)
  marketing-sales/         Launch-kit assets: sales copy, listings, etc. (CRUD)
  monetization-finance/    Pricing + revenue per title (CRUD)
```

## Each server exposes

**production-design**
`create_project`, `get_project`, `list_projects`, `update_project`, `delete_project`,
`export_backup`, `import_backup`

**marketing-sales**
`create_asset`, `get_asset`, `list_assets`, `update_asset`, `delete_asset`,
`export_backup`, `import_backup`

**monetization-finance**
`create_pricing`, `get_pricing`, `list_pricing`, `update_pricing`, `delete_pricing`,
`log_revenue`, `get_revenue_entry`, `list_revenue`, `update_revenue_entry`,
`delete_revenue_entry`, `export_backup`, `import_backup`

## Local test (per server)

```bash
cd production-design   # or marketing-sales / monetization-finance
npm install
npm run dev
# Inspector at http://localhost:3000/inspector
```

## Deploy to Manufact Cloud

Each subfolder deploys as its **own separate Manufact server** (Manufact deploys
one repo+root-directory combination per server). Steps, once this is pushed to GitHub:

1. Push this repo to GitHub.
2. In Manufact (or via the `deploy` MCP tool), create three servers from the same
   repo, setting each one's **root directory** to:
   - `production-design`
   - `marketing-sales`
   - `monetization-finance`
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Deploy each one. You'll get a separate MCP URL per server.

### Data persistence note

These servers write to a local SQLite file under `./data/`. If Manufact's container
filesystem is wiped on redeploy (not yet confirmed), data in `./data/` will be lost.
**Before redeploying any server, call its `export_backup` tool and save the JSON
output somewhere safe.** After redeploying, call `import_backup` with that JSON to
restore. If Manufact later adds a persistent volume / disk option, point `DATA_DIR`
(env var) at that mount instead and this becomes unnecessary.

## Next step

Once these three are deployed and have some real traffic, a fourth **supervisor**
server can be built that queries Manufact's own observability tools
(`get_observability_overview`, `list_server_events`, `get_server_tool_breakdown`,
`get_server_client_breakdown`) across all three serverIds and produces a unified
usage/health summary.
