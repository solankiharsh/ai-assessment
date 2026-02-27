# Theme and design system

The frontend uses the **deriv-ai-research-agent** design system for visual consistency.

## Stack

- **Styling:** Tailwind CSS v4 with `@theme inline` and CSS variables
- **UI primitives:** shadcn (New York style) + Radix UI
- **Theme:** Dark-only, oklch-based tokens, orange-tinted primary

## Main tokens

Defined in `frontend/src/app/globals.css`:

| Token | Role |
|-------|------|
| `--background`, `--foreground` | Page and text |
| `--card`, `--card-foreground` | Cards and panels |
| `--primary`, `--primary-foreground` | Primary actions and accent |
| `--muted`, `--muted-foreground` | Secondary text and surfaces |
| `--border`, `--input`, `--ring` | Borders, inputs, focus ring |
| `--destructive` | Errors and destructive actions |
| `--sidebar-*`, `--chart-*` | Sidebar and charts (shadcn) |

## App-specific tokens

- **Risk severity:** `--risk-critical`, `--risk-high`, `--risk-medium`, `--risk-low`, `--risk-info`
- **Entity types:** `--entity-person`, `--entity-org`, `--entity-location`, `--entity-event`, `--entity-document`, `--entity-financial`

## Components

- **Location:** `frontend/src/components/ui/`
- **Primitives:** Button, Badge, Card, Input, Progress, ScrollArea, Slider, Tabs, Tooltip
- **Layout:** HeaderBar, ConsoleLayout, LeftPanel, CenterPanel

## Usage

- Prefer Tailwind semantic classes: `bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`, `bg-primary`, `text-destructive`, etc.
- For risk/entity colors, use `var(--risk-*)` or `var(--entity-*)` where needed.
