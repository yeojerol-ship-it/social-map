import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,   // expose on LAN (0.0.0.0)
    port: 5173,
    https: true,  // required for SpeechRecognition on real iOS devices
  },
})
