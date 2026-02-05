# 📱 CRM WhatsApp Tutts - Documentação

## 📋 Visão Geral

Sistema de CRM integrado ao WhatsApp para gestão de leads e atendimentos da plataforma Tutts. Permite gerenciar conversas, pipeline de vendas e controle de atendimento humano/IA.

---

## 🏗️ Arquitetura Técnica

| Componente | Tecnologia | Hospedagem |
|------------|------------|------------|
| **Frontend** | Next.js 14, React, TypeScript, Tailwind CSS | Vercel |
| **Backend** | Next.js API Routes | Vercel |
| **Banco de Dados** | PostgreSQL | Supabase (Neon) |
| **Autenticação** | JWT (token do Tutts) | - |

---

## 📁 Estrutura de Pastas

```
crm-whatsapp/
├── src/
│   ├── app/                    # Páginas e APIs (App Router)
│   │   ├── api/
│   │   │   ├── inbox/          # GET - Lista leads para inbox
│   │   │   ├── leads/          # GET - Lista leads para kanban
│   │   │   ├── regioes/        # GET - Lista regiões distintas
│   │   │   └── chat/[leadId]/
│   │   │       ├── route.ts    # GET - Detalhes do chat
│   │   │       ├── assumir/    # POST - Assumir atendimento
│   │   │       ├── reativar/   # POST - Reativar IA
│   │   │       ├── finalizar/  # POST - Finalizar atendimento
│   │   │       └── stage/      # POST - Mudar estágio
│   │   ├── login/              # Página de login
│   │   ├── inbox/              # Página inbox (lista conversas)
│   │   ├── chat/[leadId]/      # Página de chat individual
│   │   └── kanban/             # Página kanban (pipeline)
│   ├── components/
│   │   ├── AuthLayout.tsx      # Layout com autenticação
│   │   └── Sidebar.tsx         # Menu lateral
│   ├── lib/
│   │   ├── auth.ts             # Funções de auth (server)
│   │   ├── auth-client.ts      # Funções de auth (client)
│   │   ├── supabase.ts         # Cliente Supabase + queries
│   │   └── hooks.tsx           # React hooks (useAuth, useApi)
│   └── types/
│       └── index.ts            # TypeScript interfaces
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.js
```

---

## 🔐 Autenticação

### Fluxo
1. Usuário acessa via Tutts
2. Token JWT é passado via URL: `/login?token=xxx`
3. Token é armazenado no `localStorage`
4. Todas as requisições enviam o token no header `Authorization: Bearer xxx`

### Estrutura do Token JWT (do Tutts)
```typescript
{
  id: number;           // ID do usuário (numérico)
  codProfissional: string;
  role: 'admin' | 'admin_master' | 'admin_financeiro' | 'user';
  nome: string;
  iat: number;
  exp: number;
}
```

### Conversão de ID para UUID
O Tutts usa IDs numéricos, mas o Supabase espera UUID. A função `userIdToUuid()` converte:
```
123 → "00000000-0000-0000-0000-000000000123"
```

---

## 🗄️ Banco de Dados (Supabase)

### Tabela Principal: `dados_cliente`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | integer | ID único (PK) |
| `uuid` | uuid | UUID do lead |
| `telefone` | text | Telefone WhatsApp |
| `nomewpp` | text | Nome no WhatsApp |
| `stage` | text | Estágio do funil |
| `status` | text | Status (ativo/inativo) |
| `atendimento_ia` | text | Estado da IA (ativa/pause/reativada) |
| `owner_user_id` | uuid | ID do atendente (formato UUID) |
| `regiao` | text | Região do lead |
| `tags` | text[] | Tags/etiquetas |
| `updated_at` | timestamp | Última atualização |

### Tabela: `chats`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | ID único (PK) |
| `lead_id` | integer | FK para dados_cliente |
| `status` | text | open/closed |
| `last_message_at` | timestamp | Última mensagem |

### Tabela: `chat_messages`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | ID único (PK) |
| `chat_id` | uuid | FK para chats |
| `direction` | text | in (cliente) / out (bot/agente) |
| `message_type` | text | text/image/audio/video/document |
| `body` | text | Conteúdo da mensagem |
| `media_url` | text | URL da mídia |

---

## 🎯 Funcionalidades

### 1. Inbox (Lista de Conversas)
- Lista todos os leads com conversas
- Filtro por **estágio** (novo, em_atendimento, qualificado, proposta, finalizado)
- Filtro por **região** (dinâmico do banco)
- Busca por nome ou telefone
- Atualização automática a cada 15 segundos

### 2. Chat (Conversa Individual)
- Histórico de mensagens
- Exibe mídia (imagens, áudio, vídeo, documentos)
- Ações:
  - **Assumir**: Pausa a IA e atribui ao atendente
  - **Reativar IA**: Devolve para a IA
  - **Finalizar**: Encerra o atendimento
  - **Mudar Estágio**: Altera o estágio do funil

### 3. Kanban (Pipeline)
- Visualização em colunas por estágio
- Drag & drop para mover leads
- Filtro por **região**
- Atualização automática a cada 30 segundos

---

## 🔌 APIs Disponíveis

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/inbox` | GET | Lista leads com filtros |
| `/api/leads` | GET | Lista leads para kanban |
| `/api/regioes` | GET | Lista regiões distintas |
| `/api/chat/[leadId]` | GET | Detalhes do lead + mensagens |
| `/api/chat/[leadId]/assumir` | POST | Assumir atendimento |
| `/api/chat/[leadId]/reativar` | POST | Reativar IA |
| `/api/chat/[leadId]/finalizar` | POST | Finalizar atendimento |
| `/api/chat/[leadId]/stage` | POST | Mudar estágio |

### Parâmetros de Query (GET /api/inbox)
- `stage`: Filtrar por estágio
- `regiao`: Filtrar por região
- `search`: Buscar por nome/telefone
- `limit`: Limite de resultados (default: 50)
- `offset`: Paginação

---

## ⚙️ Variáveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# JWT (mesmo secret do Tutts/Railway)
JWT_SECRET=2489790845b81edf12713a1ee17cf2e06932569a04b35e625acfd98a36c8e17f
```

### Onde Encontrar
- **JWT_SECRET**: Railway → Projeto Tutts → Variables
- **Supabase Keys**: Supabase → Settings → API

---

## 🚀 Deploy (Vercel)

### Configurações do Projeto
- **Framework Preset**: Next.js
- **Root Directory**: `.` (vazio ou ponto)
- **Build Command**: `npm run build`
- **Output Directory**: `.next`

### Passos para Deploy
1. Push para GitHub
2. Vercel detecta automaticamente
3. Build e deploy em ~2 minutos

### Comandos Git Padrão
```bash
git init
git add .
git commit -m "sua mensagem"
git remote add origin https://github.com/Leonardodevcloud/crm-whatsapp.git
git branch -M main
git push -f origin main
```

---

## 🔧 Manutenção Futura

### Para dar manutenção em nova conversa:
1. Envie o **ZIP mais recente** (crm-whatsapp-v8-raiz.zip)
2. Descreva o problema ou nova feature
3. Receba o ZIP atualizado
4. Execute os comandos Git para deploy

### Versões
| Versão | Data | Descrição |
|--------|------|-----------|
| v1-v5 | - | Desenvolvimento inicial |
| v6 | - | Correção client/server components |
| v7 | - | Filtro de região implementado |
| v8 | - | Correção TypeScript (Array.from) |

---

## 📊 Estágios do Funil

| Stage | Descrição |
|-------|-----------|
| `novo` | Lead recém chegado |
| `em_atendimento` | Sendo atendido por humano |
| `qualificado` | Lead qualificado |
| `proposta` | Proposta enviada |
| `finalizado` | Atendimento encerrado |

---

## 🤖 Estados da IA

| Estado | Descrição |
|--------|-----------|
| `ativa` | IA respondendo automaticamente |
| `pause` | IA pausada (atendimento humano) |
| `reativada` | IA reativada após pausa |

---

## 📱 Integração com Tutts

### Abrir CRM a partir do Tutts
```javascript
const token = sessionStorage.getItem('tutts_token');
window.open(`https://crm-whatsapp-xxx.vercel.app/login?token=${token}`, '_blank');
```

### Fluxo n8n
1. Mensagem chega no WhatsApp
2. n8n processa e salva em `dados_cliente`
3. n8n preenche a coluna `regiao` baseado na identificação
4. CRM exibe o lead na região correta

---

## 🐛 Problemas Comuns

### Erro 500 na API
- Verificar se coluna existe no banco
- Verificar variáveis de ambiente no Vercel

### Erro #438 (React)
- Componente client importando código server
- Solução: mover funções para `auth-client.ts`

### Token inválido
- Token expirado
- JWT_SECRET diferente entre Tutts e CRM

### Deploy falha no Vercel
- Verificar Root Directory (deve ser `.` ou vazio)
- Verificar erros de TypeScript no build

---

## 📞 URLs do Projeto

| Recurso | URL |
|---------|-----|
| **Produção** | https://crm-whatsapp-xxx.vercel.app |
| **GitHub** | https://github.com/Leonardodevcloud/crm-whatsapp |
| **Supabase** | https://supabase.com/dashboard |
| **Vercel** | https://vercel.com/dashboard |

---

## ✅ Checklist de Setup

- [ ] Criar projeto no Vercel conectado ao GitHub
- [ ] Configurar variáveis de ambiente no Vercel
- [ ] Criar coluna `regiao` no Supabase
- [ ] Testar login com token do Tutts
- [ ] Verificar listagem de leads
- [ ] Testar ações (assumir, reativar, finalizar)

---

*Documentação gerada em Janeiro/2026*
*Versão atual: v8*
