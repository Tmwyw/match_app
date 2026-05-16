-- Cooldown timestamps for the scheduled-nudge cron jobs in
-- NotificationsService. Both columns are NULL on existing rows so the
-- first nudge cycle treats every eligible user as "never nudged" and
-- can DM them. Subsequent cycles use these timestamps for per-user
-- throttling (24h for profile-completion DMs, 1h for unread-message DMs).

ALTER TABLE "User" ADD COLUMN "lastProfileNudgeAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastUnreadNudgeAt" TIMESTAMP(3);
