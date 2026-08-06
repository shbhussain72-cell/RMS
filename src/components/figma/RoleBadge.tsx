import type { BadgeKind } from '../../lib/group'

const FONT = 'Mulish, system-ui, sans-serif'

/** Shared role-tag colours — single source of truth for every screen. */
export const BADGE_STYLES: Record<Exclude<BadgeKind, null>, { bg: string; fg: string; label: string }> = {
  registrant: { bg: '#e4efe7', fg: '#276245', label: 'Registrant' },
  dependent:  { bg: '#fbf2d8', fg: '#9f8127', label: 'Dependent'  },
  caregiver:  { bg: '#e1eef1', fg: '#2e6a7d', label: 'Caregiver'  },
  guardian:   { bg: '#eceaf7', fg: '#5a4ba3', label: 'Guardian'   },
}

/**
 * RoleBadge — the canonical role tag used across every screen (mobile cards AND
 * desktop tables). Content-sized pill: `inline-flex` so it hugs its label and
 * NEVER stretches to fill a table cell (a block-level `flex` div does). This is
 * the one place height / padding / radius / typography live, so the tag looks
 * identical everywhere it appears.
 */
export default function RoleBadge({ kind }: { kind: BadgeKind }) {
  if (!kind) return null
  const b = BADGE_STYLES[kind]
  return (
    <span
      className="inline-flex h-[24px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-[12px] text-[11px] font-bold tracking-[0.3px]"
      style={{ backgroundColor: b.bg, color: b.fg, fontFamily: FONT }}
    >
      {b.label}
    </span>
  )
}
