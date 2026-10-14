"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    if (loading) return;
    setLoading(true);
    await signOut(createClient());
    router.push("/");
    router.refresh(); // los Server Components deben releer las cookies de sesión
  };

  return (
    <button
      className="btn magenta lg"
      type="button"
      disabled={loading}
      style={{ width: "100%" }}
      onClick={logout}
    >
      {loading ? "SALIENDO…" : "CERRAR SESIÓN"}
    </button>
  );
}
