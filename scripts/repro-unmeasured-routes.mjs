/** Discovery: why /raza-letter and /login never satisfied waitForApp. */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  shell: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, VITE_REVIEW_TOOLS: 'true' } })
await new Promise((ok, fail) => { const t=setTimeout(()=>fail(new Error('no start')),60000)
  const w=(b)=>{if(String(b).includes(String(port))){clearTimeout(t);setTimeout(ok,1500)}}
  dev.stdout.on('data',w); dev.stderr.on('data',w) })

const TOUR = ['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const mk = (loggedIn) => `try{localStorage.setItem('rms-lang','lsd');const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:${loggedIn}},version:p.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const browser = await chromium.launch()
for (const [route, loggedIn] of [['/login', true], ['/login', false], ['/miqaats/ashara-1448/raza-letter', true]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(mk(loggedIn))
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]))
  await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)   // sleep: settle without waitForApp, which is the thing under investigation
  const r = await page.evaluate(() => ({
    here: location.pathname,
    chars: document.body.innerText.replace(/\s+/g, ' ').trim().length,
    devdock: !!document.querySelector('[data-devdock]'),
    head: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 90),
  }))
  console.log(`${route} (loggedIn=${loggedIn})`)
  console.log(`   -> at ${r.here} | ${r.chars} chars (waitForApp needs >300) | devdock=${r.devdock}`)
  console.log(`   text: ${JSON.stringify(r.head)}`)
  if (errs.length) console.log(`   pageerror: ${errs[0]}`)
  await ctx.close()
}
await browser.close(); dev.kill()
