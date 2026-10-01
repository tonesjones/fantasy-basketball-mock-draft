# Mobile redesign spec (native sheet, no framework)

Scope: phone layout only (`max-width: 700px`). Desktop is unchanged. No new
dependencies; the app must still work offline from `index.html`.

## Brief

Subject: a fantasy basketball mock draft room. Audience: one person drafting on
a phone, deciding a pick in under a minute. Primary job: see who's worth taking
now, open a player, draft them.

## Direction: "the draft room at the arena"

Replace the generic near-black/white-accent look with the materials of the
subject: court-navy floor, hardwood-maple accent for the moment that matters
(you're on the clock, the Draft button), chalk-white text.

### Color (mobile overrides of the existing `--dl-*` tokens)

| Token        | Hex       | Use                                         |
|--------------|-----------|---------------------------------------------|
| court        | `#0e1626` | page background                             |
| floor        | `#152036` | raised surfaces: sheet, open filters, nav   |
| line         | `#26344f` | borders and row dividers                    |
| chalk        | `#eef2f7` | primary text                                |
| haze         | `#9aa8bd` | secondary text (must stay 4.5:1 on court)   |
| maple        | `#f0b45a` | on-the-clock state, Draft button, active tab|

Existing green/amber/red semantic colors stay for good/ok/bad signals.

### Type

Geist (already bundled) only. Drop Geist Mono on mobile; numbers use
`font-variant-numeric: tabular-nums`. Scale: 12 / 14 / 16 / 20 / 32 px.
No all-caps labels, no letter-spaced eyebrows, sentence case everywhere.

### The one bold element

The pick header. "Pick 6" set at 32px tabular, maple when it's your turn,
with plain secondary lines beside it. Everything else stays quiet.

```
 Pick 6     You're on the clock
            Round 1 of 13 · next pick #19     <- no: avoid dot strings
            Round 1 of 13. Next pick #19
```

### Layout

```
+--------------------------------+
| Pick 6   You're on the clock   |  header
|          Round 1 of 13         |
| [ Search players            ]  |
| Filters & sort        All, ADP |
|--------------------------------|
| 8.4  Anthony Edwards    ▮▮▮    |  row: rank, name, playoff pips
|      MIN  PG/SG  ADP 7.9       |
|--------------------------------|
| Players  My team  Board  Anal. |  nav: maple top-indicator on active
+--------------------------------+
```

Left aligned throughout. Rows get more breathing room but less text: the
playoff line becomes three small week pips (W1/W2/W3, game count inside,
colored good/ok/bad) instead of a full sentence.

### Sheet

```
+--------------------------------+
|            ───                 |  grip (swipe down to close)
| Giannis Antetokounmpo   Close  |  one header, name once
| MIA  PF/C  ADP 7.7             |
|--------------------------------|
| coach advice (scrolls)         |
|                                |
| [ Draft Giannis Antetokounmpo ]|  maple, pinned, safe-area aware
+--------------------------------+
```

- Native `<dialog>`; slides up in 240ms using `@starting-style`, backdrop fades.
- Swipe down on the grip/header past 80px closes; otherwise it springs back.
- Name and ADP appear once (remove duplicate from coach card on mobile).
- "Close" is a compact text button with a 44px hit area; aria-label keeps
  "Close player details".

### Quality floor

44px touch targets, visible focus (maple outline), `prefers-reduced-motion`
disables slide/fade, safe-area insets on header, sheet footer and nav, no
horizontal scroll at 320px.

## Review against the frontend-design tells

- Was: near-black + single accent, mono data labels, caps eyebrow, dot-joined
  meta. All four removed in favor of subject-derived navy/maple and plain copy.
- Navy + amber was checked against the listed defaults (cream/terracotta,
  black/acid-green, broadsheet, SaaS cards, template chrome) and isn't one.
- Boldness is spent only on the pick header; rows and sheet stay disciplined.
