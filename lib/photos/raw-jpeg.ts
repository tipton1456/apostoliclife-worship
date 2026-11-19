const MIN_EMBEDDED_JPEG = 10_000;

function readMarker(buffer: Buffer, start: number) {
  let cursor = start + 2;
  while (cursor < buffer.length - 1) {
    if (buffer[cursor] !== 0xff) return null;
    while (cursor < buffer.length && buffer[cursor] === 0xff) cursor += 1;
    if (cursor >= buffer.length) return null;
    const marker = buffer[cursor];
    cursor += 1;
    if (marker === 0xd9) return cursor;
    if (marker === 0x00 || marker === 0xd8) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 1 >= buffer.length) return null;
    const length = buffer.readUInt16BE(cursor);
    if (length < 2 || cursor + length > buffer.length) return null;
    cursor += length;
    if (marker !== 0xda) continue;

    while (cursor < buffer.length - 1) {
      if (buffer[cursor] !== 0xff) {
        cursor += 1;
        continue;
      }
      while (cursor < buffer.length && buffer[cursor] === 0xff) cursor += 1;
      if (cursor >= buffer.length) return null;
      const scan = buffer[cursor];
      cursor += 1;
      if (scan === 0x00) continue;
      if (scan >= 0xd0 && scan <= 0xd7) continue;
      if (scan === 0xd9) return cursor;
      return null;
    }
    return null;
  }
  return null;
}

export function extractLargestJpeg(buffer: Buffer) {
  let largest: Buffer | null = null;

  for (let index = 0; index < buffer.length - 3; index += 1) {
    if (buffer[index] !== 0xff || buffer[index + 1] !== 0xd8 || buffer[index + 2] !== 0xff) continue;
    const end = readMarker(buffer, index);
    if (!end) continue;
    const size = end - index;
    if (size >= MIN_EMBEDDED_JPEG && (!largest || size > largest.length)) {
      largest = Buffer.from(buffer.subarray(index, end));
    }
    index = end - 1;
  }

  return largest;
}
