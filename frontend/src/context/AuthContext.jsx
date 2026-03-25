import { createContext, useContext, useEffect, useState } from 'react'
import { api, clearToken, setToken } from '../api/client'

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
