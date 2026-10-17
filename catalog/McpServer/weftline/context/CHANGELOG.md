# Weftline Knowledge

One section per version: upstream's notes first, Weftline's second (MARKETPLACE.md section 3.1).

## 0.1.0

### Upstream

The Context MCP server as Weftline ships it (F-0407, F-0408, F-0511): `search`, `get_document`, `get_pack`,
`answer`, `graph_neighbors` and `propose_memory`, over Streamable HTTP with the 2026-07-28 headers and the
older handshake.

### Weftline

The first catalog entry (F-1201). Every org has this server as `atlas` already; the entry is how the
Marketplace tab shows it and how `marketplace.sync` keeps its reviewed fingerprint.
