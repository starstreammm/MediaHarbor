import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { useMediaStore, type MediaPlayerInstance } from "@vidstack/react";
import type { MediaNavigation } from "./config";

export function FileBar({ navigation, player, image, locked }: {
    navigation: MediaNavigation;
    player: RefObject<MediaPlayerInstance | null>;
    image: boolean;
    locked: boolean;
}) {
    const media = useMediaStore(player);
    const selected = useRef(navigation.fileIndex);
    const bar = useRef<HTMLDivElement>(null);
    const pointer = useRef<number | null>(null);
    const progress = image ? 1 : Number.isFinite(media.duration) && media.duration > 0
        ? Math.max(0, Math.min(1, media.currentTime / media.duration)) : 0;

    useEffect(() => { selected.current = navigation.fileIndex; }, [navigation.fileIndex]);
    useEffect(() => {
        if (locked && pointer.current !== null) {
            bar.current?.releasePointerCapture(pointer.current);
            pointer.current = null;
        }
    }, [locked]);

    function select(index: number) {
        if (locked) return;
        const next = Math.max(0, Math.min(navigation.fileCount - 1, index));
        if (next === selected.current) return;
        selected.current = next;
        navigation.onFile(next);
    }

    function selectAt(event: PointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        select(Math.floor((event.clientX - rect.left) / rect.width * navigation.fileCount));
    }

    return (
        <div
            ref={bar}
            className="player-files"
            role="slider"
            aria-label="Files"
            aria-orientation="horizontal"
            aria-valuemin={1}
            aria-valuemax={navigation.fileCount}
            aria-valuenow={navigation.fileIndex + 1}
            aria-valuetext={`File ${navigation.fileIndex + 1} of ${navigation.fileCount}`}
            aria-disabled={locked}
            tabIndex={locked ? -1 : 0}
            inert={locked}
            data-player-control
            onPointerDown={(event) => {
                if (locked || !event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.focus({ preventScroll: true });
                pointer.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                selectAt(event);
            }}
            onPointerMove={(event) => {
                if (pointer.current === event.pointerId) selectAt(event);
            }}
            onPointerUp={(event) => {
                if (pointer.current !== event.pointerId) return;
                selectAt(event);
                pointer.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { pointer.current = null; }}
            onLostPointerCapture={() => { pointer.current = null; }}
            onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
                const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 };
                if (!(event.key in offsets) && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                event.stopPropagation();
                select(event.key === "Home" ? 0 : event.key === "End" ? navigation.fileCount - 1 : selected.current + offsets[event.key]);
            }}
        >
            {Array.from({ length: navigation.fileCount }, (_, index) => <span
                key={index}
                className="player-file-segment"
                data-current={index === navigation.fileIndex}
                data-previous={index < navigation.fileIndex}
                aria-hidden="true"
            >
                {index === navigation.fileIndex && <span className="player-file-progress" style={{ transform: `scaleX(${progress})` }} />}
            </span>)}
        </div>
    );
}
