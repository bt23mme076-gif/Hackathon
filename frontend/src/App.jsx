import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, NavLink } from "react-router-dom";
import axios from "axios";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Crime from "./pages/Crime";
import Pollution from "./pages/Pollution";

export const API_BASE_URL = "http://localhost:8000";
export const WS_URL = "ws://localhost:8000/ws";
const AUTH_STORAGE_KEY = "drishtiai_auth";

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY);
  if (stored) {
    const { access_token } = JSON.parse(stored);
    if (access_token) config.headers.Authorization = `Bearer ${access_token}`;
  }
  return config;
});

// ---------- Auth Context ----------

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.data));
    setAuth(res.data);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout, isAuthenticated: !!auth }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------- Live Alerts / Pollution Context (single shared WebSocket) ----------

const AlertsContext = createContext(null);
export const useAlerts = () => useContext(AlertsContext);

function AlertsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [pollutionScores, setPollutionScores] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const fetchInitialData = useCallback(async () => {
    try {
      const [alertsRes, pollutionRes] = await Promise.all([
        api.get("/alerts"),
        api.get("/pollution"),
      ]);
      setAlerts(alertsRes.data);
      setPollutionScores(pollutionRes.data);
    } catch (err) {
      console.error("Failed to fetch initial data", err);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (alertId) => {
    const res = await api.post(`/alerts/${alertId}/ack`);
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? res.data : a)));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      if (wsRef.current) wsRef.current.close();
      return;
    }

    fetchInitialData();

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "alert") {
            setAlerts((prev) => [message.data, ...prev]);
          } else if (message.type === "alert_update") {
            setAlerts((prev) => prev.map((a) => (a.id === message.data.id ? message.data : a)));
          } else if (message.type === "pollution") {
            setPollutionScores((prev) => [message.data, ...prev]);
          }
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!cancelled) reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [isAuthenticated, fetchInitialData]);

  return (
    <AlertsContext.Provider value={{ alerts, pollutionScores, wsConnected, acknowledgeAlert, refresh: fetchInitialData }}>
      {children}
    </AlertsContext.Provider>
  );
}

// ---------- Layout ----------

function TopNav() {
  const { logout, auth } = useAuth();
  const { wsConnected } = useAlerts();
  const navigate = useNavigate();

  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive ? "bg-orange-500 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;

  return (
    <header className="bg-[#0f172a] border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">DrishtiAI</h1>
          <p className="text-slate-400 text-xs">Nagpur Smart City Initiative</p>
        </div>
        <nav className="flex items-center gap-2">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/crime" className={linkClass}>Crime</NavLink>
          <NavLink to="/pollution" className={linkClass}>Pollution</NavLink>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`} />
          {wsConnected ? "Live" : "Disconnected"}
        </span>
        <span className="text-slate-300 text-sm">{auth?.email} <span className="text-slate-500">({auth?.role})</span></span>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="text-sm text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-md transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}

function ProtectedLayout({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <AlertsProvider>
      <div className="min-h-screen bg-[#0f172a] flex flex-col">
        <TopNav />
        <main className="flex-1">{children}</main>
      </div>
    </AlertsProvider>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
      <Route path="/crime" element={<ProtectedLayout><Crime /></ProtectedLayout>} />
      <Route path="/pollution" element={<ProtectedLayout><Pollution /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
