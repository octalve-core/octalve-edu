"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

/// A short list of labels typed one at a time (Enter or a comma adds one; each can be removed). Used for the classes of a question.
export function TagInput({ label, tags, onChange, hint, max = 10 }: { label: string; tags: string[]; onChange: (tags: string[]) => void; hint?: string; max?: number }) {
  const [text, setText] = useState("");
  const listId = useId();

  function add() {
    const next = text.trim();
    if (next === "") return;
    if (tags.length < max && !tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) onChange([...tags, next]);
    setText("");
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
  }

  return (
    <div className="space-y-2">
      <TextField
        label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        maxLength={40}
        hint={tags.length >= max ? `At most ${max}.` : hint}
        aria-describedby={tags.length > 0 ? listId : undefined}
      />
      {tags.length > 0 && (
        <ul id={listId} className="flex flex-wrap gap-2" aria-label={`${label} chosen`}>
          {tags.map((tag) => (
            <li key={tag}>
              <Button variant="secondary" onClick={() => onChange(tags.filter((t) => t !== tag))} className="min-h-11 text-sm">
                {tag}
                <span aria-hidden="true"> ×</span>
                <span className="sr-only">, remove</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
