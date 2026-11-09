import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import {
    MediaPlayer, MediaProvider, TimeSlider, isHLSProvider, useMediaProvider,
    useVideoQualityOptions, useAudioOptions, type MediaPlayerInstance, type MediaPlayerProps,
} from "@vidstack/react";
import { Alert, Avatar, CircularProgress, Dialog, Drawer, IconButton, Popover, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import LockOpenIcon from "@mui/icons-material/LockOpenRounded";
import LockIcon from "@mui/icons-material/LockRounded";
import PlayIcon from "@mui/icons-material/PlayArrowRounded";
import PauseIcon from "@mui/icons-material/PauseRounded";
import BackIcon from "@mui/icons-material/Replay10Rounded";
import ForwardIcon from "@mui/icons-material/Forward10Rounded";
import VolumeIcon from "@mui/icons-material/VolumeUpRounded";
import MuteIcon from "@mui/icons-material/VolumeOffRounded";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import SettingsIcon from "@mui/icons-material/SettingsRounded";
import KeyboardIcon from "@mui/icons-material/KeyboardRounded";
import TouchIcon from "@mui/icons-material/TouchAppRounded";
import PipIcon from "@mui/icons-material/PictureInPictureAltRounded";
import FullscreenIcon from "@mui/icons-material/FullscreenRounded";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExitRounded";
import CloseIcon from "@mui/icons-material/CloseRounded";
import CheckIcon from "@mui/icons-material/CheckRounded";
import { useLocalStorage } from "~/hooks/storage";
import type { TableCreator, TablePost } from "~/model/table";
import { api } from "~/hooks/api";
import PostRating from "~/components/post/rating";
import { NORMAL_SPEEDS, PLAYER_CONFIG as C, SHUTTLE_SPEEDS, timestamp, type MediaNavigation } from "./config";
import { usePlayerControls } from "./use-player-controls";
import { useMediaRetry } from "./use-media-retry";
import { useFileInfo } from "~/hooks/file-info";
import { FileBar } from "./file-bar";
import "./player.css";

export type FullPlayerProps = {
    uid: number;
    post?: TablePost;
    image?: boolean;
    sx?: MediaPlayerProps["style"];
    playerRef?: RefObject<MediaPlayerInstance | null>;
    navigation: MediaNavigation;
    thumbnails?: string;
    navigationFeedback?: string;
    controlsVisible: boolean;
    setControlsVisible: (visible: boolean) => void;
    onRateChange: (rate: number) => void;
};

export function FullPlayer({ uid, post, image = false, sx, playerRef, navigation, thumbnails, navigationFeedback, controlsVisible, setControlsVisible, onRateChange }: FullPlayerProps) {
    const info = useFileInfo(uid);
    const missing = info.data?.exist === false;
    const localPlayer = useRef<MediaPlayerInstance>(null);
    const player = playerRef ?? localPlayer;
    const [savedSpeed, setSavedSpeed] = useLocalStorage<number>("player-normal-speed", 1);
    const normalSpeed = NORMAL_SPEEDS.find((value) => value === savedSpeed) ?? 1;
    const recovery = useMediaRetry(uid, !image && !missing);
    const [locked, setLocked] = useState(false);
    return (
        <MediaPlayer
            ref={player}
            className="harbor-player"
            src={image || missing ? undefined : { src: `/api/file/${uid}?attempt=${recovery.attempt}`, type: "application/x-mpegurl" }}
            style={sx}
            keyDisabled
            fullscreenOrientation="none"
            controls={false}
            loop={!image}
            playsInline
            autoPlay={!image}
            load="eager"
            onError={recovery.onError}
            onPlaying={recovery.onPlaying}
            onProviderChange={(provider) => {
                if (isHLSProvider(provider)) provider.library = () => import("hls.js");
            }}
        >
            {missing && <Alert severity="warning" sx={{ position: "absolute", top: 16, left: 16, right: 16, zIndex: 10 }}>File missing from storage. Update the data path and run a scan in Settings.</Alert>}
            {/* Keep the player and file bar mounted while replacing each media provider. */}
            {!image && <MediaProvider key={`media:${uid}:${recovery.attempt}`} />}
            <PlayerInterface
                key={`${uid}:${recovery.attempt}`}
                uid={uid}
                post={post}
                onRateChange={onRateChange}
                image={image}
                player={player}
                normalSpeed={normalSpeed}
                setNormalSpeed={setSavedSpeed}
                navigation={navigation}
                thumbnails={thumbnails}
                navigationFeedback={navigationFeedback}
                retry={recovery.retry}
                retrying={recovery.retrying}
                locked={locked}
                setLocked={setLocked}
                visible={controlsVisible}
                setVisible={setControlsVisible}
            />
            {navigation.fileCount > 1 && <FileBar navigation={navigation} player={player} image={image} locked={locked} />}
        </MediaPlayer>
    );
}

function Control({ label, children, onClick, disabled, className = "", buttonRef, pressed }: {
    label: string;
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    buttonRef?: RefObject<HTMLButtonElement | null>;
    pressed?: boolean;
}) {
    const localButton = useRef<HTMLButtonElement>(null);
    const ref = buttonRef ?? localButton;
    return (
        <Tooltip title={label} placement="top" slotProps={{
            popper: {
                container: () => ref.current?.closest("[data-media-player]") ?? document.body,
                sx: { width: "max-content", maxWidth: "calc(100vw - 24px)" },
            },
            tooltip: { sx: { width: "max-content", maxWidth: "min(320px, calc(100vw - 24px))", whiteSpace: "normal" } },
        }}>
            <span className={`player-control-wrap ${className}`}>
                <IconButton
                    ref={ref}
                    className="player-button"
                    aria-label={label}
                    aria-pressed={pressed}
                    disabled={disabled}
                    onClick={onClick}
                    data-player-control
                >
                    {children}
                </IconButton>
            </span>
        </Tooltip>
    );
}

function PlayerInterface({ uid, post, image, player, normalSpeed, setNormalSpeed, navigation, thumbnails, navigationFeedback, retry, retrying, locked, setLocked, visible, setVisible, onRateChange }: {
    uid: number;
    post?: TablePost;
    image: boolean;
    player: RefObject<MediaPlayerInstance | null>;
    normalSpeed: number;
    setNormalSpeed: (speed: number) => void;
    navigation: MediaNavigation;
    thumbnails?: string;
    navigationFeedback?: string;
    retry: () => void;
    retrying: boolean;
    locked: boolean;
    setLocked: (locked: boolean) => void;
    visible: boolean;
    setVisible: (visible: boolean) => void;
    onRateChange: (rate: number) => void;
}) {
    const provider = useMediaProvider();
    const qualityOptions = useVideoQualityOptions({ auto: "Auto" });
    const audioOptions = useAudioOptions();
    const hls = isHLSProvider(provider) ? provider.instance : null;
    const level = hls && hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : undefined;
    const controls = usePlayerControls({ player, image, normalSpeed, setNormalSpeed, navigation, fps: level?.frameRate, locked, setLocked, visible, setVisible });
    const { media, panel, hold, scrub, feedback } = controls;
    const accountUid = post?.account_uid;
    const creator = useQuery({
        queryKey: ["post-creator", accountUid],
        queryFn: ({ signal }) => api.get("/api/post/creator/avatar_uid", {
            searchParams: { account_uid: accountUid! },
            signal,
        }).json<TableCreator | null>(),
        enabled: panel === "info" && accountUid != null && accountUid > 0,
    });
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up("md"));
    const touchable = useMediaQuery("(any-pointer: coarse)");
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    const [imageError, setImageError] = useState(false);
    const [loadingVisible, setLoadingVisible] = useState(false);
    const infoButton = useRef<HTMLButtonElement>(null);
    const settingsButton = useRef<HTMLButtonElement>(null);
    const surface = useRef<HTMLDivElement>(null);
    const shortcutsTitle = useId();
    const ready = image ? imageSize !== null : media.canPlay;
    const error = imageError ? "This image could not be loaded." : retrying ? undefined : media.error?.message;
    const loading = retrying || (!error && (!ready || (!media.paused && media.waiting)));

    useEffect(() => {
        if (!loading) { setLoadingVisible(false); return; }
        const timer = setTimeout(() => setLoadingVisible(true), C.loadingDelay);
        return () => clearTimeout(timer);
    }, [loading]);
    useEffect(() => {
        if (!document.activeElement?.closest(".player-files")) surface.current?.focus({ preventScroll: true });
        if (navigationFeedback) controls.notify(navigationFeedback);
    }, []);
    useEffect(() => {
        if (media.autoPlayError) controls.notify("Autoplay was blocked. Use Play to start.", "error", C.rulerDuration);
    }, [media.autoPlayError]);
    useEffect(() => {
        if (error) controls.cancelGesture();
    }, [error]);
    useEffect(() => {
        if (panel === "info" && wide) player.current?.el?.querySelector<HTMLButtonElement>(".player-info button")?.focus({ preventScroll: true });
    }, [panel, wide, player]);

    const video = player.current?.el?.querySelector("video");
    const width = image ? imageSize?.width : video?.videoWidth;
    const height = image ? imageSize?.height : video?.videoHeight;
    const information = [
        ["Media type", image ? "Image" : "Video · HLS"],
        ["File ID", String(uid)],
        ["Media", `${navigation.fileIndex + 1} of ${navigation.fileCount}`],
        ["Duration", !image && media.duration > 0 ? timestamp(media.duration) : null],
        ["Resolution", width && height ? `${width} × ${height}` : null],
        ["Aspect ratio", width && height ? `${(width / height).toFixed(3)}:1` : null],
        ["Frame rate", level?.frameRate ? `${level.frameRate} FPS` : null],
        ["Video codec", level?.videoCodec ?? media.quality?.codec],
        ["Audio codec", level?.audioCodec],
        ["Bitrate", media.quality?.bitrate ? `${Math.round(media.quality.bitrate / 1000)} kbps` : null],
        ["Timestamp", !image && ready ? timestamp(media.currentTime, true) : null],
        ["Playback speed", !image && ready ? `${controls.shuttle && controls.shuttle < 0 ? controls.shuttle : media.playbackRate}x` : null],
    ].filter((entry) => entry[1]);
    const postInformation = post ? [
        ["Post ID", String(post.uid)],
        ["Platform", post.platform],
        ["Platform post ID", post.pid],
        ["Account", post.account_pid ?? (post.account_uid ? String(post.account_uid) : null)],
        ["Posted", post.post_time ? new Date(post.post_time).toLocaleString() : null],
        ["Added", new Date(post.create_time).toLocaleString()],
    ].filter((entry) => entry[1]) : [];
    const percent = (value: number) => `${Math.max(0, Math.min(100, (value - media.seekableStart) / (media.seekableEnd - media.seekableStart || 1) * 100))}%`;
    const controlsVisible = visible && !locked;
    const shuttleRate = controls.shuttle ?? 0;
    const criticalFeedback = feedback?.visible && (feedback.kind === "error" || feedback.kind === "lock");
    const criticalError = feedback?.visible && feedback.kind === "error";
    const interactiveOverlay = Boolean(hold?.visible || scrub?.visible);
    const shortcutGroups = touchable ? [
        {
            title: "Playback",
            items: image ? [] : [
                ["Tap Play / Pause", "Start or pause the video"],
                ["Double-tap center", "Play / pause"],
                ["Double-tap left / right", "Seek backward / forward 10 seconds"],
                ["Slide left / right", "Preview a new position; release to seek"],
                ["Press and hold", "Temporarily play at 2× while the video is playing"],
                ["Slide while holding", "Move left / right to choose 1.5×, 2×, 3× or 5×"],
                ["Slide down while holding", "Release to lock the selected speed"],
                ["Tap speed badge", "Unlock speed and restore normal playback speed"],
            ],
        },
        {
            title: "Navigation",
            items: [
                ["Swipe up / down", "Next / previous post"],
                ...(navigation.fileCount > 1 ? [["Tap or slide top bar", "Choose a file directly"]] : []),
                ...(image && navigation.fileCount > 1 ? [["Swipe left / right", "Next / previous file"]] : []),
            ],
        },
        {
            title: "Controls",
            items: [
                ["Tap the screen", "Show / hide controls"],
                ["Tap the lock", "Lock controls to prevent accidental gestures"],
                ["Tap while locked", "Show the unlock button; tap it to unlock"],
                ["Tap Info", "Show post details and media info"],
                ["Tap Close", "Close the post"],
            ],
        },
    ] : [
        {
            title: "Playback",
            items: image ? [] : [
                ["Enter", "Play / pause"],
                ["Space", "Play / pause"],
                ["J / L", "Decrease / increase shuttle speed (−5× to 5×)"],
                ["K", "Pause and show shuttle speeds"],
                ["W / E", "Previous / next frame (approximate)"],
                ["0–9", "Jump to 0%–90% of the video"],
                ["Home / End", "Jump to beginning / end"],
                ...(media.canSetVolume ? [["M", "Mute / unmute"]] : []),
            ],
        },
        {
            title: "Navigation",
            items: [
                ["↑ / ↓", "Previous / next post"],
                ...(navigation.fileCount > 1 ? [["← / →", "Previous / next media"]] : image ? [] : [
                    ["← / →", "Seek backward / forward 5 seconds"],
                    ["Shift + ← / →", "Seek backward / forward 10 seconds"],
                ]),
                ["Esc", "Close panel, exit fullscreen, then close post"],
            ],
        },
        {
            title: "Player",
            items: [
                ["?", "Open / close keyboard shortcuts"],
                ["I", "Toggle post and media info"],
                ["S", "Toggle settings"],
                ["Shift + U", "Lock / unlock controls"],
                ...(media.canFullscreen ? [["F", "Enter / exit fullscreen"]] : []),
                ...(!image && media.canPictureInPicture ? [["P", "Enter / exit picture-in-picture"]] : []),
            ],
        },
    ];

    const volumeControl = (
        <div className="player-volume" data-player-control>
            <Control label={media.muted || !media.volume ? "Unmute (M)" : "Mute (M)"} onClick={controls.mute}>
                {media.muted || !media.volume ? <MuteIcon /> : <VolumeIcon />}
            </Control>
            <input
                type="range" min="0" max="1" step="0.01"
                aria-label="Volume" value={media.muted ? 0 : media.volume}
                onChange={(event) => controls.volume(Number(event.target.value))}
            />
        </div>
    );

    return (
        <div
            ref={surface}
            className="player-interface"
            tabIndex={0}
            aria-label={image ? "Image viewer" : "Video player"}
            data-controls-visible={visible}
            data-locked={locked}
            data-fullscreen={media.fullscreen}
            data-info-inline={wide && panel === "info" && !locked}
            onPointerDown={controls.pointerDown}
            onPointerMove={controls.pointerMove}
            onPointerUp={controls.pointerUp}
            onPointerCancel={controls.pointerCancel}
            onLostPointerCapture={controls.lostPointerCapture}
            onPointerLeave={(event) => { if (event.pointerType === "mouse") controls.mouseLeave(); }}
            onContextMenu={(event) => {
                if (!(event.target as HTMLElement).closest("[data-player-panel]")) event.preventDefault();
            }}
            onDoubleClick={(event) => {
                if (!(event.target as HTMLElement).closest("[data-player-panel]")) event.preventDefault();
            }}
            onPointerDownCapture={(event) => {
                if ((event.target as HTMLElement).closest("[data-player-control]")) {
                    controls.interaction("focus", false);
                    controls.interaction("pointer", true);
                }
            }}
            onPointerUpCapture={(event) => {
                if ((event.target as HTMLElement).closest("[data-player-control]")) controls.interaction("pointer", false);
            }}
            onFocusCapture={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("[data-player-control]") && target.matches(":focus-visible")) controls.interaction("focus", true);
            }}
            onBlurCapture={(event) => {
                if (!(event.relatedTarget instanceof HTMLElement) || !event.relatedTarget.closest("[data-player-control]")) controls.interaction("focus", false);
            }}
        >
            <div className="player-viewport">
                {image && <img
                    className="player-image" src={`/api/file/${uid}`} alt="Current media" draggable={false}
                    onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                    onError={() => setImageError(true)}
                />}
                <div className="player-gesture-surface" aria-hidden="true" />
                {loadingVisible && <div className="player-loading" role="status" aria-label={retrying ? "Preparing video, retrying" : "Loading media"}><CircularProgress size={32} color="inherit" /></div>}
                {error && <div className="player-error" role="alert" data-player-control>
                    <p>{error}</p>
                    <button onClick={retry}>Retry</button>
                    <button onClick={navigation.onClose}>Close preview</button>
                </div>}
                <div className="player-unlock player-fade" data-visible={visible && locked} inert={!visible || !locked} data-player-control>
                    <Control label="Unlock controls (Shift + U)" onClick={controls.toggleLock}><LockIcon /></Control>
                </div>
                <div
                    className="player-bottom player-fade" data-visible={controlsVisible} inert={!controlsVisible} data-player-control
                    onPointerEnter={(event) => { if (event.pointerType === "mouse") controls.interaction("hover", true); }}
                    onPointerLeave={(event) => { if (event.pointerType === "mouse") controls.interaction("hover", false); }}
                >
                    {!image && <div className="player-progress-row">
                        <span className="player-mobile-time">{timestamp(media.currentTime)}</span>
                        <TimeSlider.Root
                            className="player-timeline" aria-label="Playback timeline"
                            key={controls.timelineKey}
                            noSwipeGesture
                            pauseWhileDragging={false}
                            onDragStart={controls.timelineStart}
                            onDragEnd={controls.timelineEnd}
                        >
                            <TimeSlider.Chapters className="player-chapters">
                                {(cues, forwardRef) => cues.map((cue) => <div className="player-chapter" key={cue.startTime} ref={forwardRef}>
                                    <TimeSlider.Track className="player-track">
                                        <TimeSlider.Progress className="player-buffered" />
                                        <TimeSlider.TrackFill className="player-played" />
                                    </TimeSlider.Track>
                                </div>)}
                            </TimeSlider.Chapters>
                            <TimeSlider.Thumb className="player-thumb" />
                            <TimeSlider.Preview className="player-preview" noClamp={false}>
                                {thumbnails && <TimeSlider.Thumbnail.Root src={thumbnails} className="player-thumbnail"><TimeSlider.Thumbnail.Img /></TimeSlider.Thumbnail.Root>}
                                <TimeSlider.Value type="pointer" format="time" />
                            </TimeSlider.Preview>
                        </TimeSlider.Root>
                        <span className="player-mobile-time">{timestamp(media.duration)}</span>
                    </div>}
                    <div className="player-toolbar">
                        <div className="player-toolbar-group">
                            <Control label="Lock controls (Shift + U)" onClick={controls.toggleLock}><LockOpenIcon /></Control>
                            {!image && <>
                                <Control label={media.paused && !(shuttleRate < 0) ? "Play (Enter / Space)" : "Pause (Enter / Space)"} onClick={() => media.paused && !(shuttleRate < 0) ? controls.play() : controls.pause()}>
                                    {media.paused && !(shuttleRate < 0) ? <PlayIcon /> : <PauseIcon />}
                                </Control>
                                <Control className="player-seek-control" label={`Seek backward 10 seconds${navigation.fileCount === 1 ? " (Shift + ←)" : ""}`} onClick={() => controls.seekBy(-10)}><BackIcon /></Control>
                                <Control className="player-seek-control" label={`Seek forward 10 seconds${navigation.fileCount === 1 ? " (Shift + →)" : ""}`} onClick={() => controls.seekBy(10)}><ForwardIcon /></Control>
                                {media.canSetVolume && <div className="player-desktop-only">{volumeControl}</div>}
                                <span className="player-desktop-time">{timestamp(media.currentTime)} / {timestamp(media.duration)}</span>
                            </>}
                        </div>
                        <div className="player-toolbar-group">
                            <Control className="player-help-control" label={touchable ? "Touch gestures" : "Keyboard shortcuts (?)"} onClick={() => controls.togglePanel("shortcuts")} pressed={panel === "shortcuts"}>
                                {touchable ? <TouchIcon /> : <KeyboardIcon />}
                            </Control>
                            <Control label="Info (I)" onClick={() => controls.togglePanel("info")} buttonRef={infoButton} pressed={panel === "info"}><InfoIcon /></Control>
                            <Control className="player-settings-control" label="Settings (S)" onClick={() => controls.togglePanel("settings")} buttonRef={settingsButton} pressed={panel === "settings"}><SettingsIcon /></Control>
                            {!image && media.canPictureInPicture && <Control className="player-desktop-only" label="Picture-in-picture (P)" onClick={() => void controls.pip()} pressed={media.pictureInPicture}><PipIcon /></Control>}
                            <Control className="player-fullscreen-control" label="Fullscreen (F)" disabled={!media.canFullscreen} onClick={() => void controls.fullscreen()} pressed={media.fullscreen}>
                                {media.fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                            </Control>
                            <Control label="Close preview (Esc)" onClick={navigation.onClose}><CloseIcon /></Control>
                        </div>
                    </div>
                </div>
                {controls.speedLock !== null && <button
                    className="player-speed-lock player-fade" data-visible={controlsVisible} inert={!controlsVisible}
                    data-player-control onClick={controls.unlockSpeed}
                ><LockIcon fontSize="small" /> Speed {controls.speedLock}x · Unlock</button>}

                {scrub && !error && !criticalError && <div className="player-scrub player-fade" data-visible={scrub.visible} aria-live="off">
                    <div><span>{timestamp(scrub.origin)}</span><strong>{timestamp(scrub.target)}</strong><span>{scrub.target >= scrub.origin ? "+" : "−"}{timestamp(Math.abs(scrub.target - scrub.origin))}</span></div>
                    <div className="player-scrub-track">
                        <span className="player-scrub-buffer" style={{ width: percent(media.bufferedEnd) }} />
                        <span className="player-scrub-played" style={{ width: percent(scrub.target) }} />
                        <i className="player-scrub-origin" style={{ left: percent(scrub.origin) }} />
                        <i className="player-scrub-target" style={{ left: percent(scrub.target) }} />
                    </div>
                </div>}
                {hold && !error && !criticalError && <div className="player-hold player-fade" data-visible={hold.visible} aria-live="polite">
                    {hold.armed && <LockIcon />} {hold.rate}x · {hold.armed ? "Release to Lock" : "Hold to accelerate"}
                </div>}
                <div
                    className="player-ruler player-fade"
                    data-visible={controls.ruler && !locked && !interactiveOverlay && !criticalFeedback && !error}
                    inert={!controls.ruler || locked || Boolean(interactiveOverlay || criticalFeedback || error)}
                    data-player-control
                    onPointerEnter={() => controls.interaction("ruler", true)}
                    onPointerLeave={() => controls.interaction("ruler", false)}
                >
                    <strong>{shuttleRate < 0 ? `Reverse ${Math.abs(shuttleRate)}x · Seek emulation` : shuttleRate > 0 ? `Forward ${shuttleRate}x` : "Paused"}</strong>
                    <div className="player-ruler-ticks">
                        {[...SHUTTLE_SPEEDS.filter((value) => value < 0), 0, ...SHUTTLE_SPEEDS.filter((value) => value > 0)].map((rate) => (
                            <button key={rate} aria-label={rate ? `${rate < 0 ? "Reverse" : "Forward"} ${Math.abs(rate)}x` : "Pause"} aria-pressed={shuttleRate === rate} onClick={() => controls.selectShuttle(rate)}>
                                {rate > 0 ? "+" : ""}{rate}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="player-feedback player-fade" data-visible={Boolean(feedback?.visible && !error && (feedback.kind === "error" || (!interactiveOverlay && (feedback.kind === "lock" || !controls.ruler))))} role="status" aria-live="polite">
                    {feedback?.text ?? ""}
                </div>
            </div>
            <Dialog
                open={panel === "shortcuts" && !locked}
                container={() => player.current?.el ?? document.body}
                onClose={() => controls.togglePanel(null)}
                aria-labelledby={shortcutsTitle}
                maxWidth={false}
                transitionDuration={0}
                sx={{ position: "absolute", inset: 0 }}
                slotProps={{
                    backdrop: { sx: { position: "absolute" } },
                    paper: {
                        className: "player-shortcuts",
                        ...{ "data-player-panel": true, "data-player-control": true },
                    },
                }}
            >
                <div className="player-panel-heading">
                    <h2 id={shortcutsTitle}>{touchable ? "Touch gestures" : "Keyboard shortcuts"}</h2>
                    <Control label={touchable ? "Close gesture guide" : "Close shortcuts (Esc / ?)"} onClick={() => controls.togglePanel(null)}><CloseIcon /></Control>
                </div>
                <p className="player-shortcuts-hint">{touchable
                    ? "Close this guide to use gestures on the media. Use the bottom buttons for other controls."
                    : "Close this guide to use playback and navigation shortcuts. Text fields keep their own keyboard controls."}</p>
                <div className="player-shortcut-groups">
                    {shortcutGroups.filter((group) => group.items.length > 0).map((group) => <section key={group.title}>
                        <h3>{group.title}</h3>
                        <dl>{group.items.map(([keys, action]) => <div key={keys}>
                            <dt>{touchable ? keys : <kbd>{keys}</kbd>}</dt>
                            <dd>{action}</dd>
                        </div>)}</dl>
                    </section>)}
                </div>
                <p className="player-shortcuts-hint">{touchable
                    ? "When controls are locked, tap the screen to reveal the unlock button."
                    : "When controls are locked, use Shift + U to unlock or Esc to exit."}</p>
            </Dialog>
            <Drawer
                open={panel === "info" && !locked}
                variant={wide ? "persistent" : "temporary"}
                anchor={wide ? "right" : "bottom"}
                container={() => player.current?.el ?? document.body}
                onClose={() => controls.togglePanel(null)}
                transitionDuration={0}
                sx={wide
                    ? { position: "absolute", right: 0, top: 0, bottom: 0, width: "var(--player-info-width)", zIndex: 2, pointerEvents: "none" }
                    : { position: "absolute", inset: 0 }}
                slotProps={{
                    backdrop: { sx: { position: "absolute" } },
                    paper: {
                        className: "player-info",
                        ...{ "data-player-panel": true, "data-player-control": true },
                        role: wide ? "complementary" : "dialog",
                        "aria-label": "Post and media info",
                        "aria-modal": wide ? undefined : true,
                        sx: {
                            position: "absolute", width: "100%", boxSizing: "border-box", pointerEvents: "auto",
                            height: wide ? "100%" : "auto", maxHeight: wide ? "100%" : "min(75dvh, 100%)",
                            borderRadius: wide ? 0 : "16px 16px 0 0",
                        },
                    },
                }}
            >
                <div className="player-panel-heading"><strong>Info</strong><Control label="Close info (Esc)" onClick={() => controls.togglePanel(null)}><CloseIcon /></Control></div>
                {post && <section>
                    <h3>Post details</h3>
                    {creator.isLoading && <p role="status">Loading creator…</p>}
                    {creator.isError && <p role="alert">Could not load the creator. <button onClick={() => void creator.refetch()}>Retry</button></p>}
                    {creator.data && <div className="player-post-creator">
                        <Avatar
                            alt={creator.data.alias || "Creator"}
                            src={creator.data.avatar > 0 ? `/api/file/${creator.data.avatar}` : undefined}
                            sx={{ width: 40, height: 40 }}
                        >{creator.data.alias?.slice(0, 1) || undefined}</Avatar>
                        {creator.data.alias && <span>{creator.data.alias}</span>}
                    </div>}
                    <div className="player-post-rating">
                        <span>Rating</span>
                        <PostRating uid={post.uid} rate={post.rate} onChange={onRateChange} />
                    </div>
                    {post.overview && <p className="player-post-overview">{post.overview}</p>}
                    <dl>{postInformation.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                    {post.url && /^https?:\/\//i.test(post.url) && <a href={post.url} target="_blank" rel="noopener noreferrer">Open original post ↗</a>}
                </section>}
                <section>
                    <h3>Media info</h3>
                    <dl>{information.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                </section>
            </Drawer>
            <Popover
                open={panel === "settings" && !locked}
                anchorEl={settingsButton.current}
                container={() => player.current?.el ?? document.body}
                onClose={() => controls.togglePanel(null)}
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                transformOrigin={{ vertical: "bottom", horizontal: "right" }}
                marginThreshold={12}
                transitionDuration={200}
                slotProps={{ paper: { className: "player-panel", "data-player-panel": true, "data-player-control": true } as React.HTMLAttributes<HTMLDivElement> }}
            >
                <div role="dialog" aria-label="Player settings" onKeyDown={(event) => {
                    if (event.key === "Escape") { event.stopPropagation(); controls.togglePanel(null); }
                }}>
                    <div className="player-panel-heading"><strong>Settings</strong><Control label="Close settings (Esc)" onClick={() => controls.togglePanel(null)}><CloseIcon /></Control></div>
                    {!image && <>
                        <h3>Playback speed</h3>
                        <div className="player-speed-options">
                            {NORMAL_SPEEDS.map((rate) => <button key={rate} aria-pressed={normalSpeed === rate} onClick={() => controls.selectNormal(rate)}>
                                {normalSpeed === rate && <CheckIcon />} {rate}x
                            </button>)}
                        </div>
                        {qualityOptions.length > 0 && <>
                            <h3>Quality</h3>
                            {qualityOptions.map((option) => <button className="player-option" key={option.value} disabled={qualityOptions.disabled} aria-pressed={option.selected} onClick={() => {
                                option.select(); controls.notify(`Quality · ${option.label}`);
                            }}>{option.label}{option.selected && <CheckIcon />}</button>)}
                        </>}
                        {audioOptions.length > 0 && <>
                            <h3>Audio</h3>
                            {audioOptions.map((option) => <button className="player-option" key={option.value} disabled={audioOptions.disabled} aria-pressed={option.selected} onClick={() => {
                                option.select(); controls.notify(`Audio · ${option.label}`);
                            }}>{option.label} {option.track.language}{option.selected && <CheckIcon />}</button>)}
                        </>}
                        {media.canSetVolume && <><h3>Volume</h3>{volumeControl}</>}
                        {media.canPictureInPicture && <button className="player-option" onClick={() => void controls.pip()}><PipIcon />{media.pictureInPicture ? "Exit" : "Enter"} picture-in-picture</button>}
                    </>}
                    <button className="player-option" disabled={!media.canFullscreen} onClick={() => void controls.fullscreen()}><FullscreenIcon />{media.fullscreen ? "Exit" : "Enter"} fullscreen</button>
                </div>
            </Popover>
        </div>
    );
}
