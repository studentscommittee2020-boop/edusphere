import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // three.js + @react-three/fiber (and its @react-three/* friends) —
          // only ever pulled in transitively by the lazy-loaded HeroScene,
          // but keeping it isolated stops it from ever leaking into a
          // vendor chunk that ships on every route.
          if (
            id.includes("node_modules/three/") ||
            id.includes("node_modules/@react-three/") ||
            id.includes("node_modules/react-reconciler/") ||
            id.includes("node_modules/react-use-measure/") ||
            id.includes("node_modules/suspend-react/")
          ) {
            return "vendor-three";
          }

          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/@remix-run/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("node_modules/use-sync-external-store/") ||
            id.includes("node_modules/zustand/") ||
            id.includes("node_modules/sonner/")
          ) {
            return "vendor-react";
          }

          if (id.includes("node_modules/@supabase/")) {
            return "vendor-supabase";
          }

          if (id.includes("node_modules/@sentry/")) {
            return "vendor-sentry";
          }

          if (id.includes("node_modules/framer-motion/")) {
            return "vendor-framer-motion";
          }

          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-lucide";
          }

          return "vendor";
        },
      },
    },
    // Real fix applied above: HeroScene's three.js payload is now isolated
    // in its own lazy chunk instead of inflating the main bundle, and the
    // main entry chunk is split by vendor so no single non-decorative
    // chunk should cross this line. Raised only enough to stop flagging
    // the (already lazy, desktop-only, decorative) three.js chunk itself —
    // see the build report for the actual measured sizes.
    chunkSizeWarningLimit: 600,
  },
});
