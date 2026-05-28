# Portrait Mode Menu Design - Bottom Sheet Layout

## Overview
This document describes the new responsive portrait mode design for the STMS application, implementing a **Bottom Sheet Split Layout** for mobile devices in portrait orientation.

## Design Features

### 1. **Collapsed State (Default)**
- **Position**: Fixed at the bottom of the screen
- **Appearance**: Horizontal bar with icon buttons only
- **Height**: ~90px (adjusted for mobile)
- **Features**:
  - Shows 6 main action icons: My Location, Add Marker, Safety Alerts, Report Grid, Nearest Attractions, Tourist Attractions
  - Expand button (+) on the right to expand the menu
  - Icons only - no text labels visible
  - Touch-friendly button sizing (56x56px buttons)
  - Rounded top corners (border-radius: 24px 24px 0 0)

### 2. **Expanded State**
- **Position**: Bottom sheet overlay covering up to 85% of screen height
- **Layout**: Full-width bottom sheet with scrollable content
- **Features**:
  - Shows full menu with text labels and descriptions
  - Can scroll through all menu items
  - Collapse button (-) in header
  - Header shows "STMS" title and "Live" status badge
  - Content areas include:
    - My Location
    - Add Marker with form
    - Safety Alerts
    - Report Grid
    - Nearest Attractions
    - Tourist Attractions (with search)

### 3. **Split Layout (Map + Bottom Sheet)**
- **Map**: Full screen above the bottom sheet
- **Bottom Sheet**: Overlay at the bottom with rounded top corners
- **Interaction**: 
  - Map remains visible and interactive when sheet is collapsed
  - User can swipe or tap to expand/collapse the sheet
  - Bottom sheet slides in/out smoothly with transitions

## Responsive Breakpoints

### Portrait Mode (Max Width: 768px, Max Height: 900px)
```css
@media (max-height: 900px) and (max-width: 768px)
```
- Bottom sheet layout is active
- Icons arranged horizontally in collapsed state
- Full-height bottom sheet when expanded
- Map takes full viewport height minus bottom sheet

### Tablet/Landscape Mode (Min Height: 900px, Max Width: 1024px)
```css
@media (min-height: 900px) and (max-width: 1024px)
```
- Hybrid layout with narrower left sidebar (320px)
- Falls back to traditional left sidebar for larger screens

### Desktop Mode (Default)
- Traditional left sidebar layout (360px width)
- Full desktop experience

## CSS Implementation

### Key Classes

1. **`.map-controls-left`**: Main container repositioned to bottom
2. **`.controllers-box`**: Bottom sheet container with animations
3. **`.controllers-box.collapsed`**: Icon-only state
4. **`.controllers-box.expanded`**: Full menu state with content
5. **`.collapsed-menu`**: Horizontal flex layout for icons
6. **`.map-container`**: Adjusted for portrait mode (full width)

### Animations & Transitions
- **Smooth expansion**: 0.3s ease transition for height changes
- **Icon tooltips**: Appear above icons in portrait mode
- **Sliding animation**: Bottom sheet slides in/out smoothly

## Dark Mode Support

All portrait mode styles include dark theme support using `[data-theme='dark']` selectors:
- Icon buttons adapt to dark background
- Text colors adjust for readability
- Box shadows optimized for dark mode
- Proper contrast maintained

## Files Modified

1. **`MapControlLeft.css`**
   - Added portrait mode media queries (lines ~850+)
   - Added bottom sheet layout styles
   - Added mobile-specific positioning for controls

2. **`MapView.css`**
   - Added map height adjustments for portrait
   - Adjusted leaflet control positioning
   - Optimized mobile control placement

3. **`App.css`**
   - Updated portrait orientation media queries
   - Hid header and actions in portrait mode
   - Full-screen map card layout

## Component Structure

The MapControlLeft component already supports this design through its existing state management:
- `isBoxExpanded`: Controls collapsed/expanded state
- `setIsBoxExpanded`: Toggle function
- Already renders different UI based on expansion state

No JavaScript changes required - CSS-only implementation!

## Touch & Interaction Considerations

✅ **Touch-Friendly**:
- Large tap targets (56x56px minimum)
- Proper spacing between buttons (8px gap)
- Smooth swipe-friendly bottom sheet

✅ **Gesture Support**:
- Bottom sheet can be dragged up/down (future enhancement)
- Tap expand button to toggle state
- Map remains interactive during collapse

## Browser Compatibility

- Modern browsers (Chrome, Safari, Firefox, Edge)
- Uses standard CSS media queries
- Flexbox and Grid layout support
- CSS transitions for smooth animations

## Future Enhancements

1. **Drag-to-expand**: Allow users to drag the bottom sheet
2. **Swipe gestures**: Detect swipe up/down to toggle expansion
3. **Snapping points**: Multiple snap positions (collapsed, half-expanded, full)
4. **Keyboard accessibility**: Better keyboard navigation on mobile

## Testing Checklist

- [ ] Test on iOS devices (Safari, Chrome)
- [ ] Test on Android devices (Chrome, Firefox)
- [ ] Test dark/light theme switching in portrait mode
- [ ] Test all menu items functionality in expanded state
- [ ] Test map interaction when bottom sheet is open
- [ ] Test transitions and animations smoothness
- [ ] Test form submissions in portrait mode
- [ ] Verify touch target sizes are adequate
- [ ] Check accessibility with screen readers
