# Occlusion baseline — captured before the Ask Help panel was anchored

`node scripts/check-layout.mjs` · 200 route visits (25 routes x 2 languages x 4 widths).
Raw JSON: `artifacts/audit/layout-baseline-pre-askhelp.json` (untracked — `artifacts/` is gitignored).

## Why this exists

Anchoring and clamping the Ask Help FAB moves an occluder. Hits will migrate between the
fixed/sticky class and the in-flow class as it moves. Without a before-picture there is no
way to tell "anchoring fixed it" from "the occluder moved and now covers something else".

**The load-bearing fact: zero findings currently name the Ask Help dock or FAB.** Any
FAB-named finding after the change is new, not pre-existing.

## Totals

| Kind | Raw | Distinct route+element | Gates the run |
|---|---:|---:|---|
| OCCLUDED | 124 | 73 | yes |
| OVERLAY | 72 | 47 | no (log-only) |
| OVERLAP | 26 | 10 | yes |
| CLIPPED | 23 | 5 | yes |
| TALL-ROW | 4 | 1 | yes |
| PAGE-OVERFLOW | 0 | 0 | yes |
| RTL-SCROLL | 0 | 0 | yes |

OCCLUDED occurs **only at 768/1024/1440 — never at 390**. The mobile layout is clean;
this is a desktop-branch defect class.

## OCCLUDED (73 distinct)

| Route | Langs | Widths | Occluder / element | Text |
|---|---|---|---|---|
| /miqaats | en | 768 | `div.absolute.inset-0 over p.whitespace-nowrap.text-[13px].leading-[14px]` | Wed, 08 Jul · 11:59 PM |
| /miqaats | lsd | 768 | `div.absolute.inset-0 over bdi` | ٠٩ شهر صفر المظفر ١٤٤٨ھ |
| /miqaats/ashara-1448 | en | 1024,1440 | `div.absolute.left-1/2.end-0 over p.absolute.left-1/2.top-1/2` | Important Notice |
| /miqaats/ashara-1448/araz | en | 768,1440 | `div.sticky-cta.w-full.px-[16px] over p.mt-[2px].text-[12px].leading-[16px]` | Mother · Female · Age 58 · ITS 30412793 |
| /miqaats/ashara-1448/araz | en/lsd | 768,1024,1440 | `div.sticky-cta.w-full.px-[16px] over span.text-[14px].font-bold` | Host City |
| /miqaats/ashara-1448/araz | en/lsd | 768,1440 | `p.truncate.text-[15px].font-extrabold over p.text-[14px].font-bold.leading-[18px]` | Yusuf Husain |
| /miqaats/ashara-1448/araz | en | 768 | `div.flex.items-center.justify-between over p.mt-[2px].text-[12px].leading-[16px]` | Son · Male · Age 15 · ITS 30412794 |
| /miqaats/ashara-1448/araz | en/lsd | 768 | `button.flex.h-[52px].min-w-[120px] over span.text-[14px].font-bold` | Host City |
| /miqaats/ashara-1448/araz | en/lsd | 768,1024,1440 | `p.truncate.text-[11px].font-bold over p.text-[14px].font-bold.leading-[18px]` | Fatema Husain |
| /miqaats/ashara-1448/araz | en | 1024,1440 | `p.truncate.text-[15px].font-extrabold over p.mt-[2px].text-[12px].leading-[16px]` | Daughter · Female · Age 19 · ITS 3041279 |
| /miqaats/ashara-1448/araz | en/lsd | 1024,1440 | `div.flex.items-center.justify-between over span.text-[14px].font-bold` | Host City |
| /miqaats/ashara-1448/araz | en | 1024 | `span.whitespace-nowrap.text-[15px].font-bold over button.text-[14px].font-bold.text-[#a9b1ab]` | Relay City |
| /miqaats/ashara-1448/araz | en/lsd | 1440 | `div.flex.items-center.justify-between over button.text-[14px].font-bold.text-[#a9b1ab]` | Relay City |
| /miqaats/ashara-1448/araz | en/lsd | 1024,1440 | `div.sticky-cta.w-full.px-[16px] over p.text-[14px].font-bold.leading-[18px]` | Ruqaiya Bhen |
| /miqaats/ashara-1448/araz | lsd | 768 | `div.sticky-cta.w-full.px-[16px] over bdi` | Male |
| /miqaats/ashara-1448/araz | lsd | 768 | `p.truncate.text-[15px].font-extrabold over bdi` | Female |
| /miqaats/ashara-1448/araz | lsd | 768,1024,1440 | `div.flex.items-center.justify-between over bdi` | 19 · ITS 30412795 |
| /miqaats/ashara-1448/araz | lsd | 1024 | `p.truncate.text-[11px].font-bold over bdi` | Female |
| /miqaats/ashara-1448/araz | lsd | 1024 | `button.flex.h-[52px].min-w-[120px] over button.text-[14px].font-bold.text-[#a9b1ab]` | ‏ريلے موضع |
| /miqaats/ashara-1448/araz | lsd | 1024,1440 | `div.sticky-cta.w-full.px-[16px] over button.text-[14px].font-bold.text-[#a9b1ab]` | ‏ريلے موضع |
| /miqaats/ashara-1448/city | en | 768 | `div.group/host.relative.w-full over span.text-[11px].font-bold.uppercase` | Phase 1 · Slot Closed |
| /miqaats/ashara-1448/city | en | 768 | `div.relative.z-[1] over p.mt-[12px].text-[18px].font-bold` | You missed your turn |
| /miqaats/ashara-1448/city | en | 768 | `div.flex.items-center.gap-[10px] over p.mt-[6px].text-[14px].leading-[20px]` | Your Jamaat's booking time is over. You  |
| /miqaats/ashara-1448/city | en | 768 | `div[city-cards].flex.flex-col.gap-[20px] over strong.font-bold.text-[#3a2f2d]` | Phase 2 |
| /miqaats/ashara-1448/city | en/lsd | 768 | `div[city-cards].flex.flex-col.gap-[20px] over span` | starts |
| /miqaats/ashara-1448/city | en/lsd | 768 | `div[city-cards].flex.flex-col.gap-[20px] over bdi` | Fri, 20 |
| /miqaats/ashara-1448/city | en | 768,1024 | `button.relative.z-[1].flex over p.text-[13px].leading-[17px].sm:text-[14px]` | Host city |
| /miqaats/ashara-1448/city | en | 1024 | `p.text-[15px].leading-[19px].sm:text-[17px] over p.mt-[12px].text-[18px].font-bold` | You missed your turn |
| /miqaats/ashara-1448/city | en | 1024,1440 | `button.relative.z-[1].flex over p.mt-[6px].text-[14px].leading-[20px]` | Your Jamaat's booking time is over. You  |
| /miqaats/ashara-1448/city | en | 1024 | `div.relative.z-[1] over strong.font-bold.text-[#3a2f2d]` | Phase 2 |
| /miqaats/ashara-1448/city | en/lsd | 1024,1440 | `div.relative.z-[1] over span` | starts |
| /miqaats/ashara-1448/city | en/lsd | 1024,1440 | `div.relative.z-[1] over bdi` | Fri, 20 |
| /miqaats/ashara-1448/city | en | 1440 | `div.mb-[8px].flex.items-center over p.mt-[12px].text-[18px].font-bold` | You missed your turn |
| /miqaats/ashara-1448/city | en | 1440 | `p.mt-[8px].text-[13px].sm:mt-[12px] over strong.font-bold.text-[#3a2f2d]` | Phase 2 |
| /miqaats/ashara-1448/city | en | 1440 | `p.mt-[8px].text-[13px].sm:mt-[12px] over span` | starts |
| /miqaats/ashara-1448/city | en | 1440 | `p.mt-[8px].text-[13px].sm:mt-[12px] over bdi` | Fri, 20 |
| /miqaats/ashara-1448/city | lsd | 768,1024,1440 | `div.group/host.relative.w-full over bdi` | 1 · slot |
| /miqaats/ashara-1448/city | lsd | 768,1024 | `div.flex.items-center.gap-[10px] over p.mt-[12px].text-[18px].font-bold` | اْثثني وارو نكلي گيو |
| /miqaats/ashara-1448/city | lsd | 768,1024 | `span.text-[13px].font-bold over bdi` | Round 2 |
| /miqaats/ashara-1448/city | lsd | 768 | `div.flex.items-center.gap-[10px] over bdi` | reserve |
| /miqaats/ashara-1448/city | lsd | 1024 | `button.relative.z-[1].flex over bdi` | Round 2 |
| /miqaats/ashara-1448/city | lsd | 1024 | `div.h-full.rounded-full.transition-[width] over bdi` | ‏يوم الجمعة, 20 |
| /miqaats/ashara-1448/city | lsd | 1024 | `div.h-full.rounded-full.transition-[width] over span` | ٠٦:٠٠ PM |
| /miqaats/ashara-1448/city | lsd | 1440 | `div.flex.min-w-0.flex-1 over p.mt-[12px].text-[18px].font-bold` | اْثثني وارو نكلي گيو |
| /miqaats/ashara-1448/city | lsd | 1440 | `div.flex.min-w-0.flex-1 over bdi` | Round 2 |
| /miqaats/ashara-1448/manage/host | en | 768,1024 | `button.relative.z-[1].inline-flex over p.text-[13px].leading-[17px].sm:text-[14px]` | Host city |
| /miqaats/ashara-1448/people | en | 768 | `div.flex.items-center.justify-between over h2.text-[22px].leading-[28px].tracking-[0.2px]` | Other Details |
| /miqaats/ashara-1448/people | en | 768 | `div.sticky-cta.w-full.px-[16px] over p.mt-[6px].text-[14px].leading-[20px]` | Share your requirements so we can make y |
| /miqaats/ashara-1448/people | en | 1024 | `div.sticky-cta.w-full.px-[16px] over h2.text-[22px].leading-[28px].tracking-[0.2px]` | Other Details |
| /miqaats/ashara-1448/people | en | 1024 | `div.flex.items-center.justify-between over p.mt-[6px].text-[14px].leading-[20px]` | Share your requirements so we can make y |
| /miqaats/ashara-1448/people | en | 1440 | `div.sticky-cta.w-full.px-[16px] over span.text-[14px].leading-[20px].text-[#23302a]` | Yes |
| /miqaats/ashara-1448/review | en | 768 | `p.truncate.text-[15px].font-extrabold over bdi` | Requires transportation |
| /miqaats/ashara-1448/review | en | 1024,1440 | `div.sticky-cta.w-full.px-[16px] over bdi` | Requires transportation |
| /miqaats/ashara-1448/review | en/lsd | 768,1024,1440 | `div.flex.items-center.justify-between over p.flex.items-center.text-[13px]` | Airport pickup assistance |
| /miqaats/ashara-1448/timeline | lsd | 768 | `div.group.relative.min-h-[92px] over bdi` | Registration |
| /miqaats/ashara-1448/zone | en | 768 | `div.rounded-[16px].border.border-[#e7dfc9] over span.text-[11px].font-bold.uppercase` | Phase 1 · Slot Closed |
| /miqaats/ashara-1448/zone | en | 768 | `p.text-[18px].leading-[24px].font-bold over p.mt-[12px].text-[18px].font-bold` | You missed your turn |
| /miqaats/ashara-1448/zone | en | 768 | `div.mt-[14px].grid.grid-cols-3 over p.mt-[6px].text-[14px].leading-[20px]` | Your Jamaat's booking time is over. You  |
| /miqaats/ashara-1448/zone | en | 768 | `div.rounded-[16px].border.border-[#e7dfc9] over strong.font-bold.text-[#3a2f2d]` | Phase 2 |
| /miqaats/ashara-1448/zone | en/lsd | 768 | `div.rounded-[16px].border.border-[#e7dfc9] over span` | starts |
| /miqaats/ashara-1448/zone | en/lsd | 768 | `div.rounded-[16px].border.border-[#e7dfc9] over bdi` | Fri, 20 |
| /miqaats/ashara-1448/zone | en | 1024 | `p.text-[18px].leading-[24px].font-bold over p.mt-[6px].text-[14px].leading-[20px]` | Your Jamaat's booking time is over. You  |
| /miqaats/ashara-1448/zone | en | 1024 | `svg over strong.font-bold.text-[#3a2f2d]` | Phase 2 |
| /miqaats/ashara-1448/zone | en | 1024 | `span.mt-[3px].inline-flex.items-center over span` | starts |
| /miqaats/ashara-1448/zone | en | 1024 | `div.mt-[14px].grid.grid-cols-3 over bdi` | Fri, 20 |
| /miqaats/ashara-1448/zone | en | 1440 | `div.rounded-[16px].border.border-[#e7dfc9] over p.mt-[6px].text-[14px].leading-[20px]` | Your Jamaat's booking time is over. You  |
| /miqaats/ashara-1448/zone | en | 1440 | `span.text-[14px].font-bold.leading-[18px] over strong.font-bold.text-[#3a2f2d]` | Phase 2 |
| /miqaats/ashara-1448/zone | en | 1440 | `button.flex.flex-col.items-start over span` | starts |
| /miqaats/ashara-1448/zone | en/lsd | 1024,1440 | `button.flex.flex-col.items-start over bdi` | Fri, 20 |
| /miqaats/ashara-1448/zone | lsd | 768,1024,1440 | `div.rounded-[16px].border.border-[#e7dfc9] over p.mt-[12px].text-[18px].font-bold` | اْثثني وارو نكلي گيو |
| /miqaats/ashara-1448/zone | lsd | 768,1024,1440 | `p.text-[18px].leading-[24px].font-bold over bdi` | Round 2 |
| /miqaats/ashara-1448/zone | lsd | 768 | `span.text-[14px].font-bold.leading-[18px] over bdi` | reserve |
| /miqaats/ashara-1448/zone | lsd | 1024,1440 | `div.mt-[14px].grid.grid-cols-3 over span` | ٠٦:٠٠ PM |

## OVERLAY (47 distinct)

| Route | Langs | Widths | Occluder / element | Text |
|---|---|---|---|---|
| /join-group | en | 390 | `div.sticky-cta.w-full.px-[16px] over p.text-[14px].font-bold.leading-[18px]` | Mohammed Husain |
| /join-group | en/lsd | 390 | `div.flex.items-center.gap-[10px] over p.text-[12px].leading-[16px].text-[#8a938e]` | Father · Male · Age 62 · ITS 30412792 |
| /miqaats | en | 390 | `span.ai-cta__pill over h3.min-w-0` | Milad Syedna Yusuf Najmuddin RA |
| /miqaats | en | 768 | `span.text-[14px].font-bold over span.whitespace-nowrap.text-[13px].leading-[18px]` | Thu, 30 Jul 2026 |
| /miqaats | en | 768 | `span.ai-cta__pill over span.whitespace-nowrap.text-[13px].leading-[18px]` | 06:00 AM IST |
| /miqaats | en | 1440 | `span.ai-cta__pill over span.truncate.text-end.text-[14px]` | Colombo |
| /miqaats/ashara-1448 | en | 390 | `span.ai-cta__pill over span.whitespace-nowrap.text-[12px].leading-[18px]` | Surat |
| /miqaats/ashara-1448 | en | 390 | `span.text-[15px].font-bold.text-[#1a3326] over span.whitespace-nowrap.text-[12px].leading-[18px]` | London |
| /miqaats/ashara-1448 | en | 390 | `button[event-timeline].flex.h-[52px].w-full over span.whitespace-nowrap.text-[12px].leading-[18px]` | Dubai |
| /miqaats/ashara-1448 | lsd | 390 | `div.sticky-cta.w-full.px-[16px] over span.whitespace-nowrap.text-[12px].leading-[18px]` | Nairobi |
| /miqaats/ashara-1448/araz | en | 390 | `button.flex.h-[52px].min-w-[120px] over p.text-[14px].font-bold.leading-[18px]` | Murtaza bhai Moiz bhai Gheewala |
| /miqaats/ashara-1448/araz | en/lsd | 390 | `div.flex.items-center.justify-between over bdi` | You) · Male · Age 31 · ITS 30412786 |
| /miqaats/ashara-1448/araz | en | 390 | `div.sticky-cta.w-full.px-[16px] over span.text-[12px].font-bold.uppercase` | Host City |
| /miqaats/ashara-1448/araz | lsd | 390 | `div.flex.items-center.justify-between over p.text-[14px].font-bold.leading-[18px]` | مرتضى بهائي معز بهائي ككهي والا |
| /miqaats/ashara-1448/araz | lsd | 390 | `p.truncate.text-[15px].font-extrabold over bdi` | Male |
| /miqaats/ashara-1448/arrange | en | 390 | `div.flex.items-center.justify-between over span.text-[14px].font-bold.text-[#23302a]` | Germany |
| /miqaats/ashara-1448/arrange | lsd | 390 | `p.truncate.text-[15px].font-extrabold over span.text-[14px].font-bold.text-[#23302a]` | ‏برطانيه |
| /miqaats/ashara-1448/city | lsd | 390 | `div.flex.items-center.justify-between over p.text-[14px].font-bold.text-[#23302a]` | مرتضى بهائي معز بهائي ككهي والا |
| /miqaats/ashara-1448/city | lsd | 390 | `p.truncate.text-[15px].font-extrabold over bdi` | Male |
| /miqaats/ashara-1448/city | lsd | 390 | `div.flex.items-center.justify-between over bdi` | 31 · ITS 30412786 |
| /miqaats/ashara-1448/city | lsd | 390 | `button.flex.h-[52px].min-w-[120px] over span.inline-flex.h-[24px].shrink-0` | Registrant |
| /miqaats/ashara-1448/city-allocation | lsd | 768,1024,1440 | `div.sticky-cta.w-full.px-[16px] over p.flex.items-center.text-[13px]` | ‏طبي مدد ني ضرورة چھے؟ |
| /miqaats/ashara-1448/manage/relay | en | 390 | `div.sticky-cta.w-full.px-[16px] over p.text-[11px].font-bold.uppercase` | Current |
| /miqaats/ashara-1448/manage/relay | en | 390 | `p.truncate.text-[11px].font-bold over p.text-[12px].font-semibold.text-[#8a938e]` | Relay City |
| /miqaats/ashara-1448/manage/relay | en | 390 | `p.truncate.text-[15px].font-extrabold over p.mt-[1px].text-[14px].font-bold` | Mumbai |
| /miqaats/ashara-1448/manage/relay | en | 390 | `button.flex.h-[52px].min-w-[120px] over span.text-[13px].font-bold.leading-[17px]` | Choose city |
| /miqaats/ashara-1448/people | en | 390 | `div.flex.items-center.justify-between over p.text-[12px].leading-[18px].text-[#5a6660]` | Mother · Female · Age 58 · ITS 30412793 |
| /miqaats/ashara-1448/people | en | 390 | `div.flex.items-center.justify-between over p.flex-1.text-[12px].leading-[16px]` | This member requires medical assistance. |
| /miqaats/ashara-1448/people | en | 390 | `div.flex.items-center.justify-between over span.text-[12px].leading-[16px]` | Assign |
| /miqaats/ashara-1448/people | lsd | 390 | `p.truncate.text-[11px].font-bold over p.flex-1.text-[12px].leading-[16px]` | ‏اْ ممبر نے طب ني ضرورة چھے. معاون مقرر  |
| /miqaats/ashara-1448/people | lsd | 390 | `span.whitespace-nowrap.text-[15px].font-bold over span.text-[12px].leading-[16px]` | ‏سونپو |
| /miqaats/ashara-1448/preferred-city | en/lsd | 390 | `button.flex.h-[48px].flex-1 over h3.text-[17px].leading-[24px].text-[#15402f]` | Visa Document |
| /miqaats/ashara-1448/preferred-city | en | 768,1024,1440 | `div.flex.items-center.gap-[12px] over h3.text-[17px].leading-[24px].text-[#15402f]` | Visa Document |
| /miqaats/ashara-1448/raza | en/lsd | 390 | `div.flex.items-center.justify-between over p.text-[17px].font-bold.text-[#23302a]` | Mohammed Husain |
| /miqaats/ashara-1448/raza | en | 390 | `div.flex.items-center.justify-between over p.text-[13px].text-[#7a847e].mt-[3px]` | Father · Male · Age 62 · ITS 30412792 |
| /miqaats/ashara-1448/raza | en/lsd | 390,768,1024,1440 | `p.truncate.text-[15px].font-extrabold over bdi` | Requires accommodation |
| /miqaats/ashara-1448/raza | lsd | 390,768,1024,1440 | `div.flex.items-center.justify-between over bdi` | 62 · ITS 30412792 |
| /miqaats/ashara-1448/review | en | 390 | `div.sticky-cta.w-full.px-[16px] over p.absolute.left-[calc(50%+0.5px)].top-[calc(50%-2px)]` | Other Details |
| /miqaats/ashara-1448/review | lsd | 390 | `div.flex.items-center.justify-between over p.absolute.left-[calc(50%+0.5px)].top-[calc(50%-2px)]` | ‏بيجي تفاصيل |
| /miqaats/ashara-1448/roster | en | 390,768,1024,1440 | `p.truncate.text-[11px].font-bold over bdi` | Requires accommodation |
| /miqaats/ashara-1448/roster | lsd | 768,1024,1440 | `div.flex.items-center.justify-between over p.flex.items-center.text-[13px]` | ‏اْوا جاوا نا انتظام ني ضرورة چھے؟ |
| /miqaats/ashara-1448/zone | lsd | 390 | `div[reserve-confirm].sticky-cta.w-full.px-[16px] over button.inline-flex.items-center.justify-center` | Request |
| /miqaats/ashara-1448/zone-allocation | en | 390 | `p.truncate.text-[15px].font-extrabold over span.text-[15px].text-[#3d3d3a]` | Raza status |
| /miqaats/ashara-1448/zone-allocation | en | 390 | `span.whitespace-nowrap.text-[15px].font-bold over span.text-[15px].font-bold` | Pending |
| /miqaats/ashara-1448/zone-allocation | lsd | 390 | `p.truncate.text-[11px].font-bold over span.text-[15px].text-[#3d3d3a]` | ‏رزا حال |
| /miqaats/ashara-1448/zone-allocation | lsd | 390 | `button.flex.h-[52px].min-w-[120px] over span.text-[15px].font-bold` | باقي |
| /miqaats/ashara-1448/zone-allocation | lsd | 768,1024,1440 | `div.flex.items-center.justify-between over p.flex.items-center.text-[13px]` | ‏رهائش ني ضرورة چھے؟ |

## OVERLAP (10 distinct)

| Route | Langs | Widths | Occluder / element | Text |
|---|---|---|---|---|
| /miqaats | en/lsd | 390,768,1024,1440 | `div.ix-card-lg.relative.flex ∩ button.ai-cta.fixed.bottom-[24px]` |  |
| /miqaats/ashara-1448/araz | en/lsd | 768 | `button.flex.items-center.gap-[9px] ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/araz | en/lsd | 1024 | `button.flex.items-center ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/araz | en/lsd | 1024 | `button.text-[14px].font-bold.text-[#a9b1ab] ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/araz | en/lsd | 1440 | `button.flex.size-[30px].shrink-0 ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/arrange | en/lsd | 390 | `button.flex.w-full.items-center ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/city | en | 390 | `button.shrink-0.inline-flex.h-[30px] ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/people | en/lsd | 390 | `div.flex.items-center.gap-[10px] ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/people | en/lsd | 390 | `button.flex.h-[24px].shrink-0 ∩ button.flex.h-[52px].min-w-[120px]` |  |
| /miqaats/ashara-1448/people | en/lsd | 1440 | `button.flex.min-h-[52px].w-full ∩ button.flex.h-[52px].min-w-[120px]` |  |

## CLIPPED (5 distinct)

| Route | Langs | Widths | Occluder / element | Text |
|---|---|---|---|---|
| /miqaats | en/lsd | 768,1024 | `div.ix-card-lg.relative.flex` | Sat, 25 Jul 2026 |
| /miqaats/ashara-1448/city | en | 768 | `div.group/host.relative.w-full` | Requested |
| /miqaats/ashara-1448/manage/host | en | 768 | `div.group/host.relative.w-full` | Selected |
| /miqaats/ashara-1448/manage/relay | en | 768 | `div.shrink-0.overflow-hidden.rounded-[12px]` | Available |
| /miqaats/ashara-1448/timeline | en/lsd | 768,1024 | `div[AppScreen].relative.mx-auto.flex` | Opens |

## TALL-ROW (1 distinct)

| Route | Langs | Widths | Occluder / element | Text |
|---|---|---|---|---|
| /miqaats/ashara-1448/people | en | 768,1024 | `tr.transition-colors.duration-150.cursor-pointer` | SNSyed NaziaDaughter · Female · Age 09 · ITS 30412791Childre |

