# Museum Map SVG Label System

Reference for the two types of vector-text labels in `svg/museum-map.svg` and how they're handled by `MuseumMap.tsx`.

## Overview

The SVG contains two distinct sets of path-based text labels (not `<text>` elements — these are `<path>` outlines):

1. **"GALLERY N" number labels** — e.g. "GALLERY 1", "GALLERY 2", etc.
2. **Gallery name labels** — e.g. "Foundation", "IT Story", "Wintrol", etc.

Both are rendered as SVG `<path>` elements grouped inside bare `<g>` tags (no `id`). Each set uses a unique CSS class per gallery for fill color.

---

## 1. "GALLERY N" Number Labels

These spell out "GALLERY 1" through "GALLERY 9" on the floor plan.

### Mapping

| Gallery # | Gallery ID          | SVG Group ID           | Label CSS Class | SVG Lines   |
|-----------|---------------------|------------------------|-----------------|-------------|
| 1         | hilight-experience    | hilightexperience        | `st86`          | 4011–4018   |
| 2         | prologue            | Proluge                | `st51`          | 1450–1457   |
| 3         | people-garden       | gallery_people_garden  | `st58`          | 3645–3654   |
| 4         | factory-experience  | FACTORY_Experience     | `st62`          | 1494–1501   |
| 5         | consumer-care       | Consumer_c             | `st91`          | 1474–1481   |
| 6         | wintrol             | wintrol                | `st93`          | 1512–1519   |
| 7         | it-story            | IT_Story               | `st17`          | 1542–1549   |
| 8         | spirit-of-hilight     | spirit_of_hiLight        | `st98`          | 2922–2931   |
| 9         | foundation          | Foundation             | `st54`          | 2946–2956   |

### How they work

Each label is a bare `<g>` containing 8–9 `<path>` elements that share the same CSS class. The 8 paths spell "GALLERY" and the 9th path is the digit.

**Problem solved**: These labels were originally nested inside their gallery floor plan groups. When a gallery was hidden (e.g. `visibility: hidden` for `category_inactive`) or a parent group got `opacity: 0` (structural/auxiliary groups), the labels disappeared too.

**Solution** (`MuseumMap.tsx`):
1. During SVG load, labels are **extracted** from their parent groups into a new top-level `<g id="gallery-number-labels">`.
2. Each extracted `<g>` is tagged with `data-gallery-label="<gallery-id>"`.
3. The color state `useEffect` styles them per view state:

| State | Condition | Fill | Opacity |
|---|---|---|---|
| **Default** | screensaver / categories screen | Original SVG color | 1 |
| **Category active** | gallery's category is selected, no gallery focused | Original SVG color | 1 |
| **Gallery active** | this specific gallery is selected | `#ffffff` (white) | 1 |
| **Gallery inactive** | sibling in same category, different gallery selected | Original SVG color | 0.47 |
| **Category inactive** | gallery belongs to a different category | `#c0c0c0` (light grey) | 1 |

**Identification logic**: The code finds the label `<g>` by querying for the first `.stNN` path, checking its parent is a bare `<g>` (no `id`) containing 7+ paths of the same class.

### Constant in code

```ts
// MuseumMap.tsx
const galleryNumberLabelClasses: Record<string, string> = {
  'hilight-experience': 'st86',   // Gallery 1
  'prologue': 'st51',           // Gallery 2
  'people-garden': 'st58',      // Gallery 3
  'factory-experience': 'st62', // Gallery 4
  'consumer-care': 'st91',      // Gallery 5
  'wintrol': 'st93',            // Gallery 6
  'it-story': 'st17',           // Gallery 7
  'spirit-of-hilight': 'st98',    // Gallery 8
  'foundation': 'st54',         // Gallery 9
};
```

---

## 2. Gallery Name Labels (REMOVED)

These spelled out gallery names like "Foundation", "Consumer Care", "Wintrol", etc.

### Mapping

| Text Group ID              | Gallery            | SVG Line |
|----------------------------|--------------------|----------|
| `Layer_1-2-g-1-text-1`    | Foundation         | 778      |
| `Layer_1-2-g-1-text-2`    | Consumer Care      | 832      |
| `Layer_1-2-g-1-text-3`    | Factory Experience | 876      |
| `Layer_1-2-g-1-text-4`    | Wintrol            | 946      |
| `Layer_1-2-g-1-text-5`    | Spirit of Curato  | 986      |
| `Layer_1-2-g-1-text-6`    | Curato Experience | 1066     |
| `Layer_1-2-g-1-text-7`    | Prologue           | 1237     |
| `Layer_1-2-g-1-text-8`    | People Garden      | 1287     |
| *(none)*                   | IT Story           | —        |

**Note**: IT Story has no text group (`textGroupId` is empty in `galleries.ts`).

### Structure

These live inside `Layer_1-2` (the overall text/annotation layer). Each group contains pairs of `<g class="st6">` sub-groups with paths in `st55` (fill) and `st24` (shadow), rendering the same letter shapes twice for a shadow effect.

### Why they were removed

`Layer_1-2` gets `opacity: 0` when zoomed into a category. These name labels would briefly flash during the zoom transition (visible for one frame before the `useEffect` fires), then disappear. They were removed entirely during SVG load to prevent this flash.

**Removal code** (`MuseumMap.tsx`, inside SVG load `useEffect`):
```ts
const nameLabels = Array.from(layer1.querySelectorAll('[id^="Layer_1-2-g-1-text-"]'));
for (let nl = 0; nl < nameLabels.length; nl++) {
  nameLabels[nl].remove();
}
```

### `textGroupId` in galleries.ts

Each gallery has a `textGroupId` field that references these groups. The `editorConfig.json` color states have `textVisibility` and `textFill` properties that were intended to control them, but since the labels are now removed, these config fields are effectively unused for the main map. They may still be referenced by `applyColorStateToGallery()` — the code is safe (it queries by ID and gets `null`).

---

## SVG Layer Hierarchy (relevant layers)

```
<svg>
  ├── <g id="Layer_1-2">           ← Text/annotation layer (opacity: 0 when zoomed)
  │   ├── Layer_1-2-g-1-text-1..8  ← Gallery name labels (REMOVED at load)
  │   └── <text> elements           ← White text labels (REMOVED at load)
  │
  ├── <g id="Proluge">             ← Gallery floor plan group (svgGroupId)
  │   └── <g id="gallery_Proluge"> ← Sub-group (in auxiliaryGroupIds → opacity: 0 when zoomed)
  │       └── <g> (bare)           ← "GALLERY 2" label was here (EXTRACTED to label layer)
  │
  ├── <g id="Consumer_c">
  │   └── <g id="gallery_consumer_care">
  │       └── <g> (bare)           ← "GALLERY 5" label was here (EXTRACTED)
  │
  ├── ... (other gallery groups)
  │
  ├── <g id="outline">             ← Outline layer (shown when zoomed)
  ├── <g id="Layer_21">            ← Route paths layer (toggled per category)
  │
  └── <g id="gallery-number-labels">  ← CREATED at load time
      ├── <g data-gallery-label="hilight-experience">   ← Gallery 1 (.st86 paths)
      ├── <g data-gallery-label="prologue">            ← Gallery 2 (.st51 paths)
      ├── <g data-gallery-label="people-garden">       ← Gallery 3 (.st58 paths)
      ├── <g data-gallery-label="factory-experience">  ← Gallery 4 (.st62 paths)
      ├── <g data-gallery-label="consumer-care">       ← Gallery 5 (.st91 paths)
      ├── <g data-gallery-label="wintrol">             ← Gallery 6 (.st93 paths)
      ├── <g data-gallery-label="it-story">            ← Gallery 7 (.st17 paths)
      ├── <g data-gallery-label="spirit-of-hilight">     ← Gallery 8 (.st98 paths)
      └── <g data-gallery-label="foundation">          ← Gallery 9 (.st54 paths)
```

---

## Categories → Galleries mapping

| Category          | Category ID   | Galleries                                              |
|-------------------|---------------|--------------------------------------------------------|
| Experience & Origin | `origin`    | Gallery 1 (hilight-experience), 2 (prologue), 3 (people-garden) |
| Business          | `businesses`  | Gallery 4 (factory-experience), 5 (consumer-care), 6 (wintrol), 7 (it-story) |
| Galleries 8-9     | `community`   | Gallery 8 (spirit-of-hilight), 9 (foundation)           |

---

## Adding a new gallery label

If a new gallery is added to the SVG:

1. Find the CSS class used for its "GALLERY N" path group in the SVG
2. Add the mapping to `galleryNumberLabelClasses` in `MuseumMap.tsx`
3. The extraction and styling logic handles it automatically
4. If it has a name label in `Layer_1-2` with id `Layer_1-2-g-1-text-*`, it will be auto-removed by the existing selector
