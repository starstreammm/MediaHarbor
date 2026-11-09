import { useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, List, ListItem, ListItemText, Switch, Tooltip, Typography,
} from "@mui/material";
import FormatLineSpacingRoundedIcon from "@mui/icons-material/FormatLineSpacingRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { arrayMove, move } from "@dnd-kit/helpers";
import { useLocalStorage } from "~/hooks/storage";


interface CardDefinition {
    id: string;
    label: string;
}

interface LayoutCard extends CardDefinition {
    visible: boolean;
}

export function useCardLayout(key: string, definitions: readonly CardDefinition[]) {
    const [stored, setStored] = useLocalStorage<unknown>(key, [], "local");
    const cards: LayoutCard[] = [];
    const seen = new Set<string>();

    // Browser storage may contain outdated IDs, duplicates, or invalid values.
    for (const entry of Array.isArray(stored) ? stored : []) {
        if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || typeof entry.visible !== "boolean") continue;
        const definition = definitions.find(card => card.id === entry.id);
        if (!definition || seen.has(definition.id)) continue;
        cards.push({ ...definition, visible: entry.visible });
        seen.add(definition.id);
    }
    for (const definition of definitions) {
        if (!seen.has(definition.id)) cards.push({ ...definition, visible: true });
    }

    return {
        cards,
        visibleIds: cards.filter(card => card.visible).map(card => card.id),
        setCards: (next: LayoutCard[]) => setStored(next.map(({ id, visible }) => ({ id, visible }))),
        reset: () => setStored([]),
    };
}

function SortableCard({ card, index, count, onToggle, onMove }: {
    card: LayoutCard;
    index: number;
    count: number;
    onToggle: (visible: boolean) => void;
    onMove: (direction: number) => void;
}) {
    const { ref, handleRef } = useSortable({ id: card.id, index, transition: null });

    return (
        <ListItem ref={ref} disableGutters sx={{ gap: 0.5, bgcolor: "background.paper" }}>
            <IconButton ref={handleRef} size="small" aria-label={`Drag to reorder ${card.label}`} sx={{ touchAction: "none", cursor: "grab" }}>
                <DragIndicatorRoundedIcon fontSize="small" />
            </IconButton>
            <ListItemText primary={card.label} sx={{ minWidth: 0, overflowWrap: "anywhere" }} />
            <IconButton size="small" disabled={index === 0} aria-label={`Move ${card.label} up`} onClick={() => onMove(-1)}>
                <ArrowUpwardRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={index === count - 1} aria-label={`Move ${card.label} down`} onClick={() => onMove(1)}>
                <ArrowDownwardRoundedIcon fontSize="small" />
            </IconButton>
            <Switch checked={card.visible} onChange={(_, visible) => onToggle(visible)}
                slotProps={{ input: { "aria-label": `Show ${card.label}` } }} />
        </ListItem>
    );
}

export function CardLayoutControl({ layout, label, disabled = false }: {
    layout: ReturnType<typeof useCardLayout>;
    label: string;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Tooltip title={label}>
                <Box component="span" sx={{ display: "inline-flex" }}>
                    <IconButton aria-label={label} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>
                        <FormatLineSpacingRoundedIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Tooltip>
            <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" aria-label={label}>
                <DialogTitle>{label}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary">
                        Drag or use the arrows to reorder cards. Switch cards off to hide them. Changes are saved in this browser.
                    </Typography>
                    <DragDropProvider onDragEnd={event => layout.setCards(move(layout.cards, event))}>
                        <List>
                            {layout.cards.map((card, index) => (
                                <SortableCard key={card.id} card={card} index={index} count={layout.cards.length}
                                    onToggle={visible => layout.setCards(layout.cards.map(item => item.id === card.id ? { ...item, visible } : item))}
                                    onMove={direction => layout.setCards(arrayMove(layout.cards, index, index + direction))} />
                            ))}
                        </List>
                    </DragDropProvider>
                </DialogContent>
                <DialogActions>
                    <Button onClick={layout.reset}>Reset layout</Button>
                    <Button onClick={() => setOpen(false)}>Done</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
