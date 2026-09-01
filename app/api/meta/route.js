import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { BUSINESS } from "@/lib/config";

export const dynamic = "force-dynamic";

// Datos públicos que necesita la web: servicios, empleados, productos,
// galería, reseñas aprobadas y datos del negocio (sin nada sensible).
export async function GET() {
  const db = supabaseAdmin();
  const [services, employees, products, gallery, reviews] = await Promise.all([
    db.from("services").select("id,name,duration_min,price_eur").eq("active", true).order("name"),
    db.from("employees").select("id,name").eq("active", true).order("name"),
    db
      .from("products")
      .select("id,name,description,price_eur,stock")
      .eq("active", true)
      .gt("stock", 0)
      .order("name"),
    db.from("gallery").select("id,url,caption").order("created_at", { ascending: false }).limit(24),
    db
      .from("reviews")
      .select("id,rating,comment,created_at,clients(name)")
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  if (services.error || employees.error) {
    return Response.json({ error: "Error al cargar los datos" }, { status: 500 });
  }

  const appReviews = (reviews.data || []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    author: (r.clients?.name || "Cliente").split(" ")[0],
    date: r.created_at,
  }));

  return Response.json({
    services: services.data,
    employees: employees.data,
    products: products.error ? [] : products.data,
    gallery: gallery.error ? [] : gallery.data,
    appReviews,
    maxDaysAhead: BUSINESS.maxDaysAhead,
    business: {
      name: BUSINESS.name,
      fullName: BUSINESS.fullName,
      phone: BUSINESS.phone,
      phoneLink: BUSINESS.phoneLink,
      address: BUSINESS.address,
      mapsUrl: BUSINESS.mapsUrl,
      mapsEmbedUrl: BUSINESS.mapsEmbedUrl,
      googleRating: BUSINESS.googleRating,
      googleReviewCount: BUSINESS.googleReviewCount,
      googleReviews: BUSINESS.googleReviews,
      photos: BUSINESS.photos,
    },
  });
}
