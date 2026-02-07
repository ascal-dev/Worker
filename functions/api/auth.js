export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pw = request.headers.get("X-App-Password") || url.searchParams.get("pw");
  
  return Response.json({ ok: pw === env.APP_PASSWORD }, {
    headers: { "Access-Control-Allow-Origin": "*" }
  });
}
