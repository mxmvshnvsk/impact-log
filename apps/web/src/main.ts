import { createApp } from 'vue'
import App from './App.vue'
import { initTheme } from './composables/useTheme'
import { i18n } from './i18n'
import { router } from './router'
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'

initTheme()

createApp(App).use(i18n).use(router).mount('#app')
