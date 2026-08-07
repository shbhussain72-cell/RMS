/**
 * StatusBar — iPhone X status bar, pixel-exact from Figma (node 29:1998 / 29:2195 / 29:3132).
 *
 * Height 44px. Time "9:41" SF Pro Text Semibold 14px tracking -0.28px at left 48px.
 * Cellular (right 64.33), Wifi (right 44.03), Battery union (right 14.67) + capacity bar.
 *
 * Icons are inlined as SVG using currentColor so `tone` controls the whole bar's color:
 *   - tone="light" (default): white — sits over the green hero / forest header.
 *   - tone="dark": #2c3a3c — sits over a white app bar / page.
 * Background is always transparent so it overlays whatever is beneath it.
 */
type Tone = "light" | "dark";

const COLOR: Record<Tone, string> = {
  light: "#ffffff",
  dark: "#2c3a3c",
};

export default function StatusBar({ tone = "light" }: { tone?: Tone }) {
  const color = COLOR[tone];
  return (
    <div className="relative h-[44px] w-full shrink-0" data-node-id="29:1998" data-name="status-bar">
      {/* Time — centred ON the 48px mark, without assuming how wide it renders.

          The original was `left-[48px] w-[30px] -translate-x-1/2`: physical, while every icon
          to its right already used logical `end-`, so under RTL the icons moved to the left
          edge and the clock stayed put — both ends of the bar on the same side.

          The first fix was `start-[33px]` (33 = 48 - 30/2). That is correct only while the
          clock really is 30px wide, and `w-[30px]` is a Figma decree rather than a
          measurement: LSD forces a different font family across the whole document, so the
          rendered digits need not match. Trading a direction bug for a width assumption is
          not a fix, it is a quieter bug.

          `start-[48px] w-0` + `flex justify-center` centres on a POINT instead: a zero-width
          box at the 48px mark whose content overflows it symmetrically, whatever width that
          content turns out to be. Direction-neutral, no transform, no magic constant — and
          the same "centre on a point" behaviour that keeps the nowrap exemptions physical
          elsewhere, expressed without a physical inset.

          NOTE: this component is currently imported by nothing, so none of this can be
          verified in the running app. It is fixed rather than left because an unmounted
          component is exactly where a latent assumption survives until someone mounts it. */}
      <p
        className="absolute start-[48px] top-[calc(50%-6px)] flex h-[17px] w-0 justify-center whitespace-nowrap text-[14px] tracking-[-0.28px] leading-[normal]"
        style={{ fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif', fontWeight: 600, color }}
      >
        9:41
      </p>

      {/* Cellular */}
      <div className="absolute end-[64.33px] top-[calc(50%+1px)] -translate-y-1/2 h-[10.669px] w-[17px]" style={{ color }} data-name="Cellular">
        <svg viewBox="0 0 17 10.6689" fill="none" className="block h-full w-full">
          <path
            d="M11.332 2.33594C11.8843 2.33594 12.332 2.78365 12.332 3.33594V9.66895C12.332 10.2212 11.8843 10.6689 11.332 10.6689H10.332C9.77975 10.6689 9.33203 10.2212 9.33203 9.66895V3.33594C9.33203 2.78365 9.77975 2.33594 10.332 2.33594H11.332ZM16 0C16.5523 0 17 0.447715 17 1V9.66699C16.9998 10.2191 16.5522 10.667 16 10.667H15C14.4478 10.667 14.0002 10.2191 14 9.66699V1C14 0.447715 14.4477 0 15 0H16ZM2 6.66406C2.55228 6.66406 3 7.11178 3 7.66406V9.66406C3 10.2163 2.55228 10.6641 2 10.6641H1C0.447715 10.6641 0 10.2163 0 9.66406V7.66406C0 7.11178 0.447715 6.66406 1 6.66406H2ZM6.66797 4.66406C7.22025 4.66406 7.66797 5.11178 7.66797 5.66406V9.66406C7.66797 10.2163 7.22025 10.6641 6.66797 10.6641H5.66797C5.11568 10.6641 4.66797 10.2163 4.66797 9.66406V5.66406C4.66797 5.11178 5.11568 4.66406 5.66797 4.66406H6.66797Z"
            fill="currentColor"
          />
        </svg>
      </div>

      {/* Wifi */}
      <div className="absolute end-[44.03px] top-[calc(50%+0.81px)] -translate-y-1/2 h-[10.968px] w-[15.272px]" style={{ color }} data-name="Wifi">
        <svg viewBox="0 0 15.2725 10.9679" fill="none" className="block h-full w-full">
          <path
            d="M5.42774 8.4035C6.70329 7.32463 8.57112 7.32466 9.84669 8.4035C9.91086 8.46153 9.94844 8.54355 9.9502 8.63006C9.95183 8.71639 9.91809 8.80003 9.85645 8.86053L7.85938 10.8762C7.8009 10.9353 7.72087 10.9679 7.6377 10.9679C7.55456 10.9679 7.47454 10.9352 7.41602 10.8762L5.41798 8.86053C5.35626 8.79988 5.3224 8.71559 5.32423 8.62908C5.32616 8.54283 5.36376 8.46138 5.42774 8.4035ZM2.7627 5.71404C5.51085 3.15801 9.76655 3.15793 12.5147 5.71404C12.5766 5.77392 12.6123 5.8564 12.6133 5.94256C12.6142 6.02872 12.5802 6.11185 12.5195 6.17303L11.3643 7.34002C11.2453 7.45884 11.0536 7.46155 10.9316 7.34588C10.0293 6.52874 8.85508 6.07635 7.6377 6.07635C6.42102 6.07685 5.24758 6.52921 4.34571 7.34588C4.22364 7.46175 4.03107 7.45911 3.91212 7.34002L2.75782 6.17303C2.69706 6.11195 2.66326 6.02872 2.66407 5.94256C2.66498 5.8564 2.70071 5.7739 2.7627 5.71404ZM0.0966866 3.02947C4.3118 -1.0097 10.9618 -1.00995 15.1768 3.02947C15.2377 3.08942 15.2719 3.17156 15.2725 3.25701C15.273 3.34257 15.239 3.42481 15.1787 3.48553L14.0225 4.65252C13.9033 4.77199 13.7107 4.77324 13.5899 4.65545C11.9839 3.12872 9.85255 2.27764 7.63673 2.27752C5.42063 2.27751 3.28877 3.12856 1.68262 4.65545C1.56183 4.77344 1.36905 4.77222 1.25001 4.65252L0.0937569 3.48553C0.0334926 3.42476 -0.000556156 3.34259 6.87362e-06 3.25701C0.000622824 3.1715 0.0356758 3.08939 0.0966866 3.02947Z"
            fill="currentColor"
          />
        </svg>
      </div>

      {/* Battery */}
      <div className="absolute end-[14.67px] top-[calc(50%+1px)] -translate-y-1/2 h-[11.333px] w-[24.328px]" style={{ color }} data-name="Battery">
        <svg viewBox="0 0 24.3281 11.333" fill="none" className="block h-full w-full">
          <path
            opacity="0.4"
            d="M19.333 0C20.8058 0 22 1.19423 22 2.66699V8.66699L21.9863 8.93945C21.8497 10.2841 20.7137 11.333 19.333 11.333H2.66699L2.39355 11.3193C1.13878 11.1917 0.141165 10.1943 0.0136719 8.93945L0 8.66699V2.66699C0 1.28643 1.04909 0.150438 2.39355 0.0136719L2.66699 0H19.333ZM2.66699 1C1.74652 1 1 1.74652 1 2.66699V8.66699C1.00018 9.58732 1.74663 10.333 2.66699 10.333H19.333C20.2534 10.333 20.9998 9.58732 21 8.66699V2.66699C21 1.74652 20.2535 1 19.333 1H2.66699ZM23 3.66406C23.8047 4.00284 24.3281 4.79093 24.3281 5.66406C24.3281 6.5372 23.8047 7.32529 23 7.66406V3.66406Z"
            fill="currentColor"
          />
        </svg>
        {/* Capacity fill — 18 x 7.333 at right 19 (offset 4.33 inside the 24.328 union) */}
        <div
          className="absolute end-[4.33px] top-1/2 h-[7.333px] w-[18px] -translate-y-1/2 rounded-[1.333px]"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}
