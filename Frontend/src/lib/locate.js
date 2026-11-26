/**
 * Ubica el texto de un hallazgo dentro de un documento ya dibujado en pantalla y devuelve Ranges del DOM.
 *
 * El texto que analiza FastAPI no es idéntico al que se ve (en un PDF las palabras salen partidas y en las
 * tablas arma "Columna: valor"), así que se compara sin espacios, mayúsculas ni marcas de Markdown.
 */
const IGNORED = /[\s­*_`#|]/
const MIN_CHARS = 4
const PREFIX_CHARS = 40

/** Caracteres comparables de `text`, avisando de qué posición original sale cada uno. */
function normalize(text, emit) {
  for (let i = 0; i < text.length; i++) {
    for (const c of text[i].normalize('NFKC').toLowerCase()) if (!IGNORED.test(c)) emit(c, i)
  }
}

const comparable = (text) => {
  let out = ''
  normalize(text ?? '', (c) => (out += c))
  return out
}

export function indexText(root) {
  let text = ''
  const at = [] // por cada carácter comparable: [nodo de texto, posición]
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('style, script')) continue
    normalize(node.data, (c, i) => {
      text += c
      at.push([node, i])
    })
  }
  return { text, at }
}

function toRange({ at }, start, length) {
  const range = new Range()
  range.setStart(at[start][0], at[start][1])
  const [node, offset] = at[start + length - 1]
  range.setEnd(node, offset + 1)
  return range
}

function occurrences(text, needle) {
  const found = []
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) found.push(i)
  return found
}

/**
 * Ranges donde aparece el hallazgo; lista vacía si no se encuentra.
 * `preferred` (la página del PDF) desempata cuando la misma frase está repetida.
 */
export function locate(index, finding, preferred) {
  const first = (needle) => {
    const all = occurrences(index.text, needle)
    return all.find((i) => preferred?.contains(index.at[i][0])) ?? all[0]
  }
  const sources = [finding.quote, finding.fragment].filter(Boolean)

  // 1) La frase o el párrafo tal cual.
  for (const source of sources) {
    const needle = comparable(source)
    if (needle.length < MIN_CHARS) continue
    const at = first(needle)
    if (at !== undefined) return [toRange(index, at, needle.length)]
  }

  // 2) Por partes: filas de tabla ("Columna: valor; …") o párrafos con su título delante ("Título: texto").
  for (const source of sources) {
    const parts = source.split(/[;:\n]/).map(comparable).filter((p) => p.length >= MIN_CHARS).sort((a, b) => b.length - a.length)
    let anchor
    const ranges = []
    for (const part of parts) {
      // La parte más larga fija el lugar; las demás se toman en su aparición más cercana.
      const at = anchor === undefined ? first(part) : occurrences(index.text, part).sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0]
      if (at === undefined) continue
      anchor ??= at
      ranges.push(toRange(index, at, part.length))
    }
    if (ranges.length) return ranges
  }

  // 3) Al menos el comienzo.
  for (const source of sources) {
    const needle = comparable(source).slice(0, PREFIX_CHARS)
    if (needle.length < PREFIX_CHARS) continue
    const at = first(needle)
    if (at !== undefined) return [toRange(index, at, needle.length)]
  }
  return []
}
