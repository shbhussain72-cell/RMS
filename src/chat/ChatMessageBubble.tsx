import type { ChatBubble } from './types'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

export default function ChatMessageBubble({ message }: { message: ChatBubble }) {
  const isBot = message.from === 'bot'
  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-[14px] px-[13px] py-[9px] text-[13.5px] leading-[19px] ${
          isBot ? 'rounded-tl-[4px] bg-[#faf8f2] text-[#23302a]' : 'rounded-tr-[4px] bg-[#1f5a44] text-white'
        }`}
        style={{ fontFamily: FONT_SANS }}
      >
        {message.text}
      </div>
    </div>
  )
}
