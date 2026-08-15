import {NextResponse} from 'next/server'; import {searchTMDB} from '@/lib/tmdb';
export async function GET(req:Request){const q=new URL(req.url).searchParams.get('q')?.trim(); if(!q||q.length<2)return NextResponse.json({results:[]}); try{return NextResponse.json(await searchTMDB(q))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:500})}}
