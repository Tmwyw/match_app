import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { BlocksResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BlocksService } from "./blocks.service";

@Controller("blocks")
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  async list(@CurrentUser() current: { id: string }): Promise<BlocksResponse> {
    return this.blocks.list(current.id);
  }

  @Post(":userId")
  @HttpCode(204)
  async create(
    @CurrentUser() current: { id: string },
    @Param("userId") userId: string,
  ): Promise<void> {
    await this.blocks.block(current.id, userId);
  }

  @Delete(":userId")
  @HttpCode(204)
  async remove(
    @CurrentUser() current: { id: string },
    @Param("userId") userId: string,
  ): Promise<void> {
    await this.blocks.unblock(current.id, userId);
  }
}
