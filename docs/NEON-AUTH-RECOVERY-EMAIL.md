# E-mails de autenticação do MyCatalog via Neon e Resend

## O que foi implementado

O fluxo de recuperação existente continua usando `authClient.requestPasswordReset()` e a página `/reset-password`. O Neon cria o link seguro e chama `POST /api/webhooks/neon-auth`; o servidor verifica a assinatura Ed25519 e a validade do evento, então envia o conteúdo pelo Resend. O link recebido de `event_data.link_url` é usado sem criar nem alterar tokens.

O evento `send.magic_link` abrange `forget-password`, `sign-in` e `email-verification`. O endpoint envia um modelo MyCatalog correspondente para cada tipo. O evento `send.otp` não deve ser habilitado na configuração recomendada; o fluxo OTP não foi alterado.

## Auditoria: alteração do endereço de e-mail

O fluxo de alteração de e-mail **não está implementado**. A seção de e-mail da conta permanece somente leitura em `components/AccountPrivacy.tsx`. Isso também está de acordo com o guia oficial atual do Neon Managed Better Auth: a documentação de gerenciamento de usuários informa que alterações de endereço ainda não são suportadas.

A personalização existente para `link_type: "email-verification"` é o modelo genérico de verificação de e-mail (por exemplo, confirmação do cadastro). Ela não inicia uma alteração de endereço nem representa, por si só, uma confirmação no endereço antigo ou a verificação do novo endereço.

O contrato público dos webhooks lista `send.magic_link` com `sign-in`, `email-verification` e `forget-password`; não documenta um tipo de magic link `change-email`, nem eventos separados de confirmação no endereço antigo e verificação no novo. Há uma inconsistência na documentação oficial: a referência do SDK menciona `sendVerificationEmail()` e `verifyEmail()` no contexto de verificação após uma mudança, mas o guia de gerenciamento de usuários afirma explicitamente que mudanças de endereço não são suportadas e limita `updateUser()` a campos como nome. Os tipos do pacote instalado também incluem métodos OTP genéricos com nomes relacionados a `change-email`, mas o guia de OTP do Neon não documenta esse caso nem define destinatário/etapas em um contrato de webhook. Sem esse fluxo e contrato confirmados para o serviço gerenciado, o MyCatalog não os chama nem envia mensagens presumindo qual endereço deve recebê-las.

Para manter a segurança, não se altera diretamente o registro de usuário, não se usa um OTP de confirmação de cadastro como autorização para trocar e-mail e não se contorna a confirmação do provedor. A implementação pode ser completada quando o Neon oferecer e documentar um fluxo gerenciado de alteração com seus passos, destinatários e eventos. Até lá, a tela continua informando que o endereço não pode ser trocado por ali.

### Cobertura atual dos e-mails

| Fluxo | Evento/tipo Neon | Template MyCatalog | Situação |
| --- | --- | --- | --- |
| Recuperação de senha | `send.magic_link` / `forget-password` | **Redefina sua senha** | Implementado |
| Login por link | `send.magic_link` / `sign-in` | **Acesse sua conta no MyCatalog** | Implementado |
| Verificação de e-mail (cadastro) | `send.magic_link` / `email-verification` | **Confirme seu e-mail no MyCatalog** | Implementado; não altera e-mail de conta |
| Alteração de e-mail | Nenhum fluxo/evento de alteração documentado pelo Neon Managed Better Auth | Nenhum | Não disponível com o contrato atual do Neon |

## Variáveis

- `NEON_AUTH_BASE_URL`: URL base do Neon Auth já usada pelo aplicativo. O endpoint usa essa URL para obter o JWKS oficial em `/.well-known/jwks.json`.
- `RESEND_API_KEY`: chave da API Resend, configurada no ambiente Production da Vercel. Para desenvolvimento local, adicione-a ao `.env.local`.
- `NEON_AUTH_URL`: fallback legado para `NEON_AUTH_BASE_URL`, se esse for o nome já usado no ambiente.

O remetente está definido como `MyCatalog <noreply@catalogmy.pro>`. A chave da API nunca deve ser exposta em variáveis `NEXT_PUBLIC_*`.

## Configuração do webhook Neon

Faça esta configuração no projeto e branch usados em produção, somente depois que esta versão estiver publicada. Configure o segredo e publique o endpoint antes de ativar o webhook, pois `send.magic_link` bloqueia o fluxo de autenticação até o endpoint responder:

1. Abra o projeto Neon **Bisnaga MyCatalog**, branch **production**.
2. Configure `RESEND_API_KEY` no ambiente Production da Vercel e publique esta versão; confirme que o endpoint responde.
3. Em **Auth → Configuration → Webhooks**, defina o URL como `https://www.catalogmy.pro/api/webhooks/neon-auth`.
4. Selecione somente `send.magic_link` e defina timeout de 10 segundos.
5. Habilite os webhooks e salve por último. Não inclua `send.otp`.

Use o host `www`: o domínio raiz `catalogmy.pro` redireciona para `www`, e o Neon não segue redirects de webhook. Ao assinar `send.magic_link`, o Neon deixa de enviar o e-mail padrão desse evento; este endpoint passa a enviar os três tipos suportados.

## Segurança e falhas

O handler verifica a assinatura destacada EdDSA sobre o corpo bruto, consulta o JWKS do Neon, exige timestamp recente (janela de cinco minutos), compara os cabeçalhos com o evento assinado, valida o destinatário e limita os links ao host HTTPS do Neon Auth configurado. Respostas temporárias do Neon, rede ou Resend recebem HTTP 503 para permitir retry. Erros de conteúdo ou assinatura são rejeitados sem enviar e-mail.

Cada envio inclui uma chave de idempotência baseada no `event_id` do Neon; uma repetição de entrega não deve duplicar o e-mail. Logs e respostas não incluem endereço de e-mail, token, URL privada ou detalhes do provedor.

## Testes

Execute `npm test`. O teste `scripts/test-neon-email-webhook.mjs` cobre assinatura Ed25519, validade temporal, correspondência dos cabeçalhos, os três modelos, o uso do link original, rejeição de OTP/link inseguro/expirado e falha transitória do Resend. Não envia e-mail real.

Para verificar a entrega real, publique a aplicação, configure o webhook seguindo os passos acima e solicite recuperação usando uma conta de teste sua. O Neon exige URL HTTPS pública; um teste local precisa de um túnel HTTPS temporário configurado no painel. O fluxo de recuperação existente finaliza a troca da senha em `/reset-password`.

## Referências oficiais

- [Neon: Customize authentication emails](https://neon.com/docs/auth/guides/customize-emails)
- [Neon: Webhooks](https://neon.com/docs/auth/guides/webhooks)
- [Neon: User management](https://neon.com/docs/auth/guides/user-management)
- [Neon: Managed Better Auth SDK](https://neon.com/docs/reference/javascript-sdk)
- [Resend: Idempotency keys](https://resend.com/changelog/idempotency-keys)
