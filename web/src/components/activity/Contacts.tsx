import { useState } from "react";
import { useAddContact, useContacts } from "../../hooks/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  jobId: string;
}

interface ContactRecord {
  id?: string;
  name: string;
  contact_type?: string;
  email?: string;
}

export function ContactsPanel({ jobId }: Props) {
  const { data: contacts = [] } = useContacts(jobId);
  const addContact = useAddContact(jobId);
  const [name, setName] = useState("");
  const [contactType, setContactType] = useState("recruiter");
  const [email, setEmail] = useState("");

  if (!jobId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a job to see contacts.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmedName = name.trim();
          if (!trimmedName) return;
          await addContact.mutateAsync({
            name: trimmedName,
            contactType,
            email: email.trim(),
          });
          setName("");
          setContactType("recruiter");
          setEmail("");
        }}
      >
        <Input
          type="text"
          placeholder="Name"
          className="sm:flex-1"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="sm:w-44">
          <Select value={contactType} onValueChange={setContactType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recruiter">Recruiter</SelectItem>
              <SelectItem value="hiring_manager">Hiring manager</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          type="email"
          placeholder="Email"
          className="sm:flex-1"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || addContact.isPending}>
          Add contact
        </Button>
      </form>
      <div className="flex flex-col gap-2">
        {contacts.length ? (
          (contacts as ContactRecord[]).map((contact) => (
            <div
              key={contact.id || contact.email || contact.name}
              className="rounded-lg border border-border bg-card/50 px-3 py-2"
            >
              <p className="text-sm font-semibold text-foreground">
                {contact.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {contact.contact_type || "contact"}
                {contact.email ? ` · ${contact.email}` : ""}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        )}
      </div>
    </div>
  );
}
