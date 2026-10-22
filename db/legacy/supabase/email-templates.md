# Templates de e-mail do MyCatalog

Configure estes modelos em **Supabase → Authentication → Email Templates**.

## Confirm signup

**Assunto:** Confirme sua conta no MyCatalog

```html
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#171923">
  <h1 style="font-size:25px;margin:0 0 16px">Bem-vindo ao MyCatalog!</h1>
  <p style="line-height:1.6;color:#555d6d">Sua conta está quase pronta. Confirme seu endereço de e-mail para começar a organizar seus filmes e séries.</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#8b5cf6;color:#fff;text-decoration:none;font-weight:700">Confirmar minha conta</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#7b8495">Se você não criou uma conta no MyCatalog, ignore este e-mail com segurança.</p>
</div>
```

## Reset password

**Assunto:** Redefina sua senha do MyCatalog

```html
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#171923">
  <h1 style="font-size:25px;margin:0 0 16px">Redefinição de senha</h1>
  <p style="line-height:1.6;color:#555d6d">Recebemos uma solicitação para criar uma nova senha para sua conta no MyCatalog.</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#8b5cf6;color:#fff;text-decoration:none;font-weight:700">Criar nova senha</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#7b8495">Se você não solicitou essa alteração, ignore este e-mail. Sua senha atual continuará funcionando.</p>
</div>
```
