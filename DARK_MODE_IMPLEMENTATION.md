# Dark Mode Implementation - Samsung One UI Design

## Overview

Professional dark mode implementation following Samsung One UI design principles. The theme automatically switches when users toggle the dark mode setting in Settings → Appearance.

## Color Palette

### Light Mode (Default)

- **Background**: `#FFFFFF` (white)
- **Surface**: `#F5F5F5` (light gray)
- **Border**: `#E5E5E5` (light border)
- **Text Primary**: `#080A0B` (near black)
- **Accent**: `#0072de` (blue)
- **Text Secondary**: `#9A9FA6` (gray)

### Dark Mode

- **Background**: `#1C1C1E` (deep black)
- **Surface**: `#2C2C2E` (elevated surface)
- **Border**: `#3A3A3C` (dark border)
- **Text Primary**: `#FFFFFF` (white)
- **Accent**: `#4A9FFF` (bright blue)
- **Text Secondary**: `#9A9FA6` (gray - same as light)

## How It Works

### 1. Settings Toggle

- Location: **Settings Modal → Appearance → Dark Mode**
- Stored in: `chrome.storage.local` under `settings.ui.darkMode`
- Applied via: `useEffect` in `PopulatedState.tsx` (line ~413-420)

```typescript
useEffect(() => {
  if (settings.ui.darkMode) {
    document.documentElement.classList.add("dark")
  } else {
    document.documentElement.classList.remove("dark")
  }
}, [settings.ui.darkMode])
```

### 2. Tailwind Dark Mode

Uses Tailwind's `class` strategy for dark mode:

- Configured in `tailwind.config.js`: `darkMode: 'class'`
- Classes applied: `bg-white dark:bg-[#1C1C1E]`
- Transitions: Smooth color changes via CSS (0.3s ease)

### 3. CSS Variables

Global dark mode variables in [style.css](style.css):

```css
.dark {
  --primary-dark: #4a9fff;
  --bg-dark: #1c1c1e;
  --surface-dark: #2c2c2e;
  --border-dark: #3a3a3c;
  --text-dark: #ffffff;
  color-scheme: dark;
}
```

## Components Updated

### ✅ Core Components (Fully Implemented)

1. **popup.tsx** - Extension popup (lines 30-35)
2. **sidepanel.tsx** - Sidepanel root container (line 33)
3. **style.css** - Global styles and CSS variables
4. **SettingsModal.tsx** - Settings panel (all 393 lines)
5. **EmptyState.tsx** - Onboarding empty state (all 176 lines)
6. **PopulatedState.tsx** - Main UI container (header, tabs, search, filters updated)
7. **graph.tsx** - Full-page graph view (all UI elements updated)

### 🔄 Patterns Used

#### Static Backgrounds

```tsx
className = "bg-white dark:bg-[#1C1C1E]"
```

#### Borders

```tsx
className = "border-[#E5E5E5] dark:border-[#3A3A3C]"
```

#### Text

```tsx
className = "text-[#080A0B] dark:text-[#FFFFFF]"
```

#### Buttons (Active State)

```tsx
style={{
  backgroundColor: isActive ?
    (document.documentElement.classList.contains('dark') ? '#4A9FFF' : '#0072de')
    : 'transparent',
  color: isActive ? '#FFFFFF' :
    (document.documentElement.classList.contains('dark') ? '#FFFFFF' : '#080A0B')
}}
```

#### Hover States

```tsx
className = "hover:bg-gray-50 dark:hover:bg-[#2C2C2E]"
```

## Testing Checklist

### Visual Testing

- [ ] Toggle dark mode in Settings
- [ ] Check all tabs: Timeline, Knowledge Graph, Projects, Focus Mode
- [ ] Verify search bar changes color
- [ ] Test filter buttons (labels, clusters)
- [ ] Check modal overlays (Settings, Add Label)
- [ ] Verify graph full view controls and UI

### Interaction Testing

- [ ] Hover states on buttons
- [ ] Active/selected states on tabs
- [ ] Loading animations (search spinner)
- [ ] Empty states (no results, no data)
- [ ] Sidebar scroll arrows

### Edge Cases

- [ ] Rapid toggle of dark mode (no flashing)
- [ ] Page reload preserves dark mode setting
- [ ] Extension restart maintains preference

## Known Limitations

1. **Graph Canvas** - D3 force graph canvas uses hardcoded colors in drawing logic (not CSS-based)
2. **Session Cards** - Timeline session cards need individual dark mode updates (future enhancement)
3. **Project Cards** - Project view cards need dark mode styling (future enhancement)
4. **Cluster Labels** - Inline cluster labels in timeline need updates (future enhancement)

## Future Enhancements

### Priority 1 (High Impact)

- [ ] Session cards in timeline view
- [ ] Project cards and project detail views
- [ ] Context menu overlays (page actions, label management)

### Priority 2 (Polish)

- [ ] Toast notifications
- [ ] Tooltip styling
- [ ] Badge colors (notification badges, counters)

### Priority 3 (Advanced)

- [ ] Graph canvas node colors adapt to theme
- [ ] Favicon placeholders in dark mode
- [ ] Loading skeleton screens

## Maintenance Notes

### When Adding New Components

1. Use Tailwind dark mode classes: `dark:bg-[#1C1C1E]`
2. Reference color palette constants (avoid hardcoding)
3. Test both light and dark modes before committing
4. Use Samsung color values for consistency

### When Modifying Existing Components

1. Check if dark mode classes exist
2. Preserve accessibility (contrast ratios)
3. Match hover/active states to theme
4. Validate against Samsung One UI guidelines

## Resources

- [Samsung One UI Design Guidelines](https://design.samsung.com/)
- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- Color Contrast Checker: [WebAIM](https://webaim.org/resources/contrastchecker/)

---

**Implementation Date**: January 2025  
**Framework**: Plasmo + React + Tailwind CSS  
**Design System**: Samsung One UI Inspired
