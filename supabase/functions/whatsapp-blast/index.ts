import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeChileanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  let phone = digits;

  // Si empieza con 9 y tiene 9 digitos => celular chileno sin codigo pais
  if (phone.startsWith("9") && phone.length === 9) {
    phone = "56" + phone;
  }

  // Si empieza con 569 y tiene 11 digitos => ok
  if (phone.length !== 11 || !phone.startsWith("56")) {
    return null;
  }

  return phone;
}

function capitalizeName(name: string): string {
  if (!name) return "Cliente";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo no permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { text, target, client_ids } = await req.json();

    if (!text || !target) {
      return new Response(
        JSON.stringify({ error: "Faltan campos: text, target" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (target === "specific" && (!Array.isArray(client_ids) || client_ids.length === 0)) {
      return new Response(
        JSON.stringify({ error: "target=specific requiere client_ids: string[]" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!["vip", "all", "active", "specific"].includes(target)) {
      return new Response(
        JSON.stringify({
          error: "target invalido. Usar: vip | all | active | specific",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const waToken = Deno.env.get("WHATSAPP_TOKEN");
    if (!waToken) {
      return new Response(
        JSON.stringify({ error: "WHATSAPP_TOKEN no configurado" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Consultar clientes
    let query = supabase
      .from("clients")
      .select("id, first_name, phone, tier")
      .not("phone", "is", null)
      .eq("active", true);

    if (target === "vip") {
      query = query.eq("tier", "vip");
    } else if (target === "specific") {
      query = query.in("id", client_ids);
    }
    // "all" y "active" traen todos los activos con telefono

    const { data: clients, error: dbError } = await query;

    if (dbError) {
      return new Response(
        JSON.stringify({ error: "Error consultando clientes", detail: dbError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let enviados = 0;
    let errores = 0;
    let omitidos = 0;
    const errors: Array<{ phone: string; error: string }> = [];
    const sent_client_ids: string[] = [];

    for (const client of clients || []) {
      const phone = normalizeChileanPhone(client.phone || "");

      if (!phone) {
        omitidos++;
        continue;
      }

      const firstName = capitalizeName(client.first_name || "");

      try {
        const res = await fetch(
          "https://graph.facebook.com/v22.0/112291225051441/messages",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${waToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: phone,
              type: "template",
              template: {
                name: "promo_almibar",
                language: { code: "es_CL" },
                components: [
                  {
                    type: "body",
                    parameters: [
                      { type: "text", text: firstName },
                      { type: "text", text: text },
                    ],
                  },
                ],
              },
            }),
          }
        );

        if (res.ok) {
          enviados++;
          if (client.id) sent_client_ids.push(client.id);
        } else {
          errores++;
          const errBody = await res.text();
          errors.push({ phone, error: errBody });
        }
      } catch (e) {
        errores++;
        errors.push({ phone, error: (e as Error).message });
      }

      // 200ms de delay entre mensajes para no saturar la API
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({ enviados, errores, omitidos, errors, sent_client_ids }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Error interno", detail: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
