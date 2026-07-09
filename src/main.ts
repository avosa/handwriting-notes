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

void bootstrap()
