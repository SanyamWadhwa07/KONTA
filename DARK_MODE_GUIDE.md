# Samsung-Inspired Dark Mode Implementation

## Color Palette (Samsung One UI)

### Light Mode

- Background: `#FFFFFF`
- Surface: `#F5F5F5`
- Border: `#E5E5E5`
- Text Primary: `#080A0B`
- Text Secondary: `#9A9FA6`
- Accent: `#0072de`

### Dark Mode

- Background: `#1C1C1E` (Samsung dark background)
- Surface: `#2C2C2E` (Elevated surfaces)
- Border: `#3A3A3C` (Subtle borders)
- Text Primary: `#FFFFFF`
- Text Secondary: `#8E8E93`
- Accent: `#4A9FFF` (Brighter blue for dark mode)

## Usage Pattern

```tsx
className =
  "bg-white dark:bg-[#2C2C2E] border-[#E5E5E5] dark:border-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]"
```

## Applied to:

1. Sidepanel root
2. Popup root
3. SettingsModal (all sections)
4. All buttons, borders, and text

## Toggle Implementation

The dark mode toggle in settings automatically applies the `dark` class to `document.documentElement` which cascades to all components using Tailwind's `dark:` utility.
