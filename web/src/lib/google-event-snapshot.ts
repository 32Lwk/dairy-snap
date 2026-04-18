import type { calendar_v3 } from "googleapis";
import type { Prisma } from "@/generated/prisma/client";

type GEvent = calendar_v3.Schema$Event;

const MAX_DESCRIPTION_IN_COLUMNS = 500_000;
const MAX_PAYLOAD_JSON_CHARS = 450_000;
const MAX_SEARCH_BLOB_CHARS = 250_000;

function sliceStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[truncated ${s.length - max} chars]`;
}

function person(p: GEvent["creator"]) {
  if (!p) return undefined;
  const out: Record<string, unknown> = {};
  if (p.displayName != null) out.displayName = p.displayName;
  if (p.email != null) out.email = p.email;
  if (p.id != null) out.id = p.id;
  if (p.self != null) out.self = p.self;
  return Object.keys(out).length ? out : undefined;
}

function attendees(list: calendar_v3.Schema$EventAttendee[] | null | undefined) {
  if (!list?.length) return undefined;
  return list.slice(0, 300).map((a) => {
    const o: Record<string, unknown> = {};
    if (a.displayName != null) o.displayName = a.displayName;
    if (a.email != null) o.email = a.email;
    if (a.responseStatus != null) o.responseStatus = a.responseStatus;
    if (a.optional != null) o.optional = a.optional;
    if (a.organizer != null) o.organizer = a.organizer;
    if (a.resource != null) o.resource = a.resource;
    return o;
  });
}

function reminders(r: GEvent["reminders"]) {
  if (!r) return undefined;
  return {
    useDefault: r.useDefault,
    overrides: r.overrides?.slice(0, 50).map((o) => ({ method: o.method, minutes: o.minutes })),
  };
}

function conferenceData(c: calendar_v3.Schema$ConferenceData | null | undefined) {
  if (!c) return undefined;
  return {
    conferenceId: c.conferenceId,
    conferenceSolution: c.conferenceSolution
      ? {
          key: c.conferenceSolution.key,
          name: c.conferenceSolution.name,
          iconUri: c.conferenceSolution.iconUri,
        }
      : undefined,
    entryPoints: c.entryPoints?.slice(0, 20).map((e) => ({
      entryPointType: e.entryPointType,
      uri: e.uri,
      label: e.label,
      pin: e.pin,
    })),
    notes: c.notes,
    signature: c.signature,
  };
}

function attachments(list: calendar_v3.Schema$EventAttachment[] | null | undefined) {
  if (!list?.length) return undefined;
  return list.slice(0, 50).map((a) => ({
    fileUrl: a.fileUrl,
    title: a.title,
    mimeType: a.mimeType,
    iconLink: a.iconLink,
    fileId: a.fileId,
  }));
}

function extendedProps(e: GEvent["extendedProperties"]) {
  if (!e) return undefined;
  const priv = e.private && typeof e.private === "object" ? { ...e.private } : undefined;
  const shared = e.shared && typeof e.shared === "object" ? { ...e.shared } : undefined;
  if (!priv && !shared) return undefined;
  return { private: priv, shared: shared };
}

/** Google Calendar event: JSON snapshot (description, extendedProperties, attendees, conference, etc.) */
export function buildGoogleEventSnapshot(ev: GEvent): Prisma.InputJsonValue {
  const description = sliceStr(ev.description ?? "", MAX_DESCRIPTION_IN_COLUMNS);

  const snapshot: Record<string, unknown> = {
    kind: ev.kind,
    etag: ev.etag,
    id: ev.id,
    status: ev.status,
    htmlLink: ev.htmlLink,
    created: ev.created,
    updated: ev.updated,
    summary: ev.summary,
    description,
    location: ev.location,
    colorId: ev.colorId,
    creator: person(ev.creator ?? undefined),
    organizer: person(ev.organizer ?? undefined),
    start: ev.start,
    end: ev.end,
    endTimeUnspecified: ev.endTimeUnspecified,
    recurrence: ev.recurrence?.slice(0, 100),
    recurringEventId: ev.recurringEventId,
    originalStartTime: ev.originalStartTime,
    transparency: ev.transparency,
    visibility: ev.visibility,
    iCalUID: ev.iCalUID,
    sequence: ev.sequence,
    attendees: attendees(ev.attendees ?? undefined),
    attendeesOmitted: ev.attendeesOmitted,
    reminders: reminders(ev.reminders ?? undefined),
    hangoutLink: ev.hangoutLink,
    conferenceData: conferenceData(ev.conferenceData ?? undefined),
    attachments: attachments(ev.attachments ?? undefined),
    extendedProperties: extendedProps(ev.extendedProperties ?? undefined),
    eventType: ev.eventType,
    source:
      ev.source && (ev.source.title != null || ev.source.url != null)
        ? { title: ev.source.title, url: ev.source.url }
        : undefined,
    locked: ev.locked,
    privateCopy: ev.privateCopy,
    guestsCanInviteOthers: ev.guestsCanInviteOthers,
    guestsCanModify: ev.guestsCanModify,
    guestsCanSeeOtherGuests: ev.guestsCanSeeOtherGuests,
    anyoneCanAddSelf: ev.anyoneCanAddSelf,
    workingLocationProperties: ev.workingLocationProperties ?? undefined,
    outOfOfficeProperties: ev.outOfOfficeProperties ?? undefined,
    focusTimeProperties: ev.focusTimeProperties ?? undefined,
    birthdayProperties: ev.birthdayProperties ?? undefined,
    gadget: ev.gadget ?? undefined,
  };

  let json = JSON.stringify(snapshot);
  if (json.length > MAX_PAYLOAD_JSON_CHARS) {
    snapshot.description = sliceStr(String(snapshot.description ?? ""), 50_000);
    json = JSON.stringify(snapshot);
    if (json.length > MAX_PAYLOAD_JSON_CHARS) {
      snapshot.description = "[omitted: payload too large]";
      snapshot._truncated = true;
      json = JSON.stringify(snapshot);
    }
  }

  return JSON.parse(json) as Prisma.InputJsonValue;
}

/** Flattened text for keyword search / embeddings (extended props, attendees, conference notes, …) */
export function buildGoogleEventSearchBlob(ev: GEvent, snapshotDescription: string): string {
  const parts: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (t) parts.push(t);
  };

  push(ev.summary);
  push(ev.location);
  push(snapshotDescription);
  push(ev.hangoutLink);
  push(ev.conferenceData?.notes);

  const ep = ev.extendedProperties;
  if (ep?.private && typeof ep.private === "object") {
    for (const [k, v] of Object.entries(ep.private)) {
      push(`${k}: ${v}`);
    }
  }
  if (ep?.shared && typeof ep.shared === "object") {
    for (const [k, v] of Object.entries(ep.shared)) {
      push(`${k}: ${v}`);
    }
  }

  for (const a of ev.attendees ?? []) {
    push([a.displayName, a.email].filter(Boolean).join(" "));
  }

  for (const line of ev.recurrence ?? []) {
    push(line);
  }

  const cd = ev.conferenceData;
  for (const e of cd?.entryPoints ?? []) {
    push([e.label, e.uri, e.pin].filter(Boolean).join(" "));
  }

  for (const at of ev.attachments ?? []) {
    push([at.title, at.fileUrl].filter(Boolean).join(" "));
  }

  const blob = parts.join("\n");
  return sliceStr(blob, MAX_SEARCH_BLOB_CHARS);
}

export function descriptionForGcalColumn(ev: GEvent): string {
  return sliceStr(ev.description ?? "", MAX_DESCRIPTION_IN_COLUMNS);
}
