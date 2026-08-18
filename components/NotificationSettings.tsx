"use client";
import { useEffect, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const rows = [["new_follower","Novo seguidor","Quando alguém começar a seguir você"],["follow_request","Solicitações para seguir","Quando um perfil pedir acesso ao seu perfil privado"],["review_like","Curtidas em resenhas","Quando alguém curtir uma avaliação sua"]] as const;
export function NotificationSettings() {
  const toast = useToast(); const [prefs,setPrefs]=useState<any>({}); const [saving,setSaving]=useState(false);
  useEffect(()=>{fetch("/api/profile/notifications",{cache:"no-store"}).then(r=>r.ok?r.json():{}).then(setPrefs)},[]);
  const toggle=(key:string)=>setPrefs((p:any)=>({...p,[key]:!p[key]}));
  async function save(){setSaving(true);const r=await fetch("/api/profile/notifications",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(prefs)});setSaving(false);r.ok?toast.success("Preferências salvas"):toast.error("Não foi possível salvar");}
  return <section className="panel notification-settings"><div className="settings-panel-head"><div className="settings-icon"><Bell size={19}/></div><div><h2>Notificações</h2><p className="muted">Escolha apenas os avisos que realmente importam.</p></div></div><div className="notification-table"><div className="notification-head"><span>Evento</span><b>No site</b><b>E-mail</b></div>{rows.map(([key,title,description])=><div key={key}><span><strong>{title}</strong><small>{description}</small></span><input aria-label={`${title} no site`} type="checkbox" checked={Boolean(prefs[`${key}_site`])} onChange={()=>toggle(`${key}_site`)}/><input aria-label={`${title} por email`} type="checkbox" checked={Boolean(prefs[`${key}_email`])} onChange={()=>toggle(`${key}_email`)}/></div>)}</div><label className="notification-product"><input type="checkbox" checked={Boolean(prefs.product_updates_email)} onChange={()=>toggle("product_updates_email")}/><span><strong>Novidades do MyCatalog por e-mail</strong><small>Atualizações importantes do produto, sem publicidade excessiva.</small></span></label><button className="btn primary" disabled={saving} onClick={save}>{saving?<Loader2 className="spin" size={15}/>:<Save size={15}/>} Salvar notificações</button></section>;
}
