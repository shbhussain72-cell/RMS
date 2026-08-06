/**
 * HomeIndicator — iPhone home indicator, pixel-exact from Figma (node 29:1996).
 *
 * 26px tall, full width. A single rounded line: from x=140 to x=250.651 at y=13,
 * stroke-width 3.62791, opacity 0.3. Color follows currentColor via `tone`
 * (dark #313131 over light surfaces, white over the green hero).
 */
type Tone = "light" | "dark";

const COLOR: Record<Tone, string> = {
  light: "#ffffff",
  dark: "#313131",
};

export default function HomeIndicator({ tone = "dark" }: { tone?: Tone }) {
  return (
    <div className="relative h-[26px] w-full shrink-0" data-node-id="29:1996" data-name="Home Indicator">
      <svg viewBox="0 0 390 26" fill="none" preserveAspectRatio="none" className="block h-full w-full">
        <path
          d="M140 13H250.651"
          stroke={COLOR[tone]}
          strokeOpacity="0.3"
          strokeWidth="3.62791"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
