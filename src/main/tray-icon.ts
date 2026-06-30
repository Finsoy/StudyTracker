import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'

/** Absolute path to the bundled app icon (PNG), in dev and packaged builds. */
export function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
}

/** Loads the real app icon, optionally resized, falling back to the drawn icon. */
export function loadAppIcon(size?: number): NativeImage {
  const image = nativeImage.createFromPath(appIconPath())
  if (image.isEmpty()) return createAppIcon(size ?? 16)
  return size ? image.resize({ width: size, height: size }) : image
}

/**
 * Builds a small solid icon from a raw bitmap buffer, used as a fallback when
 * the bundled icon file cannot be loaded.
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
