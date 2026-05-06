import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  AdminBanInput,
  type AdminChatTranscript,
  type AdminStats,
  type AdminUserDetail,
  AdminUserStatus,
  type AdminUsersResponse,
} from "@tg-app-meet/shared";
import { AdminGuard } from "../common/admin.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("stats")
  async stats(): Promise<AdminStats> {
    return this.admin.getStats();
  }

  @Get("users")
  async listUsers(
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("role") role?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ): Promise<AdminUsersResponse> {
    const parsedStatus = AdminUserStatus.safeParse(status);
    const parsedRole =
      role === "BUYER" || role === "OWNER" ? (role as "BUYER" | "OWNER") : undefined;
    return this.admin.listUsers({
      q,
      status: parsedStatus.success ? parsedStatus.data : undefined,
      role: parsedRole,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get("users/:id")
  async userDetail(@Param("id") id: string): Promise<AdminUserDetail> {
    return this.admin.getUserDetail(id);
  }

  @Post("users/:id/ban")
  async banUser(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdminBanInput)) body: AdminBanInput,
  ): Promise<AdminUserDetail> {
    return this.admin.ban(id, body);
  }

  @Post("users/:id/unban")
  async unbanUser(@Param("id") id: string): Promise<AdminUserDetail> {
    return this.admin.unban(id);
  }

  @Post("users/:id/reset-role")
  async resetRole(@Param("id") id: string): Promise<AdminUserDetail> {
    return this.admin.resetUserRole(id);
  }

  @Get("chats/:id/messages")
  async chatTranscript(@Param("id") id: string): Promise<AdminChatTranscript> {
    return this.admin.getChatTranscript(id);
  }
}
