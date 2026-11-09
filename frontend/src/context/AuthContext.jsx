import { createContext, useContext, useEffect, useState } from 'react'
import { api, clearToken, setToken, setUnauthorizedHandler } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      return
    }
    api.get('/users/me')
      .then(setUser)
      .catch(() => {
        clearToken()
        setUser(null)
      })
  }, [])

  // A 401 from anywhere (not just this initial check) means the token is
  // dead — clear it so ProtectedRoute redirects to /login instead of the
  // app silently acting logged-in while every request fails.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken()
      setUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  async function login(email, password) {
    const { access_token } = await api.post('/auth/login', { email, password })
    setToken(access_token)
    const me = await api.get('/users/me')
    setUser(me)
    return me
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
