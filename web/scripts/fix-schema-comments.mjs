import fs from "node:fs";
const p = new URL("../prisma/schema.prisma", import.meta.url);
let s = fs.readFileSync(p, "utf8");
const re =
  /\n  \/\*\*[\s\S]*?\n  eventPayload Json\?\n  \/\*\*[\s\S]*?\n  eventSearchBlob String @default\(""\)\n/;
if (!re.test(s)) {
  console.error("no match");
  process.exit(1);
}
s = s.replace(
  re,
  `\n  /// Google Calendar API event snapshot (extendedProperties, attendees, conference, attachments)\n  eventPayload Json?\n  /// Denormalized text for search/embeddings\n  eventSearchBlob String @default("")\n`,
);
fs.writeFileSync(p, s);
console.log("ok");
