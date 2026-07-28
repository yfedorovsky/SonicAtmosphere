DROP INDEX "draft_tracks_draft_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "draft_tracks_draft_id_idx" ON "draft_tracks" USING btree ("draft_id","position");