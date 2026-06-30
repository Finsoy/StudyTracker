export type VdfNode = { [key: string]: string | VdfNode }

/**
 * Minimal parser for Valve's KeyValues (VDF) text format, enough for Steam's
 * `libraryfolders.vdf` and `appmanifest_*.acf` files. Handles quoted keys/values
 * and nested `{ }` blocks; ignores comments and unquoted tokens.
 */
export function parseVdf(text: string): VdfNode {
  let index = 0

  function skipWhitespaceAndComments(): void {
    while (index < text.length) {
      const char = text[index]
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        index++
      } else if (char === '/' && text[index + 1] === '/') {
        while (index < text.length && text[index] !== '\n') index++
      } else {
        break
      }
    }
  }

  function readString(): string {
    // assumes current char is the opening quote
    index++
    let value = ''
    while (index < text.length && text[index] !== '"') {
      if (text[index] === '\\' && index + 1 < text.length) {
        const next = text[index + 1]
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next
        index += 2
      } else {
        value += text[index]
        index++
      }
    }
    index++ // closing quote
    return value
  }

  function parseObject(): VdfNode {
    const node: VdfNode = {}
    while (index < text.length) {
      skipWhitespaceAndComments()
      if (index >= text.length || text[index] === '}') {
        index++ // consume closing brace
        break
      }
      if (text[index] !== '"') {
        index++
        continue
      }
      const key = readString()
      skipWhitespaceAndComments()
      if (text[index] === '{') {
        index++ // consume opening brace
        node[key] = parseObject()
      } else if (text[index] === '"') {
        node[key] = readString()
      }
    }
    return node
  }

  skipWhitespaceAndComments()
  // top-level files start with a single root key followed by a block
  const root: VdfNode = {}
  while (index < text.length) {
    skipWhitespaceAndComments()
    if (index >= text.length || text[index] !== '"') break
    const key = readString()
    skipWhitespaceAndComments()
    if (text[index] === '{') {
      index++
      root[key] = parseObject()
    } else if (text[index] === '"') {
      root[key] = readString()
    }
  }
  return root
}
