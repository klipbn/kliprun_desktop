import { useState } from "react";
import { CircleAlert, Inbox, Mail, SquareTerminal } from "lucide-react";
import { COLUMN_TITLES, type BoardColumn as BoardColumnData, type ColumnKey } from "@shared/types";
import type { CardPriorities, CardPriority } from "../cardPriorities";
import { moveCard, orderedCards } from "../cardOrder";
import { SessionCard } from "./SessionCard";

const COLUMN_ACCENT: Record<ColumnKey, string> = {
  attention: "text-warning",
  running: "text-accent",
  idle: "text-success",
};

const COLUMN_BADGE: Record<ColumnKey, string> = {
  attention: "bg-warning/15 text-warning border-warning/40",
  running: "bg-accent/10 text-accent border-accent/40",
  idle: "bg-success/15 text-success border-success/40",
};

/** Column header icons. */
function ColumnIcon({ columnKey }: { columnKey: ColumnKey }) {
  const cls = "w-4 h-4 shrink-0";
  if (columnKey === "attention") return <CircleAlert className={`${cls} text-warning`} aria-label="Needs attention" />;
  if (columnKey === "running") return <SquareTerminal className={`${cls} text-accent`} aria-label="Running" />;
  return <Mail className={`${cls} text-success`} aria-label="IDLE" />;
}

interface Props {
  columnKey: ColumnKey;
  order: string[];
  onOrderChange: (column: ColumnKey, ids: string[]) => void;
  column: BoardColumnData;
  selectedId: string | null;
  activeTerminalId: string | null;
  now: number;
  isRead: (card: import("@shared/readTracker").TrackedCard) => boolean;
  priorities: CardPriorities;
  onPriorityChange: (id: string, priority: CardPriority | null) => void;
  onSelect: (id: string) => void;
}

export function BoardColumn({ columnKey, column, selectedId, activeTerminalId, now, isRead, priorities, onPriorityChange, onSelect, order, onOrderChange }: Props) {
  const title = COLUMN_TITLES[columnKey];
  const highlight = columnKey === "attention" && column.count > 0;

  const cards = orderedCards(column.cards, order);
  const [dropID, setDropID] = useState<string | null>(null);
  const dragType = `application/x-kliprun-card-${columnKey}`;
  const move = (from: string, to: string) => onOrderChange(columnKey, moveCard(cards.map(card => card.session_id), from, to));

  return (
    <section
      className={`min-h-0 flex flex-col rounded-lg border ${
        highlight ? "border-warning/40" : "border-border"
      } bg-surface/50`}
      data-testid={`column-${columnKey}`}
    >
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className={`font-medium text-sm flex items-center gap-1.5 ${COLUMN_ACCENT[columnKey]}`}>
          <ColumnIcon columnKey={columnKey} />
          {title}
        </h2>
        <span
          className={`px-2 py-0.5 rounded-full text-xs border ${COLUMN_BADGE[columnKey]}`}
          data-testid={`column-count-${columnKey}`}
        >
          {column.count}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-text-secondary">
            <Inbox className="w-5 h-5" />
            <span className="text-xs">No sessions</span>
          </div>
        ) : (
          cards.map((card) => (
            <div key={card.session_id} draggable tabIndex={0} aria-label={`Reorder ${card.title || "Untitled Session"}`}
              className={`rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent ${dropID === card.session_id ? "ring-2 ring-accent" : ""}`}
              onDragStart={event => {
                event.dataTransfer.setData(dragType, card.session_id);
                event.dataTransfer.effectAllowed = "move";
                const cardElement = event.currentTarget.firstElementChild as HTMLElement;
                const bounds = cardElement.getBoundingClientRect();
                event.dataTransfer.setDragImage(cardElement, event.clientX - bounds.left, event.clientY - bounds.top);
              }}
              onDragEnd={() => setDropID(null)}
              onKeyDown={event => {
                if (event.target !== event.currentTarget || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                event.preventDefault();
                const target = cards[cards.indexOf(card) + (event.key === "ArrowUp" ? -1 : 1)];
                if (target) move(card.session_id, target.session_id);
              }}
              onDragOver={event => {
                if (!event.dataTransfer.types.includes(dragType)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropID(card.session_id);
              }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropID(null); }}
              onDrop={event => {
                if (!event.dataTransfer.types.includes(dragType)) return;
                event.preventDefault();
                move(event.dataTransfer.getData(dragType), card.session_id);
                setDropID(null);
              }}>
                <SessionCard
                  card={card}
                  depth={0}
                  selectedId={selectedId}
                  activeTerminalId={activeTerminalId}
                  now={now}
                  isRead={isRead}
                  priorities={priorities}
                  onPriorityChange={onPriorityChange}
                  onSelect={onSelect}
                />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
