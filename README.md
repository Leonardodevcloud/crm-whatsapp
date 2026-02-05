# CRM WhatsApp - Módulo Tutts

Módulo de CRM para gerenciamento de conversas WhatsApp, integrado ao sistema Tutts.

## 🚀 Features

- **Inbox**: Lista de conversas com filtros por estágio e busca
- **Chat**: Visualização do histórico de mensagens
- **Kanban**: Pipeline visual com drag & drop
- **Ações**: Assumir atendimento, pausar/reativar IA, finalizar
- **Auth**: Validação via JWT do Tutts (mesmo token)

## 📋 Pré-requisitos

- Node.js 18+
- Conta no Supabase com as tabelas `dados_cliente`, `chats`, `chat_messages`
- Sistema Tutts rodando (para obter JWT)

## 🔧 Instalação

### 1. Clone ou copie os arquivos

```bash
cd crm-whatsapp
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# JWT Secret - DEVE SER IGUAL AO DO SERVIDOR TUTTS!
JWT_SECRET=mesmo-secret-do-tutts
```

### 4. Execute em desenvolvimento

```bash
npm run dev
```

Acesse: http://localhost:3000

## 🔑 Autenticação

O CRM usa o **mesmo JWT** do sistema Tutts. Para acessar:

1. Faça login no sistema Tutts principal
2. Copie o token JWT (disponível no localStorage ou via console)
3. Cole na página de login do CRM

**Ou** acesse diretamente com o token na URL:
```
http://localhost:3000/login?token=SEU_TOKEN_JWT
```

### Integração direta com Tutts

Para abrir o CRM direto do Tutts, adicione um link/botão que passa o token:

```javascript
// No frontend do Tutts
const token = localStorage.getItem('token');
window.open(`https://crm.seudominio.com/login?token=${token}`, '_blank');
```

## 📱 Uso

### Inbox
- Lista todas as conversas ativas
- Filtrar por estágio (novo, em_atendimento, etc)
- Buscar por nome ou telefone
- Atualização automática a cada 15 segundos

### Chat
- Visualizar histórico de mensagens
- **Assumir**: Pausar IA e assumir o atendimento
- **Reativar IA**: Devolver para atendimento automático
- **Finalizar**: Encerrar o atendimento
- Alterar estágio via dropdown

### Kanban
- Visualização em colunas por estágio
- Arrastar e soltar para mudar estágio
- Clique no card para abrir o chat

## 🔄 Sincronização com n8n

O CRM **não envia mensagens** no WhatsApp. Ele apenas:
- Atualiza `dados_cliente.atendimento_ia`
- Atualiza `dados_cliente.stage`
- Atualiza `dados_cliente.owner_user_id`

### Configurar n8n para respeitar o CRM

No seu workflow n8n, antes de responder uma mensagem, verifique:

```javascript
// Node: IF - Verificar se IA pode responder
// Condição:
{{$json.atendimento_ia}} !== 'pause'
```

Ou via SQL no Supabase:
```sql
SELECT atendimento_ia 
FROM dados_cliente 
WHERE telefone = '5511999998888';

-- Se retornar 'pause', não responder
-- Se retornar 'ativa' ou 'reativada', pode responder
```

## 📁 Estrutura do Projeto

```
src/
├── app/
│   ├── api/
│   │   ├── inbox/          # GET lista inbox
│   │   ├── leads/          # GET lista kanban
│   │   └── chat/[leadId]/
│   │       ├── route.ts    # GET detalhes + mensagens
│   │       ├── assumir/    # POST assumir
│   │       ├── reativar/   # POST reativar IA
│   │       ├── finalizar/  # POST finalizar
│   │       └── stage/      # POST alterar stage
│   ├── login/              # Página de login
│   ├── inbox/              # Página inbox
│   ├── chat/[leadId]/      # Página chat
│   └── kanban/             # Página kanban
├── components/
│   ├── Sidebar.tsx         # Menu lateral
│   └── AuthLayout.tsx      # Layout autenticado
├── lib/
│   ├── auth.ts             # Validação JWT
│   ├── hooks.tsx           # useAuth, useApi
│   └── supabase.ts         # Cliente + helpers
└── types/
    └── index.ts            # Tipagens
```

## 🚀 Deploy (Vercel)

1. Push para GitHub
2. Importe no Vercel
3. Configure variáveis de ambiente
4. Deploy!

```bash
# Ou via CLI
npm i -g vercel
vercel --prod
```

## ⚙️ Configurações Avançadas

### Adicionar novos estágios

Edite os arquivos:
- `src/app/inbox/page.tsx` (STAGES)
- `src/app/kanban/page.tsx` (KANBAN_COLUMNS)
- `src/app/chat/[leadId]/page.tsx` (STAGES)
- `src/app/api/chat/[leadId]/stage/route.ts` (VALID_STAGES)

### Alterar intervalo de polling

- Inbox: `src/app/inbox/page.tsx` → `setInterval(loadLeads, 15000)`
- Chat: `src/app/chat/[leadId]/page.tsx` → `setInterval(loadChat, 10000)`
- Kanban: `src/app/kanban/page.tsx` → `setInterval(loadKanban, 30000)`

### Adicionar real-time (Fase 2)

Substitua o polling por Supabase Realtime:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key)

// Escutar mudanças em dados_cliente
supabase
  .channel('leads')
  .on('postgres_changes', { 
    event: '*', 
    schema: 'public', 
    table: 'dados_cliente' 
  }, (payload) => {
    console.log('Lead atualizado:', payload)
    // Atualizar estado
  })
  .subscribe()
```

## 🐛 Troubleshooting

### "Token inválido"
- Verifique se `JWT_SECRET` é igual ao do servidor Tutts
- Verifique se o token não expirou

### "Erro ao buscar inbox"
- Verifique conexão com Supabase
- Verifique se as tabelas existem
- Verifique RLS policies (ou desative temporariamente)

### Cards não aparecem no Kanban
- Verifique se `dados_cliente.status = 'ativo'`
- Verifique se `stage` não é 'finalizado'

## 📄 Licença

Propriedade de Tutts. Todos os direitos reservados.
