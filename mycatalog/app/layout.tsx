import './globals.css'; import {Nav} from '@/components/Nav';
export const metadata={title:'MyCatalog',description:'Seu catálogo pessoal de filmes e séries'};
export default function RootLayout({children}:{children:React.ReactNode}){return <div className="app"><Nav/><main className="main">{children}</main></div>}
