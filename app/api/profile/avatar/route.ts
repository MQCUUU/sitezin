import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function PUT(request: Request) {
  const s=await createClient(); const {data:{user}}=await s.auth.getUser(); if(!user)return NextResponse.json({error:"Não autenticado."},{status:401});
  const {avatar_url}=await request.json(); const url=String(avatar_url||"").trim(); if(url && !/^https?:\/\//i.test(url))return NextResponse.json({error:"Informe uma URL válida."},{status:400});
  const {error}=await s.from("profiles").update({avatar_url:url.slice(0,1000)||null}).eq("id",user.id); if(error)return NextResponse.json({error:error.message},{status:400});
  await s.auth.updateUser({data:{...user.user_metadata,avatar_url:url||null}}); return NextResponse.json({success:true});
}
