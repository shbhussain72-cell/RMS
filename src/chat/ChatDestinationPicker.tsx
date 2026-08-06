import QuickReplyRow from './QuickReplyRow'
import type { ChatOption } from './types'

/** In-bubble city/zone chip grid — a scrollable variant of QuickReplyRow, since it lives inside
 *  the chat's own scrolling column rather than a floating anchored popover. */
export default function ChatDestinationPicker({ options, onPick }: { options: ChatOption[]; onPick: (value: string) => void }) {
  return (
    <div className="thin-scrollbar max-h-[220px] overflow-y-auto pr-[2px]">
      <QuickReplyRow options={options} onPick={onPick} />
    </div>
  )
}
