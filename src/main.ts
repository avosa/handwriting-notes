import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installPersistence } from './store/persistence'
import './assets/fonts.css'
import './assets/main.css'

async function bootstrap() {
  const app = createApp(App)
  app.use(createPinia())
  // Restore any saved work before the first paint so nothing flashes empty.
  await installPersistence()
  app.mount('#app')
}

// Register the service worker so the app installs and runs offline. It is optional: without
// support, or if registration fails, the app still works, just without offline loading.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

void bootstrap()
