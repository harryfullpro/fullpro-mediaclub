/* =========================================================
 * FullPro Media Club · Supabase config
 * Valores do Project Settings → API Keys (publishable key).
 *
 * A publishable key é PÚBLICA por design (protegida por RLS
 * no schema.sql). Pode commitar esse arquivo sem medo.
 * ========================================================= */
window.FULLPRO_CONFIG = {
  SUPABASE_URL:      'https://xgaaocnuqgcwttrljqep.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_CvGDWe2yLTBDTBxdoGV7IQ_WUGCGa2o',
  /* YouTube Data API v3 key (free, até 10k req/dia)
   * Crie em: https://console.cloud.google.com → APIs → YouTube Data API v3
   * Deixe vazio para preencher engajamento manualmente. */
  YOUTUBE_API_KEY:   'AIzaSyD_s4_RmQU1wYxAW28JEom3xkyzkQB3LuA',
  /* Instagram Graph API (requer conta Business/Creator)
   * 1. Crie um App em: https://developers.facebook.com
   * 2. Adicione o produto "Instagram Graph API"
   * 3. Gere um Long-Lived User Access Token (validade ~60 dias)
   * 4. Cole o token abaixo. Renove antes de expirar.
   * 5. IG_USER_ID: ID numérico da conta IG Business (visível em /me?fields=id)
   * Deixe vazio para preencher engajamento do Instagram manualmente. */
  IG_ACCESS_TOKEN:   'EAAMfQnMLWAMBRDPJob9KeKsCG2woBa1VPCFoIL64OdeJ6xfLSd7PfZACFZACGC5lVXMYP42eSRhex079K9lJIf4IS0EGvD8NE9SZBMHyhSPEFMNdpeJBBVoWuAEpXmpnHX61bzvzP0rwKaBYAP4tV1IJRe6pR4pOZCXj2ZAsC8JhwuqrZA52bGxNyNeTg1ogsI',
  IG_USER_ID:        '17841408535149834',
  /* TikTok API v2 (requer app no TikTok for Developers)
   * 1. Crie um App em: https://developers.tiktok.com
   * 2. Adicione Login Kit + scopes: user.info.basic, user.info.stats, video.list
   * 3. Configure redirect URI: https://fullpro-mediaclub.vercel.app/admin
   * 4. Use Sandbox mode para desenvolvimento (até 20 test users)
   * 5. Clique "Conectar TikTok" no admin para autenticar via OAuth */
  TK_CLIENT_KEY:     'awt9x0v2h89awe3s',
  TK_CLIENT_SECRET:  'DHpC8YbY8q4newYRJZtM4jNfORKKWO7z'
};
