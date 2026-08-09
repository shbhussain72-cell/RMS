# RMS
Raza Management System

## Internal review build

The Remarks and Coverage tools are gated on one environment variable, not on `DEV`:

```
VITE_REVIEW_TOOLS=true
```

They used to be gated on `import.meta.env.DEV`, which meant they existed only on a machine
running `vite`. Review happens on the deployed URL, so the people whose feedback the tools
collect were the only people who could not reach them.

| environment | set it? | why |
|---|---|---|
| local dev | yes (`.env.local`) | normal working state |
| Vercel **Preview** | yes | this is where internal review happens |
| Vercel **Production** | yes *while this is an internal review build* — **remove it before anything real ships** | |

Vercel applies env changes at build time, not to an existing deployment: **redeploy after
changing it.**

With the flag unset, none of the tool code is in the bundle — the modules are dropped, not
hidden. `npm run check:gate` builds both ways and asserts the bundle differs; `npm run build`
alone checks whichever state you built in.

### Getting remarks out

Remarks persist to `localStorage`, so on a shared URL every reviewer has their own private set
and nobody else can see them. **Export is the only way out**, and there is deliberately no
backend. The panel's primary action exports Markdown (paste it straight into a message) or
JSON (round-trips back into the tool), and the pill carries an amber `↑n` badge counting
remarks that have never been exported or have been edited since.
