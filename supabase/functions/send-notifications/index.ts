// ============================================================================
// send-notifications — notification fan-out (Deno Edge Function).
// ============================================================================
// Inserts in-app notification rows for a set of users and delivers Web Push to
// each of their registered devices. Runs with the service role.
//
// Required secrets (supabase secrets set …):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:owner@…)
// Deploy:  supabase functions deploy send-notifications
// Invoke:  supabase.functions.invoke('send-notifications', {
//            body: { user_ids, type, payload: { title, body, url } } })
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { user_ids, type, payload } = await req.json()
    if (!Array.isArray(user_ids) || !type) return json({ error: 'user_ids and type required' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // Only the owner may fan out notifications.
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: auth } = await asUser.auth.getUser()
    if (!auth?.user) return json({ error: 'unauthorized' }, 401)
    const { data: me } = await asUser.from('users').select('role').eq('auth_id', auth.user.id).maybeSingle()
    if (!me || me.role !== 'owner') return json({ error: 'forbidden' }, 403)

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:owner@example.com'
    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    }

    // 1) In-app notification rows.
    const rows = user_ids.map((user_id: string) => ({ user_id, type, payload: payload ?? {} }))
    const { error: insErr } = await db.from('notifications').insert(rows)
    if (insErr) return json({ error: insErr.message }, 500)

    // 2) Web push to each device.
    let sent = 0
    if (vapidPublic && vapidPrivate) {
      const { data: subs } = await db
        .from('push_subscriptions')
        .select('*')
        .in('user_id', user_ids)
      const body = JSON.stringify({
        title: payload?.title ?? 'Hussain Catering Ops',
        body: payload?.body ?? '',
        url: payload?.url ?? '/',
        tag: type,
      })
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys } as webpush.PushSubscription,
            body,
          )
          sent++
        } catch (e) {
          // Prune stale endpoints (410 Gone / 404 Not Found).
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          }
        }
      }
    }

    return json({ ok: true, notified: user_ids.length, pushed: sent })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
