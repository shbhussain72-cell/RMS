import { useT } from '../../i18n'
/**
 * Breadcrumb — pixel-exact from Figma (node 29:3078).
 *
 * Horizontal row, gap 8px, items center-aligned.
 * Crumb text: Mulish Regular 14px, line-height 1.5.
 *   - inactive (has a target): #8a938e
 *   - current (last / no target): #1f5a44
 * Separator: chevron-right inside a 16px box; the chevron stroke is #8a938e,
 * drawn from x=0.5..4.5 over a 5x9 viewBox positioned at inset 25% top/bottom, 37.5% sides.
 *
 * Pass `onNavigate(to)` to handle crumb clicks (router-agnostic).
 */
export type Crumb = { label: string; to?: string };

function Chevron() {
  return (
    <div className="relative size-[16px] shrink-0 overflow-clip" data-name="chevron-right">
      <div className="absolute inset-y-[25%] start-[37.5%] end-[37.5%]">
        <svg viewBox="0 0 5 9" fill="none" preserveAspectRatio="none" className="block h-full w-full">
          <path
            d="M0.5 0.5L4.5 4.5L0.5 8.5"
            stroke="#8a938e"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default function Breadcrumb({
  items,
  onNavigate,
  activeColor = "#a8843e",
  dense = false,
  onBack,
  backOnMobile = false,
}: {
  items: Crumb[];
  onNavigate?: (to: string) => void;
  /** Colour of the current (last) crumb. Defaults to forest green; the desktop
   *  Add-people sidebar passes gold to match the approved design. */
  activeColor?: string;
  /** Desktop two-panel sidebars are narrow, so they pass `dense` (13px + tighter
   *  gaps) to keep long breadcrumbs on one line. Mobile keeps the default 14px. */
  dense?: boolean;
  /** When set, renders a leading "‹ Go back" action inline as the first item of
   *  the row, so the header is a single line (no separate Go-back row above). Shown
   *  on BOTH web and mobile for a consistent navigation experience. */
  onBack?: () => void;
  /** @deprecated Go-back now always shows on mobile; kept for call-site compatibility. */
  backOnMobile?: boolean;
}) {
     const { tx } = useT()
  const textSize = dense ? "text-[13px]" : "text-[14px]";
  return (
    <div
      className={`flex flex-wrap items-center ${dense ? "gap-x-[6px]" : "gap-x-[8px]"} gap-y-[6px]`}
      data-node-id="29:3078"
      data-name="Breadcrumb"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className={`group flex shrink-0 items-center gap-[5px] pe-[8px] ${textSize} leading-[1.5] text-[#5a6660] transition-colors duration-150 hover:text-[#15402f] focus-visible:text-[#15402f] focus-visible:outline-none`}
          style={{ fontFamily: "Mulish, system-ui, sans-serif", fontWeight: 600 }}
        >
          <svg viewBox="0 0 24 24" className="size-[16px] shrink-0 transition-transform duration-200 group-hover:-translate-x-[2px]" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="whitespace-nowrap" {...tx('Go back')} />
        </button>
      )}
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const isLink = !!item.to && !isLast;
        return (
          <div key={`${item.label}-${i}`} className={`flex shrink-0 items-center ${dense ? "gap-[6px]" : "gap-[8px]"}`}>
            {isLink ? (
              <button
                type="button"
                onClick={() => item.to && onNavigate?.(item.to)}
                className={`cursor-pointer whitespace-nowrap text-start ${textSize} leading-[1.5] text-[#8a938e] underline-offset-[3px] transition-colors duration-150 hover:text-[#15402f] hover:underline focus-visible:text-[#15402f] focus-visible:outline-none`}
                style={{ fontFamily: "Mulish, system-ui, sans-serif", fontWeight: 400 }}
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`whitespace-nowrap ${textSize} leading-[1.5]`}
                style={{ fontFamily: "Mulish, system-ui, sans-serif", fontWeight: 400, color: isLast ? activeColor : "#8a938e" }}
              >
                {item.label}
              </span>
            )}
            {!isLast && <Chevron />}
          </div>
        );
      })}
    </div>
  );
}
