// src/lib/validators/video.ts
import { z } from "zod";
import { VideoReqOrigin, VideoDeliveryMethod } from "@prisma/client";
import { parseCoDateTime } from "@/lib/datetime";

const dateLike = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const d = parseCoDateTime(v);
    return d; // Date | null
  });

export const VideoDownloadRequestSchema = z.object({
  origin: z.nativeEnum(VideoReqOrigin),

  requestType: z.string().trim().optional().nullable(),

  radicadoTMSA: z.string().trim().optional().nullable(),
  radicadoTMSADate: dateLike.optional(), // -> Date|null
  radicadoConcesionarioDate: dateLike.optional(), // -> Date|null

  requesterName: z.string().trim().optional().nullable(),
  requesterDocument: z.string().trim().optional().nullable(),
  requesterRole: z.string().trim().optional().nullable(),
  requesterPhone: z.string().trim().optional().nullable(),
  requesterEmail: z.string().trim().optional().nullable(),
  requesterEmails: z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => {
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
      if (!v) return [];
      return String(v)
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean);
    })
    .refine((list) => list.length <= 3, "Maximo 3 correos")
    .optional(),

  vehicleId: z.string().trim().optional().nullable(),

  eventStartAt: dateLike.optional(), // -> Date|null
  eventEndAt: dateLike.optional(),   // -> Date|null

  cameras: z.string().trim().optional().nullable(),
  deliveryMethod: z.nativeEnum(VideoDeliveryMethod).optional().nullable(),

  descriptionNovedad: z.string().trim().optional().nullable(),
  finSolicitud: z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => {
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
      if (!v) return [];
      return String(v)
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean);
    })
    .optional(),
});
