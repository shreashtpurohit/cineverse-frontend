import { useState, useEffect, useRef, createContext, useContext } from "react"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { io } from "socket.io-client"

/* ─────────────── CONFIG ─────────────── */
const API = import.meta.env.VITE_API_URL || "http://localhost:4000"

/* ─────────────── THEME ─────────────── */
const T = {
  bg: '#070910', surface: '#0d0f15', card: '#111318',
  border: '#1c1f28', border2: '#252830',
  accent: '#6c8cff', accentDim: 'rgba(108,140,255,0.12)', accentBorder: 'rgba(108,140,255,0.25)',
  gold: '#f0c060', goldDim: 'rgba(240,192,96,0.12)', goldBorder: 'rgba(240,192,96,0.25)',
  green: '#4ecb8d', greenDim: 'rgba(78,203,141,0.12)', greenBorder: 'rgba(78,203,141,0.25)',
  red: '#ff6b6b', redDim: 'rgba(255,107,107,0.12)',
  purple: '#b06cff', purpleDim: 'rgba(176,108,255,0.12)',
  orange: '#ff9f5a', orangeDim: 'rgba(255,159,90,0.12)',
  text: '#e8eaf0', muted: '#5a5f72', muted2: '#8890a8',
}
const G = {
  body: { margin: 0, padding: 0, background: T.bg, color: T.text, fontFamily: "'Inter', sans-serif", minHeight: '100vh' },
  syne: { fontFamily: "'Syne', sans-serif" },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
}

/* ─────────────── TOKEN HELPERS ─────────────── */
const getToken = () => localStorage.getItem("cv_token")
const getRefreshToken = () => localStorage.getItem("cv_refresh")
const setTokens = (a, r) => { localStorage.setItem("cv_token", a); localStorage.setItem("cv_refresh", r) }
const clearTokens = () => { localStorage.removeItem("cv_token"); localStorage.removeItem("cv_refresh"); localStorage.removeItem("cv_user") }
const getStoredUser = () => { try { const s = localStorage.getItem("cv_user"); return s ? JSON.parse(s) : null } catch { return null } }
const setStoredUser = (u) => localStorage.setItem("cv_user", JSON.stringify(u))

/* ─────────────── API CLIENT ─────────────── */
async function apiFetch(path, opts = {}, retry = true) {
  const token = getToken()
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, { ...opts, headers })
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetch(path, opts, false)
    clearTokens()
    window.location.reload()
    throw new Error("Session expired")
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }))
    throw new Error(err.error || "Request failed")
  }
  return res.json()
}

async function tryRefresh() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const data = await fetch(`${API}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).then(r => r.json())
    if (data.accessToken) { setTokens(data.accessToken, data.refreshToken); setStoredUser(data.user); return true }
  } catch {}
  return false
}

const apiAuth = {
  login: (email, password) => apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name, email, password) => apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: async () => { await fetch(`${API}/api/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: getRefreshToken() }) }).catch(() => {}); clearTokens() },
}
const apiMovies = {
  trending: () => apiFetch("/api/movies/trending"),
  search: (q) => apiFetch(`/api/movies/search?q=${encodeURIComponent(q)}`),
  get: (tmdbId) => apiFetch(`/api/movies/${tmdbId}`),
}
const apiReviews = {
  getForMovie: (movieId) => apiFetch(`/api/reviews/${movieId}`),
  create: (data) => apiFetch("/api/reviews", { method: "POST", body: JSON.stringify(data) }),
  delete: (id) => apiFetch(`/api/reviews/${id}`, { method: "DELETE" }),
  like: (id) => apiFetch(`/api/reviews/${id}/like`, { method: "POST" }),
}
const apiWatchlist = {
  get: () => apiFetch("/api/watchlist"),
  add: (movieId) => apiFetch("/api/watchlist", { method: "POST", body: JSON.stringify({ movieId }) }),
  update: (id, status) => apiFetch(`/api/watchlist/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
  remove: (id) => apiFetch(`/api/watchlist/${id}`, { method: "DELETE" }),
}
const apiNotifications = {
  get: () => apiFetch("/api/notifications"),
  readAll: () => apiFetch("/api/notifications/read-all", { method: "PUT" }),
}
const apiAdmin = {
  getStats: () => apiFetch("/api/admin/stats"),
  deleteUser: (id) => apiFetch(`/api/admin/users/${id}`, { method: "DELETE" }),
}

/* ─────────────── AUTH CONTEXT ─────────────── */
const AuthContext = createContext(null)
function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  useEffect(() => { const u = getStoredUser(); if (u) setUser(u); setAuthLoading(false) }, [])
  const login = async (email, password) => {
    const data = await apiAuth.login(email, password)
    setTokens(data.accessToken, data.refreshToken)
    setStoredUser(data.user)
    setUser(data.user)
  }
  const register = async (name, email, password) => {
    const data = await apiAuth.register(name, email, password)
    setTokens(data.accessToken, data.refreshToken)
    setStoredUser(data.user)
    setUser(data.user)
  }
  const logout = async () => { await apiAuth.logout(); setUser(null) }
  return <AuthContext.Provider value={{ user, authLoading, login, register, logout }}>{children}</AuthContext.Provider>
}
const useAuth = () => useContext(AuthContext)

/* ─────────────── HELPERS ─────────────── */
function Stars({ rating, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? T.gold : T.border2 }}>★</span>
      ))}
    </span>
  )
}

function Pill({ children, color = 'blue' }) {
  const map = { blue: [T.accentDim, T.accent, T.accentBorder], green: [T.greenDim, T.green, T.greenBorder], gold: [T.goldDim, T.gold, T.goldBorder], purple: [T.purpleDim, T.purple, 'rgba(176,108,255,0.25)'], red: [T.redDim, T.red, 'rgba(255,107,107,0.25)'], orange: [T.orangeDim, T.orange, 'rgba(255,159,90,0.25)'] }
  const [bg, fg, border] = map[color] || map.blue
  return <span style={{ background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 3, padding: '2px 8px', fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", display: 'inline-flex', alignItems: 'center' }}>{children}</span>
}

function Avatar({ letter, size = 36 }) {
  const colors = { R: T.accent, P: T.purple, A: T.green, K: T.gold, D: T.orange }
  const bg = colors[letter?.toUpperCase()] || T.muted2
  return <div style={{ width: size, height: size, borderRadius: '50%', background: `${bg}22`, border: `1px solid ${bg}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: bg, flexShrink: 0, fontFamily: "'Syne', sans-serif" }}>{letter?.toUpperCase()}</div>
}

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.card, border: `1px solid ${T.greenBorder}`, borderLeft: `3px solid ${T.green}`, borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 1000, maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'slideIn 0.3s ease' }}>
      <span style={{ fontSize: 18 }}>🔔</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.green, fontFamily: "'Syne', sans-serif" }}>Notification</div>
        <div style={{ fontSize: 12, color: T.muted2, marginTop: 2 }}>{msg}</div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', marginLeft: 'auto', fontSize: 16 }}>×</button>
    </div>
  )
}

function Spinner() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div style={{ width: 32, height: 32, border: `2px solid ${T.border2}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /></div>
}

function MoviePoster({ movie, size = 200 }) {
  if (movie.posterPath) return <img src={movie.posterPath} alt={movie.title} style={{ width: '100%', height: size, objectFit: 'cover', display: 'block' }} />
  return <div style={{ height: size, background: `linear-gradient(135deg, ${movie.color || '#1a2040'}, ${T.accent}22)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 52 }}>🎬</span></div>
}

/* ─────────────── NAV ─────────────── */
function Nav({ page, setPage, watchlistCount }) {
  const { user, logout } = useAuth()
  const [notifCount, setNotifCount] = useState(0)
  const [notifList, setNotifList] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)

  useEffect(() => {
    if (!user) { setNotifCount(0); return }
    apiNotifications.get().then(d => { setNotifCount(d.unreadCount); setNotifList(d.notifications) }).catch(() => {})
  }, [user, page])

  const handleMarkRead = async () => {
    await apiNotifications.readAll().catch(() => {})
    setNotifCount(0)
    setNotifList(nl => nl.map(n => ({ ...n, read: true })))
    setShowNotifs(false)
  }

  const tabs = [
    { id: 'home', label: 'HOME' },
    { id: 'search', label: 'SEARCH' },
    { id: 'watchlist', label: `WATCHLIST${watchlistCount ? ` (${watchlistCount})` : ''}` },
    ...(user?.role === 'ADMIN' ? [{ id: 'admin', label: 'ADMIN' }] : []),
  ]

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,9,16,0.97)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
        <div onClick={() => setPage('home')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '14px 0', marginRight: 16, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎬</div>
          <span style={{ ...G.syne, fontWeight: 800, fontSize: 16, background: `linear-gradient(135deg, ${T.text}, ${T.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>CineVerse</span>
        </div>
        <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setPage(t.id)} style={{ padding: '14px 16px', ...G.mono, fontSize: 10.5, letterSpacing: 1, color: page === t.id ? T.accent : T.muted, background: 'none', border: 'none', borderBottom: `2px solid ${page === t.id ? T.accent : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {user && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowNotifs(!showNotifs)} style={{ ...G.mono, fontSize: 10, color: notifCount > 0 ? T.gold : T.muted, background: 'none', border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 10px', cursor: 'pointer' }}>
                🔔{notifCount > 0 ? ` ${notifCount}` : ''}
              </button>
              {showNotifs && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 300, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 200 }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...G.syne, fontSize: 13, fontWeight: 700, color: T.text }}>Notifications</span>
                    {notifCount > 0 && <button onClick={handleMarkRead} style={{ ...G.mono, fontSize: 10, color: T.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Mark all read</button>}
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {notifList.length === 0
                      ? <div style={{ padding: '20px 16px', fontSize: 13, color: T.muted, textAlign: 'center' }}>No notifications yet</div>
                      : notifList.map(n => (
                        <div key={n.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, background: n.read ? 'transparent' : T.accentDim }}>
                          <div style={{ fontSize: 13, color: T.text }}>{n.message}</div>
                          <div style={{ ...G.mono, fontSize: 10, color: T.muted, marginTop: 3 }}>{new Date(n.createdAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar letter={user.name[0]} size={30} />
              <span style={{ fontSize: 12, color: T.muted2 }}>{user.name}</span>
              {user.role === 'ADMIN' && <Pill color="purple">ADMIN</Pill>}
              <button onClick={() => logout().then(() => setPage('home'))} style={{ ...G.mono, fontSize: 10, color: T.muted, background: 'none', border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}>LOGOUT</button>
            </div>
          ) : (
            <button onClick={() => setPage('auth')} style={{ ...G.mono, fontSize: 10.5, color: T.accent, background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 4, padding: '7px 14px', cursor: 'pointer', letterSpacing: 0.5 }}>LOGIN →</button>
          )}
        </div>
      </div>
    </nav>
  )
}

/* ─────────────── MOVIE CARD ─────────────── */
function MovieCard({ movie, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={() => onClick(movie)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: T.card, border: `1px solid ${hov ? T.accentBorder : T.border}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s', transform: hov ? 'translateY(-2px)' : 'none', boxShadow: hov ? `0 8px 32px rgba(108,140,255,0.1)` : 'none' }}>
      <div style={{ position: 'relative', borderBottom: `1px solid ${T.border}` }}>
        <MoviePoster movie={movie} size={200} />
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.7)', borderRadius: 3, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: T.gold, fontSize: 11 }}>★</span>
          <span style={{ ...G.mono, fontSize: 11, color: T.text }}>{movie.rating}</span>
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(movie.genres || movie.genre || []).slice(0, 2).map(g => <Pill key={g} color="blue">{g}</Pill>)}
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ ...G.syne, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>{movie.title}</div>
        <div style={{ ...G.mono, fontSize: 10, color: T.muted, marginBottom: 8 }}>{movie.year} · {movie.director || 'Unknown'}</div>
        <p style={{ fontSize: 12, color: T.muted2, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0 }}>{movie.overview}</p>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stars rating={movie.rating / 2} size={12} />
          <span style={{ ...G.mono, fontSize: 10, color: T.muted }}>{(movie.voteCount || movie.votes || 0).toLocaleString()} votes</span>
        </div>
      </div>
    </div>
  )
}

/* ─────────────── HOME ─────────────── */
function Home({ setPage, setSelectedMovie, showToast }) {
  const { user } = useAuth()
  const [trendingMovies, setTrendingMovies] = useState([])
  const [recentReviews, setRecentReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiMovies.trending()
      .then(d => setTrendingMovies(d.results || []))
      .catch(() => setError('Could not load movies. Make sure the backend is running on port 4000.'))
      .finally(() => setLoading(false))
  }, [])

  const featured = trendingMovies[2] || trendingMovies[0]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
      <div style={{ padding: '60px 0 48px', borderBottom: `1px solid ${T.border}`, backgroundImage: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(108,140,255,0.06) 0%, transparent 70%)' }}>
        <div style={{ ...G.mono, fontSize: 10, letterSpacing: 3, color: T.accent, textTransform: 'uppercase', marginBottom: 16 }}>— MOVIE REVIEW PLATFORM</div>
        <h1 style={{ ...G.syne, fontSize: 'clamp(32px, 5vw, 54px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 12, background: `linear-gradient(135deg, ${T.text} 0%, ${T.accent} 60%, ${T.purple} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: '0 0 12px' }}>
          Your Cinema,<br />Your Reviews.
        </h1>
        <p style={{ color: T.muted2, fontSize: 15, maxWidth: 520, marginBottom: 28 }}>Discover films, write reviews, build your watchlist, and get real-time notifications.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setPage('search')} style={{ ...G.syne, fontWeight: 600, fontSize: 13, background: T.accent, color: '#fff', border: 'none', borderRadius: 5, padding: '12px 24px', cursor: 'pointer' }}>Search Movies →</button>
          {!user && <button onClick={() => setPage('auth')} style={{ ...G.syne, fontWeight: 600, fontSize: 13, background: 'transparent', color: T.text, border: `1px solid ${T.border2}`, borderRadius: 5, padding: '12px 24px', cursor: 'pointer' }}>Create Account</button>}
        </div>
      </div>

      {error && <div style={{ background: T.redDim, border: '1px solid rgba(255,107,107,0.2)', borderRadius: 6, padding: '14px 18px', color: T.red, fontSize: 13, margin: '24px 0' }}>⚠️ {error}</div>}

      {featured && (
        <div style={{ padding: '48px 0 0', marginBottom: 40 }}>
          <div style={{ ...G.mono, fontSize: 10, letterSpacing: 3, color: T.muted2, textTransform: 'uppercase', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            FEATURED <span style={{ flex: 1, height: 1, background: T.border, display: 'inline-block' }} />
          </div>
          <div onClick={() => { setSelectedMovie(featured); setPage('movie') }}
            style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', display: 'grid', gridTemplateColumns: '280px 1fr', transition: 'border-color 0.2s' }}>
            <div style={{ minHeight: 220 }}><MoviePoster movie={featured} size={280} /></div>
            <div style={{ padding: 32 }}>
              <Pill color="red">EDITOR'S PICK</Pill>
              <h2 style={{ ...G.syne, fontSize: 28, fontWeight: 800, color: T.text, margin: '12px 0 8px' }}>{featured.title}</h2>
              <div style={{ ...G.mono, fontSize: 11, color: T.muted, marginBottom: 12 }}>{featured.year} · {featured.director}</div>
              <p style={{ fontSize: 14, color: T.muted2, lineHeight: 1.7, marginBottom: 16 }}>{featured.overview}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Stars rating={featured.rating / 2} size={16} />
                <span style={{ color: T.gold, fontWeight: 700, fontSize: 18, ...G.syne }}>{featured.rating}</span>
                <span style={{ ...G.mono, fontSize: 11, color: T.muted }}>{(featured.voteCount || 0).toLocaleString()} votes</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(featured.genres || []).map(g => <Pill key={g} color="red">{g}</Pill>)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...G.mono, fontSize: 10, letterSpacing: 3, color: T.muted2, textTransform: 'uppercase', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        TRENDING NOW <span style={{ flex: 1, height: 1, background: T.border, display: 'inline-block' }} />
      </div>
      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16, marginBottom: 48 }}>
          {trendingMovies.map(m => <MovieCard key={m.id || m.tmdbId} movie={m} onClick={mov => { setSelectedMovie(mov); setPage('movie') }} />)}
        </div>
      )}
    </div>
  )
}

/* ─────────────── SEARCH ─────────────── */
function Search({ setPage, setSelectedMovie }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef()

  const handleSearch = (val) => {
    setQ(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setResults([]); setSearched(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await apiMovies.search(val)
        setResults(data.results || [])
        setSearched(true)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 400)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
      <div style={{ marginBottom: 8, ...G.mono, fontSize: 10, letterSpacing: 3, color: T.accent, textTransform: 'uppercase' }}>02 — SEARCH</div>
      <h2 style={{ ...G.syne, fontSize: 32, fontWeight: 800, color: T.text, marginBottom: 8 }}>Find Movies</h2>
      <p style={{ color: T.muted2, fontSize: 14, marginBottom: 32 }}>Search by title, genre, or director. Powered by TMDB API.</p>
      <div style={{ position: 'relative', marginBottom: 32 }}>
        <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: T.muted, fontSize: 18 }}>🔍</span>
        <input value={q} onChange={e => handleSearch(e.target.value)} placeholder="Search movies, directors, genres..." autoFocus
          style={{ width: '100%', background: T.card, border: `1px solid ${T.border2}`, borderRadius: 6, padding: '14px 16px 14px 46px', color: T.text, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: "'Inter', sans-serif" }}
          onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border2} />
        {q && <button onClick={() => handleSearch('')} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 18 }}>×</button>}
      </div>
      {loading ? <Spinner /> : searched && results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <div style={{ ...G.syne, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>No movies found</div>
          <p style={{ color: T.muted2, fontSize: 14 }}>Try a different search term</p>
        </div>
      ) : results.length > 0 ? (
        <>
          <div style={{ ...G.mono, fontSize: 11, color: T.muted, marginBottom: 16 }}>{results.length} results for "{q}"</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
            {results.map(m => <MovieCard key={m.id || m.tmdbId} movie={m} onClick={mov => { setSelectedMovie(mov); setPage('movie') }} />)}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 0', color: T.muted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
          <div style={{ ...G.syne, fontSize: 20, color: T.muted2 }}>Search for any movie</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Powered by The Movie Database (TMDB)</div>
        </div>
      )}
    </div>
  )
}

/* ─────────────── MOVIE DETAIL ─────────────── */
function MovieDetail({ movie, setPage, showToast, onWatchlistChange }) {
  const { user } = useAuth()
  const [fullMovie, setFullMovie] = useState(movie)
  const [movieReviews, setMovieReviews] = useState([])
  const [loadingReviews, setLoadingReviews] = useState(true)
  const [activeTab, setActiveTab] = useState('reviews')
  const [newReview, setNewReview] = useState('')
  const [newRating, setNewRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [watchStatus, setWatchStatus] = useState(null)
  const [watchItemId, setWatchItemId] = useState(null)
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    const id = movie.tmdbId || movie.id
    apiMovies.get(id).then(m => { setFullMovie(m); setWatchStatus(m.watchlistStatus || null) }).catch(() => {})
  }, [movie.tmdbId, movie.id])

  useEffect(() => {
    if (!fullMovie.id) return
    apiReviews.getForMovie(fullMovie.id)
      .then(d => setMovieReviews(d.reviews || []))
      .catch(() => {})
      .finally(() => setLoadingReviews(false))
  }, [fullMovie.id])

  useEffect(() => {
    if (!user || !fullMovie.id) return
    apiWatchlist.get().then(items => {
      const item = items.find(i => i.movieId === fullMovie.id)
      if (item) { setWatchItemId(item.id); setWatchStatus(item.status) }
    }).catch(() => {})
  }, [user, fullMovie.id])

  const handleWatchlist = async () => {
    if (!user) { setPage('auth'); return }
    try {
      if (watchStatus && watchItemId) {
        await apiWatchlist.remove(watchItemId)
        setWatchStatus(null); setWatchItemId(null)
        showToast(`Removed "${fullMovie.title}" from watchlist`)
      } else {
        const item = await apiWatchlist.add(fullMovie.id)
        setWatchStatus(item.status); setWatchItemId(item.id)
        showToast(`Added "${fullMovie.title}" to watchlist! 🎬`)
      }
      if (onWatchlistChange) onWatchlistChange()
    } catch (e) { showToast(e.message || 'Error updating watchlist') }
  }

  const handleLike = async (reviewId) => {
    if (!user) { setPage('auth'); return }
    try {
      const data = await apiReviews.like(reviewId)
      setMovieReviews(rs => rs.map(r => r.id === reviewId ? { ...r, likedByMe: data.liked, likeCount: data.likeCount } : r))
    } catch {}
  }

  const submitReview = async () => {
    if (!newReview.trim() || !newRating) return
    if (!user) { setPage('auth'); return }
    if (newReview.length < 10) { setReviewError('Review must be at least 10 characters'); return }
    setSubmitting(true); setReviewError('')
    try {
      const review = await apiReviews.create({ content: newReview, rating: newRating, movieId: fullMovie.id })
      setMovieReviews(prev => [review, ...prev])
      setNewReview(''); setNewRating(0); setActiveTab('reviews')
      showToast('Review posted! 🎉')
    } catch (e) { setReviewError(e.message || 'Failed to post review') }
    finally { setSubmitting(false) }
  }

  const handleDeleteReview = async (reviewId) => {
    try {
      await apiReviews.delete(reviewId)
      setMovieReviews(rs => rs.filter(r => r.id !== reviewId))
      showToast('Review deleted')
    } catch {}
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
      <button onClick={() => setPage('home')} style={{ ...G.mono, fontSize: 11, color: T.muted2, background: 'none', border: 'none', cursor: 'pointer', padding: '20px 0', display: 'flex', alignItems: 'center', gap: 6 }}>← BACK TO HOME</button>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 32, display: 'grid', gridTemplateColumns: '260px 1fr' }}>
        <div><MoviePoster movie={fullMovie} size={380} /></div>
        <div style={{ padding: 32 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {(fullMovie.genres || []).map(g => <Pill key={g} color="blue">{g}</Pill>)}
          </div>
          <h1 style={{ ...G.syne, fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: T.text, margin: '0 0 8px' }}>{fullMovie.title}</h1>
          <div style={{ ...G.mono, fontSize: 11, color: T.muted, marginBottom: 16 }}>{fullMovie.year} · Directed by {fullMovie.director || 'Unknown'}</div>
          <p style={{ color: T.muted2, fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>{fullMovie.overview}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <Stars rating={fullMovie.rating / 2} size={18} />
            <span style={{ ...G.syne, fontSize: 24, fontWeight: 800, color: T.gold }}>{fullMovie.rating}</span>
            <span style={{ ...G.mono, fontSize: 11, color: T.muted }}>{(fullMovie.voteCount || 0).toLocaleString()} votes</span>
          </div>
          {(fullMovie.cast || []).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...G.mono, fontSize: 9, color: T.muted, letterSpacing: 1, marginBottom: 8 }}>CAST</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {fullMovie.cast.slice(0, 6).map(c => <Pill key={c} color="gold">{c}</Pill>)}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => { if (!user) { setPage('auth'); return }; setActiveTab('write') }}
              style={{ ...G.syne, fontWeight: 600, fontSize: 12, background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`, color: '#fff', border: 'none', borderRadius: 5, padding: '9px 18px', cursor: 'pointer' }}>
              ✍️ Write Review
            </button>
            <button onClick={handleWatchlist}
              style={{ ...G.syne, fontWeight: 600, fontSize: 12, background: watchStatus ? T.goldDim : T.accentDim, color: watchStatus ? T.gold : T.accent, border: `1px solid ${watchStatus ? T.goldBorder : T.accentBorder}`, borderRadius: 5, padding: '9px 18px', cursor: 'pointer' }}>
              {watchStatus ? '✓ In Watchlist' : '+ Add to Watchlist'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ borderBottom: `1px solid ${T.border}`, marginBottom: 28 }}>
        {['reviews', 'write'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ ...G.mono, fontSize: 11, letterSpacing: 1, padding: '12px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? T.accent : 'transparent'}`, color: activeTab === tab ? T.accent : T.muted, cursor: 'pointer', textTransform: 'uppercase' }}>
            {tab === 'reviews' ? `Reviews (${movieReviews.length})` : 'Write a Review'}
          </button>
        ))}
      </div>

      {activeTab === 'reviews' ? (
        loadingReviews ? <Spinner /> : movieReviews.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', border: `1px dashed ${T.border2}`, borderRadius: 8 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✍️</div>
            <div style={{ ...G.syne, fontSize: 16, fontWeight: 700, color: T.text }}>No reviews yet — be the first!</div>
            <button onClick={() => setActiveTab('write')} style={{ marginTop: 16, ...G.syne, fontWeight: 600, fontSize: 13, background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: '10px 20px', cursor: 'pointer' }}>Write a Review</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {movieReviews.map(r => (
              <div key={r.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Avatar letter={r.user?.name?.[0] || '?'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ ...G.syne, fontSize: 14, fontWeight: 700, color: T.text }}>{r.user?.name}</span>
                      {r.user?.role === 'ADMIN' && <Pill color="purple">ADMIN</Pill>}
                      <span style={{ marginLeft: 'auto', ...G.mono, fontSize: 10, color: T.muted }}>{new Date(r.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <Stars rating={r.rating} size={14} />
                    <p style={{ fontSize: 14, color: T.muted2, lineHeight: 1.7, marginTop: 10 }}>{r.content}</p>
                    <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button onClick={() => handleLike(r.id)}
                        style={{ background: r.likedByMe ? T.accentDim : T.redDim, border: `1px solid ${r.likedByMe ? T.accentBorder : 'rgba(255,107,107,0.2)'}`, color: r.likedByMe ? T.accent : T.red, borderRadius: 3, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>
                        ♥ {r.likeCount || 0}
                      </button>
                      {(user?.id === r.userId || user?.role === 'ADMIN') && (
                        <button onClick={() => handleDeleteReview(r.id)} style={{ ...G.mono, fontSize: 10, color: T.red, background: T.redDim, border: '1px solid rgba(255,107,107,0.2)', borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}>DELETE</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: 24 }}>
          <div style={{ ...G.syne, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 20 }}>Your Rating</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <button key={i} onMouseEnter={() => setHoverRating(i)} onMouseLeave={() => setHoverRating(0)} onClick={() => setNewRating(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 32, color: i <= (hoverRating || newRating) ? T.gold : T.border2, transition: 'color 0.15s' }}>★</button>
            ))}
            {newRating > 0 && <span style={{ ...G.mono, fontSize: 12, color: T.gold, alignSelf: 'center', marginLeft: 8 }}>{newRating}.0 / 5.0</span>}
          </div>
          <textarea value={newReview} onChange={e => setNewReview(e.target.value)} placeholder="Share your thoughts about this film..." rows={5}
            style={{ width: '100%', background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 6, padding: 16, color: T.text, fontSize: 14, fontFamily: "'Inter', sans-serif", resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.7 }} />
          {!user && <div style={{ background: T.goldDim, border: `1px solid ${T.goldBorder}`, borderRadius: 4, padding: '10px 14px', fontSize: 13, color: T.gold, marginTop: 12 }}>⚠️ Login karo to post a review</div>}
          {reviewError && <div style={{ background: T.redDim, border: '1px solid rgba(255,107,107,0.2)', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: T.red, marginTop: 12 }}>{reviewError}</div>}
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button onClick={submitReview} disabled={!newReview.trim() || !newRating || submitting}
              style={{ ...G.syne, fontWeight: 600, fontSize: 13, background: newReview.trim() && newRating && !submitting ? T.accent : T.border, color: newReview.trim() && newRating && !submitting ? '#fff' : T.muted, border: 'none', borderRadius: 5, padding: '11px 24px', cursor: newReview.trim() && newRating ? 'pointer' : 'default', transition: 'all 0.2s' }}>
              {submitting ? 'Posting...' : 'Post Review'}
            </button>
            <button onClick={() => { setNewReview(''); setNewRating(0) }} style={{ ...G.syne, fontSize: 13, background: 'none', color: T.muted2, border: `1px solid ${T.border}`, borderRadius: 5, padding: '11px 20px', cursor: 'pointer' }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────── WATCHLIST ─────────────── */
const STATUS_LABELS = { PLAN_TO_WATCH: { label: 'Plan to Watch', color: 'blue' }, WATCHING: { label: 'Watching', color: 'orange' }, WATCHED: { label: 'Watched', color: 'green' }, DROPPED: { label: 'Dropped', color: 'red' } }

function Watchlist({ setPage, setSelectedMovie, showToast, onWatchlistChange }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    if (!user) return
    apiWatchlist.get().then(setItems).catch(() => {}).finally(() => setLoading(false))
  }, [user])

  if (!user) return (
    <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
      <h2 style={{ ...G.syne, fontSize: 24, color: T.text, marginBottom: 12 }}>Sign in to see your watchlist</h2>
      <button onClick={() => setPage('auth')} style={{ ...G.syne, fontWeight: 700, fontSize: 14, background: T.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '12px 28px', cursor: 'pointer' }}>Login →</button>
    </div>
  )

  const handleStatusChange = async (item, newStatus) => {
    try {
      const updated = await apiWatchlist.update(item.id, newStatus)
      setItems(prev => prev.map(i => i.id === item.id ? updated : i))
      showToast(`Status updated to ${STATUS_LABELS[newStatus]?.label}`)
    } catch (e) { showToast(e.message || 'Error') }
  }

  const handleRemove = async (item) => {
    try {
      await apiWatchlist.remove(item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      showToast('Removed from watchlist')
      if (onWatchlistChange) onWatchlistChange()
    } catch {}
  }

  const filtered = filter === 'ALL' ? items : items.filter(i => i.status === filter)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
      <div style={{ ...G.mono, fontSize: 10, letterSpacing: 3, color: T.gold, textTransform: 'uppercase', marginBottom: 8 }}>04 — WATCHLIST</div>
      <h2 style={{ ...G.syne, fontSize: 32, fontWeight: 800, color: T.text, marginBottom: 8 }}>Your Watchlist</h2>
      <p style={{ color: T.muted2, fontSize: 14, marginBottom: 28 }}>{items.length} movie{items.length !== 1 ? 's' : ''} saved</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        {['ALL', ...Object.keys(STATUS_LABELS)].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ ...G.mono, fontSize: 10, letterSpacing: 1, padding: '6px 14px', background: filter === s ? T.accentDim : 'none', color: filter === s ? T.accent : T.muted, border: `1px solid ${filter === s ? T.accentBorder : T.border}`, borderRadius: 4, cursor: 'pointer' }}>
            {s === 'ALL' ? 'ALL' : STATUS_LABELS[s].label.toUpperCase()}
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', border: `1px dashed ${T.border2}`, borderRadius: 10 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📽️</div>
          <div style={{ ...G.syne, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 8 }}>{filter === 'ALL' ? 'Your watchlist is empty' : `No ${STATUS_LABELS[filter]?.label} movies`}</div>
          <button onClick={() => setPage('search')} style={{ ...G.syne, fontWeight: 600, fontSize: 13, background: T.accent, color: '#fff', border: 'none', borderRadius: 5, padding: '12px 24px', cursor: 'pointer', marginTop: 16 }}>Discover Movies →</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map(item => (
            <div key={item.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ cursor: 'pointer' }} onClick={() => { setSelectedMovie(item.movie); setPage('movie') }}>
                <MoviePoster movie={item.movie} size={160} />
              </div>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ ...G.syne, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4, cursor: 'pointer' }} onClick={() => { setSelectedMovie(item.movie); setPage('movie') }}>{item.movie.title}</div>
                <div style={{ ...G.mono, fontSize: 10, color: T.muted, marginBottom: 12 }}>{item.movie.year}</div>
                <select value={item.status} onChange={e => handleStatusChange(item, e.target.value)}
                  style={{ width: '100%', background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 4, padding: '7px 10px', color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', outline: 'none', marginBottom: 10 }}>
                  {Object.entries(STATUS_LABELS).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
                </select>
                <button onClick={() => handleRemove(item)} style={{ ...G.mono, fontSize: 10, color: T.red, background: T.redDim, border: '1px solid rgba(255,107,107,0.2)', borderRadius: 3, padding: '5px 10px', cursor: 'pointer', width: '100%' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────── AUTH ─────────────── */
function Auth({ setPage }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    setError('')
    if (!form.email || !form.password) { setError('Please fill all fields'); return }
    if (mode === 'register' && !form.name) { setError('Please enter a username'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      if (mode === 'login') await login(form.email, form.password)
      else await register(form.name, form.email, form.password)
      setPage('home')
    } catch (e) { setError(e.message || 'Something went wrong') }
    finally { setLoading(false) }
  }

  const inputStyle = {
    width: '100%', background: T.surface, border: `1px solid ${T.border2}`,
    borderRadius: 5, padding: '11px 14px', color: T.text, fontSize: 14,
    outline: 'none', boxSizing: 'border-box'
  }

  return (
    <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 24px 80px' }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '28px 32px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
          <h2 style={{ ...G.syne, fontSize: 22, fontWeight: 800, color: T.text, margin: '0 0 4px' }}>
            {mode === 'login' ? 'Welcome back' : 'Join CineVerse'}
          </h2>
          <p style={{ color: T.muted2, fontSize: 13, margin: 0 }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create your account to start reviewing'}
          </p>
        </div>
        <div style={{ padding: '28px 32px' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', marginBottom: 24, background: T.surface, borderRadius: 5, padding: 3 }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setForm({ name: '', email: '', password: '' }) }}
                style={{ flex: 1, ...G.mono, fontSize: 11, padding: '8px', background: mode === m ? T.accent : 'none', color: mode === m ? '#fff' : T.muted, border: 'none', borderRadius: 3, cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase', transition: 'all 0.2s' }}>
                {m}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...G.mono, fontSize: 10, color: T.muted, letterSpacing: 1, display: 'block', marginBottom: 6 }}>USERNAME</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="your_username" style={inputStyle} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ ...G.mono, fontSize: 10, color: T.muted, letterSpacing: 1, display: 'block', marginBottom: 6 }}>EMAIL</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com" type="email" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ ...G.mono, fontSize: 10, color: T.muted, letterSpacing: 1, display: 'block', marginBottom: 6 }}>PASSWORD</label>
            <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handle()}
              placeholder="••••••••" type="password" style={inputStyle} />
          </div>

          {error && (
            <div style={{ background: T.redDim, border: '1px solid rgba(255,107,107,0.2)', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: T.red, marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          <button onClick={handle} disabled={loading}
            style={{ width: '100%', ...G.syne, fontWeight: 700, fontSize: 14, background: loading ? T.border : `linear-gradient(135deg, ${T.accent}, ${T.purple})`, color: loading ? T.muted : '#fff', border: 'none', borderRadius: 5, padding: '13px', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>

          {mode === 'register' && (
            <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginTop: 16 }}>
              By registering you agree to our terms of service
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────── ADMIN ─────────────── */
function Admin() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiAdmin.getStats().then(setStats).catch(e => setError(e.message || 'Failed to load stats')).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (error) return <div style={{ maxWidth: 1100, margin: '48px auto', padding: '0 24px', color: T.red }}>{error}</div>
  if (!stats) return null

  const statCards = [
    { label: 'Total Users', value: stats.users?.toLocaleString(), icon: '👥', color: T.accent, bg: T.accentDim, border: T.accentBorder },
    { label: 'Total Reviews', value: stats.reviews?.toLocaleString(), icon: '✍️', color: T.green, bg: T.greenDim, border: T.greenBorder },
    { label: 'Movies Indexed', value: stats.movies?.toLocaleString(), icon: '🎬', color: T.gold, bg: T.goldDim, border: T.goldBorder },
    { label: 'Active Today', value: stats.activeToday?.toLocaleString(), icon: '⚡', color: T.purple, bg: T.purpleDim, border: 'rgba(176,108,255,0.25)' },
  ]
  const tooltipStyle = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 11, color: T.text, fontFamily: "'JetBrains Mono', monospace" }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
      <div style={{ ...G.mono, fontSize: 10, letterSpacing: 3, color: T.purple, textTransform: 'uppercase', marginBottom: 8 }}>05 — ADMIN</div>
      <h2 style={{ ...G.syne, fontSize: 32, fontWeight: 800, color: T.text, marginBottom: 4 }}>Dashboard</h2>
      <p style={{ color: T.muted2, fontSize: 14, marginBottom: 36 }}>Live platform analytics</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 36 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '20px 24px' }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div style={{ ...G.syne, fontSize: 28, fontWeight: 800, color: s.color, margin: '12px 0 4px' }}>{s.value}</div>
            <div style={{ ...G.mono, fontSize: 10, color: T.muted, letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>
      {stats.growth?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '20px 20px 12px' }}>
            <div style={{ ...G.syne, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>Platform Growth</div>
            <div style={{ ...G.mono, fontSize: 10, color: T.muted, marginBottom: 16 }}>USERS & REVIEWS · LAST 6 MONTHS</div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats.growth}>
                <defs>
                  <linearGradient id="uGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.accent} stopOpacity={0.25} /><stop offset="95%" stopColor={T.accent} stopOpacity={0} /></linearGradient>
                  <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.green} stopOpacity={0.2} /><stop offset="95%" stopColor={T.green} stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="users" stroke={T.accent} strokeWidth={2} fill="url(#uGrad)" name="Users" />
                <Area type="monotone" dataKey="reviews" stroke={T.green} strokeWidth={2} fill="url(#rGrad)" name="Reviews" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {stats.genres?.length > 0 && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '20px 20px 12px' }}>
              <div style={{ ...G.syne, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>Movies by Genre</div>
              <div style={{ ...G.mono, fontSize: 10, color: T.muted, marginBottom: 16 }}>TOP GENRES · ALL TIME</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.genres} layout="vertical">
                  <XAxis type="number" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="genre" tick={{ fill: T.muted2, fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={T.purple} radius={[0, 3, 3, 0]} name="Movies" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...G.syne, fontSize: 15, fontWeight: 700, color: T.text }}>Recent Users</div>
          <Pill color="purple">USER MANAGEMENT</Pill>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border2}` }}>
                {['User', 'Email', 'Role', 'Joined', 'Reviews', 'Actions'].map(h => (
                  <th key={h} style={{ ...G.mono, fontSize: 10, letterSpacing: 1, color: T.muted, textAlign: 'left', padding: '12px 20px', fontWeight: 500 }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(stats.recentUsers || []).map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < stats.recentUsers.length - 1 ? `1px solid ${T.border}` : 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '14px 20px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar letter={u.name[0].toUpperCase()} size={28} /><span style={{ ...G.syne, fontSize: 13, fontWeight: 600, color: T.text }}>{u.name}</span></div></td>
                  <td style={{ padding: '14px 20px', fontSize: 12, color: T.muted2 }}>{u.email}</td>
                  <td style={{ padding: '14px 20px' }}><Pill color={u.role === 'ADMIN' ? 'purple' : 'blue'}>{u.role}</Pill></td>
                  <td style={{ padding: '14px 20px', ...G.mono, fontSize: 11, color: T.muted }}>{new Date(u.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td style={{ padding: '14px 20px', ...G.mono, fontSize: 12, color: T.text }}>{u.reviews}</td>
                  <td style={{ padding: '14px 20px' }}>
                    {u.role !== 'ADMIN' && <button onClick={async () => { if (!confirm(`Delete ${u.name}?`)) return; await apiAdmin.deleteUser(u.id); setStats(s => ({ ...s, recentUsers: s.recentUsers.filter(x => x.id !== u.id) })) }} style={{ ...G.mono, fontSize: 10, color: T.red, background: T.redDim, border: '1px solid rgba(255,107,107,0.2)', borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}>DELETE</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─────────────── APP ─────────────── */
function AppShell() {
  const { user } = useAuth()
  const [page, setPage] = useState('home')
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [watchlistCount, setWatchlistCount] = useState(0)
  const [toast, setToast] = useState(null)
  const showToast = (msg) => setToast(msg)

  // Socket.io for real-time notifications
  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('cv_token')
    const socket = io(API, { auth: { token }, transports: ['websocket', 'polling'] })
    socket.on('notification', (n) => showToast(n.message))
    return () => socket.disconnect()
  }, [user])

  // Sync watchlist count
  const refreshWatchlistCount = () => {
    if (!user) { setWatchlistCount(0); return }
    apiWatchlist.get().then(items => setWatchlistCount(items.length)).catch(() => {})
  }
  useEffect(refreshWatchlistCount, [user, page])

  const renderPage = () => {
    if (page === 'movie' && selectedMovie) return <MovieDetail movie={selectedMovie} setPage={setPage} showToast={showToast} onWatchlistChange={refreshWatchlistCount} />
    if (page === 'search') return <Search setPage={setPage} setSelectedMovie={setSelectedMovie} />
    if (page === 'watchlist') return <Watchlist setPage={setPage} setSelectedMovie={setSelectedMovie} showToast={showToast} onWatchlistChange={refreshWatchlistCount} />
    if (page === 'auth') return <Auth setPage={setPage} />
    if (page === 'admin' && user?.role === 'ADMIN') return <Admin />
    return <Home setPage={setPage} setSelectedMovie={setSelectedMovie} showToast={showToast} />
  }

  return (
    <div style={G.body}>
      <Nav page={page} setPage={setPage} watchlistCount={watchlistCount} />
      {renderPage()}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

export default function App() {
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@300;400;500&display=swap'
    document.head.appendChild(link)
    document.body.style.cssText = 'margin:0;padding:0;background:#070910;color:#e8eaf0;'
    const style = document.createElement('style')
    style.textContent = '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:#0d0f15}::-webkit-scrollbar-thumb{background:#252830;border-radius:3px}input,textarea,button,select{font-family:inherit}'
    document.head.appendChild(style)
  }, [])

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}