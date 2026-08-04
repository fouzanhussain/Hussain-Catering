// Generates PWA PNG icons without external deps (Node zlib + hand-rolled PNG).
// Design: teal background, off-white "plate" circle, thin ring — a catering nod.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')
mkdirSync(publicDir, { recursive: true })

const BG = [15, 118, 110] // teal-700
const PLATE = [241, 245, 249] // slate-100
const RING = [13, 148, 136] // teal-600

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const cx = size / 2
  const cy = size / 2
  const plateR = size * 0.34
  const ringOuter = size * 0.4
  const ringInner = size * 0.37

  // Raw image: each row prefixed with a filter byte (0 = none). RGB, 8-bit.
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy)
      let c = BG
      if (d <= plateR) c = PLATE
      else if (d >= ringInner && d <= ringOuter) c = RING
      raw[o++] = c[0]
      raw[o++] = c[1]
      raw[o++] = c[2]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(resolve(publicDir, `pwa-${size}x${size}.png`), png(size))
}
// Apple touch icon: 180x180 is the iOS convention.
writeFileSync(resolve(publicDir, 'apple-touch-icon.png'), png(180))
console.log('Generated PWA icons in public/')
