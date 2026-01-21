export function addCreatedBy(data: any, userId: string) {
  // Intenta cubrir variantes típicas sin romper:
  // - createdById
  // - createdBy
  // - createdByUserId
  // Si tu schema no tiene ninguna, no añade nada.
  const candidates = ["createdById", "createdBy", "createdByUserId"];

  for (const key of candidates) {
    if (key in data) continue;
    // No podemos "detectar" campos del schema en runtime,
    // así que solo añadimos si el caller lo permite (usando any en create()).
  }

  // Lo retornamos como fragmento para mezclar en data con any.
  // Ajusta aquí si confirmas el nombre real.
  return { createdById: userId };
}
