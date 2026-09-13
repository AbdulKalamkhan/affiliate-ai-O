// Content channel values = CONFIG, not business logic (channel/provider-neutral
// rule). Core code never branches on these names. Adding a channel = add the
// Prisma enum value + extend this list; no wiring changes needed downstream.
export const CONTENT_CHANNELS = ["PINTEREST"] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];
export const DEFAULT_CONTENT_CHANNEL: ContentChannel = "PINTEREST";