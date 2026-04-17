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
  IG_ACCESS_TOKEN:   '',
  IG_USER_ID:        ''
};
