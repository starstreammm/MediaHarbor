import { Rating } from "@mui/material";
import { updateRate } from "~/function/post";


export default function PostRating({ uid, rate, onChange }: { uid: number; rate: number; onChange: (newValue: number) => void }) {
    return (
        <Rating
            value={rate}
            onChange={(_, newValue) => {
                if (newValue === null || newValue === 0) return;
                onChange(newValue);
                updateRate(uid, newValue);
            }}
            onClick={(e) => e.stopPropagation()}
        />
    );
}