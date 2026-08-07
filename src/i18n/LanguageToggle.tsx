/**
 * English ⇄ Lisan ud-Dawat segmented toggle.
 *
 * App-level control: it flips `lang` in LangProvider, which writes localStorage and sets
 * dir/lang/data-lang on <html>. There is no per-page language state anywhere.
 *
 * Two variants because the app has two header treatments: `header` sits on the green
 * gradient AppBar/IdentityHeader, `light` sits on cream/white surfaces (the Login screen,
 * which renders no AppBar at all).
 *
 * The labels "EN" / "LSD" are intentionally NOT translated — a language switcher has to
 * stay readable in the language you are switching away from.
 */
import { useLang } from './index'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

export default function LanguageToggle({
  variant = 'header',
  className = '',
}: {
  variant?: 'header' | 'light'
  className?: string
}) {
  const { lang, setLang } = useLang()
  const onGreen = variant === 'header'

  const track = onGreen
    ? 'bg-[rgba(255,255,255,0.14)] border-[rgba(255,255,255,0.22)]'
    : 'bg-white border-[#e7dfc9]'

  const seg = (active: boolean) =>
    active
      ? onGreen
        ? 'bg-white text-[#15402f]'
        : 'bg-[#1f5a44] text-white'
      : onGreen
        ? 'text-[rgba(255,255,255,0.78)] hover:text-white'
        : 'text-[#5a6660] hover:text-[#15402f]'

  return (
    <div
      className={`flex shrink-0 items-center gap-[2px] rounded-full border p-[2px] ${track} ${className}`}
      role="group"
      aria-label="Language"
      // Always LTR: this control must not mirror when the app flips to RTL, or the
      // segments swap places under the user's finger between toggles.
      dir="ltr"
    >
      {(['en', 'lsd'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`flex h-[24px] items-center justify-center rounded-full px-[9px] text-[11px] font-bold leading-none tracking-[0.4px] transition-colors ${seg(lang === l)}`}
          style={{ fontFamily: FONT_SANS }}
        >
          {l === 'en' ? 'EN' : 'LSD'}
        </button>
      ))}
    </div>
  )
}
