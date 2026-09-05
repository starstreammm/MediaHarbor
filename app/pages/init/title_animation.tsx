import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
    text: string;
    speed?: number;
    delay?: number;
    punctuationDelay?: number;
    className?: string;
    style?: React.CSSProperties;
    cursor?: boolean;
}

export default function TypeWriter({
    text,
    speed = 35,
    delay = 0,
    punctuationDelay = 150,
    className = "",
    style = {},
    cursor = true
}: Props) {
    const [displayed, setDisplayed] = useState("");
    const [done, setDone] = useState(false);
    const [started, setStarted] = useState(false);

    const indexRef = useRef(0);
    const startTimeRef = useRef<number | null>(null);
    const lastUpdateRef = useRef(0);

    const chars = useMemo(() => text.split(""), [text]);

    useEffect(() => {
        setDisplayed("");
        setDone(false);
        setStarted(false);

        indexRef.current = 0;
        startTimeRef.current = null;
        lastUpdateRef.current = 0;

        let raf: number;

        const loop = (t: number) => {
            // 初始化开始时间
            if (startTimeRef.current === null) {
                startTimeRef.current = t + delay;
            }

            // delay 阶段，不显示任何东西
            if (t < startTimeRef.current) {
                raf = requestAnimationFrame(loop);
                return;
            }

            const currentIndex = indexRef.current;

            // 完成
            if (currentIndex >= chars.length) {
                setDone(true);
                return;
            }

            const ch = chars[currentIndex];

            let threshold = speed;

            // 标点额外停顿
            if ([".", "!", "?", ",", "，", "。", "！", "？"].includes(ch)) {
                threshold += punctuationDelay;
            }

            const elapsed = t - lastUpdateRef.current;

            if (elapsed >= threshold) {
                // 第一个字符输出时才显示光标
                setStarted(true);

                setDisplayed((prev) => prev + ch);

                indexRef.current += 1;
                lastUpdateRef.current = t;
            }

            raf = requestAnimationFrame(loop);
        };

        raf = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(raf);
    }, [text, speed, delay, punctuationDelay, chars]);

    return (
        <span
            className={className}
            style={{
                ...style,
                whiteSpace: "pre-wrap",
                wordBreak: "normal",
            }}
        >
            {displayed}

            {cursor && started && !done && (
                <span
                    style={{
                        marginLeft: 2,
                        opacity: 0.7,
                        animation: "blink 1s infinite",
                    }}
                >
                    |
                </span>
            )}

            <style>
                {`
                @keyframes blink {
                    0% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0;
                    }
                    100% {
                        opacity: 1;
                    }
                }
                `}
            </style>
        </span>
    );
}