# SAM3 UI Refactor Plan - TailwindCSS + shadcn/ui

**Branch**: `ui-refactor-shadcn`
**Date**: 2025-11-23
**Goal**: Modernize the SAM3 Dataset Labeling UI with a clean, professional black & white design using TailwindCSS and shadcn/ui components

---

## Overview

This refactor replaces all inline React styles with TailwindCSS utilities and shadcn/ui components. The new design follows a minimalist black/white/gray color scheme for a professional, distraction-free labeling experience.

### Key Benefits
- **Consistency**: Unified design system with shadcn/ui
- **Maintainability**: No more inline styles scattered across components
- **Accessibility**: shadcn components built on Radix UI primitives
- **Responsiveness**: Tailwind utilities make responsive design easier
- **Dark Mode Ready**: Built-in dark mode support (future enhancement)

---

## Setup Complete ✓

### Dependencies Installed
- [x] TailwindCSS v4 + @tailwindcss/vite
- [x] shadcn/ui CLI initialized (Default style, Neutral theme)
- [x] react-dropzone for file uploads
- [x] 13 core shadcn components:
  - button, card, input, label, select
  - dialog, badge, alert, separator
  - scroll-area, tooltip, progress, tabs

### Configuration
- [x] `vite.config.ts` - Tailwind plugin + path alias (`@/`)
- [x] `tsconfig.json` + `tsconfig.app.json` - Path resolution
- [x] `src/index.css` - Tailwind imports + CSS variables
- [x] `components.json` - shadcn configuration
- [x] `src/lib/utils.ts` - Utility functions (cn helper)

---

## Design System

### Color Palette (Neutral Black/White Theme)

**Light Mode (Default)**:
```css
--background: oklch(1 0 0)           /* Pure white */
--foreground: oklch(0.145 0 0)       /* Near black */
--primary: oklch(0.205 0 0)          /* Dark gray/black */
--secondary: oklch(0.97 0 0)         /* Light gray */
--muted: oklch(0.97 0 0)             /* Subtle gray */
--accent: oklch(0.97 0 0)            /* Light accent */
--destructive: oklch(0.577 0.245 27.325) /* Red for delete actions */
--border: oklch(0.922 0 0)           /* Light border */
```

**Dark Mode (Future)**:
- Variables defined in `src/index.css:85-117`

### Typography
- Default system fonts: `system-ui, Avenir, Helvetica, Arial, sans-serif`
- Consistent sizing via Tailwind: `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-3xl`

### Spacing Scale
- Tailwind default: `gap-2`, `gap-3`, `gap-4`, `gap-5`, `gap-6`
- Padding: `p-2`, `p-3`, `p-4`, `p-5`, `p-6`
- Margin: `mt-2`, `mb-4`, `mx-auto`, etc.

### Border Radius
- `--radius: 0.625rem` (10px) - Default rounded corners
- Variants: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`

---

## Component Refactor Plan

### Phase 1: Simple Form Components (Easiest First)

#### 1. CropAndLabel.tsx
**Current**: 100% inline styles, custom form
**Target**: shadcn Input, Label, Select, Button, Card, Badge

**Changes**:
- [ ] Wrap entire component in `<Card>`
- [ ] Replace label input with `<Label>` + `<Input>`
- [ ] Replace background select with shadcn `<Select>`
- [ ] Replace buttons with `<Button variant="default">` and `<Button variant="secondary">`
- [ ] Use `<Badge>` for keyboard shortcut numbers (1-9)
- [ ] Add `<Card className="bg-muted">` for keyboard shortcut help section
- [ ] Apply `space-y-4` for vertical spacing

**Before (inline)**:
```tsx
<input style={{ padding: '10px', fontSize: '16px', ... }} />
<button style={{ backgroundColor: '#1976D2', ... }}>Save</button>
```

**After (shadcn)**:
```tsx
<Label htmlFor="label-input">Label</Label>
<Input id="label-input" placeholder="e.g., car, person..." />
<Button onClick={handleSave}>Save Crop (Enter)</Button>
```

**Estimated Time**: 1 hour

---

#### 2. ProjectManager.tsx
**Current**: Inline modal dialog, styled project cards, manual hover states
**Target**: shadcn Dialog, Card, Button, Badge, ScrollArea

**Changes**:
- [ ] Replace custom modal with `<Dialog>`, `<DialogContent>`, `<DialogHeader>`
- [ ] Replace project list items with `<Card>` components
- [ ] Use `<ScrollArea>` for project list scrolling
- [ ] Replace "New Project" button with `<Button className="w-full">`
- [ ] Replace delete button with `<Button variant="destructive" size="icon">`
- [ ] Use `<Badge variant="outline">` for crop/label counts
- [ ] Apply `cn()` utility for conditional styling (selected project)

**Before (inline)**:
```tsx
{showDialog && <div style={{ position: 'fixed', ... }}>...</div>}
<div style={{ padding: '12px', backgroundColor: isSelected ? '#e3f2fd' : 'white' }}>
```

**After (shadcn)**:
```tsx
<Dialog open={showDialog} onOpenChange={setShowDialog}>
  <DialogContent>...</DialogContent>
</Dialog>
<Card className={cn("cursor-pointer", isSelected && "border-primary")}>
```

**Estimated Time**: 1.5 hours

---

### Phase 2: Layout & Navigation

#### 3. App.tsx
**Current**: Inline styled header, workflow cards, sidebar layout
**Target**: shadcn Button, Card, Badge, Separator

**Changes**:
- [ ] Replace header with Tailwind utilities: `bg-primary text-primary-foreground`
- [ ] Replace workflow buttons with `<Button variant={active ? 'default' : 'secondary'}>`
- [ ] Use `<Badge>` for crop/label counts in header
- [ ] Replace instruction cards with `<Card>`, `<CardHeader>`, `<CardContent>`
- [ ] Add `<Separator>` between workflow sections
- [ ] Apply grid layout: `grid grid-cols-1 md:grid-cols-3 gap-5`
- [ ] Use `flex`, `justify-between`, `items-center` for header layout

**Before (inline)**:
```tsx
<header style={{ backgroundColor: '#1976D2', padding: '20px', ... }}>
<button style={{ padding: '10px 20px', backgroundColor: workflow === 'upload' ? '#27ae60' : '#7f8c8d' }}>
```

**After (shadcn)**:
```tsx
<header className="bg-primary text-primary-foreground shadow-md">
  <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
    <Button variant={workflow === 'upload' ? 'default' : 'secondary'}>
```

**Estimated Time**: 1.5 hours

---

### Phase 3: Complex Interactive Components

#### 4. ImageUpload.tsx
**Current**: Custom drag-and-drop, inline styles, manual error display
**Target**: react-dropzone + shadcn Card, Alert, Progress

**Changes**:
- [ ] Install and configure react-dropzone
- [ ] Wrap dropzone in `<Card className="p-5">`
- [ ] Replace error div with `<Alert variant="destructive">`
- [ ] Add `<Progress>` bar for upload feedback
- [ ] Use Tailwind utilities for dropzone styling: `border-dashed`, `hover:bg-accent`
- [ ] Apply `text-center`, `py-12` for dropzone content

**Before (inline)**:
```tsx
<div style={{ border: '2px dashed #ccc', padding: '40px', ... }}>
{error && <div style={{ color: 'red', marginTop: '15px' }}>{error}</div>}
```

**After (shadcn)**:
```tsx
<Card className="p-5">
  <Dropzone onDrop={handleDrop} className="border-dashed hover:bg-accent">
    <div className="text-center py-12">...</div>
  </Dropzone>
  {error && (
    <Alert variant="destructive" className="mt-4">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )}
</Card>
```

**Estimated Time**: 1 hour

---

#### 5. InteractiveCanvas.tsx
**Current**: Canvas with inline styled controls, mask selector grid
**Target**: shadcn Card, Button, Badge, Tooltip

**Changes**:
- [ ] Wrap canvas in `<Card>` with padding
- [ ] Replace instruction panel with `<Card className="mb-4 bg-muted">`
- [ ] Replace control buttons with `<Button variant="destructive">` (Clear) and `<Button variant="secondary">` (Undo)
- [ ] Use `<Badge>` for:
  - Click mode indicator
  - Point counter
  - Segmentation status
  - Mask confidence scores
- [ ] Replace mask selector grid with `<Card>` grid using `grid grid-cols-3 gap-3`
- [ ] Add `<Tooltip>` for keyboard shortcut hints
- [ ] Apply `cn()` for selected mask highlighting

**Before (inline)**:
```tsx
<button style={{ backgroundColor: '#f44336', color: 'white', ... }}>Clear All</button>
<div style={{ padding: '12px 20px', border: `2px solid ${selected ? '#1976D2' : '#ccc'}` }}>
  Mask {idx + 1} - {(score * 100).toFixed(1)}%
</div>
```

**After (shadcn)**:
```tsx
<Button variant="destructive" onClick={handleClear}>Clear All</Button>
<Card className={cn("cursor-pointer", selected && "border-primary bg-primary/5")}>
  <CardContent className="p-4 text-center">
    <p className="text-sm font-semibold">Mask {idx + 1}</p>
    <Badge variant="secondary">{(score * 100).toFixed(1)}%</Badge>
  </CardContent>
</Card>
```

**Estimated Time**: 1.5 hours

---

## Implementation Checklist

### Setup Phase ✓
- [x] Create git branch `ui-refactor-shadcn`
- [x] Install TailwindCSS v4
- [x] Configure Vite + TypeScript
- [x] Initialize shadcn/ui
- [x] Install core components
- [x] Install react-dropzone
- [x] Create this documentation

### Refactoring Phase (In Progress)
- [ ] Refactor CropAndLabel.tsx
- [ ] Refactor ProjectManager.tsx
- [ ] Refactor App.tsx
- [ ] Refactor ImageUpload.tsx
- [ ] Refactor InteractiveCanvas.tsx

### Testing Phase
- [ ] Start backend server (`node backend/server.js`)
- [ ] Start frontend dev server (`npm run dev`)
- [ ] Open Chrome via MCP
- [ ] Test project creation/selection
- [ ] Test image upload (drag-drop + click)
- [ ] Test canvas interaction (click points, mask selection)
- [ ] Test crop labeling (form inputs, keyboard shortcuts)
- [ ] Test gallery view
- [ ] Verify all buttons have correct hover states
- [ ] Verify responsive behavior (resize window)
- [ ] Check visual consistency across all views

### Polish Phase
- [ ] Add screenshots to this document
- [ ] Document any breaking changes
- [ ] Update CLAUDE.md with new component structure
- [ ] Create PR with detailed description

---

## Testing Strategy

### Manual Testing via MCP Chrome

**Test Scenarios**:

1. **Project Management**
   - Create new project
   - Select project
   - Delete project
   - Verify dialog animations
   - Check button states

2. **Image Upload**
   - Drag and drop image
   - Click to browse image
   - Test file validation (wrong type, too large)
   - Verify error messages display
   - Check upload progress

3. **Interactive Segmentation**
   - Click to add foreground point (left-click)
   - Click to add background point (right-click)
   - Verify point visualization (green/red circles)
   - Check mask generation
   - Test mask selector cards
   - Switch between masks
   - Test Clear/Undo buttons
   - Verify keyboard shortcuts

4. **Crop Labeling**
   - Enter label text
   - Select background mode
   - Test keyboard shortcuts (1-9 for recent labels)
   - Save crop (Enter key)
   - Skip crop (Esc key)
   - Verify form validation

5. **Gallery View**
   - View saved crops
   - Check layout and spacing
   - Verify labels display correctly

### Visual Regression Testing

**Before/After Comparisons**:
- Take screenshots of each view before refactoring
- Take screenshots after refactoring
- Compare for:
  - Layout consistency
  - Spacing uniformity
  - Color palette adherence
  - Typography consistency
  - Interactive states (hover, focus, active)

---

## Breaking Changes & Migration Notes

### None Expected
This refactor is **purely visual/stylistic**. No functional changes are planned.

**What stays the same**:
- All React component logic
- API calls and data flow
- Canvas rendering logic
- Keyboard shortcuts
- LocalStorage integration
- Session management

**What changes**:
- Visual appearance (black/white theme)
- Component markup (shadcn components instead of divs/buttons)
- Import statements (`@/components/ui/*`)
- CSS approach (Tailwind utilities instead of inline styles)

---

## File Changes Summary

### New Files Created
- `src/components/ui/` - 13 shadcn component files
- `src/lib/utils.ts` - Utility functions
- `components.json` - shadcn config
- `UI_REFACTOR_PLAN.md` - This file

### Modified Files
- `vite.config.ts` - Added Tailwind plugin + path alias
- `tsconfig.json` - Added path resolution
- `tsconfig.app.json` - Added path resolution
- `src/index.css` - Replaced with Tailwind imports + CSS variables
- `package.json` - Added dependencies

### Files to Refactor
- `src/App.tsx`
- `src/components/ProjectManager.tsx`
- `src/components/ImageUpload.tsx`
- `src/components/InteractiveCanvas.tsx`
- `src/components/CropAndLabel.tsx`

---

## Future Enhancements (Post-Refactor)

### Nice-to-Have Features
- [ ] Dark mode toggle (CSS variables already support it)
- [ ] Toast notifications for success/error messages
- [ ] Loading skeletons for data fetching
- [ ] Animated transitions between workflow states
- [ ] Keyboard shortcut help dialog (using `<Dialog>`)
- [ ] Responsive design improvements for mobile/tablet

### Performance Optimizations
- [ ] Code splitting for shadcn components
- [ ] Lazy loading for gallery images
- [ ] Debounced search for project list (when many projects)

---

## Success Criteria

### Visual
- ✓ Clean black/white/gray design
- ✓ Consistent spacing and typography
- ✓ Smooth hover/focus states
- ✓ Professional appearance

### Functional
- ✓ All features work exactly as before
- ✓ No regressions in functionality
- ✓ Keyboard shortcuts still work
- ✓ Responsive across screen sizes

### Code Quality
- ✓ No inline styles remaining
- ✓ Consistent use of Tailwind utilities
- ✓ Proper use of shadcn components
- ✓ Clean imports with `@/` alias

---

**Last Updated**: 2025-11-23
**Status**: Setup Complete ✓ | Refactoring In Progress
**Next Step**: Refactor CropAndLabel.tsx
