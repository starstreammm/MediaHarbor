import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useMemo,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
} from "@mui/material";
import type { TablePost } from "~/model/table";
import { getPostDetail } from "~/function/collection";
import { PostView } from "./view_index";

type PostList = {
    data: TablePost[];
    setData: Dispatch<SetStateAction<TablePost[]>>;
};

type PreviewContext = {
    register: (id: string, list: PostList) => () => void;
    open: (id: string, post: TablePost) => void;
};

const PreviewContext = createContext<PreviewContext | null>(null);

export function usePostPreview(
    data: TablePost[],
    setData: PostList["setData"],
    enabled = true,
) {
    const { register, open } = useContext(PreviewContext)!;
    const id = useId();
    useEffect(() => {
        if (enabled) return register(id, { data, setData });
    }, [register, id, data, setData, enabled]);
    return (index: number) => open(id, data[index]);
}

export function PostPreviewProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const [params, setParams] = useSearchParams();
    const [lists, setLists] = useState(new Map<string, PostList>());
    const [activeList, setActiveList] = useState<string | null>(null);
    const [navigationFeedback, setNavigationFeedback] = useState<string>();
    const [controlsVisible, setControlsVisible] = useState(true);
    const isOpen = params.get("open") === "post";
    const uid = Number(params.get("post"));
    const validUid = Number.isSafeInteger(uid) && uid > 0;
    const preferredList = activeList ? lists.get(activeList) : undefined;
    const list = preferredList?.data.some((post) => post.uid === uid)
        ? preferredList
        : [...lists.values()]
              .reverse()
              .find(({ data }) => data.some((post) => post.uid === uid));
    const listedPost = list?.data.find((post) => post.uid === uid);
    const detail = useQuery({
        queryKey: ["post", uid],
        queryFn: () => getPostDetail(uid),
        enabled: isOpen && validUid && !listedPost,
        retry: false,
    });
    const post = listedPost ?? detail.data;

    const register = useCallback((id: string, list: PostList) => {
        setLists((prev) => new Map(prev).set(id, list));
        return () =>
            setLists((prev) => {
                const next = new Map(prev);
                next.delete(id);
                return next;
            });
    }, []);

    const open = useCallback(
        (id: string, post: TablePost) => {
            setActiveList(id);
            setNavigationFeedback(undefined);
            setControlsVisible(true);
            setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("open", "post");
                next.set("post", String(post.uid));
                next.delete("file");
                return next;
            });
        },
        [setParams],
    );
    const context = useMemo(() => ({ register, open }), [register, open]);

    const close = () =>
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete("open");
                next.delete("post");
                next.delete("file");
                return next;
            },
            { replace: true },
        );

    const movePost = (direction: number) => {
        const index = list?.data.findIndex((post) => post.uid === uid) ?? -1;
        const nextPost = index >= 0 ? list?.data[index + direction] : undefined;
        if (!nextPost) return false;
        setNavigationFeedback(
            direction < 0 ? "↑ Previous post" : "Next post ↓",
        );
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set("post", String(nextPost.uid));
                next.delete("file");
                return next;
            },
            { replace: true },
        );
        return true;
    };

    const requestedFile = Number(params.get("file") ?? 1);
    const selectedFile =
        post && Number.isSafeInteger(requestedFile) && requestedFile > 0
            ? Math.min(requestedFile - 1, Math.max(0, post.files.length - 1))
            : 0;

    return (
        <PreviewContext.Provider value={context}>
            {children}
            {isOpen && validUid && post ? (
                <PostView
                    key={post.uid}
                    post={post}
                    onRateChange={(rate) => {
                        queryClient.setQueryData<TablePost>(["post", post.uid], (current) => ({ ...(current ?? post), rate }));
                        for (const { data, setData } of lists.values()) {
                            if (data.some((item) => item.uid === post.uid)) {
                                setData((previous) => previous.map((item) => item.uid === post.uid ? { ...item, rate } : item));
                            }
                        }
                    }}
                    selectedFile={selectedFile}
                    setSelectedFile={(index) =>
                        setParams(
                            (prev) => {
                                const next = new URLSearchParams(prev);
                                next.set("file", String(index + 1));
                                return next;
                            },
                            { replace: true },
                        )
                    }
                    navigationFeedback={navigationFeedback}
                    controlsVisible={controlsVisible}
                    setControlsVisible={setControlsVisible}
                    onClose={close}
                    onNext={() => movePost(1)}
                    onLast={() => movePost(-1)}
                />
            ) : isOpen ? (
                <Dialog open onClose={close}>
                    <DialogTitle>Post preview</DialogTitle>
                    <DialogContent>
                        {!validUid
                            ? "Invalid post ID."
                            : detail.isError
                              ? "Unable to load this post. It may have been deleted."
                              : "Loading post…"}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={close}>Close</Button>
                    </DialogActions>
                </Dialog>
            ) : null}
        </PreviewContext.Provider>
    );
}
