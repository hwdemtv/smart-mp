/**
 * MathJax Renderer Wrapper
 * 
 * Provides a high-performance wrapper around MathJax for converting LaTeX
 * mathematical expressions to SVG format.
 * 
 * @version 2.0.0
 */

import { LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html'
import { TeX } from 'mathjax-full/js/input/tex'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages'
import { mathjax } from 'mathjax-full/js/mathjax'
import { SVG } from 'mathjax-full/js/output/svg'

// --- Types ---
interface MathJaxOptions {
  em: number;
  ex: number;
  containerWidth: number;
  display?: boolean;
  scale?: number;
}

// --- Initialization ---
const adaptor = new LiteAdaptor()
RegisterHTMLHandler(adaptor)

const mathjax_document = mathjax.document('', {
  InputJax: new TeX({
    packages: AllPackages
  }),
  OutputJax: new SVG({
    fontCache: 'none',
    scale: 1,

  })
})

// --- Configuration ---
const baseMathJaxOptions: MathJaxOptions = {
  em: 16,
  ex: 8,
  containerWidth: 1280
}

// --- Cache ---
const formulaCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

// --- Helpers ---
function cleanMathJaxOutput(svg: string): string {
  // [Changed] Keep mjx-container! 
  // MathJax uses the container to apply correct styles (like vertical-align).
  // Stripping it causes layout issues (clipping roots) and attribute loss.
  // The post-render upload process currently handles replacing mjx-container with the final image.

  // 1. Ensure namespace on the inner SVG if missing
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg;
}

// --- Rules (No Global Flag) ---
// Local rules for matching single instances without state
const inlineRule = /\$([^\$]+)\$/;
const blockRule = /\$\$([\s\S]*?)\$\$/;
// Global versions for replace all
const blockRuleGlobal = /\$\$([\s\S]*?)\$\$/g;
const inlineRuleGlobal = /\$([^\$]+)\$/g;

// --- Main Functions ---

/**
 * Parses a LaTeX math string and returns an SVG string.
 * @param math The LaTeX math string (without delimiters)
 * @param displayMode true for block math, false for inline math
 * @returns SVG string
 */
export function parseMath(math: string, displayMode: boolean = false): string {
  const trimmed = math?.trim();
  if (!trimmed) return '';

  const cacheKey = `${displayMode ? 'block' : 'inline'}:${trimmed}`;
  if (formulaCache.has(cacheKey)) {
    return formulaCache.get(cacheKey)!;
  }

  try {
    const options: MathJaxOptions = {
      ...baseMathJaxOptions,
      display: displayMode,
      // scale is handled by OutputJax config, but we pass options for metric consistency
    };

    const node = mathjax_document.convert(trimmed, options)
    let svg = adaptor.outerHTML(node)

    // Clean up MathJax output
    svg = cleanMathJaxOutput(svg);

    // Cache result
    if (formulaCache.size >= MAX_CACHE_SIZE) {
      // Simple LRU eviction (delete first inserted)
      const firstKey = formulaCache.keys().next().value;
      if (firstKey) formulaCache.delete(firstKey);
    }
    formulaCache.set(cacheKey, svg);

    return svg
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[MathJax] Failed to parse "${trimmed}":`, errorMessage);
    return `<span class="math-error" title="${errorMessage}">Math Error</span>`;
  }
}


/**
 * Parses an HTML string and replaces LaTeX math delimiters with SVG.
 * @param html The input HTML string
 * @returns HTML string with rendered math
 */
export function parseHTML(html: string): string {
  // Use replacement function with global regex to replace all occurrences safely
  // Process block math first
  let result = html.replace(blockRuleGlobal, (match, math) => {
    const svg = parseMath(math, true);
    return svg || match;
  });

  // Process inline math
  result = result.replace(inlineRuleGlobal, (match, math) => {
    const svg = parseMath(math, false);
    return svg || match;
  });

  return result;
}


