const BASE='https://api.themoviedb.org/3';
export const img=(path?:string,size='w500')=>path?`https://image.tmdb.org/t/p/${size}${path}`:'/placeholder.svg';
async function tmdb(path:string){const token=process.env.TMDB_API_KEY;if(!token) throw new Error('TMDB_API_KEY não configurada'); const r=await fetch(`${BASE}${path}`,{headers:{Authorization:`Bearer ${token}`,accept:'application/json'},next:{revalidate:86400}}); if(!r.ok) throw new Error(`TMDB ${r.status}`); return r.json();}
export async function searchTMDB(q:string){return tmdb(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false&language=${process.env.TMDB_LANGUAGE||'pt-BR'}`)}
export async function detailsTMDB(type:'movie'|'tv',id:number){return tmdb(`/${type}/${id}?language=${process.env.TMDB_LANGUAGE||'pt-BR'}&append_to_response=credits,videos,images`)}
