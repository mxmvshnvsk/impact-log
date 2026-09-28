import { createApp, defineComponent, h } from 'vue'
import App from './App.vue'
import { PwaOfflineBanner } from './components/PwaOfflineBanner'
import { PwaUpdateToast } from './components/PwaUpdateToast'
import { bootstrapAccount } from './composables/useSync'
import { initTheme } from './composables/useTheme'
import { i18n } from './i18n'
import { initPwa } from './pwa'
import { router } from './router'
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'

initTheme()

// Корень: плашка «нет сети» над каркасом страницы, приложение, тост обновления (docs/pwa.md)
const AppRoot = defineComponent({
  name: 'AppRoot',
  render: () => [h(PwaOfflineBanner), h(App), h(PwaUpdateToast)],
})

createApp(AppRoot).use(i18n).use(router).mount('#app')

// Офлайн-оболочка (service worker, только production) и цвет панели браузера под тему
initPwa()

// Аккаунт синхронизации — после первого рендера: локальные записи доступны и без сети
void bootstrapAccount()
