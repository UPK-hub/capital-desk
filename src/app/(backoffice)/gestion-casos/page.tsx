import { redirect } from "next/navigation";

// El módulo "Gestión de casos" se consolidó dentro de "Casos".
// Esta ruta queda solo como redirección para enlaces antiguos.
export default function GestionCasosRedirect() {
  redirect("/cases");
}
