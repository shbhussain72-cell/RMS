/**
 * identity.ts — a name on your work. NOT a login, and the UI has to say so.
 *
 * Anyone with the link can post as anyone. There is no password, no session, no server-side
 * check, and nothing here should ever be described as one. That is acceptable for six known
 * reviewers behind Deployment Protection, and it stops being acceptable the moment somebody
 * believes it is authentication — so `IDENTITY_DISCLAIMER` is exported next to the value and
 * is rendered wherever the name is set or shown.
 *
 * Reuses `rms-remark-author`, the key the local-only build already wrote, so a reviewer who
 * has been using the tool keeps their name instead of being asked again.
 */
export const AUTHOR_KEY = 'rms-remark-author'

export const IDENTITY_DISCLAIMER =
  'This is a label on your remarks, not a login. Anyone with this link can type any name.'

const listeners = new Set<() => void>()

export function getAuthor(): string {
  try {
    return (localStorage.getItem(AUTHOR_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function setAuthor(name: string): void {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80)
  try {
    if (clean) localStorage.setItem(AUTHOR_KEY, clean)
    else localStorage.removeItem(AUTHOR_KEY)
  } catch { /* private mode — the name lives for this session only */ }
  listeners.forEach((fn) => fn())
}

export function subscribeAuthor(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * Has the reviewer given a name yet?
 *
 * The panels ask once, on first use, and block writing until it is answered. Defaulting to
 * "reviewer" instead would be worse than asking: six people sharing one label makes the
 * author field on every record useless, and it is the only attribution this design has.
 */
export const hasAuthor = (): boolean => getAuthor().length > 0
