/**
 * Иконки расширения: маскот impact log — ретро-монитор с глазами (без ножек, вся эмоция на экране).
 * Пиксель-арт рисуется на сетке и масштабируется «ближайшим соседом», PNG пишется вручную (node:zlib).
 *   16 px — сетка 16×16 (1:1), 32 — она же ×2, 48 — ×3 (панель браузера и chrome://extensions);
 *   128 — детальная сетка 32×32 ×4 с полями по гайдлайнам Chrome Web Store.
 * Запуск: node scripts/icons.mjs [outDir] (по умолчанию static/icons). Цвета маскота фиксированы
 * (docs/design-system.md, «Маскот») и одинаковы для светлой и тёмной темы.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const COLORS = {
  edge: [0x8e, 0x9c, 0x95, 255], // контур корпуса — темнее --mascot-case-edge, чтобы читался на светлой панели
  case: [0xdf, 0xe6, 0xe2, 255], // --mascot-case
  bezel: [0xc9, 0xd3, 0xce, 255], // --mascot-bezel
  screen: [0x0b, 0x17, 0x12, 255], // экран (низ градиента)
  scan: [0x12, 0x26, 0x1d, 255], // сканлайны
  glow: [0x3d, 0xff, 0x8f, 255], // --mascot-glow: глаза, курсор, индикатор
  halo: [0x1a, 0x5c, 0x3b, 255], // свечение вокруг глаз
  vent: [0xa9, 0xb6, 0xaf, 255], // решётка
}

/* ---------- рисование на сетке ---------- */

function createGrid(size) {
  return { size, cells: new Array(size * size).fill(null) }
}

function set(grid, x, y, color) {
  if (x >= 0 && y >= 0 && x < grid.size && y < grid.size) grid.cells[y * grid.size + x] = color
}

/** Прямоугольник [x0..x1]×[y0..y1] (включительно) со «ступенчатым» пиксельным скруглением радиуса r */
function roundRect(grid, x0, y0, x1, y1, r, color) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
      const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
      if (r > 0 && dx > 0 && dy > 0) {
        const cx = r - dx + 0.5
        const cy = r - dy + 0.5
        if ((r - cx) ** 2 + (r - cy) ** 2 > (r - 0.5) ** 2 + 0.5) continue
      }
      set(grid, x, y, color)
    }
  }
}

function rect(grid, x0, y0, x1, y1, color) {
  roundRect(grid, x0, y0, x1, y1, 0, color)
}

/** 16×16: минимум деталей — корпус, экран, два глаза, курсор-рот, индикатор */
function drawSmall() {
  const g = createGrid(16)
  roundRect(g, 0, 1, 15, 14, 2, COLORS.edge)
  roundRect(g, 1, 2, 14, 13, 1, COLORS.case)
  roundRect(g, 2, 3, 13, 10, 1, COLORS.screen)
  rect(g, 5, 5, 5, 7, COLORS.glow)
  rect(g, 10, 5, 10, 7, COLORS.glow)
  rect(g, 7, 9, 8, 9, COLORS.glow)
  set(g, 12, 12, COLORS.glow)
  rect(g, 3, 12, 5, 12, COLORS.vent)
  return g
}

/** 32×32 (для 128 px): рамка экрана, сканлайны, свечение глаз, решётка */
function drawLarge() {
  const g = createGrid(32)
  roundRect(g, 3, 5, 28, 27, 4, COLORS.edge)
  roundRect(g, 4, 6, 27, 26, 3, COLORS.case)
  roundRect(g, 6, 8, 25, 21, 3, COLORS.bezel)
  roundRect(g, 7, 9, 24, 20, 2, COLORS.screen)
  for (let y = 10; y <= 19; y += 2) {
    for (let x = 7; x <= 24; x++)
      if (g.cells[y * 32 + x] === COLORS.screen) set(g, x, y, COLORS.scan)
  }
  for (const x of [11, 19]) {
    rect(g, x - 1, 11, x + 2, 16, COLORS.halo)
    rect(g, x, 12, x + 1, 15, COLORS.glow)
  }
  rect(g, 15, 18, 16, 18, COLORS.glow)
  rect(g, 23, 23, 24, 24, COLORS.glow)
  rect(g, 7, 23, 12, 23, COLORS.vent)
  rect(g, 7, 25, 10, 25, COLORS.vent)
  return g
}

/* ---------- PNG ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
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

function encodePng(grid, scale) {
  const size = grid.size * scale
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // бит на канал
  header[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0 // фильтр None
    for (let x = 0; x < size; x++) {
      const color = grid.cells[Math.floor(y / scale) * grid.size + Math.floor(x / scale)]
      if (color) raw.set(color, row + 1 + x * 4)
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.argv[2] ?? join(root, 'static', 'icons')
mkdirSync(outDir, { recursive: true })
const small = drawSmall()
const large = drawLarge()
const icons = { 16: [small, 1], 32: [small, 2], 48: [small, 3], 128: [large, 4] }
for (const [size, [grid, scale]] of Object.entries(icons)) {
  writeFileSync(join(outDir, `icon-${size}.png`), encodePng(grid, scale))
}
console.log(`icons → ${outDir}`)
