const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntity(entity: string, body: string): string {
  if (body.startsWith('#x') || body.startsWith('#X')) {
    const codePoint = Number.parseInt(body.slice(2), 16);
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : entity;
  }
  if (body.startsWith('#')) {
    const codePoint = Number.parseInt(body.slice(1), 10);
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : entity;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
}

function isValidCodePoint(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff;
}

export function sanitizeRestaurantDescription(description: string | null): string {
  if (!description) return '';

  const operationalNoteStart = description.search(/\bAn Important Message\b/i);
  const cardDescription = operationalNoteStart >= 0 ? description.slice(0, operationalNoteStart) : description;

  return cardDescription
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}
