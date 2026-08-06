# FIGMA_SPEC — Miqaat Registration (Ashara Mubaraka)

Pixel-exact foundation spec. Figma file `HDoCF0sVTVz2HTNfYHRB4r`.
Source nodes: Login `29:1942`, Miqaat List `29:2086`, Add people `29:2997`.

**Rules for screen agents**
- Every value below is from Figma. Use Tailwind **arbitrary values** (`text-[#1f5a44]`, `h-[48px]`, `rounded-[9999px]`, `shadow-[...]`). Do not approximate.
- Fonts: **Marcellus** (serif headings), **Mulish** (sans body) — already loaded in `index.html`. Status-bar time uses an `-apple-system` / SF Pro stack.
- Wrap each screen in `<PhoneScreen>` (the 390px frame). Do not re-implement the status bar / home indicator.
- Assets live in `/figma/*` (see `frontend/public/figma/`).

---

## (a) Colors

| Hex | Role |
|---|---|
| `#0e2d21` | forest-900 — hero gradient top, deep overlay |
| `#15402f` | forest-800 — hero gradient mid, heading green, header gradient start |
| `#1f5a44` | forest-700 — primary green, buttons, current breadcrumb, login title |
| `#194a37` | gold-button text green (on gold CTA) |
| `#23302a` | card name text (person rows) |
| `#313131` | base ink (home indicator stroke) |
| `#2c3a3c` | status-bar dark tone (icons/time on white bg) |
| `#5a6660` | ink-muted — secondary body, "Remember Me", person meta |
| `#8a938e` | ink-faint — placeholders, inactive breadcrumb, sticky-CTA caption |
| `#757575` | input placeholder (Add-people ITS input) |
| `#3d3d46` | countdown caption text |
| `#f8f4ea` | cream-50 — button text on green, sticky-CTA fade base |
| `#fffdf8` | cream — card surface, login panel, person cards |
| `#fbfbfb` / `#fbf2d8?` | input bg (add-people search input is `#fbfbfb`) |
| `#e7dfc9` | cream border — inputs, person cards |
| `#ece4d2` | miqaat-card border + inner divider |
| `#e9dabf` | invite-card border (gold) |
| `#c9a45c` | gold (default) — checkbox border, gold gradient end |
| `#e3cd96` | gold-light — hero accents, dividers, gold gradient start |
| `#a8843e` | gold-dark — field labels, section heading text |
| `#9f8127` | "Dependent" badge text |
| `#993c1d` | countdown number (live/amber tile) |
| `#d85a30` | countdown unit label (live/amber tile) |
| `#fff7f5` | countdown tile bg (live) |
| `#e1eef1` | countdown tile bg (upcoming) + Caregiver badge bg |
| `#2e6a7d` | countdown number (upcoming) + Caregiver badge text |
| `#4d93a9` | countdown unit label (upcoming) |
| `#e4efe7` | Registrant badge bg |
| `#276245` | Registrant badge text |
| `#fbf2d8` | Dependent badge bg |
| `#e5f5e7` | guardian-pill bg |
| `#badcc7` | guardian-pill border |
| `rgba(11,119,67,0.9)` | guardian-pill text (`#0b7743` @ 90%) |
| `#a8843e` | (status note "Live" pill bg is `#a8843e`) |
| `#b23b3b` | notification badge red |
| `#cc9c42` | invite-pill dot |
| `#0c3d22` | invite-pill text |
| `#e9e4da` | PhoneScreen page background (outside the 390 column on wide viewports) |

**Gradients**
- Hero (Login `29:1943`), vertical: `from-[#0e2d21] via-[#15402f] to-[#1f5a44]` (`bg-gradient-to-b`, via at 50%). Height 335px.
- Header (Miqaat List `29:2155`): `linear-gradient(175.2deg, #15402f 0%, #1f5a44 78%)`. Height 119px, rounded-b-20.
- Primary button (Login `29:1992`): `linear-gradient(172.36deg, #1f5a44 0%, #15402f 100%)`.
- Gold button (Add people `29:3129`): `bg-gradient-to-b from-[#e3cd96] to-[#c9a45c]`.
- Gold "Add" button (`29:3089`): `bg-gradient-to-b from-[rgba(227,205,150,0.5)] to-[rgba(201,164,92,0.5)]`.
- Invite card (`29:3092`): `linear-gradient(166.5deg, #f7e6c3 0%, #fffdf8 50%, rgba(247,230,195,0.4) 100%)`.
- Sticky-CTA fade (`29:3148`): `bg-gradient-to-b from-[rgba(248,244,234,0)] to-[#f8f4ea] to-[28%]`, height 102px.

---

## (b) Typography (font-size / weight / line-height / letter-spacing)

| Role | Family | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| Hero title ("Welcome to") | Marcellus | 24px | 400 | 28px | — |
| Login panel title | Marcellus | 22px | 400 | 33px | — |
| Page H1 ("All Miqaats") | Marcellus | 24px | 400 | 28px | 0.2px |
| Page H2 ("Add People to group") | Marcellus | 20px | 400 | 28px | 0.2px |
| Card title (miqaat name) | Marcellus | 18px | 400 | 20px | 0.1455px |
| Invite-card title | Marcellus | 20px | 400 | 22px | 0.2px |
| Field label (ITS id / Password) | Mulish | 14px | 700 | 18px | 0.6px, **uppercase** (ITS id only) |
| Section heading ("YOUR FAMILY") | Mulish | 16px | 700 | 18px | 2.5px, uppercase |
| Body / subtitle | Mulish | 13.5px | 400 | 20.25px | — |
| Person name | Mulish | 14px | 700 | 18px | — |
| Person meta | Mulish | 12px | 400 | 18px | — |
| Input value / placeholder | Mulish | 16px | 400 | normal | — |
| Button label (primary/secondary) | Mulish | 14px | 700 | normal | 0.2px |
| Login button label | Mulish | 16px | 700 | 24px | 0.4px |
| Confirm (sticky) label | Mulish | 15.5px | 700 | 15.5px | — |
| Badge (Registrant/etc.) | Mulish | 10.165px | 700 | 15.247px | 0.5082px |
| Countdown number | Mulish | 20px | 700 | 24px | — |
| Countdown unit | Mulish | 10px | 700 | 14px | 0.6026px, uppercase |
| Caption ("Registration ends…") | Mulish | 12px | 500 | 16px | — |
| Sticky-CTA caption | Mulish | 11px | 700 | 17.05px | 0.5px, uppercase |
| Breadcrumb | Mulish | 14px | 400 | 1.5 | — |
| Status-bar time | -apple-system/SF Pro | 14px | 600 | normal | -0.28px |

---

## (c) Buttons

**Primary green pill** (Login `29:1992`, Register-now `29:2120`)
- Height **48px** (login) / **42px** (in-card). Radius **9999px** (login) / **30px** (in-card).
- Login bg: `linear-gradient(172.36deg,#1f5a44,#15402f)`. In-card bg: solid `#1f5a44`.
- Shadow: `shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.18),0px_2px_6px_0px_rgba(21,64,47,0.06)]`.
- Text: `#f8f4ea`, Mulish 700, 16px (login) / 14px (in-card), tracking 0.4px / 0.2px.
- **Disabled**: `opacity-50` (the login button ships disabled at opacity 50).

**Confirm button** (sticky CTA `29:3153`): solid `#1f5a44`, h-52, w-113.57, radius **14px**, shadow `0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)`, text white Mulish 700 15.5px.

**Outline (secondary) pill** (View-details `29:2152`): transparent, `border border-[#1f5a44]`, h-42, radius 30px, same shadow as primary, text `#1f5a44` Mulish 700 14px tracking 0.2px.

**Gold button** (Invite-now `29:3129`): `bg-gradient-to-b from-[#e3cd96] to-[#c9a45c]`, h-42, radius 14px, shadow `0px_6px_18px_-6px_rgba(21,64,47,0.18),0px_2px_6px_0px_rgba(21,64,47,0.06)`, text `#1f5a44` Mulish 700 14px tracking 0.2px.

**Gold "Add" button** (`29:3089`): `bg-gradient-to-b from-[rgba(227,205,150,0.5)] to-[rgba(201,164,92,0.5)]`, h-48, radius 14px, shadow `0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)`, text `#194a37` Mulish 700 16px.

---

## (d) Input field

- Login (`29:1982/29:1985`): `bg-white`, `border border-[#e7dfc9]`, **h-48**, radius **8px**, content padding-left **15px**. Placeholder `#8a938e` Mulish 400 16px.
- Add-people search (`29:3086`): `bg-[#fbfbfb]`, `border border-[#e7dfc9]`, h-48, radius **12px**, padding-left 11px. Placeholder `#757575` Mulish 400 16px.
- Field label sits **above** the input: Mulish 700 14px `#a8843e` tracking 0.6px (ITS id uppercase).

---

## (e) Card

- **Miqaat card** (`29:2089`): `bg-white`, `border border-[#ece4d2]`, radius **18px**, shadow `0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)`. Width 358 inside 390 frame (16px side margins). Inner divider `border-t border-[#ece4d2]`.
- **Person card** (`29:3006`): `bg-[#fffdf8]`, `border border-[#e7dfc9]`, radius **14px**, no shadow. Base height 62px (106–107px when a guardian/care pill is shown).
- **Login panel** (`29:1977`): `bg-[#fffdf8]`, `border border-[rgba(255,255,255,0.6)]`, top corners radius 16px.
- **Invite card** (`29:3092`): gold gradient (see §a), `border border-[#e9dabf]`, radius 12px.
- **Sticky CTA card** (`29:3149`): `bg-[#fffdf8]`, `border border-[#e7dfc9]`, radius 18px, shadow `0px_22px_50px_-18px_rgba(21,64,47,0.3),0px_8px_20px_-10px_rgba(21,64,47,0.16)`.
- **Avatar** (person): `bg-[#1f5a44]`, size 36, radius full, initials white Mulish 700 14px.

---

## (f) Badges / pills (per tone)

All badges: h-20, radius `50.824px` (≈9999px), text Mulish 700 10.165px tracking 0.5082px, w-72 (person-row badges).

| Badge | bg | text |
|---|---|---|
| Registrant | `#e4efe7` | `#276245` |
| Dependent | `#fbf2d8` | `#9f8127` |
| Caregiver | `#e1eef1` | `#2e6a7d` |
| Live (status note) | `#a8843e` | white (Mulish 600 14px, w-71, radius 58px) |
| Guardian / Under-care pill | `#e5f5e7`, border `#badcc7`, radius 8px, h-36 | `rgba(11,119,67,0.9)` 12px, "Change" bold; shield icon `/figma/shield-task.svg` |
| Notification badge | `#b23b3b` | white Mulish 800 10px, size 16, radius 9px |
| Invite remaining pill | `rgba(12,61,34,0.08)`, border `rgba(12,61,34,0.15)` | `#0c3d22` 12px, dot `#cc9c42` |

**Status dots**: Live = `/figma/dot-live.svg`, Upcoming = `/figma/dot-upcoming.svg` (size 8).
**Countdown tiles** (h-68, radius 9.792px): Live → bg `#fff7f5`, border `rgba(227,205,150,0.3)` 0.753px, number `#993c1d`, unit `#d85a30`. Upcoming → bg `#e1eef1` (no border), number `#2e6a7d`, unit `#4d93a9`.

---

## (g) 390px frame contract + PhoneScreen

- Every Figma frame is **390px wide**. The device frame background is white (`bg-white`); children paint hero/page backgrounds on top.
- `PhoneScreen` centers a 390px column on wide viewports (page bg `#e9e4da`) and fills width at ≤390px. It renders `StatusBar` (absolute, top, z-30, transparent bg), then the scrollable children, then an optional sticky `footer` (z-20) pinned to the bottom of the column, then `HomeIndicator` (z-30).
- The status bar overlays the top 44px — screens that start with a hero/header must let it run to the top edge (the hero already reserves the 44px visually). Plain pages should pad their first content below 44px.
- Chrome heights: **StatusBar 44px**, **AppBar 70px** (white pages, sits at top under status bar), **Header (green identity) 119px** (Miqaat List), **HomeIndicator 26px**.
- Breadcrumb row: left margin 16px, sits ~12px under the app bar/header.

---

## (h) Shared component API

Import root: `src/components/figma/`.

| Component | Import | Props | Example |
|---|---|---|---|
| PhoneScreen | `import PhoneScreen from "@/components/figma/PhoneScreen"` | `{ children, statusTone?: "light"\|"dark", footer?: ReactNode, showHomeIndicator?: boolean, frameClassName?: string }` | `<PhoneScreen statusTone="dark" footer={<StickyCta/>}>…</PhoneScreen>` |
| StatusBar | `import StatusBar from "@/components/figma/StatusBar"` | `{ tone?: "light"\|"dark" }` | `<StatusBar tone="light" />` (usually via PhoneScreen) |
| HomeIndicator | `import HomeIndicator from "@/components/figma/HomeIndicator"` | `{ tone?: "light"\|"dark" }` | `<HomeIndicator tone="dark" />` (usually via PhoneScreen) |
| AppBar | `import AppBar from "@/components/figma/AppBar"` | `{ notificationCount?: number, onBellClick?: () => void }` | `<AppBar notificationCount={3} onBellClick={openNotifs} />` |
| Breadcrumb | `import Breadcrumb from "@/components/figma/Breadcrumb"` | `{ items: {label: string, to?: string}[], onNavigate?: (to: string) => void }` | `<Breadcrumb items={[{label:"Miqaat list",to:"/"},{label:"Add people"}]} onNavigate={nav}/>` |
| BottomSheet | `import BottomSheet from "@/components/figma/BottomSheet"` | `{ open: boolean, onClose: () => void, title?: string, children: ReactNode }` | `<BottomSheet open={open} onClose={close} title="Assign guardian">…</BottomSheet>` |

> Imports use whatever path style the screens already use (relative or alias). If no `@` alias is configured, import via relative path, e.g. `../components/figma/PhoneScreen`.

### Asset manifest (`/figma/…`)
`statusbar-battery-union.svg`, `statusbar-wifi.svg`, `statusbar-cellular.svg` (inlined in StatusBar), `home-indicator.svg` (inlined), `its-crest-login.png`, `its-crest-header.png`, `its-crest-appbar.png`, `hero-arch-login.svg`, `hero-arch-header.svg`, `chevron-right-vector.svg` (inlined in Breadcrumb), `shield-task.svg`, `checkbox-unchecked.svg`, `checkbox-checked.svg`, `checkbox-mask.svg`, `ornament-pattern.png`, `ornament-mask.svg`, `miqaat-card-bg.png`, `icon-date-range-gold.svg`, `icon-date-range-blue.svg`, `icon-schedule.svg`, `dot-live.svg`, `dot-upcoming.svg`.
