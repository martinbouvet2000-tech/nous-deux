export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  timezone: string
  location_city: string | null
  location_country: string | null
  location_lat: number | null
  location_lng: number | null
  partner_id: string | null
  partner_code: string
  created_at: string
  updated_at: string
}

export interface Mood {
  id: string
  user_id: string
  emoji: string
  label: string | null
  note: string | null
  created_at: string
}

export interface Thought {
  id: string
  sender_id: string
  receiver_id: string
  content: string | null
  image_url: string | null
  is_read: boolean
  created_at: string
}

export interface Tap {
  id: string
  sender_id: string
  receiver_id: string
  created_at: string
}

export interface Countdown {
  id: string
  created_by: string
  title: string
  target_date: string
  emoji: string
  is_active: boolean
  created_at: string
}

export interface CalendarEvent {
  id: string
  created_by: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  is_shared: boolean
  color: string
  created_at: string
}

export interface TodoList {
  id: string
  title: string
  emoji: string
  created_by: string
  created_at: string
}

export interface TodoItem {
  id: string
  list_id: string
  title: string
  is_done: boolean
  assigned_to: string | null
  due_date: string | null
  created_at: string
}

export interface DailyQuestion {
  id: string
  question: string
  category: string
  date: string
  created_at: string
}

export interface QuestionAnswer {
  id: string
  question_id: string
  user_id: string
  answer: string
  created_at: string
}

export interface Gratitude {
  id: string
  user_id: string
  items: string[]
  date: string
  created_at: string
}

export interface Capsule {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  image_url: string | null
  reveal_date: string
  is_opened: boolean
  opened_at: string | null
  created_at: string
}

export interface PhotoAlbum {
  id: string
  title: string
  cover_url: string | null
  created_by: string
  created_at: string
}

export interface Photo {
  id: string
  album_id: string | null
  uploaded_by: string
  url: string
  caption: string | null
  is_favorite: boolean
  taken_at: string | null
  created_at: string
}

export interface WatchItem {
  id: string
  title: string
  type: 'movie' | 'series' | 'documentary'
  poster_url: string | null
  status: 'to_watch' | 'watching' | 'watched'
  rating: number | null
  notes: string | null
  added_by: string
  created_at: string
}

export interface TimelineEvent {
  id: string
  title: string
  description: string | null
  emoji: string
  event_date: string
  photo_url: string | null
  created_by: string
  created_at: string
}

export interface LoveNote {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  is_active: boolean
  created_at: string
}

export interface Streak {
  id: string
  current_count: number
  longest_count: number
  last_activity_date: string | null
  updated_at: string
}

export interface BucketItem {
  id: string
  title: string
  emoji: string
  category: 'travel' | 'experience' | 'milestone' | 'food' | 'creative' | 'other'
  is_done: boolean
  done_date: string | null
  created_by: string
  created_at: string
}
