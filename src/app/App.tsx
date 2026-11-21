// @refresh reset
import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { router } from "./routes";
import { hasWarmLocalAuthCache, waitForFastAuthBoot } from "./services/supabaseClient";

export default function App() {
  // Jika cache akun lokal sudah tersedia, langsung tampilkan UI secara instan sambil menyegarkan data dari Supabase di background.
  // Pada browser / perangkat / incognito baru yang kosong, muat state autentikasi inti secara cepat terlebih dahulu.
  const [ready, setReady] = useState(() => hasWarmLocalAuthCache());

  useEffect(() => {
    document.title = "Performance Appraisal System";
    let alive = true;
    void waitForFastAuthBoot().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F7FB]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1A284F]/15 border-t-[#1A284F]" />
        <p className="text-sm font-medium text-[#1A284F]">Memuat data Performance Appraisal…</p>
      </div>
    );
  }

  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
