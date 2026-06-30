import { nativeImage, type NativeImage } from 'electron'

/**
 * Builds a small solid icon from a raw bitmap buffer so the app needs no binary
 * image asset checked into the repo.
 */
export function createAppIcon(size = 16): NativeImage {
  const buffer = Buffer.alloc(size * size * 4)
  // BGRA, opaque indigo-ish square
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4
    buffer[offset] = 0xf1 // B
    buffer[offset + 1] = 0x63 // G
    buffer[offset + 2] = 0x63 // R
    buffer[offset + 3] = 0xff // A
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size })
}
