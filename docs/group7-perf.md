# Group 7 — overflow and compositor work

Two findings, both about elements that are enormously larger than the box they are seen
through. They are logged together because the suspected cost is the same: a very large layer
that the compositor has to keep around even though almost none of it is visible.

**Neither has been profiled yet.** The brief is explicit that `.ai-cta__spin` should be
profiled *before* being contained — if the freeze traces to compositor thrash rather than
off-screen overflow, containment alone will not fix it. The same caution applies to the
ornament below. These are symptom reports.

---

## 7.1 `.ai-cta__spin` — ring overflows its box on every route

Measured on every route at every width:

```
span.ai-cta__ring — scrollWidth 277 > clientWidth 132
```

Reported as a renderer freeze. Candidate causes, in the order worth testing:

1. **Compositor thrash** — a continuously animating element promoted to its own layer,
   repainting at full size rather than the visible 132px.
2. **Off-screen overflow** — the 277px of ring outside the box still being rasterised.

If (1), `contain` will not help and the fix is to reduce what animates or to animate a
`transform` on a smaller layer. If (2), `overflow: clip` plus `contain: paint` should be
enough. Pausing via `IntersectionObserver` and honouring
`prefers-reduced-motion: reduce` is worth doing in either case, but is not a substitute for
finding out which.

## 7.2 Success header ornament — 4398 × 4271px, clipped to a 358px header

`src/screens/Success.tsx`, the masked decorative artwork in the success card header:

```
div.flex.h-[4270.95px].w-[4398.656px]   inside a 358px-wide overflow-clip header
```

It is ~150× the area it is seen through. Two separate concerns:

**Rasterisation cost.** The same question as 7.1 — whether the full 4398×4271 surface is being
rasterised to show a 358×125 slice. Worth profiling alongside it since the fix is likely the
same shape.

**It hit-tests above page content.** This surfaced during the centring elimination pass. The
Success card's centring was converted from `left-1/2 + -translate-x-1/2` to
`start-0 end-0 mx-auto`, geometry stayed pixel-identical, and 8 new `OVERLAY` findings
appeared: the ornament hit-testing above the success heading at every width in both
languages.

The conversion was reverted (see `docs/centring-exceptions.md`) and the findings went away, so
this is currently **latent, not live**. But the ornament being large enough and high enough in
the paint order to sit over the heading is a property of the ornament, not of the centring —
the centring change only removed the stacking context that was hiding it. Any future change
that removes a transform from an ancestor in that subtree will surface it again.

Worth fixing at the source: the ornament should not be able to hit-test at all
(`pointer-events: none`) and should not depend on an ancestor's incidental stacking context to
stay behind the text.

---

### Why this is here rather than in the centring write-up

It was found while reverting an experiment, and a reverted experiment is exactly the kind of
place a real finding gets lost as a footnote. The centring exemption records *why those three
sites stay physical*; this records *the thing that made them stay physical*, which is a
separate defect with its own fix.
