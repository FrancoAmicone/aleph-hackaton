#!/usr/bin/env node
'use strict'

// Assemble the deployment directory that `pear stage` uploads to the upgrade
// drive. The updater (pear-runtime-updater) looks for exactly two things:
//
//   /package.json                          -> its `version` is compared to the running one
//   /by-arch/<platform>-<arch>/app/<name>  -> the artifact to swap in
//
// macOS gets a second artifact alongside the plain binary, `<name>.app`, since
// that bundle is the only shape `pear install` will look for on darwin. Which
// of the two a running copy asks for depends on how it was started — see the
// bundleName logic in lib/pear-cli.js.
//
// So this copies whatever `npm run make` left in out/ into that shape. Run it
// after every `npm run make`, then:
//
//   pear stage pear://<key> ./deploy
//   pear seed  pear://<key>
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = require(path.join(root, 'package.json'))
const name = pkg.productName || pkg.name

const outDir = path.join(root, 'out')
const deployDir = path.join(root, 'deploy')

if (!fs.existsSync(outDir)) {
  console.error('No out/ directory — run `npm run make` first.')
  process.exit(1)
}

const hosts = fs
  .readdirSync(outDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

if (hosts.length === 0) {
  console.error('out/ is empty — run `npm run make` first.')
  process.exit(1)
}

// Start clean so a stale architecture never ships in a release.
fs.rmSync(deployDir, { recursive: true, force: true })
fs.mkdirSync(deployDir, { recursive: true })

// The manifest the updater compares versions against. Keep it minimal: the
// drive only needs the identity, the version and the upgrade link.
const manifest = {
  name: pkg.name,
  productName: pkg.productName,
  version: pkg.version,
  upgrade: pkg.upgrade
}
fs.writeFileSync(path.join(deployDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

// macOS installs are app bundles: `pear install` looks for <name>.app, and the
// updater swaps the whole bundle. The executable lives inside at
// Contents/MacOS/<name>, which is what you run for a terminal app.
function writeMacBundle(bundleDir, from) {
  const macos = path.join(bundleDir, 'Contents', 'MacOS')
  fs.mkdirSync(macos, { recursive: true })
  fs.copyFileSync(from, path.join(macos, name))
  fs.chmodSync(path.join(macos, name), 0o755)

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleDisplayName</key><string>${pkg.productName || pkg.name}</string>
  <key>CFBundleIdentifier</key><string>com.pear.${pkg.name}</string>
  <key>CFBundleExecutable</key><string>${name}</string>
  <key>CFBundleVersion</key><string>${pkg.version}</string>
  <key>CFBundleShortVersionString</key><string>${pkg.version}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
</dict>
</plist>
`
  fs.writeFileSync(path.join(bundleDir, 'Contents', 'Info.plist'), plist)
}

let copied = 0
for (const host of hosts) {
  const binary = host.startsWith('win32') ? `${name}.exe` : name
  const from = path.join(outDir, host, binary)

  if (!fs.existsSync(from)) {
    console.warn(`skipping ${host}: no ${binary} in out/${host}`)
    continue
  }

  const target = path.join(deployDir, 'by-arch', host, 'app')
  fs.mkdirSync(target, { recursive: true })

  // Always ship the plain executable: it is what a dumped/direct install runs,
  // and what the updater swaps for that install style.
  fs.copyFileSync(from, path.join(target, binary))
  fs.chmodSync(path.join(target, binary), 0o755)

  const size = (fs.statSync(from).size / 1024 / 1024).toFixed(1)
  const shipped = [binary]

  // macOS additionally ships an .app bundle, because that is the only shape
  // `pear install` will look for on darwin. Both entries live side by side so
  // each install style finds its own artifact — see bundleName in lib/pear-cli.js.
  if (host.startsWith('darwin')) {
    writeMacBundle(path.join(target, `${name}.app`), from)
    shipped.push(`${name}.app`)
  }

  for (const artifact of shipped) {
    console.log(`  by-arch/${host}/app/${artifact}  (${size} MB)`)
  }
  copied++
}

if (copied === 0) {
  console.error('Nothing was copied — did `npm run make` succeed?')
  process.exit(1)
}

const host = `${os.platform()}-${os.arch()}`
console.log(`\ndeploy/ ready — v${pkg.version}, ${copied} platform(s), built on ${host}`)
console.log(`\nNext:\n  pear stage ${pkg.upgrade} ./deploy\n  pear seed  ${pkg.upgrade}`)
