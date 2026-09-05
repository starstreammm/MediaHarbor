import { Tooltip } from "@mui/material";
import { useState, useEffect } from "react";

import { api } from "~/hooks/api";
import { pushError } from "~/components/error_popout";
import type { TableCreator } from "~/model/table";
import UserAvatar from "~/components/avatar";
import CreatorView from "~/components/creator/view_index";

export function ShowCreatorAvatar({ account_uid, size = 38 }: { account_uid?: number | null; size?: number }) {
    const [creator, setCreator] = useState<TableCreator | null>(null);
    const [openDetail, setOpenDetail] = useState(false);

    useEffect(() => {
        if (!account_uid || account_uid < 0) return;
        api.get("/api/post/creator/avatar_uid", { searchParams: { account_uid } }).json<TableCreator>()
            .then((res) => setCreator(res))
            .catch((err) => pushError(err, "Fetch Creator Avatar"));
    }, [, account_uid]);

    return (
        <>
            {openDetail && creator?.avatar &&
                <CreatorView creator={creator} setCreator={setCreator} onClose={() => setOpenDetail(false)} />
            }
            <Tooltip title={creator?.alias ?? "Unknown Creator"}>
                <UserAvatar uid={creator?.avatar} size={size} onClick={() => setOpenDetail(true)} />
            </Tooltip>

        </>
    );
}