import { useState } from "react";
import { useAddNote, useNotes } from "../../hooks/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  jobId: string;
}

interface NoteRecord {
  id?: string;
  note: string;
  note_type?: string;
  created_at?: string;
}

export function NotesPanel({ jobId }: Props) {
  const { data: notes = [] } = useNotes(jobId);
  const addNote = useAddNote(jobId);
  const [text, setText] = useState("");

  if (!jobId) {
    return <p className="text-sm text-muted-foreground">Select a job to see notes.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmed = text.trim();
          if (!trimmed) return;
          await addNote.mutateAsync({ note: trimmed, noteType: "general" });
          setText("");
        }}
      >
        <Input
          type="text"
          placeholder="Add a note"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" disabled={!text.trim() || addNote.isPending}>
          Add
        </Button>
      </form>
      <div className="flex flex-col gap-2">
        {notes.length ? (
          (notes as NoteRecord[]).map((note) => (
            <div
              key={note.id || note.created_at}
              className="rounded-lg border border-border bg-card/50 px-3 py-2"
            >
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {note.note}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.note_type || "general"}
                {note.created_at
                  ? ` · ${new Date(note.created_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No notes yet. Add one above.
          </p>
        )}
      </div>
    </div>
  );
}
