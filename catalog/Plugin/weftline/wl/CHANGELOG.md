# wl for Claude Code

One section per version: upstream's notes first, Weftline's second (MARKETPLACE.md section 3.1).

## 0.1.0

### Upstream

The plugin as `integrations/claude-code/plugin` holds it at `plugin/v0.1.0` (F-0511): four skills, five hooks
that only call `wl hook`, and one MCP server, the Context MCP server at `${WL_SERVER}/mcp`.

### Weftline

The first catalog entry (F-1201). The same release is published to the public plugin marketplace by
`release-plugin.yml`, which organizations' managed settings pin; this entry is what the Marketplace tab lists
and what an org's generated managed settings name.
