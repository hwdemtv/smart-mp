/**
 * new version os mathjax wrapper for render math LaTeX to svg
 */

import { LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html'
import { TeX } from 'mathjax-full/js/input/tex'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages'
import { mathjax } from 'mathjax-full/js/mathjax'
import { SVG } from 'mathjax-full/js/output/svg'

const adaptor = new LiteAdaptor()
RegisterHTMLHandler(adaptor)

const mathjax_document = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({
    fontCache: 'none',
    scale: 0.8
  })
})

const mathjax_options = {
  em: 13,
  ex: 6.5,
  containerWidth: 1280,
  //   display: true
}

export function parseMath(math: string, display: boolean = false): string {

  const node = mathjax_document.convert(math, { ...mathjax_options, display })

  return adaptor.outerHTML(node)
}

const inlineRule = /\$(.*)\$/g // /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/;
const blockRule = /\$\$(?!<\$\$)([\s\S]*?)\$\$/g;  // /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

export function parseHTML(html: string): string {
  let matches = html.match(blockRule)
  if (matches) {
    matches.forEach(match => {
      const math = match.replace(/\$/g, '')
      // [Fix] 显式传入 display: true，生成块级标记
      const svg = parseMath(math, true)
      html = html.replace(match, svg)
    })
  }

  matches = html.match(inlineRule)
  if (matches) {
    matches.forEach(match => {
      const math = match.replace(/\$/g, '')
      // [Fix] 显式传入 display: false，生成行内标记
      const svg = parseMath(math, false)
      html = html.replace(match, svg)
    })
  }
  return html
}


