// @refresh reset
import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { router } from "./routes";
import { hydrateAllStoresFromSupabase } from "./services/supabaseClient";

export default function App() {
  useEffect(() => {
    void hydrateAllStoresFromSupabase();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
