/**
 * In-browser events.
 *
 * Marking a conversation as read produces no Realtime event (it is an UPDATE
 * on `conversation_participants`, which is not published). The open
 * conversation therefore notifies the sidebar directly.
 */
export const CONVERSATION_READ_EVENT = 'mutechat:conversation-read'

export function emitConversationRead() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CONVERSATION_READ_EVENT))
}
