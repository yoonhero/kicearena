import katex from "katex";
import "katex/dist/katex.min.css";
import { memo, useMemo } from "react";

const MAX_MATH_CACHE_ENTRIES = 300;
const mathHtmlCache = new Map<string, string>();

const cacheKey = (latex: string, displayMode: boolean) =>
    `${displayMode ? "display" : "inline"}\u0000${latex}`;

const rememberMathHtml = (key: string, html: string) => {
    if (mathHtmlCache.has(key)) mathHtmlCache.delete(key);
    mathHtmlCache.set(key, html);
    if (mathHtmlCache.size <= MAX_MATH_CACHE_ENTRIES) return;
    const oldestKey = mathHtmlCache.keys().next().value;
    if (oldestKey) mathHtmlCache.delete(oldestKey);
};

export const renderMathHtml = (latex: string, displayMode = false) => {
    const key = cacheKey(latex, displayMode);
    const cached = mathHtmlCache.get(key);
    if (cached) {
        mathHtmlCache.delete(key);
        mathHtmlCache.set(key, cached);
        return cached;
    }

    const html = katex.renderToString(latex, {
        displayMode,
        output: "html",
        throwOnError: false,
        strict: "ignore",
        trust: false,
    });
    rememberMathHtml(key, html);
    return html;
};

export const MathHtml = memo(function MathHtml({
    latex,
    displayMode = false,
    className = "",
}: {
    latex: string;
    displayMode?: boolean;
    className?: string;
}) {
    const html = useMemo(() => renderMathHtml(latex, displayMode), [displayMode, latex]);
    const mathClassName =
        `${displayMode ? "kice-math-display" : "kice-math-inline"} ${className}`.trim();

    return <span className={mathClassName} dangerouslySetInnerHTML={{ __html: html }} />;
});
