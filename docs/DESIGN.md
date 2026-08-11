# Design

Values sampled from screenshots of the live site, not eyeballed. Where a value
is a judgement call it says so.

## Palette

Three greens on warm grey paper. There is no black and no pure white anywhere in
the system: text is dark green, paper is warm grey, cards are warm off-white.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#DDDCD8` | page background, warm light grey |
| `--card` | `#EFEEEA` | raised surfaces, stat panels, list cards |
| `--forest` | `#0D3221` | headlines, dark pills, chips, primary text |
| `--emerald` | `#0AA96F` | accents, CTAs, active states, icon tiles |
| `--moss` | `#2C6249` | body copy, secondary text, labels |
| `--chalk` | `#F8FAFA` | text on dark/photo surfaces |

Derived, for states only:
```
--forest-hover  #123F2A
--emerald-hover #0BBC7C
--hairline      rgba(13, 50, 33, 0.14)
--scrim         linear-gradient(transparent, rgba(6, 26, 17, 0.85))
```

Never introduce a fourth hue. If something needs to stand out, it goes emerald
on paper or chalk on forest. Warnings and errors use forest with an emerald
underline, not red.

## Grain

The background is not flat. A flat patch of their page samples across a
luminance range of ~20, which means a noise texture sits over everything, and
photography carries a much heavier grain on top.

Implement as one fixed SVG turbulence overlay at low opacity, `pointer-events:
none`, above the background and below content. Do not apply it per-component.

Photography gets a stronger treatment: raised contrast, slight desaturation,
visible grain. It should look captured on a phone at night, not art directed.

## Type

Their display face is **ConferenceEF**, from Elsner+Flake. Identified from the
computed `font-family` on their live site, not guessed.

It is a commercial licence, so this build does not serve the font files. The
stack names it first anyway:

```
--font-display: 'ConferenceEF', 'Figtree', system-ui, sans-serif;
--font-body:    'ConferenceEF', 'Figtree', system-ui, sans-serif;
--font-mono:    'IBM Plex Mono', ui-monospace, monospace;
```

Naming a font in a stack is a reference to whatever is installed locally, which
needs no licence. Serving the files would. So on a machine that has ConferenceEF
licensed the build renders in the real face, and everyone else gets **Figtree**,
the closest free match for its weight and warmth.

If this ever ships beyond a concept build, buy the webfont licence rather than
self-hosting a file found elsewhere.

Scale, from their page:
- Hero: `clamp(38px, 6vw, 72px)`, weight 800, tracking `-0.03em`, leading `0.98`
- H2: `clamp(28px, 4vw, 52px)`, weight 800, tracking `-0.025em`, centered
- Subhead: 20px, weight 600, emerald
- Support line: 15px, weight 500, moss
- Body: 15px, weight 400, moss, leading 1.6
- Stat number: 34px, weight 800, forest
- Stat label: 11px, weight 600, uppercase, tracking `0.1em`, moss

The mono face is mine, not theirs. Data tables, check-in codes, and IDs read
better in mono and it never appears at display size, so it does not fight the
brand.

## Shape

- Buttons: full pill, `border-radius: 999px`, generous horizontal padding
- Cards: `border-radius: 18px`
- Photo cards: `border-radius: 18px`, full-bleed image, scrim from the bottom,
  chalk display text and stats sitting in the scrim
- Icon tiles: 44px emerald rounded square, `border-radius: 12px`, forest glyph
- No drop shadows anywhere. Depth comes from the paper/card value step.

## Components to match

**Segmented toggle** (their Brands / Hosts): forest pill container, emerald
active segment, chalk label on the active one, muted chalk on the inactive.
Used in this app for Brand / Host / Ops.

**Stat block**: big forest number, small uppercase moss label beneath. Never a
label above a number. Group four to a card on a two-by-two grid with a hairline
rule before any fifth spanning item.

**Section header**: centered. Forest H2, then emerald subhead, then a smaller
moss support line. Three levels, always in that order, never two.

**Category card**: grainy full-bleed photo, scrim, chalk name in display weight,
then two stats side by side in the scrim.

## What we do not copy

Do not reproduce their logo or wordmark. Palette and type convey that this build
speaks their language; a copied mark is a trademark problem and reads as
impersonation rather than fluency.

Every screen carries the concept-build label. It is not decoration and it is not
removable.
