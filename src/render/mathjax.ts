/**
 * MathJax wrapper — lazy-loaded to avoid bloating the bundle (~776KB).
 * Only imported on first math render.
 */

let _init: Promise<{ parseMath: (math: string, display?: boolean) => string }> | null = null;

function ensureMathjax() {
  if (!_init) {
    _init = (async () => {
      const [
        { LiteAdaptor },
        { RegisterHTMLHandler },
        { TeX },
        { AllPackages },
        { mathjax },
        { SVG },
      ] = await Promise.all([
        import('mathjax-full/js/adaptors/liteAdaptor'),
        import('mathjax-full/js/handlers/html'),
        import('mathjax-full/js/input/tex'),
        import('mathjax-full/js/input/tex/AllPackages'),
        import('mathjax-full/js/mathjax'),
        import('mathjax-full/js/output/svg'),
      ]);

      const adaptor = new LiteAdaptor();
      RegisterHTMLHandler(adaptor);

      const doc = mathjax.document('', {
        InputJax: new TeX({ packages: AllPackages }),
        OutputJax: new SVG({ fontCache: 'none', scale: 0.8 }),
      });

      const options = { em: 13, ex: 6.5, containerWidth: 1280 };

      return {
        parseMath(math: string, display: boolean = false): string {
          const node = doc.convert(math, { ...options, display });
          return adaptor.outerHTML(node);
        },
      };
    })();
  }
  return _init;
}

export async function parseMath(math: string, display: boolean = false): Promise<string> {
  const mj = await ensureMathjax();
  return mj.parseMath(math, display);
}
