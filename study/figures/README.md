# Paper figures (EDI / EPIDEMIA 2.0)

| ID | File (TikZ) | Preview (SVG) | Section |
|----|-------------|---------------|---------|
| Fig 1 | `edi-paradigm.tex` | `edi-paradigm.svg` | Intro — clean EDI interaction model only |
| Fig 1 overview | `edi-unified-framework.tex` | `edi-unified-framework.svg` | Intro — combined research program + paradigm + EPIDEMIA + study |
| | | `edi-unified-framework.docx` / `.doc` | Word versions of the unified figure |
| Fig 1 alt | `edi-framework.tex` | `edi-framework.svg` | Optional legacy overview (mechanisms → DGs → study → DPs) |
| Fig 1b | `edi-contribution-pyramid.tex` | `edi-contribution-pyramid.svg` | Optional alt. contribution stack |
| Fig 2 | `fig2-system-architecture.tex` | `fig2-system-architecture.svg` | EPIDEMIA Overview |
| Fig 6 | `fig6-study-procedure.tex` | `fig6-study-procedure.svg` | Evaluation |

## Still needed (screenshots / results)

| ID | How to produce |
|----|----------------|
| Fig 3 | Annotated screenshot: Decision tab **Why this alert** |
| Fig 4 | Optional workflow diagram or annotated UI path |
| Fig 5 | Annotated screenshot: full Decision panel |
| Fig 7–9 | After study: Baseline vs EDI charts for F1–F3 |

## Overleaf preamble

```latex
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning,fit}
```

Prefer **TikZ** (`.tex`) in the paper. Use **SVG** only to preview in a browser.
