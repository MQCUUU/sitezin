"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { createClient } from "@/lib/supabase/client";

export function FollowRequestNotifier() {
  const router = useRouter(); const toast = useToast();
  useEffect(() => {
    let cancelled=false; let profileUsername=""; const supabase=createClient();
    let channel:ReturnType<typeof supabase.channel>|null=null; let timer:ReturnType<typeof setInterval>|null=null;
    const incomingSeen=new Set<string>(); const acceptedSeen=new Set<string>();
    const refresh=async(notify:boolean)=>{const response=await fetch("/api/follows",{cache:"no-store"});if(cancelled||!response.ok)return;const connections=await response.json();const incoming=Array.isArray(connections.incoming)?connections.incoming:[];const accepted=Array.isArray(connections.following)?connections.following:[];const freshIncoming=incoming.filter((row:any)=>!incomingSeen.has(row.follower_id));const freshAccepted=accepted.filter((row:any)=>!acceptedSeen.has(row.following_id));incoming.forEach((row:any)=>incomingSeen.add(row.follower_id));accepted.forEach((row:any)=>acceptedSeen.add(row.following_id));window.dispatchEvent(new CustomEvent("mycatalog:follows-updated",{detail:connections}));if(notify&&freshIncoming.length&&profileUsername)toast.info("Nova solicitação para seguir você",{description:`@${freshIncoming[0]?.profile?.username||"alguém"} quer seguir seu perfil.`,duration:12000,actionLabel:"Ver solicitação",onAction:()=>router.push(`/u/${profileUsername}?tab=connections`)});if(notify&&freshAccepted.length)toast.success("Solicitação aceita",{description:`Agora você segue @${freshAccepted[0]?.profile?.username||"este perfil"}.`});};
    supabase.auth.getUser().then((result:any)=>{const user=result.data.user;if(cancelled||!user)return;fetch("/api/profile/username",{cache:"force-cache"}).then(async response=>{if(response.ok)profileUsername=(await response.json()).username||"";}).catch(()=>null);void refresh(false).then(()=>{channel=supabase.channel(`follows:${user.id}`).on("postgres_changes",{event:"*",schema:"public",table:"follows"},(payload:any)=>{const row=payload.new?.follower_id?payload.new:payload.old;if(row?.follower_id===user.id||row?.following_id===user.id)void refresh(true);}).subscribe();timer=setInterval(()=>{if(document.visibilityState==="visible"&&navigator.onLine)void refresh(true);},5*60*1000);});}).catch(()=>null);
    return()=>{cancelled=true;if(timer)clearInterval(timer);if(channel)void supabase.removeChannel(channel);};
  },[router,toast]);
  return null;
}
