import { Rating } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { updateRate } from "~/function/post";


export default function PostRating({ uid, rate, onChange }: { uid: number; rate: number; onChange: (newValue: number) => void }) {
    const update = useMutation({
        mutationFn: (newRate: number) => updateRate(uid, newRate),
        onSuccess: (_, newRate) => onChange(newRate),
    });
    return (
        <Rating
            value={rate}
            disabled={update.isPending}
            onChange={(_, newValue) => {
                if (newValue === null || newValue === 0) return;
                update.mutate(newValue);
            }}
            onClick={(e) => e.stopPropagation()}
        />
    );
}
