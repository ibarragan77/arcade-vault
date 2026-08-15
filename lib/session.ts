// ===== lib/session.ts — simulated user session (localStorage-backed) =====
"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "av_user";
const EVENT_NAME = "av-session-change";

export type SessionUser = { name: string } | null;

function readUser(): SessionUser {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeUser(user: SessionUser) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage no disponible (SSR, modo privado, etc.)
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function useSession() {
  // Se inicializa en null para que el primer render coincida con el servidor
  // (que no conoce localStorage) y se sincroniza en el useEffect siguiente.
  const [user, setUser] = useState<SessionUser>(null);

  useEffect(() => {
    setUser(readUser());

    const sync = () => setUser(readUser());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback((newUser: SessionUser) => {
    writeUser(newUser);
    setUser(newUser);
  }, []);

  const loginAsGuest = useCallback(() => {
    writeUser(null);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    writeUser(null);
    setUser(null);
  }, []);

  return { user, login, loginAsGuest, logout };
}
