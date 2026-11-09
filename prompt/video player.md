# Modify the Existing Vidstack Player — Complete UI and Interaction Specification

## 1. Objective and Scope

Modify the existing Vidstack-based media player in the current project to provide a modern, minimalist, responsive, and highly interactive playback experience.

**This is an update to the existing player, NOT a request to build a new player.**

Before editing, inspect the existing implementation, including playback controls, media state, keyboard shortcuts, pointer interactions, media navigation, post navigation, and CSS.

Requirements:

- Reuse existing Vidstack functionality and project conventions wherever possible.
- Preserve the existing media loading and post navigation mechanisms.
- Do not replace the playback engine.
- Do not change the application's architecture or data structures unnecessarily.
- Do not introduce another UI framework.
- Do not create a standalone demonstration player.
- Do not modify unrelated application functionality.
- Do not add a top information bar, post title, post metadata, or subtitle/caption controls.
- The permanent control interface must consist of **exactly two horizontal rows at the bottom**: a progress row and a control-button row.
- Temporary gesture feedback, speed rulers, settings panels, and media-navigation overlays do not count as permanent control rows.

All interactions defined below must be functional, not merely visual.

---

## 2. Playback Speed System

Support exactly six selectable normal playback speeds:

`0.5x / 1x / 1.5x / 2x / 3x / 5x`

Default: `1x`.

Maintain independent state for:

1. **Normal Speed:** selected through Settings.
2. **JKL Shuttle Speed:** signed forward/reverse speed controlled by J/L.
3. **Temporary Long-Press Speed:** applied while holding the video.
4. **Locked Speed:** speed explicitly locked using the long-press downward gesture.

These states must not unintentionally overwrite one another.

Behavior:

- The selected normal speed remains saved independently of temporary acceleration and JKL shuttle states.
- Selecting a normal speed in Settings cancels shuttle mode and speed lock, then applies the selected rate.
- A temporary long press restores the previously effective rate on release unless speed lock is activated.
- Locked speed stays active after finger release.
- Unlocking speed restores the saved normal speed.
- Switching posts or media cancels temporary acceleration, speed lock, and shuttle mode, then restores the selected normal speed.
- Handle unsupported playback rates gracefully and provide visible feedback if a requested speed cannot be applied.

---

## 3. Exact Bottom Control Layout

The player must have exactly two permanent bottom control rows.

There must be no top toolbar.

### 3.1 Row One — Progress Bar

The upper row contains the media playback timeline.

Display:

- Played progress.
- Buffered progress.
- Unplayed progress.
- Draggable seek handle.
- Current/target timestamp preview.
- Thumbnail preview when available.
- Chapter markers when available.

Appearance:

- Idle track height: 3px.
- Hover/drag height: 5px.
- Handle diameter: 12px.
- Minimum touch interaction area: 24px.
- Played color: white.
- Buffered color: `rgba(255,255,255,0.4)`.
- Unplayed color: `rgba(255,255,255,0.22)`.

Behavior:

- Mouse clicking the progress track seeks directly.
- Mouse dragging scrubs the timeline.
- Touch dragging scrubs the timeline.
- Show a timestamp preview while hovering or dragging.
- Show thumbnails only if actual thumbnail data is available.
- Clamp seeking to the valid seekable range.
- Do not allow timeline interaction to trigger video-surface gestures.
- Hide the progress row for image-only media when no video timeline exists.

### 3.2 Row Two — Desktop Control Bar

**Left group, exact order:**

1. Lock / Unlock Controls.
2. Play / Pause.
3. Seek Backward 10 Seconds.
4. Seek Forward 10 Seconds.
5. Mute / Unmute.
6. Volume Slider.
7. Current Time / Total Duration.

**Right group, exact order:**

8. Info.
9. Settings.
10. Picture-in-Picture.
11. Fullscreen.

The mute button and volume slider form a single volume-control group, but both must function.

Do not add caption/subtitle, post information, author, or title controls.

#### Button Behavior

**Lock**

- Lock or unlock all player interaction controls.
- Use open-lock and closed-lock icons.
- The locked-state unlock affordance is defined separately below.

**Play / Pause**

- Click while playing: pause.
- Click while paused: play.
- This button is a toggle.

**Backward 10 Seconds**

- Seek backward exactly 10 seconds.
- Clamp to the seekable start.
- Provide visual feedback.

**Forward 10 Seconds**

- Seek forward exactly 10 seconds.
- Clamp to the seekable end.
- Provide visual feedback.

Both 10-second buttons operate on the current video even inside a multi-file post.

**Volume**

- Speaker icon toggles mute.
- Slider adjusts volume from 0% to 100%.
- Preserve the last nonzero volume when unmuting.
- Hide unsupported programmatic volume controls.

**Time**

Display:

`01:24 / 12:36`

Use hours when necessary.

**Info**

- Opens media technical information.
- Does not display post information.

**Settings**

- Opens playback and media settings.

**Picture-in-Picture**

- Toggle PiP where supported.
- Hide or disable when unsupported.

**Fullscreen**

- Toggle fullscreen.
- Reflect the actual fullscreen state.

### 3.3 Row Two — Mobile Control Bar

Mobile must also use exactly two bottom rows and retain dedicated 10-second seek buttons.

**Left group:**

1. Lock.
2. Play/Pause.
3. Backward 10 Seconds.
4. Forward 10 Seconds.

**Right group:**

5. Info.
6. Settings.
7. Fullscreen.

Show current time and duration within available space in the progress row, without creating an additional row.

Responsive rules:

- Minimum interactive target: 44×44px.
- Icon size: approximately 20–22px.
- Minimum gap between controls: 4px.
- Do not show a permanently visible volume slider.
- Put volume controls and PiP inside Settings when excluded from the compact toolbar.
- At extremely narrow widths, Fullscreen may move into Settings, while Lock, Play/Pause, Backward 10s, Forward 10s, Info, and Settings remain directly accessible.
- Do not overlap, clip, or shrink controls below usable touch dimensions.
- Do not introduce a third toolbar row.

---

## 4. Control Visibility — Mouse vs Touch

Mouse and touchscreen visibility behavior must be different.

### 4.1 Mouse / Desktop

- Moving the mouse inside the player reveals the control rows.
- Every mouse movement resets a 3000ms inactivity timer.
- If the mouse stops moving for 3000ms, hide the controls.
- If the mouse leaves the player, hide the controls immediately unless a player menu or active control interaction requires them to remain visible.
- Mouse interaction with the timeline, toolbar, Info, or Settings prevents auto-hide during the interaction.
- The controls follow these rules while playing and while paused.
- Do not permanently display controls just because the video is paused.
- After the cursor becomes idle, controls must fade away smoothly.

A single mouse click on the video surface may reveal or refresh controls, but must not pause or seek.

### 4.2 Touchscreen

- A single tap on an empty area of the media surface reveals the controls.
- If controls are already visible, the tap refreshes the 3000ms visibility timer.
- Controls automatically hide after 3000ms without interaction.
- Do not require a second tap to hide controls.
- Tapping a control resets the inactivity timer.
- Active dragging or an open panel suspends auto-hide.
- A single tap must not pause, play, seek, or navigate.
- Do not force controls to remain visible just because playback is paused.

### 4.3 When Controls Are Locked

The locked state uses the same device-specific visibility rules, but only for the small Unlock button.

**Mouse:**

- Mouse movement reveals the small Unlock button.
- No movement for 3000ms hides it.
- Moving the mouse out of the player hides it.

**Touchscreen:**

- A single tap on the locked video reveals the small Unlock button.
- The button hides after 3000ms without interaction.
- Tapping the Unlock button actually unlocks the player.
- A single tap elsewhere must not unlock automatically.

While controls are locked, never reveal the normal toolbar or progress controls.

### 4.4 Transitions

- Control show/hide duration: 200ms.
- Prefer opacity and transform animations.
- Avoid layout shifts.
- Hide the mouse cursor during desktop inactivity in fullscreen when appropriate, and restore it on mouse movement.
- Respect reduced-motion preferences.

---

## 5. Touchscreen Horizontal Scrubbing

Horizontal dragging on a video surface performs continuous relative seeking, not fixed-distance seeking.

This applies to videos inside single-file and multi-file posts.

### Activation

- Pointer must move at least 15px horizontally.
- Horizontal movement must dominate vertical movement by at least 1.3:1.
- Once recognized, enter horizontal scrubbing mode.
- Display a temporary progress-bar overlay.
- Disable competing tap, double-tap, long-press, and navigation actions for that gesture.

### Position Calculation

Use relative movement:

`timeDelta = (horizontalDragDistance / playerWidth) * seekableDuration * 0.5`

`targetTime = initialPlaybackTime + timeDelta`

Where `seekableDuration` is the applicable media duration or DVR seekable-window length.

- Drag right: preview later playback time.
- Drag left: preview earlier playback time.
- Clamp the target position to the seekable boundaries.
- Keep sensitivity configurable.

### Scrubbing Overlay

Display a semi-transparent overlay centered horizontally, approximately 65% down the viewport.

Contents:

- Original timestamp.
- Target timestamp.
- Relative offset, such as `+00:18` or `-00:42`.
- Full-width progress track.
- Original position marker.
- Current target marker.
- Buffered portion when available.

Style:

- Width: `min(85%, 600px)`.
- Background: `rgba(0,0,0,0.65)`.
- Border radius: 12px.
- Padding: 12px 16px.
- Progress height: 5px.
- Preview handle: 14px.
- Target timestamp: 18px.

Update the overlay smoothly while dragging.

Prefer updating the preview without excessive real media seeking.

### Release

- Commit the final target timestamp once.
- Preserve the original play/pause state.
- Hide the overlay after approximately 300ms.
- Show brief completion feedback with the final seek offset.

On pointer cancellation, discard the pending target without committing it.

### Mouse Support

Mouse left-button dragging horizontally on the media surface also supports the same relative seek preview.

If the mouse drag crosses the horizontal recognition threshold before long-press activation, scrubbing owns the interaction.

If long press activates first, subsequent horizontal movement adjusts temporary playback speed instead.

---

## 6. Double-Tap / Double-Click Seeking

Divide the entire media viewing surface into three invisible horizontal zones.

| Zone   | Horizontal Position | Double Tap / Double Click |
| ------ | ------------------- | ------------------------- |
| Left   | 0–30%               | Seek backward 10 seconds  |
| Center | 30–70%              | Pause only                |
| Right  | 70–100%             | Seek forward 10 seconds   |

Support both touch double tapping and mouse double clicking.

### Left Zone

- Seek -10 seconds.
- Preserve the existing play/pause state.
- Display `-10s` with a backward icon.

### Center Zone

- Pause playback.
- If already paused, remain paused.
- Never resume playback.
- Display a pause icon.

### Right Zone

- Seek +10 seconds.
- Preserve the existing play/pause state.
- Display `+10s` with a forward icon.

### Recognition

- Double-tap interval: 280ms.
- Maximum tap-to-tap distance: 30px.
- Both taps must belong to the same zone.
- Suppress the two pending single-tap actions when a double tap succeeds.
- Do not treat toolbar interactions as video-surface double taps.
- Do not enter fullscreen on double click.
- Do not seek on double tap when the current media is an image.
- Accumulate repeated completed seeking gestures correctly, without dropping or duplicating offsets.

---

## 7. Long Press — Temporary Speed Adjustment

Support long press on the playing video surface.

Compatible inputs:

- Touch-and-hold.
- Left mouse button held down.

### Activation

Activate after 350ms of holding without a competing recognized gesture.

- Video must be playing.
- Initial temporary speed: 2x.
- Show the acceleration indicator immediately.
- Save the currently effective speed before applying acceleration.

### Available Temporary Speeds

`1.5x / 2x / 3x / 5x`

### Horizontal Movement

After long press activates:

| Horizontal Displacement | Temporary Speed |
| ----------------------- | --------------- |
| ≤ -60px                 | 1.5x            |
| -59px to +59px          | 2x              |
| +60px to +119px         | 3x              |
| ≥ +120px                | 5x              |

Measure displacement from the position when long-press acceleration activated.

- Apply each speed change immediately.
- Do not interpolate.
- Moving backward across a threshold must reduce speed.
- Do not trigger scrubbing or media navigation during active long press.
- Display the current temporary speed continuously.

### Ordinary Release

If speed locking has not been activated:

- Restore the speed that was active before long press.
- Do not pause.
- Do not seek.
- Do not navigate.
- Hide the indicator after a short transition.

### Cancellation

Restore the previous speed when:

- Pointer is canceled.
- Window loses focus.
- Playback is interrupted.
- Media changes.
- Post changes.
- Player unmounts.

Never leave playback accidentally stuck at a temporary speed.

---

## 8. Touchscreen Downward Gesture — Lock Playback Speed

Add **speed locking through a downward swipe during an active long press**.

This is separate from the main Control Lock feature.

### Activation Sequence

1. Touch and hold the playing video for 350ms.
2. Temporary acceleration activates at 2x.
3. Optionally move horizontally to select 1.5x, 2x, 3x, or 5x.
4. While continuing to hold, move downward at least 60px from the long-press activation position.
5. Arm speed locking.
6. Release the finger to confirm and lock the selected speed.

### Gesture Priority

- A normal downward swipe without an active long press navigates to the previous post.
- A downward swipe after long-press activation locks playback speed.
- The active long-press gesture must consume the downward movement.
- Never navigate posts when downward motion is being used to lock speed.
- Only enable downward speed locking for touch input; mouse users can continue to use Settings to select a persistent playback speed.

### Feedback During Locking

When downward movement reaches the lock threshold:

- Show a lock icon.
- Change the acceleration indicator to `3x · Release to Lock` or the corresponding selected speed.
- Provide an obvious visual state change.
- Do not commit the lock until finger release.
- Allow the user to cancel the armed lock before release by moving upward above the release threshold, using a small hysteresis margin to prevent flickering.

### Locked Speed State

On confirmed release:

- Continue playback at the selected locked speed.
- Do not restore the pre-hold speed.
- Show `Speed Locked · 3x`, using the actual rate.
- Keep the saved normal speed preference unchanged.
- Display a compact clickable/tappable speed-lock indicator whenever the normal controls are visible.

The indicator must be visually distinct from the main Control Lock.

### Unlocking Speed

Clicking or tapping the speed-lock indicator:

- Releases the speed lock.
- Restores the saved normal playback speed.
- Displays `Speed Unlocked · 1x`, using the actual restored rate.
- Does not pause playback.

Selecting another speed through Settings also cancels speed lock.

Entering JKL shuttle mode cancels speed lock and takes over playback-rate control.

Pausing playback cancels speed lock and restores the normal speed for the next ordinary playback.

Switching posts or media cancels speed lock.

### Control Lock Interaction

Speed lock and Control Lock are independent.

- Activating Control Lock must not automatically cancel an already locked playback speed.
- When Control Lock is active, hide the speed-lock control along with the normal controls.
- Unlock Control Lock before interacting with the speed-lock indicator.
- The locked playback speed continues until explicitly released or until an applicable playback/navigation reset occurs.

All speed-lock actions must show feedback.

---

## 9. J/K/L Bidirectional Playback Shuttle

Implement a single signed shuttle-speed ladder.

The exact JKL speed sequence is:

`-5x → -3x → -2x → -1x → +1x → +2x → +3x → +5x`

Negative speed represents reverse playback.

Positive speed represents forward playback.

**J moves exactly one step left. L moves exactly one step right.**

There is no zero-speed step in J/L movement. The transition between -1x and +1x is direct.

### J Behavior

Examples:

- +5x → +3x.
- +3x → +2x.
- +2x → +1x.
- +1x → -1x.
- -1x → -2x.
- -2x → -3x.
- -3x → -5x.
- -5x → remain at -5x.

Important: pressing J at forward 3x slows playback to forward 2x, not reverse playback.

### L Behavior

Examples:

- -5x → -3x.
- -3x → -2x.
- -2x → -1x.
- -1x → +1x.
- +1x → +2x.
- +2x → +3x.
- +3x → +5x.
- +5x → remain at +5x.

### K Behavior

K always pauses.

- Immediately pause.
- Stop shuttle playback.
- Reset active shuttle state to paused (0).
- Do not change normal-speed preferences.
- Pressing K while already paused does nothing.

When paused:

- J starts reverse at -1x.
- L starts forward at +1x.

### Normal Speeds Outside the Ladder

0.5x and 1.5x remain supported as normal speeds in Settings, but not as shuttle steps.

If starting J/L from these normal speeds:

- +0.5x + J → -1x.
- +0.5x + L → +1x.
- +1.5x + J → +1x.
- +1.5x + L → +2x.

For other supported normal speeds, use the adjacent ladder step.

Ignore operating-system key-repeat events so that each physical key press changes exactly one level.

### Reverse Playback Limitations

Do not assume that negative HTMLMediaElement playback rates are supported.

Where native reverse playback is unavailable:

- Use a controlled reverse-seeking fallback.
- Advance backward according to elapsed time and selected reverse speed.
- Prevent overlapping seeking requests.
- Clamp playback to seekable boundaries.
- Stop correctly at the beginning.
- Avoid unstable audio behavior.
- Do not claim that approximate reverse seeking is frame-accurate reverse decoding.

Provide an appropriate fallback/error indicator if reverse playback cannot function adequately for the current provider.

---

## 10. JKL Speed Ruler Feedback Overlay

Every J/K/L key press must display a horizontal speed-ruler overlay.

Visual layout:

`◀  -5  -3  -2  -1  | 0 |  +1  +2  +3  +5  ▶`

The center `0` is a pause indicator only, not a normal J/L step.

### Appearance

- Horizontally centered.
- Positioned approximately 35% down the video.
- Rounded dark translucent background.
- Equally spaced speed ticks.
- Selected tick brighter than the others.
- Small indicator marking the active position.
- Smooth transition when speed changes.
- Clear distinction between reverse and forward playback.

Above the ruler, display:

- `Reverse 3x`
- `Reverse 1x`
- `Paused`
- `Forward 1x`
- `Forward 5x`

Depending on state.

### Duration

- Show immediately on J/K/L interaction.
- Remain visible for 1200ms after the last press.
- Reset timer on additional presses.
- Fade out over 200ms.

### Mouse and Touch Interaction

When the ruler is visible and controls are unlocked, allow clicking/tapping an available speed tick to select that shuttle speed.

- Applying a negative value starts reverse shuttle playback.
- Applying a positive value starts forward shuttle playback.
- Selecting the center pause marker pauses playback.
- Show feedback for selection.
- Do not propagate clicks into the video surface.

---

## 11. W / E Frame-by-Frame Playback

Add frame stepping.

**W: Previous Frame**

**E: Next Frame**

Behavior:

- Pause first if the video is currently playing.
- Move one frame in the requested direction.
- Remain paused afterward.
- Support repeated physical key presses.
- Do not switch media or posts.
- Do not enter shuttle playback.

Frame accuracy:

- Prefer actual frame-accurate functionality when supported.
- Otherwise seek by `1 / FPS` seconds.
- Use actual media FPS metadata when available.
- Otherwise assume approximately 30 FPS and explicitly treat the result as approximate.
- Clamp to seekable boundaries.

Feedback:

- `Previous Frame` or `Next Frame`.
- Updated timestamp.
- Show a boundary indication when further stepping is unavailable.

Do not use K+J or K+L as frame-step shortcuts.

---

## 12. Complete Keyboard Shortcut List

| Key           | Exact Behavior                                                     |
| ------------- | ------------------------------------------------------------------ |
| J             | One step toward reverse on signed speed ladder                     |
| K             | Pause only                                                         |
| L             | One step toward forward on signed speed ladder                     |
| Space         | Pause only                                                         |
| W             | Previous frame                                                     |
| E             | Next frame                                                         |
| Left Arrow    | Seek -5s for single-file video; previous media for multi-file post |
| Right Arrow   | Seek +5s for single-file video; next media for multi-file post     |
| Shift + Left  | Seek backward 10 seconds for single-file video                     |
| Shift + Right | Seek forward 10 seconds for single-file video                      |
| Up Arrow      | Previous post                                                      |
| Down Arrow    | Next post                                                          |
| M             | Toggle mute                                                        |
| F             | Toggle fullscreen                                                  |
| P             | Toggle Picture-in-Picture                                          |
| I             | Toggle Info                                                        |
| S             | Toggle Settings                                                    |
| Shift + U     | Toggle Control Lock                                                |
| Home          | Seek to beginning                                                  |
| End           | Seek to end                                                        |
| 0–9           | Seek to 0%–90% of video duration                                   |
| Escape        | Close the active panel or exit fullscreen                          |

### Pause Semantics

K, Space, and center-zone double tap/double click are **pause-only commands**.

They must NEVER resume playback.

The toolbar Play/Pause button is the normal playback toggle.

L can resume playback by starting forward shuttle playback.

### Keyboard Conflict Handling

- Shortcuts operate when the player is the active keyboard target or in fullscreen.
- Do not intercept typing inside input fields, editable elements, dialogs, or menus.
- Ignore inappropriate shortcuts on image media.
- Disable or override conflicting Vidstack default shortcuts.
- Do not execute the same shortcut twice.
- Provide feedback when a valid command is unavailable or reaches a boundary.
- While Control Lock is active, only the unlocking shortcut and necessary native fullscreen escape behavior remain available.

---

## 13. Control Lock

Provide a dedicated Control Lock button in the bottom toolbar.

This lock disables user interaction with the player without interrupting existing video playback.

It is independent of Speed Lock.

### 13.1 Activating Control Lock

When locking:

- Hide both permanent bottom control rows.
- Close Info and Settings.
- Hide media-navigation arrows.
- Hide interactive speed controls.
- Cancel pending gestures and seek previews.
- Cancel active temporary long-press acceleration.
- Do not cancel an already confirmed Speed Lock.
- Preserve existing playback progress.
- Do not automatically pause.

Show `Controls Locked` as brief feedback.

### 13.2 Locked Input Behavior

Disable:

- Surface seeking.
- Double-tap seeking.
- Double-click seeking.
- Center double-tap pausing.
- Long-press acceleration.
- Drag scrubbing.
- Vertical post navigation.
- Horizontal media navigation.
- Player toolbar interactions.
- JKL shortcuts.
- W/E frame stepping.
- Other playback shortcuts.

Keep playback itself running normally.

### 13.3 Unlock Button

When controls are locked, use a small floating Unlock button near the upper-left corner.

This is a temporary overlay, not a third control bar.

Appearance:

- Closed-lock icon.
- Dark translucent circular background.
- Minimum target: 44×44px.
- Respect safe-area insets.
- Do not overlap system-level fullscreen controls unnecessarily.

### 13.4 Unlock Visibility

**Mouse:**

- Show Unlock button on mouse movement inside the player.
- Hide after 3000ms of no mouse movement.
- Hide immediately when mouse exits the player.

**Touch:**

- Single tap anywhere on the locked media surface shows Unlock.
- Hide after 3000ms of inactivity.
- Tapping Unlock restores the normal controls.
- Tapping the media elsewhere does not unlock.

### 13.5 Unlocking

Allow unlocking by:

- Clicking/tapping the Unlock button.
- Pressing Shift + U.

After unlocking:

- Restore normal control visibility behavior.
- Restore touch, mouse, and keyboard interactions.
- Preserve playback position and state.
- Preserve a previously confirmed speed lock, if still applicable.
- Show `Controls Unlocked`.

A tap on the Unlock button must not trigger a video-surface gesture.

### 13.6 Feedback While Locked

Every attempted interaction must have appropriate feedback without executing the blocked action.

For touch, a blocked surface interaction can reveal the Unlock button and briefly display a small lock icon.

For mouse, blocked clicks or drags may briefly display `Controls Locked`.

Do not spam feedback continuously during pointer movement.

---

## 14. Post and Media Navigation

Preserve the existing post and media navigation mechanisms.

Do not display post titles, author names, post IDs, publication dates, or post information inside the player.

### 14.1 Vertical Navigation

Vertical swipes always navigate between posts unless an active long-press acceleration gesture has already captured the pointer.

- Swipe up: next post.
- Swipe down: previous post.
- Minimum movement: 60px.
- Direction dominance: 1.3:1.
- Exactly one post per recognized swipe.
- Stay at boundaries.
- Show directional feedback.

Up/Down Arrow keys perform the same post navigation.

### 14.2 Horizontal Navigation

For video media:

- Horizontal touch dragging scrubs video.
- Horizontal mouse dragging scrubs video.
- Do not switch media by dragging on a video surface.

For images within multi-file posts:

- Swipe left: next media.
- Swipe right: previous media.

For single-image posts, horizontal navigation is inactive.

### 14.3 Multiple-file Posts

Provide compact Previous Media and Next Media arrow buttons where necessary.

- Display only for multiple-file posts.
- Use existing navigation functions.
- Position as unobtrusive video/image edge overlays.
- These buttons are not an additional toolbar.
- They appear alongside normal controls and follow their visibility state.
- Disable previous at the first media item.
- Disable next at the last media item.
- Do not automatically switch posts at a media boundary.
- Prevent these buttons from triggering the underlying double-click/tap seek zones.

Every navigation action must show feedback, including when a boundary prevents navigation.

---

## 15. Info Panel — Media Information Only

Provide a dedicated Info button.

Keyboard shortcut: I.

**Do not display post information.**

Do not show post titles, authors, post IDs, descriptions, or publication dates.

Only show technical information about the currently active media.

### Video Information

Display available values:

- Filename.
- Media type.
- Duration.
- Resolution.
- Aspect ratio.
- Frame rate.
- Video codec.
- Audio codec.
- Bitrate.
- File size.
- Current playback timestamp.
- Current playback speed.

### Image Information

Display available values:

- Filename.
- File format.
- File size.
- Resolution.
- Aspect ratio.

Only display fields with actual available data.

Do not invent metadata or perform unnecessary requests.

### Info Panel Behavior

- Click Info or press I to open.
- Repeat to close.
- Escape closes the panel.
- Clicking outside closes it.
- Keep normal player controls visible while open.
- Playback continues normally.
- Update information when the active media changes.
- Opening Settings closes Info.
- Panel interactions must not trigger video gestures.

Layout:

- Desktop: anchored floating panel.
- Mobile: bottom-aligned panel.
- Maximum width: 360px.
- Maximum height: 70% of the player viewport.
- Scroll internally when necessary.

---

## 16. Settings Panel

Provide a dedicated Settings button.

Keyboard shortcut: S.

### Playback Speed

Display exactly:

- 0.5x
- 1x
- 1.5x
- 2x
- 3x
- 5x

Mark the selected normal playback speed with a checkmark.

Changing this setting cancels shuttle mode and Speed Lock and applies the selected rate.

### Quality

- Auto.
- All actually available quality levels reported by the media source.

Do not invent quality choices.

### Audio

If supported:

- Available audio tracks.
- Current selected track.
- Audio language where available.

### Other Playback Settings

- Loop current video.
- Picture-in-Picture when supported.
- Mobile volume and mute controls when not shown in the main toolbar.
- Fullscreen access when moved into Settings on narrow screens.
- Existing relevant playback options.

Do not include subtitle/caption controls.

Do not add post-related settings.

### Settings Behavior

- Click Settings or press S to toggle.
- Escape closes the panel.
- Clicking outside closes it.
- Opening Info closes Settings.
- Keep regular controls visible while Settings is open.
- Settings interactions must not trigger video-surface gestures.
- Apply valid setting changes immediately.
- Show visible confirmation or rejection feedback for each change.

---

## 17. Universal Interaction Feedback

**Every meaningful user interaction must produce visible feedback.**

This includes:

- Successful actions.
- Playback state changes.
- Speed changes.
- Seeking.
- Frame stepping.
- Post/media navigation.
- Locking and unlocking.
- Info/Settings opening or closing.
- Control visibility changes.
- Boundary conditions.
- Unsupported actions.
- Failed operations.
- Blocked operations while controls are locked.

Feedback should be lightweight and should not unnecessarily obstruct the video.

### 17.1 Feedback Mapping

| Interaction                 | Feedback                                       |
| --------------------------- | ---------------------------------------------- |
| Play                        | Centered play icon                             |
| Pause                       | Centered pause icon                            |
| Backward 10s                | `-10s` and backward icon                       |
| Forward 10s                 | `+10s` and forward icon                        |
| Keyboard seek -5s           | `-5s`                                          |
| Keyboard seek +5s           | `+5s`                                          |
| Drag scrubbing              | Continuous timestamp and progress overlay      |
| Scrub release               | Final position/offset                          |
| Long press                  | Temporary speed indicator                      |
| Horizontal speed adjustment | Updated temporary speed                        |
| Downward speed-lock gesture | `Release to Lock`                              |
| Confirm speed lock          | `Speed Locked · 3x`                            |
| Unlock speed                | `Speed Unlocked · 1x`                          |
| J/L                         | Bidirectional speed ruler                      |
| K                           | Speed ruler at Pause                           |
| W/E                         | Frame step direction and timestamp             |
| Mute                        | Muted speaker icon                             |
| Unmute                      | Speaker icon                                   |
| Volume adjustment           | Current volume percentage                      |
| Fullscreen                  | Fullscreen state indicator                     |
| PiP                         | PiP enabled/disabled                           |
| Control Lock                | `Controls Locked`                              |
| Control Unlock              | `Controls Unlocked`                            |
| Locked interaction          | Small lock indicator                           |
| Previous/Next Post          | Directional indicator                          |
| Previous/Next Media         | Directional indicator                          |
| Info opened/closed          | Panel transition/state                         |
| Settings opened/closed      | Panel transition/state                         |
| Speed/quality selection     | Selected option and confirmation               |
| Boundary reached            | Brief boundary feedback                        |
| Unsupported command         | Brief unavailable feedback                     |
| Playback error              | Error message with appropriate recovery action |

### 17.2 Feedback Timing

- Standard action feedback: 800ms.
- JKL speed ruler: 1200ms after last action.
- Speed-lock confirmation: 1200ms.
- Fade-out: 150–200ms.
- Long-press indicator: visible throughout the active hold.
- Scrubbing overlay: visible throughout dragging.
- Panel feedback: the actual panel opening/closing animation is sufficient.
- Showing/hiding controls: the control transition itself is sufficient.

### 17.3 Feedback Priorities

Do not stack multiple large feedback elements.

Prioritize:

1. Critical errors.
2. Active interactive overlays such as scrubbing or long press.
3. Lock/unlock feedback.
4. Shuttle ruler.
5. Ordinary seeking and playback feedback.

Show the latest relevant feedback, avoiding excessive duplication.

Do not trigger repeated identical feedback every animation frame during a drag.

### 17.4 Feedback Accessibility

- Visual indicators must have sufficient contrast.
- Use readable timestamps.
- Do not depend on color alone.
- Do not steal keyboard focus for transient feedback.
- Do not allow noninteractive overlays to intercept pointer events.
- Respect reduced-motion settings.

---

## 18. Appearance and CSS

Use a modern, minimalist, cinematic design.

### Colors

- Primary text: `#FFFFFF`.
- Secondary text: `rgba(255,255,255,0.7)`.
- Button hover: `rgba(255,255,255,0.14)`.
- Button pressed: `rgba(255,255,255,0.22)`.
- Settings/Info background: `rgba(24,24,27,0.96)`.
- Panel border: `1px solid rgba(255,255,255,0.12)`.
- Focus outline: `2px solid #FFFFFF`.

### Control Geometry

- Desktop button row height: 48px.
- Touch target: minimum 44×44px.
- Standard icon size: 22px.
- Panel border radius: 12px.
- Tooltip border radius: 6px.
- Control horizontal padding: 12–16px.

### Background

Use a subtle bottom gradient only around the bottom control region:

`transparent → rgba(0,0,0,0.8)`

Do not add a permanent top gradient or top information bar.

### Video Display

- Preserve source aspect ratio.
- Do not stretch media.
- Do not crop by default.
- Support fullscreen portrait and landscape.
- Respect mobile safe-area insets.
- Prevent UI overlap on narrow screens.
- Use smooth opacity and transform transitions.
- Avoid excessive backdrop blur and unnecessary visual decoration.

### Controls

- Consistent iconography.
- Clear hover, pressed, selected, and disabled states.
- Accessible labels and tooltips.
- Clean keyboard focus indicators.
- Consistent visual hierarchy for Info, Settings, and Lock.

The overall visual result should be understated, polished, and focused on the media rather than the controls.

---

## 19. Gesture Recognition and State Management

Use a clear, deterministic gesture state machine.

Supported mutually exclusive interaction states:

- Idle.
- Single-tap pending.
- Double-tap recognized.
- Horizontal video scrubbing.
- Vertical post navigation.
- Horizontal image navigation.
- Long-press acceleration.
- Downward speed-lock arming.
- Timeline dragging.
- Toolbar interaction.
- Info/Settings interaction.
- Control Lock.

### Default Gesture Parameters

| Parameter                     | Value  |
| ----------------------------- | ------ |
| Tap movement tolerance        | 10px   |
| Double-tap interval           | 280ms  |
| Maximum double-tap distance   | 30px   |
| Long-press activation delay   | 350ms  |
| Horizontal direction lock     | 15px   |
| Navigation swipe threshold    | 60px   |
| Speed-lock downward threshold | 60px   |
| Direction dominance           | 1.3:1  |
| Controls inactivity timeout   | 3000ms |
| Default feedback duration     | 800ms  |
| JKL ruler duration            | 1200ms |

Keep these constants centralized and configurable.

### Gesture Priority

1. Control Lock state.
2. Explicit toolbar/menu/progress controls.
3. Already-active long press or speed-lock gesture.
4. Already-active horizontal scrubbing.
5. Directional post/media navigation.
6. Double tap/double click.
7. Single tap/click.

A single pointer sequence must never activate two conflicting gesture modes.

### Conflict Resolution

Mandatory rules:

1. Single tapping only reveals/refreshes controls.
2. Double tapping is zone-based seeking or center pause.
3. A successful double tap suppresses single-tap actions.
4. Normal horizontal video dragging performs continuous relative scrubbing.
5. Horizontal dragging after long-press activation adjusts speed.
6. Normal downward swiping navigates to the previous post.
7. Downward swiping after long-press activation arms speed lock.
8. A confirmed speed lock persists after release.
9. A canceled long press restores the prior effective speed.
10. Control Lock disables all playback gestures and ordinary shortcuts.
11. Speed Lock does not automatically enable Control Lock.
12. Progress-bar dragging always takes precedence over media-surface gestures.
13. Toolbar and panel clicks never propagate to the underlying video gesture layer.
14. Mouse movement controls desktop visibility.
15. Touch single tapping controls mobile visibility.
16. Mouse inactivity or leaving the player hides regular controls.
17. Touch inactivity hides regular controls.
18. While locked, the same visibility rules apply only to the small Unlock button.
19. Existing Vidstack keyboard and gesture defaults must not duplicate or conflict with custom behavior.
20. Cleanup must restore valid playback and interaction state after any interrupted gesture.

---

## 20. Loading, Images, and Errors

### Loading

- Show a centered loading indicator when initial loading exceeds 200ms.
- Avoid flashing spinners during extremely short transitions.
- Keep video dimensions stable while loading.

### Buffering

- Show buffering feedback when playback genuinely stalls.
- Preserve current playback speed and user intent.
- Do not falsely show a paused state merely because playback is buffering.

### Images

When the active media is an image:

- Hide video-specific progress and playback controls.
- Keep relevant image navigation.
- Keep Info accessible.
- Do not enable video scrubbing.
- Do not enable playback-speed gestures.
- Do not enable JKL shuttle or frame stepping.
- Preserve vertical post navigation.
- Preserve Control Lock behavior where relevant.

### Error Handling

- Display meaningful playback errors.
- Provide a Retry action when supported.
- Preserve application navigation.
- Do not leave the player in an unrecoverable UI lock or gesture state.
- Show feedback when a requested interaction is unsupported.

---

## 21. Implementation Requirements

Modify the existing player directly.

Before implementing:

1. Inspect existing Vidstack player setup and component structure.
2. Identify current playback-rate handling.
3. Identify existing mouse and touch handlers.
4. Identify keyboard shortcut handling.
5. Identify current post/media navigation APIs.
6. Inspect current progress bar and toolbar CSS.
7. Identify existing Info, Settings, and Lock functionality, if any.
8. Identify Vidstack default behaviors that conflict with the requested interactions.

Implementation rules:

- Reuse existing project patterns.
- Preserve current application state and navigation integration.
- Reuse supported Vidstack primitives and APIs.
- Implement custom behavior only where necessary.
- Do not invent Vidstack APIs.
- Avoid duplicate event handlers and competing keyboard shortcuts.
- Clean up event listeners, animation frames, and timers.
- Avoid excessive rerenders during scrubbing and gestures.
- Use pointer capture and cancellation handling appropriately.
- Respect browser-native scrolling outside the active player interaction region.
- Support modern desktop and mobile browsers, including Safari.
- Handle unsupported playback rates, frame stepping, PiP, and volume control honestly.

Do not create test files or automatically execute tests.

Do not perform unrelated refactoring.

After implementation, summarize:

- Which existing files were modified.
- Which controls and gestures were added or changed.
- Which Vidstack defaults were overridden.
- Any browser/provider limitations.
- Any functionality that could only be implemented approximately.
- Manual verification commands or steps, without running them automatically.

## Final Acceptance Criteria

The player must:

- Use exactly two permanent bottom control rows.
- Have no top information bar and no post or subtitle information UI.
- Include Lock, Play/Pause, -10s, +10s, Volume, Time, Info, Settings, PiP, and Fullscreen controls where applicable.
- Retain dedicated -10s/+10s controls on touchscreen layouts.
- Reveal controls on mouse movement and hide them on mouse inactivity or exit.
- Reveal controls on touchscreen single tap and hide them after inactivity.
- Apply equivalent visibility behavior to the small Unlock button while controls are locked.
- Support touch and mouse horizontal video scrubbing with a moving progress overlay.
- Support left/center/right double tap and double click actions.
- Support long-press temporary acceleration with horizontal speed adjustment.
- Support downward touch movement during long press to lock playback speed.
- Provide explicit speed-lock release functionality.
- Implement exact J/K/L signed ladder stepping.
- Display an interactive JKL speed-ruler overlay.
- Support W/E frame stepping.
- Keep K, Space, and center double tap/double click pause-only.
- Support separate Control Lock and Speed Lock states.
- Provide visible feedback for every meaningful interaction, including unsupported and blocked actions.
- Preserve existing media and post navigation.
- Remain fully responsive without introducing a third permanent control row.

The final result must be a cohesive, production-quality modification of the existing Vidstack player, with consistent behavior across mouse, keyboard, and touchscreen input.
