# The Weftline marketplace catalog

The catalog of integrations Weftline reviews, signs and mirrors into every cell: MCP servers, skills, plugins, flow
templates, packs, agent definitions and policy packs. Each entry version is reviewed once by Weftline's pipeline,
signed into a catalog bundle, and installed by organizations under their own allowlists. The design is Weftline's
MARKETPLACE.md (sections 3 to 7) and ADR-0039 to ADR-0041; this repository is made from
`tools/marketplace/repo-template` in weftline/weftline, where its validator, bundle and workflow are tested.

## Layout

```text
catalog/<kind>/<namespace>/<name>/
  manifest.yaml              the entry: identity, publisher, lifecycle, tags, license (metadata only)
  versions/<version>.yaml    one immutable file per version: digest, upstream, compatibility, permissions, policy defaults
  reviews/<version>.json     the review record, written by the review pipeline (never by a pull request)
  CHANGELOG.md               one `## <version>` section per version: `### Upstream` first, `### Weftline` second
artifacts/sha256/<digest>/   the files of a skill, plugin, flow template, pack, agent definition or policy pack, by digest
revocations/<id>.yaml        signed withdrawals
targets.yaml                 the platforms entries declare compatibility with, and where their versions are read
publishers.yaml              the namespaces, how each was verified, their contacts and owners
CODEOWNERS                   each namespace's pull requests go to its owners and to Weftline's reviewers
.github/workflows/publish.yml   validation of every pull request; the signed bundle from main
.github/rulesets/main.json   the main branch's ruleset (pull request, code-owner review, the validate check, no bypass)
tools/bundle.mjs             builds the catalog bundle (Node's standard library only)
```

The kinds are `Connector`, `McpServer`, `Skill`, `Plugin`, `FlowTemplate`, `Pack`, `AgentDefinition` and
`PolicyPack`. A namespace is `weftline` (first party), `io.github.<login>` (a GitHub account, verified through its
OIDC token or OAuth) or a reverse domain such as `com.stripe` (verified by a DNS TXT record or an HTTP challenge).

## Proposing a version

1. Add `versions/<version>.yaml` (and the artifact under `artifacts/sha256/<digest>/`, named by its content digest)
   and a `## <version>` section in the entry's `CHANGELOG.md` whose anchor `spec.changelog` names.
2. Leave `provenance` and `review` out: the review pipeline writes them, and a pull request that sets or changes
   them is refused.
3. Check it as the workflow will: `wl marketplace validate --pull-request --base origin/main`.

A published version is immutable: a pull request may not change or delete a version file `main` has (a version
is withdrawn with a revocation). The review pipeline writes `provenance` and `review` through its own pull
request, opened by its GitHub App (the login in the repository variable `WL_REVIEW_PIPELINE_LOGIN`), which the
workflow validates with `--pipeline` and a code owner merges.

The validator refuses a version pinned by a tag instead of a digest, an artifact whose content digest is not the
digest that names it, a namespace absent from `publishers.yaml` or not routed by CODEOWNERS, a target absent from
`targets.yaml` (or no target at all), declared permissions that claim less than the files show (a server's flags
and locked rules on tools it does not declare, a remote server's egress without its own host, a skill's
`tools_requested` other than its `SKILL.md`'s `allowed-tools`), metadata that differs from `manifest.yaml`, and a
changelog without the version's section in the convention's order.

## The bundle

`publish.yml` builds, from each commit of `main`, one OCI artifact `marketplace/catalog:<date>.<n>` with a channel
(`canary` from a push; `stable` or `canary` by hand): `publishers.yaml` and `targets.yaml`, each entry's files and
the revocations as layers (each the file as it is, titled with its path), and each artifact as a tar layer
annotated with its content digest. It signs the manifest with cosign keyless as this workflow on `main` (identity
`https://github.com/weftline/marketplace/.github/workflows/publish.yml@refs/heads/main`, issuer
`https://token.actions.githubusercontent.com`) and attests its SLSA provenance. With the repository variable
`ECR_REGISTRY` it pushes the release to `mirror/marketplace/catalog` in Weftline's shared registry as the role
`wl-ci-marketplace-publish`, signs the pushed digest, and attaches the Sigstore bundle as a referrer; every run
keeps the OCI layout as a tar and its Sigstore bundle as the run's artifact.

## What the repository needs

- Public visibility (partner pre-releases go to the private overlay `weftline/marketplace-private`, with the same
  layout, merged here at release).
- The teams CODEOWNERS names (`@weftline/marketplace-reviewers`, `@weftline/security`) and the ruleset of
  `.github/rulesets/main.json`, applied with `gh api -X POST repos/weftline/marketplace/rulesets --input .github/rulesets/main.json`.
- The repository variables `WL_RELEASE_REPO` (where `wl` is released; `WL_VERSION` in `publish.yml` names the first
  release with `marketplace validate`), `WL_REVIEW_PIPELINE_LOGIN` (the review pipeline's App) and, once the role
  exists, `ECR_REGISTRY`. Only `weftline/marketplace` publishes; the overlay validates only.
- In Weftline's shared-services account: the repository `mirror/marketplace/catalog` and the role
  `wl-ci-marketplace-publish`, trusted for this repository's `main` with `job_workflow_ref` limited to
  `publish.yml`, allowed to push to `mirror/marketplace/*` only.
