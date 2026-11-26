/**
 * Dibuja el archivo original dentro de `target` (PDF, Word o texto). Las librerías se cargan solo cuando hacen falta.
 * Son documentos de terceros: no se les permite enlaces, scripts ni cargar nada de fuera.
 */
const element = (tag, className) => Object.assign(document.createElement(tag), { className: className ?? '' })

async function renderPdf(blob, target, width, signal) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  try {
    const pdf = await task.promise
    for (let n = 1; n <= pdf.numPages && !signal.aborted; n++) {
      const page = await pdf.getPage(n)
      const scale = width / page.getViewport({ scale: 1 }).width
      const viewport = page.getViewport({ scale })
      const ratio = window.devicePixelRatio || 1

      const sheet = element('div', 'pdf-page')
      sheet.style.width = `${viewport.width}px`
      sheet.style.height = `${viewport.height}px`
      sheet.style.setProperty('--total-scale-factor', scale)
      const canvas = element('canvas')
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      // Capa de texto transparente sobre el dibujo: es la que permite marcar los hallazgos.
      const textLayer = element('div', 'textLayer')
      sheet.append(canvas, textLayer)
      target.append(sheet)

      await page.render({ canvas, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise
      await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render()
    }
  } finally {
    task.destroy()
  }
}

const EXTERNAL_URL = /url\(\s*['"]?(?!data:|blob:)[^)]*\)/gi

/** Quita del HTML generado a partir del Word todo lo que pueda ejecutar algo o salir a internet. */
export function sanitize(root) {
  root.querySelectorAll('script, iframe, frame, object, embed, link, meta, base, form').forEach((el) => el.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const { name, value } of [...el.attributes]) {
      const attr = name.toLowerCase()
      const forbidden =
        attr.startsWith('on') ||
        ['href', 'xlink:href', 'srcset', 'action', 'formaction'].includes(attr) ||
        (attr === 'src' && !/^(data|blob):/i.test(value)) ||
        (attr === 'style' && value.search(EXTERNAL_URL) !== -1)
      if (forbidden) el.removeAttribute(name)
    }
  })
  root.querySelectorAll('style').forEach((s) => {
    s.textContent = s.textContent.replace(/@import[^;]*;/gi, '').replace(EXTERNAL_URL, 'none')
  })
}

async function renderDocx(blob, target, width, signal) {
  const { renderAsync } = await import('docx-preview')
  // Se genera fuera de la página y se limpia antes de mostrarlo.
  const styles = element('div')
  const body = element('div', 'docx-body')
  await renderAsync(blob, body, styles, { inWrapper: false, renderAltChunks: false, useBase64URL: true })
  if (signal.aborted) return
  sanitize(styles)
  sanitize(body)
  target.append(styles, body)
  const sheet = body.querySelector('section')
  if (sheet && sheet.offsetWidth > width) body.style.zoom = width / sheet.offsetWidth
}

export async function renderDocument(blob, filename, target, signal) {
  const width = target.clientWidth
  const name = filename.toLowerCase()
  if (name.endsWith('.pdf')) return renderPdf(blob, target, width, signal)
  if (name.endsWith('.docx')) return renderDocx(blob, target, width, signal)
  if (/\.(txt|md|markdown|csv)$/.test(name)) {
    const pre = element('pre', 'preview-text')
    pre.textContent = await blob.text()
    target.append(pre)
    return
  }
  throw new Error('Este formato no tiene vista previa')
}
