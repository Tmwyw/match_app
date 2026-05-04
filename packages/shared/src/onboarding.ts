import { z } from "zod";
import { Role } from "./roles";

export const PickRoleRequest = z.object({ role: Role });
export type PickRoleRequest = z.infer<typeof PickRoleRequest>;
