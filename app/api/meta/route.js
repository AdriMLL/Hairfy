import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { BUSINESS } from "@/lib/config";

export const dynamic = "force-dynamic";

// Datos públicos que necesita la página de reservas:
// servicios, empleados y productos activos (sin datos sensibles).
export async function GET() {
  const db = supabaseAdmin();
  const [services, employees, products] = await Promise.all([
    db.from("services").select("id,name,duration_min,price_eur").eq("active", true).order("name"),
    db.from("employees").select("id,name").eq("active", true).order("name"),
    db
      .from("products")
      .select("id,name,description,price_eur,stock")
      .eq("active", true)
      .gt("stock", 0)
      .order("name"),
  ]);
  if (services.error || employees.error) {
    return Response.json({ error: "Error al cargar los datos" }, { status: 500 });
  }
  return Response.json({
    services: services.data,
    employees: employees.data,
    products: products.error ? [] : products.data,
    maxDaysAhead: BUSINESS.maxDaysAhead,
    businessName: BUSINESS.name,
  });
}
