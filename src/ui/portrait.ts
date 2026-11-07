const SIZE = 192;
const QUALITY = 0.82;

/** True only for the small JPEGs this app makes; anything else (a link, an SVG) is never shown. */
export const isPortrait = (value: string | undefined): value is string =>
  value !== undefined && value.startsWith('data:image/jpeg;base64,');

/**
 * Crops the middle square of a chosen picture, shrinks it and returns it as a small JPEG
 * data URL. The original file is not kept.
 */
export async function resizePortrait(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    throw new Error('This picture could not be read.', { cause });
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot resize pictures.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, SIZE, SIZE);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close();
  }
}
