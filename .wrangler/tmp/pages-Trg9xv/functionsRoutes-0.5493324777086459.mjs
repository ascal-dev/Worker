import { onRequestPost as __api_update_xnxx_js_onRequestPost } from "D:\\Worker\\functions\\api\\update_xnxx.js"
import { onRequest as __api_auth_js_onRequest } from "D:\\Worker\\functions\\api\\auth.js"
import { onRequest as __api_proxy_js_onRequest } from "D:\\Worker\\functions\\api\\proxy.js"

export const routes = [
    {
      routePath: "/api/update_xnxx",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_update_xnxx_js_onRequestPost],
    },
  {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_auth_js_onRequest],
    },
  {
      routePath: "/api/proxy",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_proxy_js_onRequest],
    },
  ]