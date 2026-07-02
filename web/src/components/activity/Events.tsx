import { useMemo, useState } from "react";
import { useAddEvent, useEvents } from "../../hooks/queries";

interface Props {
  jobId: string;
}

// Hide low-value, auto-emitted events by default. The Pipeline page already
// reflects status changes; the Events panel should lead with the milestones
// a human cares about.
const SYSTEM_EVENT_TYPES = new Set(["job_updated", "updated", "posting_verified"]);

const EVENT_LABELS: Record<string, string> = {
  job_added: "Job added",
  application_submitted: "Application submitted",
  outreach_sent: "Outreach sent",
  followup_sent: "Follow-up sent",
  recruiter_reply: "Recruiter replied",
  screen_scheduled: "Screen scheduled",
  screen_done: "Screen completed",
  interview_scheduled: "Interview scheduled",
  interview_done: "Interview completed",
  offer_received: "Offer received",
  application_rejected: "Application rejected",
  application_closed: "Application closed",
  posting_verified: "Posting verified",
  job_updated: "Job updated",
  updated: "Job updated",
};

function humanizeEventLabel(eventType: string): string {
  if (EVENT_LABELS[eventType]) return EVENT_LABELS[eventType];
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RawEvent {
  id?: string;
  event_type: string;
  event_date: string;
  details?: string;
  created_at?: string;
}

interface GroupedEvent extends RawEvent {
  duplicates: number;
}

// Collapses runs of same-day, same-type events into one row with a
// "+N more on this date" indicator. Keeps the most recent details string.
function groupSameDay(events: RawEvent[]): GroupedEvent[] {
  const groups: GroupedEvent[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.event_type === event.event_type &&
      last.event_date === event.event_date
    ) {
      last.duplicates += 1;
      if (!last.details && event.details) last.details = event.details;
      continue;
    }
    groups.push({ ...event, duplicates: 0 });
  }
  return groups;
}

export function EventsPanel({ jobId }: Props) {
  const { data: events = [] } = useEvents(jobId);
  const addEvent = useAddEvent(jobId);
  const [eventType, setEventType] = useState("application_submitted");
  const [eventDate, setEventDate] = useState("");
  const [details, setDetails] = useState("");
  const [showSystem, setShowSystem] = useState(false);

  const systemEventCount = useMemo(
    () => events.filter((e: RawEvent) => SYSTEM_EVENT_TYPES.has(e.event_type)).length,
    [events],
  );

  const visibleEvents = useMemo(() => {
    const filtered = showSystem
      ? (events as RawEvent[])
      : (events as RawEvent[]).filter(
          (event) => !SYSTEM_EVENT_TYPES.has(event.event_type),
        );
    return groupSameDay(filtered);
  }, [events, showSystem]);

  if (!jobId) {
    return <p className="muted">Select a job to see events.</p>;
  }

  return (
    <div>
      <form
        className="form-row"
        onSubmit={async (event) => {
          event.preventDefault();
          await addEvent.mutateAsync({
            eventType,
            eventDate: eventDate || new Date().toISOString().slice(0, 10),
            details: details.trim(),
          });
          setDetails("");
        }}
      >
        <select
          className="grow"
          value={eventType}
          onChange={(event) => setEventType(event.target.value)}
          aria-label="Event type"
        >
          <option value="application_submitted">Application submitted</option>
          <option value="outreach_sent">Outreach sent</option>
          <option value="followup_sent">Follow-up sent</option>
          <option value="screen_scheduled">Screen scheduled</option>
          <option value="screen_done">Screen completed</option>
          <option value="interview_scheduled">Interview scheduled</option>
          <option value="interview_done">Interview completed</option>
          <option value="offer_received">Offer received</option>
        </select>
        <input
          type="date"
          value={eventDate}
          onChange={(event) => setEventDate(event.target.value)}
          aria-label="Event date"
        />
        <input
          type="text"
          placeholder="Details"
          className="grow"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          aria-label="Event details"
        />
        <button type="submit">Log event</button>
      </form>

      {systemEventCount > 0 ? (
        <label className="checkbox-label" style={{ marginTop: "var(--space-inner)" }}>
          <input
            type="checkbox"
            checked={showSystem}
            onChange={(event) => setShowSystem(event.target.checked)}
          />
          <span>
            Show system events{" "}
            <span className="muted">({systemEventCount})</span>
          </span>
        </label>
      ) : null}

      <div className="stack" style={{ marginTop: "var(--space-inner)" }}>
        {visibleEvents.length ? (
          visibleEvents.map((event) => (
            <div
              className="job-card"
              key={event.id || `${event.event_date}-${event.event_type}`}
            >
              <div>
                <strong>{humanizeEventLabel(event.event_type)}</strong>
                {event.duplicates > 0 ? (
                  <span className="muted small">
                    {" "}
                    +{event.duplicates} more on this date
                  </span>
                ) : null}
                <div className="meta muted small">
                  {event.event_date}
                  {event.details ? ` - ${event.details}` : ""}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">
            {events.length > 0
              ? "No milestone events yet. Toggle Show system events to see automated entries."
              : "No events yet. Log application, outreach, interview here."}
          </p>
        )}
      </div>
    </div>
  );
}
