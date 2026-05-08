import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { DiscoverFilters, type DiscoverResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DiscoverService } from "./discover.service";

@Controller("discover")
@UseGuards(JwtAuthGuard)
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Get()
  async next(
    @CurrentUser() current: { id: string },
    @Query("verticals") verticalsCsv?: string,
    @Query("geos") geosCsv?: string,
    /**
     * Comma-separated user ids to skip when picking the next card. The FE
     * queues a small stack (Tinder-style) and uses this to ask for ids it
     * doesn't already have visible — without this, two consecutive calls
     * could return the same candidate.
     */
    @Query("exclude") excludeCsv?: string,
  ): Promise<DiscoverResponse> {
    // Parse CSV and run through the same Zod validator the frontend uses,
    // so a malformed query (too many tags, oversized tag) is rejected
    // before we touch the DB.
    const parsed = DiscoverFilters.safeParse({
      verticals: csv(verticalsCsv),
      geos: csv(geosCsv),
    });
    const exclude = csv(excludeCsv).slice(0, 20); // soft cap
    if (!parsed.success) {
      // Bad filters are not the user's fault if it's a stale localStorage
      // payload — silently fall back to no filters rather than 400'ing.
      return this.discover.next(
        current.id,
        { verticals: [], geos: [] },
        exclude,
      );
    }
    return this.discover.next(current.id, parsed.data, exclude);
  }
}

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
