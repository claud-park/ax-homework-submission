import { createServiceClient } from './supabase/server'
import { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

export async function verifyJWT(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}

export async function verifyAdmin(req: NextRequest): Promise<User | null> {
  const user = await verifyJWT(req)
  if (!user?.user_metadata?.is_admin) return null
  return user
}
