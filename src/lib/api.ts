const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// ── Token management ────────────────────────────────────────
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('cv_access_token')
}
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('cv_refresh_token')
}
export function setTokens(access: string, refresh: string) {
  localStorage.setItem('cv_access_token', access)
  localStorage.setItem('cv_refresh_token', refresh)
}
export function clearTokens() {
  localStorage.removeItem('cv_access_token')
  localStorage.removeItem('cv_refresh_token')
  localStorage.removeItem('cv_user')
}
export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const s = localStorage.getItem('cv_user')
    return s ? JSON.parse(s) : null
  } catch { return null }
}
export function setStoredUser(u: User) {
  localStorage.setItem('cv_user', JSON.stringify(u))
}

// ── Types ────────────────────────────────────────────────────
export interface User {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
  bio?: string | null
  avatar?: string | null
}

export interface Movie {
  id: string
  tmdbId: number
  title: string
  overview?: string | null
  posterPath?: string | null
  backdropPath?: string | null
  releaseDate?: string | null
  year?: number | null
  rating: number
  voteCount: number
  genres: string[]
  director?: string | null
  cast: string[]
  color?: string | null
  cvRating?: number | null
  cvReviewCount?: number
  watchlistStatus?: string | null
}

export interface Review {
  id: string
  content: string
  rating: number
  movieId: string
  userId: string
  createdAt: string
  updatedAt: string
  likeCount: number
  likedByMe: boolean
  user: { id: string; name: string; avatar?: string | null; role: string }
}

export interface WatchlistItem {
  id: string
  movieId: string
  status: 'PLAN_TO_WATCH' | 'WATCHING' | 'WATCHED' | 'DROPPED'
  createdAt: string
  movie: Movie
}

export interface Notification {
  id: string
  type: 'REVIEW_LIKE' | 'NEW_FOLLOWER' | 'NEW_REVIEW'
  message: string
  read: boolean
  createdAt: string
  data?: any
}

// ── Core fetch with auto refresh ────────────────────────────
async function apiFetch<T>(
  path: string,
  opts: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API}${path}`, { ...opts, headers })

  if (res.status === 401 && retry) {
    // Try refresh
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetch<T>(path, opts, false)
    clearTokens()
    if (typeof window !== 'undefined') window.location.href = '/?auth=expired'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Request failed')
  }

  return res.json()
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const data = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).then(r => r.json())
    if (data.accessToken) {
      setTokens(data.accessToken, data.refreshToken)
      setStoredUser(data.user)
      return true
    }
  } catch {}
  return false
}

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
  register: (name: string, email: string, password: string) =>
    apiFetch<{ user: User; accessToken: string; refreshToken: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    apiFetch<{ user: User; accessToken: string; refreshToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: async () => {
    const refreshToken = getRefreshToken()
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {})
    clearTokens()
  },
}

// ── Movies ───────────────────────────────────────────────────
export const movies = {
  trending: () => apiFetch<{ results: Movie[] }>('/api/movies/trending'),
  search: (q: string) => apiFetch<{ results: Movie[]; total?: number }>(`/api/movies/search?q=${encodeURIComponent(q)}`),
  get: (tmdbId: number | string) => apiFetch<Movie>(`/api/movies/${tmdbId}`),
}

// ── Reviews ──────────────────────────────────────────────────
export const reviews = {
  getForMovie: (movieId: string, page = 1) =>
    apiFetch<{ reviews: Review[]; total: number; pages: number }>(`/api/reviews/${movieId}?page=${page}`),
  create: (data: { content: string; rating: number; movieId: string }) =>
    apiFetch<Review>('/api/reviews', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { content?: string; rating?: number }) =>
    apiFetch<Review>(`/api/reviews/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/api/reviews/${id}`, { method: 'DELETE' }),
  like: (id: string) =>
    apiFetch<{ liked: boolean; likeCount: number }>(`/api/reviews/${id}/like`, { method: 'POST' }),
}

// ── Watchlist ────────────────────────────────────────────────
export const watchlist = {
  get: () => apiFetch<WatchlistItem[]>('/api/watchlist'),
  add: (movieId: string, status?: string) =>
    apiFetch<WatchlistItem>('/api/watchlist', { method: 'POST', body: JSON.stringify({ movieId, status }) }),
  update: (id: string, status: string) =>
    apiFetch<WatchlistItem>(`/api/watchlist/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  remove: (id: string) =>
    apiFetch<{ message: string }>(`/api/watchlist/${id}`, { method: 'DELETE' }),
}

// ── Users ────────────────────────────────────────────────────
export const users = {
  getProfile: (id: string) => apiFetch<any>(`/api/users/${id}/profile`),
  follow: (id: string) =>
    apiFetch<{ following: boolean }>(`/api/users/${id}/follow`, { method: 'POST' }),
}

// ── Notifications ────────────────────────────────────────────
export const notifications = {
  get: () => apiFetch<{ notifications: Notification[]; unreadCount: number }>('/api/notifications'),
  readAll: () => apiFetch<{ message: string }>('/api/notifications/read-all', { method: 'PUT' }),
}

// ── Admin ────────────────────────────────────────────────────
export const admin = {
  getStats: () => apiFetch<any>('/api/admin/stats'),
  getUsers: () => apiFetch<any[]>('/api/admin/users'),
  deleteUser: (id: string) => apiFetch<any>(`/api/admin/users/${id}`, { method: 'DELETE' }),
}
