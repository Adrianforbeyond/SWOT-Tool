import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// Vite Konfiguration für StackBlitz + lokale Nutzung
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // wichtig: erlaubt Zugriff von extern / StackBlitz
    port: 5173,
    strictPort: true, // Port bleibt fix, kein automatisches Springen
    open: false, // im Browser nicht automatisch öffnen
  },
  preview: {
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      '@': '/src', // erlaubt Imports wie "@/components/..."
    },
  },
});
