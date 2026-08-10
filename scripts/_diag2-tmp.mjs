import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'

const TOUR = [...new Set([...readFileSync('src/tour/steps.ts', 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]))]
const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_REVIEW_TOOLS: 'true' },
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('no start')), 90000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1500) } }
  dev.stdout.on('data', w); dev.stderr.on('data', w)
})

const seed = `try{
  localStorage.setItem('rms-remark-author','harness');
  localStorage.setItem('rms-lang','en');
  const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');
  localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}));
  localStorage.setItem('rms-tour-seen',${JSON.stringify(JSON.stringify(TOUR))});
}catch{}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(seed)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)))
await page.goto(`http://localhost:${port}/miqaats/ashara-1448/city`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

await page.locator('[data-rmk="chip"]').click()
await page.waitForTimeout(500)
const modeBtn = page.locator('[data-rmk="panel"] button').first()
console.log('mode button:', await modeBtn.textContent())

if (!(await page.locator('[data-rmk="targets"]').count())) {
  await page.locator('[data-rmk="fixture-toggle"]').click()
}
await page.locator('[data-rmk="targets"]').waitFor({ state: 'visible' })
console.log('fixture visible')
console.log('active el:', await page.evaluate(() => {
  const a = document.activeElement
  return a ? `${a.tagName} rmk=${a.getAttribute('data-rmk') || ''}` : 'none'
}))

await page.keyboard.press('Control+Shift+M')
await page.waitForTimeout(600)
console.log('mode button after shortcut:', await modeBtn.textContent())

// Try clicking a target and see what happens
const tgt = page.locator('[data-rmk="targets"]').getByText('Target with id', { exact: true })
console.log('target count:', await tgt.count())
await tgt.click().catch((e) => console.log('CLICK ERR', String(e).split('\n')[0]))
await page.waitForTimeout(800)
console.log('composer count:', await page.locator('[data-rmk="composer"]').count())

// Fall back: toggle mode via the button instead of the shortcut
if (!(await page.locator('[data-rmk="composer"]').count())) {
  console.log('--- retry via the mode BUTTON ---')
  const txt = await modeBtn.textContent()
  if (/Enter remark mode/.test(txt || '')) await modeBtn.click()
  await page.waitForTimeout(400)
  console.log('mode button now:', await modeBtn.textContent())
  await tgt.click().catch((e) => console.log('CLICK ERR2', String(e).split('\n')[0]))
  await page.waitForTimeout(800)
  console.log('composer count after button:', await page.locator('[data-rmk="composer"]').count())
}

await browser.close(); dev.kill()
