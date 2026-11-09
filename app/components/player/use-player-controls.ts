import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type RefObject } from "react";
import { useMediaStore, type MediaPlayerInstance } from "@vidstack/react";
import { PLAYER_CONFIG as C, SHUTTLE_SPEEDS, timestamp, type MediaNavigation } from "./config";

type Gesture = {
    id: number;
    pointer: string;
    mode: "pending" | "scrub" | "post" | "image" | "hold" | "armed" | "cancelled";
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    origin: number;
    target: number;
    previousRate: number;
    holdX: number;
    holdY: number;
    rate: number;
    element: HTMLElement;
};
type Feedback = { text: string; kind: "ordinary" | "lock" | "error"; visible: boolean };

export function usePlayerControls({ player, image, normalSpeed, setNormalSpeed, navigation, fps, locked, setLocked, visible, setVisible }: {
    player: RefObject<MediaPlayerInstance | null>;
    image: boolean;
    normalSpeed: number;
    setNormalSpeed: (speed: number) => void;
    navigation: MediaNavigation;
    fps?: number;
    locked: boolean;
    setLocked: (locked: boolean) => void;
    visible: boolean;
    setVisible: (visible: boolean) => void;
}) {
    const media = useMediaStore(player);
    const [panel, setPanel] = useState<"info" | "settings" | "shortcuts" | null>(null);
    const [speedLock, setSpeedLock] = useState<number | null>(null);
    const [shuttle, setShuttle] = useState<number | null>(null);
    const [hold, setHold] = useState<{ rate: number; armed: boolean; visible: boolean } | null>(null);
    const [scrub, setScrub] = useState<{ origin: number; target: number; visible: boolean } | null>(null);
    const [ruler, setRuler] = useState(false);
    const [timelineKey, setTimelineKey] = useState(0);
    const timelineOrigin = useRef<number | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const speed = useRef({ normal: normalSpeed, locked: null as number | null, shuttle: null as number | null });
    const gesture = useRef<Gesture | null>(null);
    const tap = useRef<{ time: number; x: number; y: number; zone: number } | null>(null);
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const frame = useRef<number | null>(null);
    const busy = useRef(new Set<string>());
    const lastVolume = useRef(1);
    const lastSeek = useRef<{ target: number; time: number } | null>(null);
    const mounted = useRef(true);
    const mousePosition = useRef<{ x: number; y: number } | null>(null);
    const lastMousePosition = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!visible) mousePosition.current = lastMousePosition.current;
    }, [visible]);

    function clearTimer(name: string) {
        clearTimeout(timers.current[name]);
        delete timers.current[name];
    }
    function later(name: string, action: () => void, delay: number) {
        clearTimer(name);
        timers.current[name] = setTimeout(() => {
            delete timers.current[name];
            if (mounted.current) action();
        }, delay);
    }
    function notify(text: string, kind: Feedback["kind"] = "ordinary", duration = C.feedbackDuration) {
        if (!mounted.current) return;
        setFeedback({ text, kind, visible: true });
        later("feedback", () => setFeedback((value) => value ? { ...value, visible: false } : null), duration);
    }
    function reveal() {
        setVisible(true);
        later("controls", () => {
            if (!busy.current.size) setVisible(false);
        }, C.controlsTimeout);
    }
    function interaction(name: string, active: boolean) {
        if (active) busy.current.add(name);
        else busy.current.delete(name);
        if (visible) reveal();
    }
    function togglePanel(next: "info" | "settings" | "shortcuts" | null) {
        const value = panel === next ? null : next;
        setPanel(value);
        interaction("panel", value !== null);
        if (!value) (player.current?.el?.querySelector(".player-interface") as HTMLElement | null)?.focus({ preventScroll: true });
    }
    function bounds() {
        const state = player.current?.state;
        return { start: state?.seekableStart ?? 0, end: state?.seekableEnd ?? 0 };
    }
    function clamp(time: number) {
        const { start, end } = bounds();
        const bounded = Math.max(start, Math.min(time, end));
        const ranges = player.current?.state.seekable;
        if (!ranges?.length) return bounded;
        let nearest = start;
        let distance = Infinity;
        for (let index = 0; index < ranges.length; index++) {
            const rangeStart = ranges.start(index);
            const rangeEnd = ranges.end(index);
            if (bounded >= rangeStart && bounded <= rangeEnd) return bounded;
            for (const edge of [rangeStart, rangeEnd]) {
                if (Math.abs(edge - bounded) < distance) {
                    nearest = edge;
                    distance = Math.abs(edge - bounded);
                }
            }
        }
        return nearest;
    }
    function seek(time: number, message?: string) {
        const target = player.current;
        if (image || !target?.state.canSeek) {
            notify("Seeking is unavailable for this media.");
            return false;
        }
        const position = clamp(time);
        lastSeek.current = { target: position, time: performance.now() };
        try {
            target.currentTime = position;
        } catch (error) {
            notify(`Seeking failed: ${error instanceof Error ? error.message : "Unavailable"}`, "error");
            return false;
        }
        if (message) notify(`${message}${position !== time ? " · Boundary reached" : ""}`);
        return true;
    }
    function seekBase() {
        return lastSeek.current && performance.now() - lastSeek.current.time < 1000
            ? lastSeek.current.target
            : player.current?.currentTime ?? 0;
    }
    function seekBy(seconds: number) {
        seek(seekBase() + seconds, `${seconds < 0 ? "◀" : "▶"} ${seconds > 0 ? "+" : ""}${seconds}s`);
    }
    function applyRate(rate: number) {
        const target = player.current;
        if (!target || image || !target.state.canPlay || !target.state.canSetPlaybackRate) {
            notify("Playback speed is unavailable for this media.", "error");
            return false;
        }
        try {
            const previousRate = target.playbackRate;
            target.playbackRate = rate;
            const video = target.el?.querySelector("video");
            if (video && Math.abs(video.playbackRate - rate) > 0.01) {
                target.playbackRate = previousRate;
                notify(`${rate}x is not supported by this browser.`, "error");
                return false;
            }
            return true;
        } catch (error) {
            notify(`Cannot apply ${rate}x: ${error instanceof Error ? error.message : "Unsupported rate"}`, "error");
            return false;
        }
    }
    function restoreHold(rate: number) {
        applyRate(rate < 0 ? speed.current.normal : rate);
        if (rate < 0) player.current?.pause().catch((error: Error) => notify(error.message, "error"));
    }
    function cancelGesture() {
        const current = gesture.current;
        gesture.current = null;
        clearTimer("hold");
        clearTimer("tap");
        tap.current = null;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        clearTimer("scrub");
        clearTimer("scrubFade");
        clearTimer("holdFade");
        if (current?.mode === "hold" || current?.mode === "armed") restoreHold(current.previousRate);
        if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
        setHold(null);
        setScrub(null);
        busy.current.delete("gesture");
    }
    function resetSpeed() {
        speed.current.locked = null;
        speed.current.shuttle = null;
        setSpeedLock(null);
        setShuttle(null);
        applyRate(speed.current.normal);
    }
    function pause(show = true) {
        if (image) return notify("Playback is unavailable for images.");
        cancelGesture();
        resetSpeed();
        speed.current.shuttle = 0;
        setShuttle(0);
        player.current?.pause().catch((error: Error) => notify(error.message, "error"));
        if (show) notify("Ⅱ Paused");
    }
    function play() {
        if (image) return;
        resetSpeed();
        player.current?.play().then(() => {
            if (mounted.current) notify("▶ Playing");
        }).catch((error: Error) => {
            if (mounted.current) notify(`Playback unavailable: ${error.message}`, "error");
        });
    }
    function selectNormal(rate: number) {
        cancelGesture();
        if (!applyRate(rate)) return;
        const wasReversing = (speed.current.shuttle ?? 0) < 0;
        speed.current = { normal: rate, locked: null, shuttle: null };
        setNormalSpeed(rate);
        setSpeedLock(null);
        setShuttle(null);
        if (wasReversing) player.current?.play().catch((error: Error) => notify(error.message, "error"));
        notify(`Playback speed · ${rate}x`);
    }
    function unlockSpeed() {
        resetSpeed();
        notify(`Speed Unlocked · ${speed.current.normal}x`, "lock", C.rulerDuration);
    }
    function showRuler() {
        setRuler(true);
        later("ruler", () => {
            setRuler(false);
            busy.current.delete("ruler");
        }, C.rulerDuration);
    }
    function selectShuttle(rate: number) {
        if (image) return notify("Shuttle playback is unavailable for images.");
        cancelGesture();
        if (!rate) {
            pause(false);
            showRuler();
            return;
        }
        if (!player.current?.state.canSeek) return notify("Shuttle playback is unavailable until media is seekable.");
        if (!applyRate(rate < 0 ? speed.current.normal : rate)) return;
        speed.current.locked = null;
        speed.current.shuttle = rate;
        setSpeedLock(null);
        setShuttle(rate);
        showRuler();
        if (rate < 0) {
            player.current.pause().catch((error: Error) => notify(error.message, "error"));
        } else {
            player.current.play().catch((error: Error) => {
                if (!mounted.current) return;
                speed.current.shuttle = 0;
                setShuttle(0);
                notify(error.message, "error");
            });
        }
    }
    function stepShuttle(direction: number) {
        const active = speed.current.shuttle;
        const rate = active !== null && active !== 0 ? active
            : player.current?.paused ? 0 : speed.current.locked ?? speed.current.normal;
        const next = rate === 0 ? direction
            : direction < 0 ? [...SHUTTLE_SPEEDS].reverse().find((value) => value < rate)
            : SHUTTLE_SPEEDS.find((value) => value > rate);
        selectShuttle(next ?? rate);
        if (next === undefined) notify("Shuttle speed boundary reached");
    }
    function stepFrame(direction: number) {
        const origin = seekBase();
        pause(false);
        const frameRate = fps && fps > 0 ? fps : C.fallbackFps;
        const target = clamp(origin + direction / frameRate);
        seek(target, `${direction < 0 ? "Previous" : "Next"} Frame · ${timestamp(target, true)} · Approx. ${frameRate} FPS${target === origin ? " · Boundary reached" : ""}`);
    }
    function volume(value: number) {
        if (!player.current?.state.canSetVolume) return notify("Use your device volume controls.");
        player.current.volume = value;
        player.current.muted = value === 0;
        if (value > 0) lastVolume.current = value;
        notify(`Volume · ${Math.round(value * 100)}%`);
    }
    function mute() {
        const target = player.current;
        if (!target || image || !target.state.canSetVolume) return notify("Use your device volume controls.");
        if (target.muted || target.volume === 0) {
            target.volume = target.volume || lastVolume.current;
            target.muted = false;
            notify("Unmuted");
        } else {
            lastVolume.current = target.volume;
            target.muted = true;
            notify("Muted");
        }
    }
    async function fullscreen() {
        const target = player.current;
        if (!target?.state.canFullscreen) return notify("Fullscreen is unavailable in this browser.");
        try {
            if (target.state.fullscreen) await target.exitFullscreen();
            else await target.enterFullscreen();
        } catch (error) {
            notify(`Fullscreen unavailable: ${error instanceof Error ? error.message : "Unsupported"}`, "error");
        }
    }
    async function pip() {
        const target = player.current;
        if (image || !target?.state.canPictureInPicture) return notify("Picture-in-picture is unavailable.");
        try {
            if (target.state.pictureInPicture) await target.exitPictureInPicture();
            else await target.enterPictureInPicture();
        } catch (error) {
            notify(`PiP unavailable: ${error instanceof Error ? error.message : "Unsupported"}`, "error");
        }
    }
    function toggleLock() {
        cancelGesture();
        setLocked(!locked);
        (player.current?.el?.querySelector(".player-interface") as HTMLElement | null)?.focus({ preventScroll: true });
        setPanel(null);
        setRuler(false);
        busy.current.clear();
        if (visible) reveal();
        notify(locked ? "Controls Unlocked" : "Controls Locked", "lock");
    }
    function moveFile(direction: number) {
        const index = navigation.fileIndex + direction;
        if (index < 0 || index >= navigation.fileCount) return;
        cancelGesture();
        navigation.onFile(index);
    }
    function movePost(direction: number) {
        cancelGesture();
        if (!navigation.onPost(direction)) notify("Post boundary reached");
    }
    function keyDown(event: ReactKeyboardEvent<HTMLElement> | KeyboardEvent) {
        const target = event.target as HTMLElement;
        const composing = "nativeEvent" in event ? event.nativeEvent.isComposing : event.isComposing;
        if (event.altKey || event.ctrlKey || event.metaKey || composing) return;
        const key = event.key.toLowerCase();
        if (key === "escape") {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            if (panel) togglePanel(null);
            else if (player.current?.state.fullscreen) void fullscreen();
            else navigation.onClose();
            return;
        }
        if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="menu"]')) return;
        if (key === "?") {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            if (locked) {
                return notify("Controls Locked", "lock");
            }
            return togglePanel("shortcuts");
        }
        if (panel === "shortcuts") return;
        if (target.closest("[data-player-panel]")) {
            // Only panel-local toggles are handled here; playback shortcuts stay inactive.
            if (!event.shiftKey && !event.repeat && (key === "i" || key === "s")) {
                event.preventDefault();
                event.stopPropagation();
                togglePanel(key === "i" ? "info" : "settings");
            }
            return;
        }
        if ((key === "enter" || key === " ") && target.closest("button, a")) return;
        const known = ["j", "k", "l", " ", "enter", "w", "e", "arrowleft", "arrowright", "arrowup", "arrowdown", "m", "f", "p", "i", "s", "home", "end"];
        if (!known.includes(key) && !/^\d$/.test(key) && !(key === "u" && event.shiftKey)) return;
        if (event.shiftKey && !["u", "arrowleft", "arrowright"].includes(key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (key === "u" && event.shiftKey) return toggleLock();
        if (locked) {
            return notify("Controls Locked", "lock");
        }
        if (visible) reveal();
        if (key === "i" || key === "s") return togglePanel(key === "i" ? "info" : "settings");
        if (key === "f") return void fullscreen();
        if (key === "arrowup" || key === "arrowdown") return movePost(key === "arrowup" ? -1 : 1);
        if (key === "arrowleft" || key === "arrowright") {
            const direction = key === "arrowleft" ? -1 : 1;
            if (navigation.fileCount > 1 && !event.shiftKey) return moveFile(direction);
            if (navigation.fileCount > 1 && event.shiftKey) return notify("Shift + Arrow seeking is for single-video posts.");
            return seekBy(direction * (event.shiftKey ? 10 : 5));
        }
        if (image) return notify("This shortcut is unavailable for images.");
        if (key === "enter" || key === " ") return media.paused && !((speed.current.shuttle ?? 0) < 0) ? play() : pause();
        if (key === "j" || key === "l") return stepShuttle(key === "j" ? -1 : 1);
        if (key === "k") { pause(false); showRuler(); }
        else if (key === "w" || key === "e") stepFrame(key === "w" ? -1 : 1);
        else if (key === "m") mute();
        else if (key === "p") void pip();
        else if (key === "home" || key === "end") seek(key === "home" ? bounds().start : bounds().end, key === "home" ? "Beginning" : "End");
        else if (/^\d$/.test(key)) seek(bounds().start + (bounds().end - bounds().start) * Number(key) / 10, `${key}0%`);
    }

    function pointerDown(event: PointerEvent<HTMLElement>) {
        if (event.pointerType === "mouse") {
            mousePosition.current = { x: event.clientX, y: event.clientY };
            lastMousePosition.current = mousePosition.current;
        }
        if (event.button !== 0 || !event.isPrimary) {
            cancelGesture();
            return;
        }
        if ((event.target as HTMLElement).closest("[data-player-control]")) return;
        if (panel) {
            togglePanel(null);
            return;
        }
        event.currentTarget.focus({ preventScroll: true });
        if (locked) {
            reveal();
            notify("Controls Locked", "lock");
            return;
        }
        clearTimer("scrub");
        clearTimer("scrubFade");
        setScrub(null);
        const target = player.current;
        const origin = target?.currentTime ?? 0;
        const current: Gesture = {
            id: event.pointerId, pointer: event.pointerType, mode: "pending",
            x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY,
            holdX: event.clientX, holdY: event.clientY, origin, target: origin,
            previousRate: (speed.current.shuttle ?? 0) < 0 ? speed.current.shuttle! : target?.playbackRate ?? speed.current.normal, rate: 2,
            element: event.currentTarget,
        };
        gesture.current = current;
        event.currentTarget.setPointerCapture(event.pointerId);
        busy.current.add("gesture");
        if (!image && target && (!target.paused || (speed.current.shuttle ?? 0) < 0)) {
            later("hold", () => {
                if (gesture.current !== current || current.mode !== "pending" || (target.paused && (speed.current.shuttle ?? 0) >= 0)) return;
                clearTimer("tap");
                tap.current = null;
                if (!applyRate(2)) {
                    current.mode = "cancelled";
                    return;
                }
                current.mode = "hold";
                current.holdX = current.lastX;
                current.holdY = current.lastY;
                clearTimer("holdFade");
                setHold({ rate: 2, armed: false, visible: true });
                if (current.previousRate < 0) target.play().catch((error: Error) => {
                    if (mounted.current) cancelGesture();
                    notify(error.message, "error");
                });
            }, C.holdDelay);
        }
    }
    function pointerMove(event: PointerEvent<HTMLElement>) {
        if (event.pointerType === "mouse") {
            const previous = mousePosition.current;
            lastMousePosition.current = { x: event.clientX, y: event.clientY };
            if (!previous) mousePosition.current = { x: event.clientX, y: event.clientY };
            else if (Math.hypot(event.clientX - previous.x, event.clientY - previous.y) >= C.mouseRevealThreshold) {
                mousePosition.current = { x: event.clientX, y: event.clientY };
                reveal();
            }
        }
        const current = gesture.current;
        if (!current || event.pointerId !== current.id) return;
        current.lastX = event.clientX;
        current.lastY = event.clientY;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (current.mode === "hold" || current.mode === "armed") {
            const horizontal = event.clientX - current.holdX;
            const vertical = event.clientY - current.holdY;
            const rate = horizontal <= -60 ? 1.5 : horizontal < 60 ? 2 : horizontal < 120 ? 3 : 5;
            const previousRate = current.rate;
            const previousMode = current.mode;
            if (rate !== current.rate && applyRate(rate)) current.rate = rate;
            if (current.pointer === "touch") {
                if (vertical >= C.speedLockThreshold) current.mode = "armed";
                else if (vertical < C.speedLockThreshold - C.speedLockHysteresis) current.mode = "hold";
            }
            if (current.rate !== previousRate || current.mode !== previousMode) {
                setHold({ rate: current.rate, armed: current.mode === "armed", visible: true });
            }
            return;
        }
        if (current.mode === "pending") {
            if (Math.hypot(dx, dy) > C.tapTolerance) clearTimer("hold");
            if (Math.abs(dx) >= C.directionThreshold && Math.abs(dx) >= Math.abs(dy) * C.directionDominance) {
                current.mode = image ? "image" : "scrub";
            } else if (Math.abs(dy) >= C.directionThreshold && Math.abs(dy) >= Math.abs(dx) * C.directionDominance) {
                current.mode = "post";
            }
            if (current.mode !== "pending") {
                clearTimer("hold");
                clearTimer("tap");
                tap.current = null;
            }
        }
        if (current.mode === "scrub") {
            const { start, end } = bounds();
            const width = current.element.clientWidth;
            current.target = clamp(current.origin + dx / width * (end - start) * C.seekSensitivity);
            if (frame.current === null) {
                frame.current = requestAnimationFrame(() => {
                    frame.current = null;
                    if (gesture.current === current) setScrub({ origin: current.origin, target: current.target, visible: true });
                });
            }
        }
    }
    function pointerUp(event: PointerEvent<HTMLElement>) {
        const current = gesture.current;
        if (!current || event.pointerId !== current.id) return;
        if (event.pointerType === "mouse") {
            mousePosition.current = { x: event.clientX, y: event.clientY };
            lastMousePosition.current = mousePosition.current;
        }
        gesture.current = null;
        clearTimer("hold");
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
        busy.current.delete("gesture");
        if (current.mode !== "pending") reveal();
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (current.mode === "hold" || current.mode === "armed") {
            setHold((value) => value ? { ...value, visible: false } : null);
            later("holdFade", () => setHold(null), 200);
            if (current.mode === "armed") {
                speed.current.locked = current.rate;
                speed.current.shuttle = null;
                setSpeedLock(current.rate);
                setShuttle(null);
                notify(`Speed Locked · ${current.rate}x`, "lock", C.rulerDuration);
            } else restoreHold(current.previousRate);
        } else if (current.mode === "scrub") {
            setScrub({ origin: current.origin, target: current.target, visible: true });
            const difference = current.target - current.origin;
            seek(current.target, `${difference >= 0 ? "+" : "−"}${timestamp(Math.abs(difference))} · ${timestamp(current.target)}`);
            later("scrub", () => {
                setScrub((value) => value ? { ...value, visible: false } : null);
                later("scrubFade", () => setScrub(null), 200);
            }, C.scrubReleaseDelay);
        } else if (current.mode === "post" && Math.abs(dy) >= C.navigationThreshold) {
            movePost(dy < 0 ? 1 : -1);
        } else if (current.mode === "image" && Math.abs(dx) >= C.navigationThreshold) {
            if (navigation.fileCount > 1) moveFile(dx < 0 ? 1 : -1);
        } else if (current.mode === "pending" && Math.hypot(dx, dy) <= C.tapTolerance) {
            const rect = current.element.getBoundingClientRect();
            const relative = (event.clientX - rect.left) / rect.width;
            const zone = relative < 0.3 ? -1 : relative > 0.7 ? 1 : 0;
            const previous = tap.current;
            const now = performance.now();
            if (previous && now - previous.time <= C.doubleTapDelay && previous.zone === zone && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= C.doubleTapDistance) {
                clearTimer("tap");
                tap.current = null;
                if (visible) reveal();
                if (image) reveal();
                else if (zone) seekBy(zone * 10);
                else if (media.paused && !((speed.current.shuttle ?? 0) < 0)) play();
                else pause();
            } else {
                tap.current = { time: now, x: event.clientX, y: event.clientY, zone };
                clearTimer("controls");
                later("tap", () => {
                    tap.current = null;
                    if (visible) {
                        clearTimer("controls");
                        setVisible(false);
                    } else reveal();
                }, C.doubleTapDelay);
            }
        }
    }

    function cancelTimeline() {
        if (timelineOrigin.current === null) return;
        const origin = timelineOrigin.current;
        timelineOrigin.current = null;
        setTimelineKey((value) => value + 1);
        busy.current.delete("timeline");
        busy.current.delete("pointer");
        seek(origin);
        reveal();
    }
    const interrupt = useEffectEvent(() => {
        cancelGesture();
        cancelTimeline();
        busy.current.delete("pointer");
        busy.current.delete("timeline");
        if ((speed.current.shuttle ?? 0) < 0) pause(false);
        if (visible) reveal();
    });
    const ready = useEffectEvent(() => {
        if (!image && player.current?.state.canPlay && player.current.playbackRate !== speed.current.normal) {
            applyRate(speed.current.normal);
        }
    });
    const paused = useEffectEvent(() => {
        if (media.paused && (speed.current.shuttle ?? 0) >= 0) {
            cancelGesture();
            if (speed.current.locked !== null || (speed.current.shuttle ?? 0) > 0) resetSpeed();
        }
    });
    useEffect(() => { speed.current.normal = normalSpeed; }, [normalSpeed]);
    useEffect(() => { ready(); }, [media.canPlay]);
    useEffect(() => { paused(); }, [media.paused]);
    useEffect(() => {
        if (media.waiting && gesture.current) interrupt();
    }, [media.waiting]);

    const reverseTick = useEffectEvent((elapsed: number) => {
        const target = player.current;
        if (!target || speed.current.shuttle === null || speed.current.shuttle >= 0) return false;
        const position = target.currentTime + elapsed * speed.current.shuttle;
        if (position <= bounds().start) {
            seek(bounds().start);
            pause(false);
            showRuler();
            notify("Beginning reached");
            return false;
        }
        seek(position);
        return true;
    });
    const reverseFailure = useEffectEvent(() => {
        pause(false);
        notify("Reverse seeking is too slow or unavailable for this source.", "error");
    });
    useEffect(() => {
        if (shuttle === null || shuttle >= 0) return;
        let last = performance.now();
        let seekingSince: number | null = null;
        const interval = setInterval(() => {
            const target = player.current;
            const now = performance.now();
            if (gesture.current?.mode === "hold" || gesture.current?.mode === "armed") {
                last = now;
                return;
            }
            if (!target?.state.canSeek) return reverseFailure();
            if (target.state.seeking) {
                seekingSince ??= now;
                if (now - seekingSince > C.reverseSeekTimeout) reverseFailure();
                return;
            }
            seekingSince = null;
            reverseTick((now - last) / 1000);
            last = now;
        }, C.reverseInterval);
        return () => clearInterval(interval);
    }, [shuttle, player]);

    const keyboard = useEffectEvent((event: KeyboardEvent) => keyDown(event));
    useEffect(() => {
        const element = player.current?.el;
        element?.addEventListener("keydown", keyboard, true);
        return () => element?.removeEventListener("keydown", keyboard, true);
    }, [player]);

    const stateFeedback = useEffectEvent((text: string) => notify(text));
    useEffect(() => {
        const target = player.current;
        if (!target) return;
        const fullscreenChanged = () => stateFeedback(target.state.fullscreen ? "Fullscreen enabled" : "Fullscreen exited");
        const pipChanged = () => stateFeedback(target.state.pictureInPicture ? "PiP enabled" : "PiP disabled");
        target.addEventListener("fullscreen-change", fullscreenChanged);
        target.addEventListener("picture-in-picture-change", pipChanged);
        return () => {
            target.removeEventListener("fullscreen-change", fullscreenChanged);
            target.removeEventListener("picture-in-picture-change", pipChanged);
        };
    }, [player]);
    useEffect(() => {
        mounted.current = true;
        const target = player.current;
        if (visible) reveal();
        const hidden = () => { if (document.hidden) interrupt(); };
        window.addEventListener("blur", interrupt);
        document.addEventListener("visibilitychange", hidden);
        return () => {
            mounted.current = false;
            window.removeEventListener("blur", interrupt);
            document.removeEventListener("visibilitychange", hidden);
            Object.values(timers.current).forEach(clearTimeout);
            timers.current = {};
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            const current = gesture.current;
            gesture.current = null;
            if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
            if (target && !image) target.playbackRate = speed.current.normal;
        };
    }, [player, image]);

    return {
        media, visible, locked, panel, speedLock, shuttle, hold, scrub, ruler, feedback, timelineKey, cancelTimeline,
        reveal, interaction, notify, togglePanel, seek, seekBy, pause, play, selectNormal,
        unlockSpeed, selectShuttle, volume, mute, fullscreen, pip, toggleLock,
        moveFile, movePost, pointerDown, pointerMove, pointerUp, cancelGesture,
        pointerCancel: () => {
            cancelGesture();
            cancelTimeline();
            busy.current.delete("pointer");
            busy.current.delete("ruler");
            reveal();
        },
        lostPointerCapture: () => { if (gesture.current) cancelGesture(); },
        mouseLeave: () => {
            mousePosition.current = null;
            lastMousePosition.current = null;
            busy.current.delete("hover");
            if (!busy.current.size) { clearTimer("controls"); setVisible(false); }
        },
        timelineStart: () => {
            timelineOrigin.current = player.current?.currentTime ?? 0;
            interaction("timeline", true);
        },
        timelineEnd: (percent: number) => {
            timelineOrigin.current = null;
            lastSeek.current = null;
            busy.current.delete("pointer");
            interaction("timeline", false);
            notify(`Seek · ${timestamp(bounds().start + percent / 100 * (bounds().end - bounds().start))}`);
        },
    };
}

export type PlayerControls = ReturnType<typeof usePlayerControls>;
