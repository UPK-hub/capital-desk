import { z } from "zod";
import { CaseType } from "@prisma/client";

export const CreateCaseSchema = z.object({
  type: z.nativeEnum(CaseType),
  busId: z.string().min(1, "Selecciona un bus"),
  busEquipmentId: z.string().optional().nullable(),
  title: z.string().min(3, "Título muy corto").max(120),
  description: z.string().min(5, "Descripción muy corta").max(4000),
  priority: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),

});

export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
