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

// The service worker is registered from the app shell (see usePwa), so it can also surface the
// install offer and the update-ready prompt. The app still works without it.

void bootstrap()
