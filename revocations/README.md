# Revocations

A signed withdrawal of an entry's version, or of a whole entry, in every org (MARKETPLACE.md section 7.4):
`revocations/<id>.yaml`, proposed by a Weftline operator and merged with a security code owner's review (the
ruleset has no bypass, emergencies included), then signed into the next bundle by `publish.yml`.
`marketplace.sync` loads it into `catalog.revocations`; the hub denies the withdrawn tools with the reason
`withdrawn`, and `marketplace.rollout` suspends every installed row and tells each org.

```yaml
id: 2026-11-02-stripe-mcp-2-3-1            # the file's name
entry: McpServer/com.stripe/mcp            # <kind>/<namespace>/<name>
versions: ["2.3.1"]                        # or: all
reason: A tool description changed to exfiltrate customer records (CVE pending).
issued_at: "2026-11-02T14:05:00Z"
issued_by: security@weftline.ai
```
