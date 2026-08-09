/**
 * check-gate.mjs — build the app in BOTH review-flag states and assert the bundle differs.
 *
 *   npm run check:gate
 *
 * `npm run build` already ends in `check-dev-only.mjs`, which greps dist/ for tool strings and
 * flips its expectation with VITE_REVIEW_TOOLS. That covers whichever state you happened to
 * build in. This runs both, back to back, so the pair is checked rather than one half of it.
 *
 * Why the pair matters: "absent when the flag is off" is satisfied just as well by code that
 * has been deleted, by a flag that is no longer read, or by a typo in the variable name — all
 * of which fail SILENTLY in the direction that looks safe. Only "present when on" distinguishes
 * a working gate from a dead one, and only running both in one command keeps them honest about
 * each other.
 *
 * Leaves dist/ in the FLAG-OFF state, because that is the shippable one and the next command
 * to look at dist/ should not find a review build there by surprise.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function build(flag) {
  const label = flag === undefined ? '(unset)' : flag
  console.log(`\n${'='.repeat(72)}\n  BUILD  VITE_REVIEW_TOOLS=${label}\n${'='.repeat(72)}`)
  const env = { ...process.env }
  if (flag === undefined) delete env.VITE_REVIEW_TOOLS
  else env.VITE_REVIEW_TOOLS = flag
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, env, shell: true, stdio: 'inherit' })
  return r.status === 0
}

// ON first, OFF second, so the tree is left holding the shippable bundle.
const on = build('true')
const off = build(undefined)

console.log(`\n${'='.repeat(72)}`)
console.log(`  flag on  → tools present : ${on ? 'PASS' : 'FAIL'}`)
console.log(`  flag off → tools absent  : ${off ? 'PASS' : 'FAIL'}`)
console.log(`  dist/ now holds the flag-OFF build.`)
process.exit(on && off ? 0 : 1)
