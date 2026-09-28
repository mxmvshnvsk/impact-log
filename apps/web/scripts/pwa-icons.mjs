/**
 * Иконки PWA (manifest.webmanifest, apple-touch-icon): маскот impact log — ретро-монитор с глазами,
 * без ножек, вся «эмоция» на экране (docs/design-system.md, «Маскот»). Геометрия и цвета — как в
 * components/AppMascot (viewBox 200×180), фон — плашка логотипа (--color-logo светлой темы).
 *
 * Рисуем векторно, без зависимостей: каждая фигура — функция расстояния (SDF), сглаживание — по
 * расстоянию до края в пикселях; PNG пишется вручную (node:zlib), как в apps/chrome-extension/scripts/icons.mjs.
 *
 * Запуск: node apps/web/scripts/pwa-icons.mjs [outDir] (по умолчанию apps/web/public/icons).
 * Результат лежит в репозитории; перегенерировать — только при изменении маскота.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

/* Цвета маскота фиксированы и одинаковы в обеих темах (AppMascot.css) */
const COLORS = {
  plate: hex('#0f1f18'), // --color-logo: тёмная плашка логотипа
  case: hex('#dfe6e2'), // --mascot-case
  edge: hex('#b7c3bd'), // --mascot-case-edge (контур и решётка)
  bezel: hex('#c9d3ce'), // --mascot-bezel
  screenCenter: hex('#16352a'), // радиальный градиент экрана
  screenEdge: hex('#08120e'),
  glow: hex('#3dff8f'), // --mascot-glow: глаза, курсор, индикатор
  white: [255, 255, 255],
  black: [0, 0, 0],
}

/* Корпус монитора в координатах маскота: x 28…172, y 30…164 (контур 2 → наружу на 1) */
const CASE = { x0: 28, y0: 30, x1: 172, y1: 164, r: 24 }
const CASE_CENTER = [(CASE.x0 + CASE.x1) / 2, (CASE.y0 + CASE.y1) / 2]
const CASE_WIDTH = CASE.x1 - CASE.x0
/** Самая дальняя от центра точка корпуса (угол скругления + полконтура) — для safe zone maskable */
const CASE_RADIUS =
  Math.hypot((CASE.x1 - CASE.x0) / 2 - CASE.r, (CASE.y1 - CASE.y0) / 2 - CASE.r) + CASE.r + 1

function hex(value) {
  return [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16))
}

/* ---------- функции расстояния: < 0 внутри, > 0 снаружи ---------- */

function roundRect(x, y, { x0, y0, x1, y1, r }) {
  const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)
  const qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function circle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r
}

/** Горизонтальный отрезок с круглыми концами (линия со stroke-linecap: round) */
function capsule(x, y, x0, x1, cy, r) {
  const px = Math.min(Math.max(x, x0), x1)
  return Math.hypot(x - px, y - cy) - r
}

const clamp01 = (value) => Math.min(Math.max(value, 0), 1)
const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t)

/**
 * Рисует иконку size×size. plate: 'rounded' — скруглённая плашка (purpose any),
 * 'square' — фон на всё поле (maskable, apple-touch-icon); caseWidth — ширина корпуса в долях иконки.
 */
function render(size, { plate, caseWidth }) {
  const k = (caseWidth * size) / CASE_WIDTH // пикселей в единице маскота
  const pixels = new Float64Array(size * size * 4)
  const eyes = [
    { x0: 66, y0: 70, x1: 82, y1: 92, r: 4 },
    { x0: 118, y0: 70, x1: 134, y1: 92, r: 4 },
  ]
  const cursor = { x0: 92, y0: 108, x1: 108, y1: 112, r: 1 }
  const screen = { x0: 42, y0: 44, x1: 158, y1: 134, r: 12 }
  const bezel = { x0: 38, y0: 40, x1: 162, y1: 138, r: 16 }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rgb = [0, 0, 0]
      let alpha = 0
      /** Кладёт слой цвета color с покрытием coverage поверх уже нарисованного (оператор over) */
      const paint = (color, coverage) => {
        if (coverage <= 0) return
        const outAlpha = coverage + alpha * (1 - coverage)
        rgb = rgb.map(
          (channel, i) => (color[i] * coverage + channel * alpha * (1 - coverage)) / outAlpha,
        )
        alpha = outAlpha
      }
      // Покрытие фигуры по расстоянию d (в единицах маскота) — сглаживание в один пиксель
      const cover = (d) => clamp01(0.5 - d * k)
      const glow = (d, sigma, strength) =>
        d <= 0 ? strength : strength * Math.exp(-(d * d) / (2 * sigma * sigma))

      // Плашка
      const sx = px + 0.5
      const sy = py + 0.5
      if (plate === 'square') {
        paint(COLORS.plate, 1)
      } else {
        const r = size * 0.22
        const d = roundRect(sx, sy, { x0: 0, y0: 0, x1: size, y1: size, r })
        paint(COLORS.plate, clamp01(0.5 - d))
      }
      if (alpha === 0) continue

      const x = CASE_CENTER[0] + (sx - size / 2) / k
      const y = CASE_CENTER[1] + (sy - size / 2) / k

      // Мягкое зелёное свечение экрана на плашке и тень под корпусом
      paint(COLORS.glow, 0.1 * Math.exp(-((x - 100) ** 2 + (y - 90) ** 2) / (2 * 70 ** 2)))
      const shadow = roundRect(x, y - 6, CASE)
      paint(COLORS.black, 0.35 * clamp01(1 - (shadow + 4) / 14))

      // Корпус с контуром, рамка экрана
      const caseDistance = roundRect(x, y, CASE)
      paint(COLORS.edge, cover(caseDistance - 1))
      paint(COLORS.case, cover(caseDistance + 1))
      paint(COLORS.bezel, cover(roundRect(x, y, bezel)))

      // Экран: радиальный градиент, сканлайны, свечение глаз — всё внутри экрана
      const screenCover = cover(roundRect(x, y, screen))
      if (screenCover > 0) {
        const t = clamp01(Math.hypot((x - 100) / (0.7 * 116), (y - 84.5) / (0.7 * 90)))
        paint(mix(COLORS.screenCenter, COLORS.screenEdge, t), screenCover)
        for (let line = 50; line <= 128; line += 6) {
          paint(COLORS.white, 0.04 * screenCover * cover(Math.abs(y - line) - 1))
        }
        const eyeDistance = Math.min(...eyes.map((eye) => roundRect(x, y, eye)))
        paint(COLORS.glow, screenCover * glow(eyeDistance, 4, 0.5) * (eyeDistance > 0 ? 1 : 0))
        const cursorDistance = roundRect(x, y, cursor)
        paint(
          COLORS.glow,
          screenCover * glow(cursorDistance, 3, 0.3) * (cursorDistance > 0 ? 1 : 0),
        )
        paint(COLORS.glow, cover(eyeDistance))
        paint(COLORS.glow, cover(cursorDistance))
      }

      // Индикатор питания и решётка
      const led = circle(x, y, 150, 152, 3.5)
      if (led > 0) paint(COLORS.glow, glow(led, 3, 0.55) * cover(caseDistance + 1))
      paint(COLORS.glow, cover(led))
      paint(COLORS.edge, cover(capsule(x, y, 48, 72, 150, 1.25)))
      paint(COLORS.edge, cover(capsule(x, y, 48, 66, 155, 1.25)))

      pixels.set([...rgb, alpha * 255], (py * size + px) * 4)
    }
  }
  return Uint8Array.from(pixels, (value) => Math.round(Math.min(Math.max(value, 0), 255)))
}

/* ---------- PNG (RGBA 8 бит, фильтр строк выбирается по минимальной сумме) ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function encodePng(rgba, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // бит на канал
  header[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride)
    let best = null
    for (let filter = 0; filter <= 4; filter++) {
      const out = Buffer.alloc(stride)
      let score = 0
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? row[i - 4] : 0
        const up = prev[i]
        const upLeft = i >= 4 ? prev[i - 4] : 0
        const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter]
        out[i] = (row[i] - predictor) & 0xff
        score += out[i] < 128 ? out[i] : 256 - out[i]
      }
      if (!best || score < best.score) best = { filter, out, score }
    }
    raw[y * (stride + 1)] = best.filter
    best.out.copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------- набор иконок ---------- */

// maskable: всё значимое — в круге safe zone (радиус 40% иконки), с запасом 5%
const MASKABLE_WIDTH = (0.38 * CASE_WIDTH) / CASE_RADIUS

const ICONS = [
  { file: 'icon-192.png', size: 192, plate: 'rounded', caseWidth: 0.72 },
  { file: 'icon-512.png', size: 512, plate: 'rounded', caseWidth: 0.72 },
  { file: 'icon-maskable-192.png', size: 192, plate: 'square', caseWidth: MASKABLE_WIDTH },
  { file: 'icon-maskable-512.png', size: 512, plate: 'square', caseWidth: MASKABLE_WIDTH },
  // iOS прозрачность не поддерживает и скругляет сам — фон на всё поле
  { file: 'apple-touch-icon.png', size: 180, plate: 'square', caseWidth: 0.68 },
]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.argv[2] ?? join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })
for (const { file, size, ...options } of ICONS) {
  writeFileSync(join(outDir, file), encodePng(render(size, options), size))
}
console.log(`pwa icons → ${outDir}`)
