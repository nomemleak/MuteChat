/**
 * MuteChat domain types.
 *
 * Hand-written mirror of the schema defined in `supabase/setup.sql`.
 * Single source of truth: do not duplicate these shapes elsewhere.
 */

export type FriendshipStatus = 'pending' | 'accepted'

export type Profile = {
  id: string
  username: string
  avatar_url: string | null
  created_at: string
}

export type Friendship = {
  id: string
  /** Who sent the request */
  user_id_1: string
  /** Who received the request */
  user_id_2: string
  status: FriendshipStatus
  created_at: string
}

export type Conversation = {
  id: string
  created_at: string
}

export type ConversationParticipant = {
  conversation_id: string
  user_id: string
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  gif_url: string
  created_at: string
}

/** A friendship as shown in the sidebar, from the current user's point of view. */
export type FriendEntry = {
  friendshipId: string
  status: FriendshipStatus
  /** true when the current user sent the request */
  outgoing: boolean
  friendId: string
  friendUsername: string
  friendAvatarUrl: string | null
  /** Messages received since the last read (0 if no conversation exists yet). */
  unreadCount: number
  /** Date of the latest message, used to sort the list. */
  lastMessageAt: string | null
}

/** Row returned by the `get_friends_overview` RPC. */
export type FriendOverviewRow = {
  friend_id: string
  conversation_id: string
  last_message_at: string | null
  unread_count: number
}

/** Result of the `send_friend_request` RPC. */
export type FriendRequestResult =
  | 'sent'
  | 'accepted'
  | 'already_pending'
  | 'already_friends'

/** A GIF returned by `/api/gifs`. */
export type Gif = {
  id: string
  title: string
  url: string
  previewUrl: string
  width: number
  height: number
}
