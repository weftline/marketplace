#!/usr/bin/env node
// The catalog's bundle (MARKETPLACE.md section 3.3, ADR-0039, F-1201): one OCI artifact per catalog release,
// marketplace/catalog:<date>.<n>, built from this repository as an OCI image layout that publish.yml pushes to
// the shared registry's mirror, signs with cosign keyless and attests with SLSA provenance. Its layers are, in
// order: publishers.yaml and targets.yaml; each entry's files by path (CHANGELOG.md, manifest.yaml, the review
// records with their Sigstore bundles and SBOMs, the version files), entries by kind, namespace and name; the
// revocations; and each artifact by digest, as a tar of its folder whose content digest (the skill folder's,
// AGENTS_RUNTIME.md section 11.2) names it. Each file's layer is the file as it is, titled with its path. The
// build is deterministic: the same commit, release, channel and time always give the same digest.
//
//   node tools/bundle.mjs --out <dir> --release <YYYY-MM-DD.n> --channel <canary|stable>
//                         --commit <40 hex> --created <RFC 3339> [--source <url>] [--root <dir>] [--tar <file>]
//
// It prints {"digest", "release", "channel", "layers"} as JSON. --tar also writes the layout as one tar file,
// the exported bundle the self-hosted edition's WL_MARKETPLACE_BUNDLE names. Node's standard library only:
// the catalog repository has no dependencies to install.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const MEDIA = {
  manifest: 'application/vnd.oci.image.manifest.v1+json',
  index: 'application/vnd.oci.image.index.v1+json',
  artifactType: 'application/vnd.weftline.marketplace.catalog.v1',
  config: 'application/vnd.weftline.marketplace.catalog.config.v1+json',
  publishers: 'application/vnd.weftline.marketplace.publishers.v1+yaml',
  targets: 'application/vnd.weftline.marketplace.targets.v1+yaml',
  entry: 'application/vnd.weftline.marketplace.entry.v1+yaml',
  changelog: 'application/vnd.weftline.marketplace.changelog.v1+markdown',
  version: 'application/vnd.weftline.marketplace.version.v1+yaml',
  review: 'application/vnd.weftline.marketplace.review.v1+json',
  sigstore: 'application/vnd.dev.sigstore.bundle.v0.3+json',
  spdx: 'application/spdx+json',
  cyclonedx: 'application/vnd.cyclonedx+json',
  revocation: 'application/vnd.weftline.marketplace.revocation.v1+yaml',
  artifact: 'application/vnd.weftline.marketplace.artifact.v1.tar',
};

// Annotations: the file a layer holds, and an artifact layer's content digest.
export const TITLE = 'org.opencontainers.image.title';
export const ARTIFACT_DIGEST = 'dev.weftline.marketplace.artifact';
export const CHANNEL = 'dev.weftline.marketplace.channel';
export const DEFAULT_SOURCE = 'https://github.com/weftline/marketplace';

const RELEASE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[1-9][0-9]*$/;
const CREATED_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const HEX_RE = /^[0-9a-f]{64}$/;

// The limits of an artifact folder, the skill folder's (AGENTS_RUNTIME.md section 11.2).
const MAX_FILES = 200;
const MAX_BYTES = 5 << 20;

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The regular files below dir, relative to it, sorted; a symlink or a .git directory is refused. */
function filesOf(root, dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(root, dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) throw new Error(`${dir}/${p} is a symlink, which the catalog may not hold`);
      if (e.isDirectory()) {
        if (e.name === '.git') throw new Error(`${dir}/${p} is a .git directory, which an artifact may not hold`);
        walk(p);
      } else if (e.isFile()) out.push(p);
      else throw new Error(`${dir}/${p} is not a regular file`);
    }
  };
  walk('');
  return out.sort(byPath);
}

const isDir = (p) => {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
};

const modeOf = (p) => ((lstatSync(p).mode & 0o111) !== 0 ? '0755' : '0644');

/**
 * A folder's content digest (AGENTS_RUNTIME.md section 11.2, as services/internal/marketplace/manifest's
 * FolderDigest computes it): sha256 of the RFC 8785 JSON of {"files": [{"mode", "path", "sha256"}]}, sorted by
 * path, with modes normalized to 0644 or 0755. For this shape, JSON.stringify with the keys in that order is
 * the canonical form.
 */
export function folderDigest(files) {
  const list = [...files]
    .sort((a, b) => byPath(a.path, b.path))
    .map((f) => ({ mode: f.mode, path: f.path, sha256: sha256(f.data) }));
  return `sha256:${sha256(JSON.stringify({ files: list }))}`;
}

/**
 * A deterministic ustar archive of files ({path, mode, data}), in the order given: owner 0, time 0, no
 * directory entries, two zero blocks at the end.
 */
export function tar(files) {
  const blocks = [];
  for (const f of files) {
    const h = Buffer.alloc(512);
    let name = f.path;
    let prefix = '';
    if (Buffer.byteLength(name) > 100) {
      const cut = name.lastIndexOf('/', 155);
      if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100)
        throw new Error(`${f.path}: the path is too long for a tar header`);
      prefix = name.slice(0, cut);
      name = name.slice(cut + 1);
    }
    const put = (s, off, len) => h.write(s, off, len, 'utf8');
    const octal = (n, len) => n.toString(8).padStart(len - 1, '0');
    put(name, 0, 100);
    put(`000${f.mode}`.slice(-7), 100, 8);
    put(octal(0, 8), 108, 8);
    put(octal(0, 8), 116, 8);
    put(octal(f.data.length, 12), 124, 12);
    put(octal(0, 12), 136, 12);
    h.fill(0x20, 148, 156);
    put('0', 156, 1);
    put('ustar\u000000', 257, 8);
    put(prefix, 345, 155);
    let sum = 0;
    for (const b of h) sum += b;
    put(`${sum.toString(8).padStart(6, '0')}\u0000 `, 148, 8);
    blocks.push(h, f.data);
    const pad = (512 - (f.data.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

/** The media type of a file of an entry's reviews/ directory. */
function reviewMedia(name) {
  if (/\.(intoto\.)?sigstore\.json$/.test(name)) return MEDIA.sigstore;
  if (name.endsWith('.sbom.spdx.json')) return MEDIA.spdx;
  if (name.endsWith('.sbom.cdx.json')) return MEDIA.cyclonedx;
  if (/^[^/]+\.json$/.test(name)) return MEDIA.review;
  return null;
}

/** The files of the catalog that go into the bundle, as layers to be: {path, mediaType} or an artifact. */
export function plan(root) {
  const layers = [];
  for (const [path, mediaType] of [
    ['publishers.yaml', MEDIA.publishers],
    ['targets.yaml', MEDIA.targets],
  ])
    layers.push({ path, mediaType });
  let entries = 0;
  let versions = 0;
  const kinds = isDir(join(root, 'catalog')) ? readdirSync(join(root, 'catalog')).sort(byPath) : [];
  for (const kind of kinds)
    for (const ns of readdirSync(join(root, 'catalog', kind)).sort(byPath))
      for (const name of readdirSync(join(root, 'catalog', kind, ns)).sort(byPath)) {
        const dir = `catalog/${kind}/${ns}/${name}`;
        entries++;
        for (const f of filesOf(root, dir)) {
          const path = `${dir}/${f}`;
          let mediaType = null;
          if (f === 'manifest.yaml') mediaType = MEDIA.entry;
          else if (f === 'CHANGELOG.md') mediaType = MEDIA.changelog;
          else if (f === 'README.md') continue;
          else if (/^versions\/[^/]+\.yaml$/.test(f)) {
            mediaType = MEDIA.version;
            versions++;
          } else if (f.startsWith('reviews/')) mediaType = reviewMedia(f.slice('reviews/'.length));
          if (!mediaType) throw new Error(`${path} is not part of an entry (wl marketplace validate names what is)`);
          layers.push({ path, mediaType });
        }
      }
  if (isDir(join(root, 'revocations')))
    for (const f of filesOf(root, 'revocations')) {
      if (f === 'README.md') continue;
      if (!/^[^/]+\.yaml$/.test(f)) throw new Error(`revocations/${f} is not a revocation`);
      layers.push({ path: `revocations/${f}`, mediaType: MEDIA.revocation });
    }
  const artifacts = isDir(join(root, 'artifacts/sha256'))
    ? readdirSync(join(root, 'artifacts/sha256')).sort(byPath)
    : [];
  for (const hex of artifacts) {
    if (!HEX_RE.test(hex)) throw new Error(`artifacts/sha256/${hex} is not named by a digest`);
    layers.push({ artifact: `artifacts/sha256/${hex}`, digest: `sha256:${hex}` });
  }
  return { layers, entries, versions };
}

/** The bytes and descriptor of an artifact's layer: the tar of its folder, checked against its digest. */
function artifactLayer(root, dir, want) {
  const files = filesOf(root, dir).map((p) => ({
    path: p,
    mode: modeOf(join(root, dir, p)),
    data: readFileSync(join(root, dir, p)),
  }));
  if (files.length === 0) throw new Error(`${dir} holds no file`);
  if (files.length > MAX_FILES) throw new Error(`${dir} has more than ${MAX_FILES} files`);
  if (files.reduce((n, f) => n + f.data.length, 0) > MAX_BYTES)
    throw new Error(`${dir} holds more than ${MAX_BYTES >> 20} MB`);
  const got = folderDigest(files);
  if (got !== want)
    throw new Error(`${dir}: its content digest is ${got}; an artifact's folder is named by its digest`);
  return tar(files);
}

/** Builds the bundle of the catalog at root into the OCI image layout out; returns its digest and layers. */
export function build({ root, out, release, channel, commit, created, source = DEFAULT_SOURCE }) {
  if (!RELEASE_RE.test(release ?? '')) throw new Error(`release ${release} is not <date>.<n> (2026-10-14.2)`);
  if (!['canary', 'stable'].includes(channel))
    throw new Error(`channel ${channel} is not canary or stable (MARKETPLACE.md section 6.3)`);
  if (!COMMIT_RE.test(commit ?? '')) throw new Error(`commit ${commit} is not a full commit SHA`);
  if (!CREATED_RE.test(created ?? ''))
    throw new Error(`created ${created} is not an RFC 3339 UTC time (2026-10-14T09:00:00Z)`);
  mkdirSync(join(out, 'blobs/sha256'), { recursive: true });
  const blob = (data) => {
    const hex = sha256(data);
    writeFileSync(join(out, 'blobs/sha256', hex), data);
    return { digest: `sha256:${hex}`, size: data.length };
  };
  const { layers: planned, entries, versions } = plan(root);
  const layers = planned.map((l) => {
    if (l.artifact)
      return {
        mediaType: MEDIA.artifact,
        ...blob(artifactLayer(root, l.artifact, l.digest)),
        annotations: { [TITLE]: `${l.artifact}.tar`, [ARTIFACT_DIGEST]: l.digest },
      };
    return { mediaType: l.mediaType, ...blob(readFileSync(join(root, l.path))), annotations: { [TITLE]: l.path } };
  });
  const config = Buffer.from(
    `${JSON.stringify({
      apiVersion: 'marketplace.weftline.dev/v1',
      release,
      channel,
      created,
      source: { repository: source, commit },
      entries,
      versions,
    })}\n`,
  );
  const manifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: MEDIA.manifest,
      artifactType: MEDIA.artifactType,
      config: { mediaType: MEDIA.config, ...blob(config) },
      layers,
      annotations: {
        'org.opencontainers.image.created': created,
        'org.opencontainers.image.revision': commit,
        'org.opencontainers.image.source': source,
        'org.opencontainers.image.version': release,
        [CHANNEL]: channel,
      },
    }),
  );
  const m = blob(manifest);
  writeFileSync(join(out, 'oci-layout'), `${JSON.stringify({ imageLayoutVersion: '1.0.0' })}\n`);
  writeFileSync(
    join(out, 'index.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      mediaType: MEDIA.index,
      manifests: [
        {
          mediaType: MEDIA.manifest,
          artifactType: MEDIA.artifactType,
          ...m,
          annotations: { 'org.opencontainers.image.ref.name': release },
        },
      ],
    })}\n`,
  );
  return { digest: m.digest, release, channel, layers: layers.length };
}

/** The OCI layout at dir as one tar: oci-layout, index.json and its blobs, sorted. */
export function layoutTar(dir) {
  return tar(filesOf(dir, '.').map((p) => ({ path: p, mode: '0644', data: readFileSync(join(dir, p)) })));
}

function main(argv) {
  const args = { root: process.cwd() };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.replace(/^--/, '');
    if (
      !['out', 'release', 'channel', 'commit', 'created', 'source', 'root', 'tar'].includes(k) ||
      argv[i + 1] === undefined
    ) {
      console.error(`bundle: unknown or incomplete argument ${argv[i]}`);
      return 2;
    }
    args[k] = argv[i + 1];
  }
  if (!args.out) {
    console.error('bundle: --out <dir> is required');
    return 2;
  }
  try {
    const result = build(args);
    if (args.tar) writeFileSync(args.tar, layoutTar(args.out));
    console.log(JSON.stringify(result));
    return 0;
  } catch (e) {
    console.error(`bundle: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2));
