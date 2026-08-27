/**
 * Minimal deterministic bundler for the dsh-instruction-bubble client half.
 *
 * Produces lib/client.js as a classic script that registers the plugin with
 * the DSH client module table:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
 *
 * react is the only external (baseline shell-seeded module); the rule module
 * is spliced into the factory scope; the entry's imports are rewritten to
 * require() calls; exports are appended. Inputs are exactly the two source
 * files below — no third-party tooling involved.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE_ID = 'dsh-instruction-bubble'

/** Turn one ESM source file into factory-body CJS text. */
function toBody(src, label) {
  let out = src.replace(/\r\n/g, '\n') // ending-agnostic: LF-only splicing
  // Combined import: `import React, { a, b } from 'react'`
  out = out.replace(
    /import\s+([A-Za-z_$][\w$]*)\s*,\s*\{\s*([\w$,\s]+?)\s*\}\s+from\s+['"]([^'"]+)['"];?/g,
    (_m, defaultName, named, spec) => {
      if (spec.startsWith('.')) throw new Error(`combined import from relative module not supported in ${label}: ${spec}`)
      const names = named.split(',').map((s) => s.trim()).filter(Boolean)
      return `const ${defaultName} = require(${JSON.stringify(spec)});\nconst { ${names.join(', ')} } = ${defaultName};`
    }
  )
  // Named-only import: `import { a, b } from 'x'` (relative: spliced, line dropped)
  out = out.replace(
    /import\s*\{\s*([\w$,\s]+?)\s*\}\s+from\s+['"]([^'"]+)['"];?/g,
    (_m, named, spec) => {
      if (spec.startsWith('.')) return ''
      const names = named.split(',').map((s) => s.trim()).filter(Boolean)
      return `const { ${names.join(', ')} } = require(${JSON.stringify(spec)});`
    }
  )
  // Exports → declarations (single-name forms used here).
  out = out.replace(/export\s+function\s+/g, 'function ')
  out = out.replace(/export\s+const\s+/g, 'const ')
  out = out.replace(/export\s*\{\s*[^}]*\};?/g, '')
  if (/\b(import|export)\s/.test(out)) {
    throw new Error(`untransformed ESM statement remains in ${label}`)
  }
  return out
}

const ruleSrc = readFileSync(join(root, 'src', 'client', 'rule.js'), 'utf8')
const entrySrc = readFileSync(join(root, 'src', 'client', 'index.js'), 'utf8')

const body =
  toBody(ruleSrc, 'rule.js') + '\n' +
  toBody(entrySrc, 'index.js') + '\n' +
  'exports.apply = apply;\n' +
  'exports.inject = inject;\n'

const bundle =
  'window.__ModuleLoader__.load({\n' +
  `  id: ${JSON.stringify(PACKAGE_ID)},\n` +
  '  factory: (require) => {\n' +
  '    var module = { exports: {} };\n' +
  '    var exports = module.exports;\n' +
  '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n' +
  body.split('\n').map((line) => '    ' + line).join('\n') + '\n' +
  '    return module.exports;\n' +
  '  }\n' +
  '});\n'

mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib', 'client.js'), bundle)
console.log(`wrote lib/client.js (${Buffer.byteLength(bundle)} bytes)`)