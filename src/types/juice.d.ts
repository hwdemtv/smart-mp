declare module 'juice' {
  interface JuiceOptions {
    extraCss?: string;
    preserveFontFaces?: boolean;
    preserveImportant?: boolean;
    preserveMediaQueries?: boolean;
    preserveKeyFrames?: boolean;
    preservePseudos?: boolean;
    removeStyleTags?: boolean;
    applyStyleTags?: boolean | string[];
    insertPreservedExtraCss?: boolean;
    lineLength?: number;
    styleToAttribute?: string[];
    nonVisualElements?: string[];
    excludedProperties?: string[];
    ignoredPseudos?: string[];
    widthElements?: string[];
    heightElements?: string[];
    tableElements?: string[];
    codeBlocks?: string[];
    inlinePseudoElements?: boolean;
    resolveCSSVariables?: boolean;
    xmlMode?: boolean;
    preserveInlineStyles?: boolean;
    singleModule?: boolean;
  }

  function juice(html: string, options?: JuiceOptions): string;

  export = juice;
}
