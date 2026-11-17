# Recuperação: transporte HTTPS Resend

O serviço usa a API oficial `POST https://api.resend.com/emails` com fetch nativo do Node (Node 22 recomendado), sem SMTP ou SDK adicional.

Configure exclusivamente no `.env` do backend:

```
RESEND_API_KEY=
RESEND_FROM=MiqFlix <no-reply@seu-dominio-verificado>
PASSWORD_RESET_ORIGIN=https://seu-frontend
PASSWORD_RECOVERY_DIAGNOSTICS=false
```

A chave precisa de permissão de envio. Não use prefixo VITE_ e não copie a chave para o frontend. O `.env` real não foi modificado por esta migração. As variáveis SMTP antigas não são mais lidas e podem ser removidas do ambiente após configurar as novas.

Verifique o domínio no Resend e use RESEND_FROM nesse domínio para enviar a quaisquer usuários. `onboarding@resend.dev` mantém a restrição de envio para o endereço autorizado da conta; migrar para HTTPS não remove o HTTP 403. Domínio não verificado e destinatário não autorizado têm categorias separadas. Outros erros 403 não são classificados automaticamente como um desses casos.

Erros de conexão, timeout, autenticação, domínio, destinatário, permissão, limite e indisponibilidade são normalizados para códigos internos fixos. Nenhuma mensagem bruta do provedor é registrada ou anexada ao erro. Com o diagnóstico habilitado, os logs mostram apenas operação, categoria, código e status HTTP permitido.

O prazo de 20 segundos cobre a chamada e a leitura da resposta. Não há retries automáticos nem redirecionamentos. Tanto erros retornados quanto exceções causam falha; sucesso exige um ID de aceitação. Aceitação pela API não garante entrega na caixa de entrada. Se a chamada falhar ou expirar, o controller continua revogando o token correspondente, sem alterar a resposta genérica. O envio ainda depende do processo Node persistente após responder 202.

Tokens, hashes, expiração, rate limiting, cookies, revogação de sessões, HTML, texto, assunto e link foram preservados. Nenhuma mudança no frontend ou no serviço de assinaturas.

Execute `npm test`: os testes HTTPS usam fetch/cliente simulados, sem envios reais. Os testes de autenticação usam MongoDB isolado. Os testes específicos do transporte SMTP removido foram substituídos por testes de erros HTTP, timeout, montagem da mensagem, resposta genérica e revogação do token.

Referências oficiais:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/errors

Para validação manual autorizada: configure chave/remetente/origem, reinicie o backend e solicite recuperação no frontend com uma conta de teste autorizada. Confira a mensagem e conclua a troca de senha; depois confirme que o token e a senha antiga não funcionam. Não foi executado envio real durante a migração.
