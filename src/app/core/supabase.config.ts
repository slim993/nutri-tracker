/**
 * Supabase project the app syncs with. Both values are public by design: the
 * anon key only grants what the row-level-security policies in
 * `supabase/schema.sql` allow. Leave them empty to run the app local-only.
 */
export const SUPABASE_URL: string = 'https://ibssnxendwgvdpgkslfy.supabase.co';
export const SUPABASE_ANON_KEY: string = 'sb_publishable_Thrg2vNc-kG1TytQwwyxZw_FH-Hbf-S';

export const SUPABASE_CONFIGURED = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
