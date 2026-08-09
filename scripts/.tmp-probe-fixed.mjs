import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const port = await new Promise((ok)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p))})})
const proc = spawn('npx',['vite','preview','--port',String(port),'--strictPort'],{shell:true,stdio:['ignore','pipe','pipe']})
await new Promise((ok,f)=>{const t=setTimeout(()=>f(new Error('no start')),60000);const w=(b)=>{if(String(b).includes(String(port))){clearTimeout(t);setTimeout(ok,800)}};proc.stdout.on('data',w);proc.stderr.on('data',w)})
const TOUR=['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const seed=(l)=>`try{localStorage.setItem('rms-lang',${JSON.stringify(l)});const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`
const browser=await chromium.launch()
const ctx=await browser.newContext({viewport:{width:1440,height:800},locale:'en-GB',reducedMotion:'reduce'})
await ctx.addInitScript(seed('lsd'))
const page=await ctx.newPage()
await page.goto(`http://localhost:${port}/miqaats`,{waitUntil:'domcontentloaded'})
await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
const out = await page.evaluate(()=>{
  const bell=document.querySelector('.ix-bell')
  const chain=[]
  for(let e=bell;e&&e!==document.documentElement;e=e.parentElement){
    const cs=getComputedStyle(e)
    if(cs.transform!=='none'||cs.filter!=='none'||cs.perspective!=='none'||cs.willChange!=='auto'||cs.contain!=='none'||cs.backdropFilter!=='none'){
      chain.push(`${e.tagName.toLowerCase()}.${String(e.className).split(/\s+/).slice(0,3).join('.')} transform=${cs.transform} filter=${cs.filter} willChange=${cs.willChange} contain=${cs.contain} backdrop=${cs.backdropFilter}`)
    }
  }
  return chain
})
console.log('containing-block-creating ancestors of .ix-bell:')
out.forEach(c=>console.log('   '+c))
if(!out.length) console.log('   none')
await browser.close(); proc.kill()
