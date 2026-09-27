import postcssGlobalData from '@csstools/postcss-global-data'
import postcssCustomMedia from 'postcss-custom-media'

// Именованные медиазапросы (--tablet, --desktop …) из src/styles/media.css доступны в любом CSS-файле
export default {
  plugins: [postcssGlobalData({ files: ['src/styles/media.css'] }), postcssCustomMedia()],
}
